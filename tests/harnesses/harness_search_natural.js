// Búsqueda humanizada — "ferretería en luque" se separa en rubro + ciudad y
// encuentra la ficha correcta. Verifica el parser y el WHERE efectivo con
// Postgres real (pg_trgm + unaccent + full-text español).
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_searchnat', PORT = 55521, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// ── Réplica EXACTA del parser de directory.js ────────────────────────────────
const _SEARCH_CONNECTORS = new Set(['en', 'de', 'del', 'la', 'el', 'los', 'las', 'por', 'cerca', 'zona', 'barrio', 'ciudad', 'a']);
const _normText = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function parseSearchQuery(rawQ, cities) {
  const original = String(rawQ || '').trim();
  if (!original) return { q: '', city: null };
  const origToks = original.split(/\s+/);
  const normToks = origToks.map(_normText);
  let match = null, matchIdx = [];
  for (const c of cities) {
    const cw = c.words;
    for (let i = 0; i + cw.length <= normToks.length; i++) {
      let ok = true; for (let k = 0; k < cw.length; k++) if (normToks[i + k] !== cw[k]) { ok = false; break; }
      if (ok && (!match || cw.length > match.words.length)) { match = c; matchIdx = Array.from({ length: cw.length }, (_, k) => i + k); }
    }
  }
  let city = null; let keep = origToks.map((_, i) => i);
  if (match) { city = match.name; const s = new Set(matchIdx); keep = keep.filter(i => !s.has(i)).filter(i => !_SEARCH_CONNECTORS.has(normToks[i])); }
  return { q: keep.map(i => origToks[i]).join(' ').trim(), city };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();

  let hasExt = true;
  try { await c.query('CREATE EXTENSION IF NOT EXISTS unaccent'); await c.query('CREATE EXTENSION IF NOT EXISTS pg_trgm'); }
  catch (e) { hasExt = false; console.log('(aviso: sin unaccent/pg_trgm — se saltan checks SQL) ' + e.message); }

  await c.query(`CREATE TABLE categories (id serial primary key, name text, slug text)`);
  await c.query(`CREATE TABLE cities (id serial primary key, name text, is_active boolean DEFAULT true)`);
  await c.query(`CREATE TABLE businesses (id serial primary key, name text, city text, category_id int, is_active boolean DEFAULT true)`);
  await c.query(`INSERT INTO categories (id,name,slug) VALUES (1,'Ferretería','ferreteria'),(2,'Farmacia','farmacia')`);
  await c.query(`INSERT INTO cities (name) VALUES ('Luque'),('Asunción'),('San Lorenzo'),('Ciudad del Este')`);
  await c.query(`INSERT INTO businesses (id,name,city,category_id) VALUES
    (1,'Ferretería Don José','Luque',1),
    (2,'Ferretería Central','Asunción',1),
    (3,'Farmacia San Roque','Luque',2)`);

  // Índice de ciudades (como getCityIndex del backend)
  const cities = (await c.query('SELECT name FROM cities WHERE is_active = TRUE')).rows
    .map(r => ({ name: r.name, words: _normText(r.name).split(' ').filter(Boolean) }));

  // ── PARSER ──────────────────────────────────────────────────────────────────
  let p = parseSearchQuery('ferretería en luque', cities);
  check('parse "ferretería en luque" → q=ferretería, city=Luque', p.q === 'ferretería' && p.city === 'Luque', JSON.stringify(p));
  p = parseSearchQuery('ferreteria luque', cities);
  check('parse "ferreteria luque" (sin "en") → q=ferreteria, city=Luque', p.q === 'ferreteria' && p.city === 'Luque', JSON.stringify(p));
  p = parseSearchQuery('farmacia en ciudad del este', cities);
  check('parse multi-palabra "ciudad del este" → q=farmacia, city=Ciudad del Este', p.q === 'farmacia' && p.city === 'Ciudad del Este', JSON.stringify(p));
  p = parseSearchQuery('luque', cities);
  check('parse solo "luque" → q vacío, city=Luque (browse por ciudad)', p.q === '' && p.city === 'Luque', JSON.stringify(p));
  p = parseSearchQuery('ferretería', cities);
  check('parse "ferretería" (sin ciudad) → q=ferretería, city=null (igual que antes)', p.q === 'ferretería' && p.city === null, JSON.stringify(p));
  p = parseSearchQuery('cerca de san lorenzo', cities);
  check('parse "cerca de san lorenzo" → q vacío, city=San Lorenzo', p.q === '' && p.city === 'San Lorenzo', JSON.stringify(p));
  p = parseSearchQuery('  ', cities);
  check('parse vacío → {q:"",city:null}', p.q === '' && p.city === null);

  // ── WHERE efectivo (mismas cláusulas que directory.js) ──────────────────────
  if (hasExt) {
    const search = async (qEff, cityEff) => {
      const where = ['b.is_active = TRUE']; const params = []; let i = 1;
      if (qEff) {
        where.push(`(b.name ILIKE $${i}
           OR similarity(b.name,$${i + 1}) > 0.3
           OR to_tsvector('spanish', unaccent(b.name)) @@ plainto_tsquery('spanish', unaccent($${i + 2}))
           OR EXISTS (SELECT 1 FROM categories c2 WHERE c2.id=b.category_id AND (c2.name ILIKE $${i} OR similarity(c2.name,$${i + 1}) > 0.3)))`);
        params.push(`%${qEff}%`, qEff, qEff); i += 3;
      }
      if (cityEff) { where.push(`unaccent(b.city) ILIKE unaccent($${i})`); params.push(`%${cityEff}%`); i++; }
      const r = await c.query(`SELECT b.id FROM businesses b WHERE ${where.join(' AND ')} ORDER BY b.id`, params);
      return r.rows.map(x => x.id);
    };

    // NUEVO: "ferretería en luque" → qEff+cityEff
    p = parseSearchQuery('ferretería en luque', cities);
    let ids = await search(p.q, p.city);
    check('NUEVO: "ferretería en luque" → [1] (la de Luque, no la de Asunción)', ids.join() === '1', 'ids=' + ids);

    p = parseSearchQuery('farmacia en luque', cities);
    ids = await search(p.q, p.city);
    check('NUEVO: "farmacia en luque" → [3]', ids.join() === '3', 'ids=' + ids);

    // Accent-insensible: "ferreteria" (sin tilde) encuentra ambas ferreterías
    p = parseSearchQuery('ferreteria', cities);
    ids = await search(p.q, p.city);
    check('NUEVO: "ferreteria" sin tilde → [1,2] (ambas ferreterías, vía unaccent)', ids.join() === '1,2', 'ids=' + ids);

    // Solo ciudad
    p = parseSearchQuery('luque', cities);
    ids = await search(p.q, p.city);
    check('NUEVO: "luque" → [1,3] (todo Luque)', ids.join() === '1,3', 'ids=' + ids);

    // VIEJO (bug): string completo como q, sin separar ciudad → trae ferreterías
    // de CUALQUIER ciudad (incluida Asunción), ignorando "luque". El fix lo corrige:
    // NUEVO devuelve solo [1] (Luque); VIEJO incluye la 2 (Asunción).
    const old = await search('ferretería en luque', null);
    check('VIEJO: string crudo mezcla ciudades (incluye la de Asunción, id 2)', old.includes(2), 'ids=' + old);
    check('FIX: el nuevo parseo excluye la de Asunción que el viejo colaba', old.includes(2) && !(await search('ferretería', 'Luque')).includes(2));
  }

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Contrato de fuente ──────────────────────────────────────────────────────
  const D = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/directory.js', 'utf8');
  check('src: existe parseSearchQuery + getCityIndex', /async function parseSearchQuery/.test(D) && /async function getCityIndex/.test(D));
  check('src: usa qEff/cityEff en la búsqueda', /if \(qEff\)/.test(D) && /if \(cityEff\)/.test(D));
  check('src: sólo autoextrae ciudad si no vino filtro city', /if \(qClean && !cityEff\)/.test(D));
  check('src: order-by usa param dedicado (no idx-2 frágil)', /params\.push\(qEff\);\s*\n\s*const pQ = idx; idx\+\+;/.test(D));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
