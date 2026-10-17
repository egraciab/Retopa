/**
 * RetoPA — helpers/fichaMerge.js  (2026-10-14)
 *
 * Fusión de fichas duplicadas. Caso que la originó: un dueño con su ficha ya
 * reclamada (visitas, clics) se volvió a dar de alta desde la web → Lead nuevo.
 *
 *  - findCandidates(pool, {days, businessId})
 *      Altas recientes (con lead de captación) que coinciden con una ficha MÁS
 *      VIEJA por un dato de contacto: celular (teléfono/WhatsApp de la ficha, del
 *      formulario o de la cuenta dueña) o correo (de la ficha, del formulario o de
 *      la cuenta dueña). Cada coincidencia viene con su FUENTE de los dos lados.
 *      El nombre parecido solo se muestra como apoyo: por sí solo NO propone.
 *  - preview(pool, survivorId, duplicateId)
 *      Las dos fichas lado a lado + qué se mueve. Sugerencia por campo: traer el
 *      dato de la nueva SOLO si la que queda lo tiene vacío (fuente: "alta nueva").
 *  - applyMerge(client, …)   (dentro de una transacción del llamador)
 *      Foto previa de las dos, copia los campos elegidos, mueve fotos, visitas,
 *      clics, reseñas, promos, pedidos de plan y la cuenta dueña; la nueva queda
 *      INACTIVA con merged_into (su link redirige). Nada se borra.
 *  - revertMerge(client, mergeId, adminId)
 *      Vuelve todo atrás por id. Un campo que el dueño cambió DESPUÉS de la fusión
 *      no se pisa: se informa.
 */

// Campos que se pueden traer de la duplicada. (location/lat/lng no: la geografía
// la maneja su propio flujo y quedaría desfasada.)
const MERGE_FIELDS = [
  'name', 'trade_name', 'ruc', 'description', 'address', 'city', 'phone', 'whatsapp', 'email',
  'website', 'image_url', 'cover_url', 'logo_emoji', 'hours', 'hours_json', 'category_id',
  'social_instagram', 'social_facebook', 'social_tiktok', 'social_linkedin', 'social_twitter', 'social_youtube',
];
const FIELD_LABELS = {
  name: 'Razón social / nombre', trade_name: 'Nombre comercial', ruc: 'RUC', description: 'Descripción',
  address: 'Dirección', city: 'Ciudad', phone: 'Teléfono', whatsapp: 'WhatsApp', email: 'Correo',
  website: 'Sitio web', image_url: 'Logo / foto', cover_url: 'Portada', logo_emoji: 'Emoji',
  hours: 'Horario', hours_json: 'Horario (detalle)', category_id: 'Rubro',
  social_instagram: 'Instagram', social_facebook: 'Facebook', social_tiktok: 'TikTok',
  social_linkedin: 'LinkedIn', social_twitter: 'X / Twitter', social_youtube: 'YouTube',
};
// Tablas cuyas filas pasan a la que queda (se guardan los ids para volverlas).
const MOVE_TABLES = ['business_gallery', 'business_views', 'business_clicks', 'gallery_clicks',
  'reviews', 'promotions', 'plan_requests'];

const isEmpty = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) || (Array.isArray(v) && v.length === 0);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Normalizaciones en SQL (mismas reglas que mobilePY de claimFlow).
const CEL = v => `CASE WHEN regexp_replace(COALESCE(${v},''),'\\D','','g') ~ '^(595|0)?9[0-9]{8}$'
                  THEN right(regexp_replace(${v},'\\D','','g'), 9) END`;
// Últimos 9 dígitos (misma expresión que los índices de la migración).
const PH9 = v => `right(regexp_replace(COALESCE(${v}, ''), '\\D', '', 'g'), 9)`;
const MAIL = v => `CASE WHEN position('@' in COALESCE(${v},'')) > 1 THEN lower(trim(${v})) END`;

async function tableExists(q, name) {
  const r = await q(`SELECT to_regclass($1) IS NOT NULL AS ok`, ['public.' + name]);
  return r.rows[0].ok;
}

// ── Candidatos ──────────────────────────────────────────────────────────────
async function findCandidates(pool, { days = 120, businessId = null, limit = 50 } = {}) {
  const params = [Math.max(1, Math.min(parseInt(days, 10) || 120, 730))];
  let only = '';
  if (businessId) { params.push(parseInt(businessId, 10)); only = `AND b.id = $${params.length}`; }
  const { rows } = await pool.query(`
    WITH nuevas AS (
      SELECT DISTINCT ON (b.id) b.id, b.name, b.created_at, sl.id AS lead_id,
             sl.contact_email, sl.contact_phone, sl.contact_name
        FROM service_leads sl JOIN businesses b ON b.id = sl.business_id
       WHERE sl.created_at > NOW() - make_interval(days => $1)
         AND COALESCE(sl.service_type,'') NOT IN ('claim','promo_boost')
         AND COALESCE(sl.status,'pending') NOT IN ('descartado','fusionado','lost','rejected')
         AND b.is_active = TRUE AND b.merged_into IS NULL ${only}
       ORDER BY b.id, sl.created_at DESC
    ),
    nk AS (   -- claves de las altas nuevas, con su fuente
      SELECT n.id AS nid, k.kind, k.src,
             CASE k.kind WHEN 'cel' THEN ${CEL('k.val')} ELSE ${MAIL('k.val')} END AS k
        FROM nuevas n JOIN businesses b ON b.id = n.id
        CROSS JOIN LATERAL (VALUES
          ('cel', b.phone, 'teléfono de su ficha'), ('cel', b.whatsapp, 'WhatsApp de su ficha'),
          ('cel', n.contact_phone, 'formulario de alta'),
          ('mail', b.email, 'correo de su ficha'), ('mail', n.contact_email, 'formulario de alta')
        ) AS k(kind, val, src)
      UNION ALL
      SELECT n.id, k.kind, k.src,
             CASE k.kind WHEN 'cel' THEN ${CEL('k.val')} ELSE ${MAIL('k.val')} END
        FROM nuevas n JOIN user_businesses ub ON ub.business_id = n.id
        JOIN users u ON u.id = ub.user_id
        CROSS JOIN LATERAL (VALUES ('cel', u.phone, 'su cuenta'),
                                   ('mail', u.email, 'su cuenta')) AS k(kind, val, src)
    ),
    -- Contactos del EQUIPO (admin/godmode): las fichas de prueba del staff comparten
    -- su celular/correo y no son evidencia de nada.
    staff AS (
      SELECT 'cel' AS kind, right(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 9) AS k
        FROM users u WHERE u.role IN ('admin','godmode') AND COALESCE(u.phone, '') <> ''
      UNION
      SELECT 'mail', lower(trim(u.email)) FROM users u WHERE u.role IN ('admin','godmode') AND u.email IS NOT NULL
    ),
    nkv AS (SELECT DISTINCT nid, kind, src, k FROM nk
             WHERE k IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.kind = nk.kind AND st.k = nk.k)),
    -- Las mismas claves en fichas ACTIVAS existentes. Búsqueda por igualdad sobre
    -- expresiones indexadas (sql/2026-10-14_fusion_fichas.sql): no recorre todo.
    ok AS (
      SELECT b.id AS oid, x.kind, 'teléfono' AS src, x.k FROM nkv x
        JOIN businesses b ON x.kind = 'cel' AND ${PH9('b.phone')} = x.k
      UNION ALL
      SELECT b.id, x.kind, 'WhatsApp', x.k FROM nkv x
        JOIN businesses b ON x.kind = 'cel' AND ${PH9('b.whatsapp')} = x.k
      UNION ALL
      SELECT b.id, x.kind, 'correo de la ficha', x.k FROM nkv x
        JOIN businesses b ON x.kind = 'mail' AND lower(trim(b.email)) = x.k
      UNION ALL
      SELECT ub.business_id, x.kind, 'cuenta dueña', x.k FROM nkv x
        JOIN users u ON (x.kind = 'cel' AND right(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 9) = x.k)
                     OR (x.kind = 'mail' AND lower(trim(u.email)) = x.k)
        JOIN user_businesses ub ON ub.user_id = u.id AND ub.is_owner = TRUE
    ),
    -- En cuántas fichas activas está cada dato (un celular de 3+ fichas es de alguien
    -- con varios negocios o de una agencia: por sí solo no alcanza).
    kc AS (
      SELECT o.kind, o.k, count(DISTINCT o.oid)::int AS n
        FROM ok o JOIN businesses b ON b.id = o.oid AND b.is_active = TRUE AND b.merged_into IS NULL
       GROUP BY o.kind, o.k
    ),
    pares AS (
      SELECT DISTINCT nkv.nid, o.oid, nkv.kind, nkv.k, nkv.src AS src_new, o.src AS src_old, kc.n
        FROM nkv JOIN ok o ON o.kind = nkv.kind AND o.k = nkv.k AND o.oid <> nkv.nid
        JOIN businesses ob ON ob.id = o.oid AND ob.is_active = TRUE AND ob.merged_into IS NULL
        JOIN kc ON kc.kind = o.kind AND kc.k = o.k
    )
    SELECT p.nid, p.oid, n.lead_id, n.contact_name,
           json_agg(DISTINCT jsonb_build_object('kind', p.kind, 'value', p.k, 'src_new', p.src_new, 'src_old', p.src_old, 'n', p.n)) AS evidence,
           count(DISTINCT p.kind) AS kinds
      FROM pares p JOIN nuevas n ON n.id = p.nid
      JOIN businesses o ON o.id = p.oid
     WHERE (o.created_at < n.created_at OR (o.created_at = n.created_at AND o.id < n.id))
       AND NOT EXISTS (SELECT 1 FROM business_merges m
                        WHERE m.status IN ('aplicada','descartada')
                          AND ((m.survivor_id = p.oid AND m.duplicate_id = p.nid)
                            OR (m.survivor_id = p.nid AND m.duplicate_id = p.oid)))
     GROUP BY p.nid, p.oid, n.lead_id, n.contact_name
     ORDER BY count(DISTINCT p.kind) DESC, p.nid DESC
     LIMIT ${3 * Math.max(1, Math.min(parseInt(limit, 10) || 50, 200))}`, params);
  if (!rows.length) return [];

  // Datos de las dos fichas para mostrar (y el nombre parecido como apoyo).
  const ids = [...new Set(rows.flatMap(r => [r.nid, r.oid]))];
  const info = await fichaSummaries(pool, ids);
  return rows.map(r => {
    const n = info[r.nid], o = info[r.oid];
    const sim = nameSimilarity(n.name, o.name);
    // Una línea por dato coincidente, con TODAS sus fuentes de cada lado.
    const byKey = new Map();
    for (const e of (r.evidence || [])) {
      const key = e.kind + ':' + e.value;
      if (!byKey.has(key)) byKey.set(key, { kind: e.kind, value: e.value, n: e.n || 1, src_new: new Set(), src_old: new Set() });
      byKey.get(key).src_new.add(e.src_new); byKey.get(key).src_old.add(e.src_old);
    }
    const evidence = [...byKey.values()].map(e => {
      const sn = [...e.src_new], so = [...e.src_old];
      const weak = e.n >= SHARED_KEY_MIN;
      return { kind: e.kind, value: e.value, src_new: sn, src_old: so, fichas: e.n, weak,
        label: `${e.kind === 'cel' ? 'Mismo celular ' + fmtCel(e.value) : 'Mismo correo ' + e.value} · en el alta: ${sn.join(', ')} · en la original: ${so.join(', ')}` +
               (weak ? ` (ojo: ese dato está en ${e.n} fichas)` : '') };
    }).sort((a, b) => (a.weak - b.weak) || ((a.kind === 'cel' ? 0 : 1) - (b.kind === 'cel' ? 0 : 1)));
    const strong = evidence.some(e => !e.weak);
    if (sim >= 0.5) evidence.push({ kind: 'nombre', value: Math.round(sim * 100), label: `Nombre parecido (${Math.round(sim * 100)}%) — «${n.name}» / «${o.name}»` });
    // Se propone solo con un dato propio de las dos, o con un dato compartido + nombre parecido.
    if (!strong && sim < 0.5) return null;
    return { new_id: r.nid, old_id: r.oid, lead_id: r.lead_id, contact_name: r.contact_name, evidence, nuevo: n, original: o };
  }).filter(Boolean).slice(0, Math.max(1, Math.min(parseInt(limit, 10) || 50, 200)));
}
const SHARED_KEY_MIN = 3;

function mobile9(v) { const m = String(v || '').replace(/\D/g, '').match(/^(?:595|0)?(9\d{8})$/); return m ? m[1] : null; }
function fmtCel(nine) { const d = String(nine || ''); return d.length === 9 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d; }

// Parecido de nombres sin depender de extensiones: Jaccard de trigramas sobre
// el texto sin tildes (misma idea que pg_trgm.similarity).
function nameSimilarity(a, b) {
  const tri = s => {
    const t = ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const set = new Set(); for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3)); return set;
  };
  const A = tri(a), B = tri(b); if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

async function fichaSummaries(q, ids) {
  const has = async t => tableExists(q.query ? q.query.bind(q) : q, t);
  const views = await has('business_views'), clicks = await has('business_clicks');
  const { rows } = await q.query(`
    SELECT b.id, b.name, b.trade_name, b.slug, b.city, b.address, b.phone, b.whatsapp, b.email, b.plan_type,
           b.verified, b.is_active, b.created_at, b.claim_status, b.image_url,
           c.name AS category_name,
           ${views ? `(SELECT count(*) FROM business_views v WHERE v.business_id = b.id)` : '0'}::int AS views,
           ${clicks ? `(SELECT count(*) FROM business_clicks k WHERE k.business_id = b.id)` : '0'}::int AS clicks,
           (SELECT count(*) FROM business_gallery g WHERE g.business_id = b.id)::int AS photos,
           (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
                    'is_owner', ub.is_owner, 'pending', (u.password_hash = '!pending-no-password!')))
              FROM user_businesses ub JOIN users u ON u.id = ub.user_id WHERE ub.business_id = b.id) AS users
      FROM businesses b LEFT JOIN categories c ON c.id = b.category_id
     WHERE b.id = ANY($1::int[])`, [ids]);
  const out = {}; rows.forEach(r => { r.users = r.users || []; out[r.id] = r; }); return out;
}

// ── Vista previa ────────────────────────────────────────────────────────────
async function preview(pool, survivorId, duplicateId) {
  const S = parseInt(survivorId, 10), D = parseInt(duplicateId, 10);
  if (!S || !D || S === D) return { error: 'Elegí dos fichas distintas', status: 400 };
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS category_name FROM businesses b LEFT JOIN categories c ON c.id = b.category_id
      WHERE b.id = ANY($1::int[])`, [[S, D]]);
  const s = rows.find(r => r.id === S), d = rows.find(r => r.id === D);
  if (!s || !d) return { error: 'No encontré una de las dos fichas', status: 404 };
  const block = blockers(s, d) || await paidBlockers(pool, D);
  const sum = await fichaSummaries(pool, [S, D]);

  const fields = [];
  for (const f of MERGE_FIELDS) {
    const sv = s[f], dv = d[f];
    if (isEmpty(dv) || same(sv, dv)) continue;   // nada que traer
    if ((f === 'phone' || f === 'whatsapp') && mobile9(sv) && mobile9(sv) === mobile9(dv)) continue;   // mismo número escrito distinto
    if (f === 'email' && String(sv || '').trim().toLowerCase() === String(dv || '').trim().toLowerCase()) continue;
    const show = v => f === 'category_id' ? (v ? (v === s.category_id ? s.category_name : d.category_name) : '') : v;
    fields.push({
      field: f, label: FIELD_LABELS[f] || f,
      survivor: show(sv), duplicate: show(dv),
      suggest: isEmpty(sv) ? 'duplicate' : 'survivor',
      reason: isEmpty(sv) ? 'La que queda no lo tiene: se trae del alta nueva' : 'Las dos lo tienen: se mantiene el de la que queda',
    });
  }
  const owners = { survivor: sum[S].users.filter(u => u.is_owner), duplicate: sum[D].users.filter(u => u.is_owner) };
  const otherOwner = owners.duplicate.filter(u => owners.survivor.length && !owners.survivor.some(x => x.id === u.id));
  return {
    survivor: sum[S], duplicate: sum[D], fields,
    moves: { photos: sum[D].photos, views: sum[D].views, clicks: sum[D].clicks,
             users: sum[D].users.filter(u => !sum[S].users.some(x => x.id === u.id)).length },
    warnings: [
      ...(otherOwner.length ? [`La ficha nueva es de otra cuenta (${otherOwner.map(u => u.email || u.phone || ('#' + u.id)).join(', ')}) y la que queda ya tiene dueño: esa cuenta NO pasa como dueña.`] : []),
      ...(d.plan_type && d.plan_type !== 'basic' ? [`La ficha nueva tiene plan ${d.plan_type}.`] : []),
    ],
    blocked: block || null,
  };
}

function blockers(s, d) {
  if (!s.is_active) return 'La ficha que queda está inactiva';
  if (!d.is_active) return 'La ficha a fusionar ya está inactiva';
  if (s.merged_into) return 'La ficha que queda ya fue fusionada en otra';
  if (d.merged_into) return 'Esa ficha ya fue fusionada';
  return null;
}
async function paidBlockers(pool, D) {
  for (const t of ['plan_grants', 'promotion_boosts']) {
    if (!(await tableExists(pool.query.bind(pool), t))) continue;
    const r = await pool.query(`SELECT count(*)::int AS n FROM ${t} WHERE business_id = $1`, [D]);
    if (r.rows[0].n) return `La ficha nueva tiene pagos/planes (${t}): fusionala a mano.`;
  }
  return null;
}

// ── Aplicar ─────────────────────────────────────────────────────────────────
// client: conexión con BEGIN ya hecho. take: lista de columnas a traer de la duplicada.
async function applyMerge(client, { survivorId, duplicateId, take = [], adminId = null, evidence = [], leadId = null, note = null }) {
  const S = parseInt(survivorId, 10), D = parseInt(duplicateId, 10);
  if (!S || !D || S === D) return { error: 'Elegí dos fichas distintas', status: 400 };
  const lk = await client.query('SELECT * FROM businesses WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [[S, D]]);
  const s = lk.rows.find(r => r.id === S), d = lk.rows.find(r => r.id === D);
  if (!s || !d) return { error: 'No encontré una de las dos fichas', status: 404 };
  const bl = blockers(s, d) || await paidBlockers(client, D);
  if (bl) return { error: bl, status: 409 };

  const cols = (Array.isArray(take) ? take : []).filter(c => MERGE_FIELDS.includes(c) && !isEmpty(d[c]) && !same(s[c], d[c]));
  const snap = async id => (await client.query(`SELECT to_jsonb(b) - 'location' AS j FROM businesses b WHERE id = $1`, [id])).rows[0].j;
  const survivorBefore = await snap(S), duplicateBefore = await snap(D);
  const survivorCats = (await client.query(
    'SELECT category_id, is_primary, position FROM business_categories WHERE business_id = $1 ORDER BY position', [S])).rows;

  // 1) Campos elegidos (copiados por SQL desde la otra fila: tipos exactos).
  if (cols.length) {
    const set = cols.map(c => `"${c}" = d."${c}"`).join(', ');
    await client.query(`UPDATE businesses s SET ${set}, updated_at = NOW() FROM businesses d WHERE s.id = $1 AND d.id = $2`, [S, D]);
  }
  if (cols.includes('category_id')) {   // rubro: ficha gratis = un rubro → el de la nueva pasa a principal
    await client.query('DELETE FROM business_categories WHERE business_id = $1', [S]);
    await client.query(`INSERT INTO business_categories (business_id, category_id, is_primary, position)
                        VALUES ($1, $2, TRUE, 0) ON CONFLICT DO NOTHING`, [S, d.category_id]);
  }

  // 2) Filas que pasan a la que queda.
  const moved = {};
  for (const t of MOVE_TABLES) {
    if (!(await tableExists(client.query.bind(client), t))) continue;
    let extra = '', off = 0;
    if (t === 'business_gallery') {   // las fotos nuevas van después de las existentes
      off = (await client.query('SELECT COALESCE(max(position), -1)::int + 1 AS m FROM business_gallery WHERE business_id = $1', [S])).rows[0].m;
      extra = `, position = position + ${off}`;
    }
    const r = await client.query(`UPDATE ${t} SET business_id = $1 ${extra} WHERE business_id = $2 RETURNING *`, [S, D]);
    if (r.rows.length) moved[t] = r.rows.map(x => x.id);
    if (t === 'business_gallery' && r.rows.length) moved.gallery_pos = Object.fromEntries(r.rows.map(x => [x.id, x.position - off]));
  }
  // Cuentas: pasan las que la que queda no tiene. Si la que queda ya tiene dueño,
  // una cuenta DISTINTA no entra como dueña (queda como estaba, en la inactiva).
  const sOwners = (await client.query('SELECT user_id FROM user_businesses WHERE business_id = $1 AND is_owner', [S])).rows.map(r => r.user_id);
  const sUsers = (await client.query('SELECT user_id FROM user_businesses WHERE business_id = $1', [S])).rows.map(r => r.user_id);
  const dRows = (await client.query('SELECT * FROM user_businesses WHERE business_id = $1', [D])).rows;
  moved.user_businesses = []; moved.user_businesses_removed = [];
  for (const ub of dRows) {
    if (sUsers.includes(ub.user_id)) {         // ya está en la que queda → se saca de la inactiva
      await client.query('DELETE FROM user_businesses WHERE id = $1', [ub.id]);
      moved.user_businesses_removed.push(ub);
    } else if (!ub.is_owner || !sOwners.length) {
      await client.query('UPDATE user_businesses SET business_id = $1 WHERE id = $2', [S, ub.id]);
      moved.user_businesses.push(ub.id);
    }
  }
  if (!moved.user_businesses.length) delete moved.user_businesses;
  if (!moved.user_businesses_removed.length) delete moved.user_businesses_removed;
  if (moved.reviews) await recalcRating(client, [S, D]);

  // 3) Leads del alta → 'fusionado' (se guarda el estado anterior).
  const lr = await client.query(
    `WITH old AS (SELECT id, status FROM service_leads WHERE business_id = $1
                    AND COALESCE(status,'pending') NOT IN ('won','lost','closed','descartado','fusionado'))
     UPDATE service_leads sl SET status = 'fusionado', updated_at = NOW()
       FROM old WHERE sl.id = old.id RETURNING sl.id, old.status AS prev`, [D]);
  if (lr.rows.length) moved.service_leads = lr.rows.map(r => ({ id: r.id, prev: r.prev }));

  // 4) La duplicada queda inactiva y apunta a la que queda (su link redirige).
  await client.query(
    `UPDATE businesses SET is_active = FALSE, merged_into = $1, merged_at = NOW(), claim_token = NULL, updated_at = NOW()
      WHERE id = $2`, [S, D]);

  const ins = await client.query(
    `INSERT INTO business_merges (survivor_id, duplicate_id, lead_id, status, evidence, fields_taken,
            survivor_before, survivor_cats, duplicate_before, moved, note, created_by)
     VALUES ($1,$2,$3,'aplicada',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [S, D, leadId || (lr.rows[0] && lr.rows[0].id) || null, JSON.stringify(evidence || []), JSON.stringify(cols),
     survivorBefore, JSON.stringify(survivorCats), duplicateBefore, JSON.stringify(moved), note, adminId]);
  return { id: ins.rows[0].id, fields: cols, moved, slugs: [s.slug, d.slug] };
}

async function recalcRating(client, ids) {
  await client.query(`
    UPDATE businesses b SET
      rating = COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.business_id = b.id AND r.is_approved), 0),
      review_count = (SELECT count(*) FROM reviews r WHERE r.business_id = b.id AND r.is_approved)
     WHERE b.id = ANY($1::int[])`, [ids]);
}

// ── Revertir ────────────────────────────────────────────────────────────────
async function revertMerge(client, mergeId, adminId) {
  const m = (await client.query('SELECT * FROM business_merges WHERE id = $1 FOR UPDATE', [parseInt(mergeId, 10)])).rows[0];
  if (!m) return { error: 'No encontré esa fusión', status: 404 };
  if (m.status !== 'aplicada') return { error: `Esta fusión está ${m.status}`, status: 409 };
  const S = m.survivor_id, D = m.duplicate_id;
  const lk = await client.query('SELECT * FROM businesses WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [[S, D]]);
  const s = lk.rows.find(r => r.id === S), d = lk.rows.find(r => r.id === D);
  if (!s || !d) return { error: 'Falta una de las fichas', status: 409 };
  if (d.merged_into !== S) return { error: 'La ficha fusionada ya no apunta a la que quedó: revisalo a mano', status: 409 };

  // 1) Campos: solo los que siguen con el valor que trajo la fusión.
  const taken = m.fields_taken || [], kept = [];
  const restore = [];
  for (const c of taken) {
    if (c === 'category_id') { restore.push(c); continue; }
    const now = (await client.query(`SELECT to_jsonb(b) -> $2 AS v FROM businesses b WHERE id = $1`, [S, c])).rows[0].v;
    const dupv = (m.duplicate_before || {})[c];
    if (same(now, dupv)) restore.push(c); else kept.push(c);
  }
  if (restore.length) {
    const cols = restore.map(c => `"${c}"`).join(', '), rcols = restore.map(c => `r."${c}"`).join(', ');
    await client.query(`UPDATE businesses SET (${cols}) = (SELECT ${rcols} FROM jsonb_populate_record(NULL::businesses, $2::jsonb) r),
                               updated_at = NOW() WHERE id = $1`, [S, JSON.stringify(m.survivor_before)]);
  }
  if (taken.includes('category_id')) {
    await client.query('DELETE FROM business_categories WHERE business_id = $1', [S]);
    for (const c of (m.survivor_cats || [])) {
      await client.query(`INSERT INTO business_categories (business_id, category_id, is_primary, position)
                          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [S, c.category_id, !!c.is_primary, c.position || 0]);
    }
  }

  // 2) Filas de vuelta, por id (posiciones de galería como estaban).
  const mv = m.moved || {};
  for (const t of MOVE_TABLES) {
    if (!mv[t] || !mv[t].length) continue;
    await client.query(`UPDATE ${t} SET business_id = $2 WHERE business_id = $1 AND id = ANY($3::int[])`, [S, D, mv[t]]);
  }
  for (const [gid, pos] of Object.entries(mv.gallery_pos || {})) {
    await client.query('UPDATE business_gallery SET position = $2 WHERE id = $1 AND business_id = $3', [parseInt(gid, 10), pos, D]);
  }
  if (mv.user_businesses) await client.query('UPDATE user_businesses SET business_id = $2 WHERE business_id = $1 AND id = ANY($3::int[])', [S, D, mv.user_businesses]);
  for (const ub of (mv.user_businesses_removed || [])) {
    await client.query(`INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
                        VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, business_id) DO NOTHING`,
      [ub.user_id, D, ub.is_owner, ub.can_edit]);
  }
  if (mv.reviews) await recalcRating(client, [S, D]);
  for (const l of (mv.service_leads || [])) {
    await client.query(`UPDATE service_leads SET status = $2, updated_at = NOW() WHERE id = $1 AND status = 'fusionado'`, [l.id, l.prev || 'pending']);
  }

  // 3) La duplicada vuelve como estaba.
  const db = m.duplicate_before || {};
  await client.query(
    `UPDATE businesses SET is_active = $2, merged_into = NULL, merged_at = NULL, claim_token = $3, updated_at = NOW() WHERE id = $1`,
    [D, db.is_active !== false, db.claim_token || null]);
  await client.query(`UPDATE business_merges SET status = 'revertida', reverted_at = NOW(), reverted_by = $2 WHERE id = $1`, [m.id, adminId]);
  return { ok: true, restored: restore, kept, slugs: [s.slug, d.slug] };
}

module.exports = { findCandidates, preview, applyMerge, revertMerge, nameSimilarity, MERGE_FIELDS, FIELD_LABELS };
