#!/usr/bin/env node
/**
 * RetoPA — DRY-RUN de deduplicación de negocios (SOLO LECTURA, no escribe nada).
 *
 * Detecta grupos de duplicados = mismo RUC + misma ciudad con 2+ filas ACTIVAS,
 * elige una GANADORA por criterio y marca las demás como "a desactivar/fusionar".
 * NO modifica la base. Imprime un resumen y escribe el detalle en un CSV.
 *
 * Uso (dentro del contenedor backend):
 *   docker exec -i retopa-backend node /opt/retopa/scripts/dedupe_dryrun.js
 *   # el CSV queda en /tmp/dedupe_report.csv (copialo con: docker cp retopa-backend:/tmp/dedupe_report.csv .)
 *
 * Criterio de GANADORA (de mayor a menor prioridad):
 *   verificada > tiene dueño (reclamada) > más visitas 30d > más completa (quality)
 *   > más reseñas > más nueva.
 */
const { Pool } = require('pg');
const fs = require('fs');
 
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB,
  user: process.env.DB_USER || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});
 
(async () => {
  const { rows } = await pool.query(`
    WITH grp AS (
      SELECT ruc, unaccent(lower(coalesce(city,''))) AS cityn
      FROM businesses
      WHERE is_active = TRUE AND ruc IS NOT NULL AND ruc <> ''
      GROUP BY 1,2
      HAVING count(*) > 1
    ),
    detail AS (
      SELECT b.id, b.slug, b.name, b.ruc, b.city, b.verified, b.created_at,
             fn_quality_score(b.*) AS quality,
             (SELECT count(*) FROM business_views v
                WHERE v.business_id=b.id AND v.viewed_at >= now()-interval '30 days')::int AS v30,
             (SELECT count(*) FROM business_clicks cl
                WHERE cl.business_id=b.id AND cl.click_type='whatsapp' AND cl.clicked_at >= now()-interval '30 days')::int AS wa30,
             COALESCE(b.review_count,0) AS reviews,
             EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id=b.id AND ub.is_owner=TRUE) AS has_owner
      FROM businesses b
      JOIN grp g ON g.ruc = b.ruc AND g.cityn = unaccent(lower(coalesce(b.city,'')))
      WHERE b.is_active = TRUE
    )
    SELECT *,
      row_number() OVER (
        PARTITION BY ruc, unaccent(lower(coalesce(city,'')))
        ORDER BY verified DESC, has_owner DESC, v30 DESC, quality DESC, reviews DESC, created_at DESC
      ) AS rank,
      count(*)      OVER (PARTITION BY ruc, unaccent(lower(coalesce(city,'')))) AS grp_n,
      bool_or(verified)  OVER (PARTITION BY ruc, unaccent(lower(coalesce(city,'')))) AS any_verified,
      count(*) FILTER (WHERE verified)  OVER (PARTITION BY ruc, unaccent(lower(coalesce(city,'')))) AS n_verified,
      count(*) FILTER (WHERE has_owner) OVER (PARTITION BY ruc, unaccent(lower(coalesce(city,'')))) AS n_owner
    FROM detail
    ORDER BY ruc, unaccent(lower(coalesce(city,''))), rank
  `);
 
  // Agrupar
  const groups = new Map();
  for (const r of rows) {
    const k = r.ruc + '|' + (r.city || '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
 
  let nGroups = 0, nLosers = 0, nRisky = 0;
  const csv = ['grupo,ruc,ciudad,accion,id,slug,name,verified,has_owner,v30,wa30,quality,reviews,riesgo'];
  const riskyList = [];
 
  for (const [k, g] of groups) {
    nGroups++;
    // Riesgo: 2+ verificadas, o 2+ con dueño (no desactivar automáticamente sin revisar).
    // Ojo: Postgres devuelve count()/row_number() como STRING → coercionar a número.
    const nVer = Number(g[0].n_verified), nOwn = Number(g[0].n_owner);
    const risky = nVer > 1 || nOwn > 1;
    if (risky) { nRisky++; riskyList.push({ ruc: g[0].ruc, city: g[0].city, nVer, nOwn }); }
    for (const r of g) {
      const rank = Number(r.rank);
      const accion = rank === 1 ? 'MANTENER' : (risky ? 'REVISAR' : 'DESACTIVAR');
      if (rank > 1 && !risky) nLosers++;
      csv.push([nGroups, r.ruc, JSON.stringify(r.city||''), accion, r.id, r.slug, JSON.stringify(r.name||''),
                r.verified, r.has_owner, r.v30, r.wa30, r.quality, r.reviews, risky ? 'SI' : ''].join(','));
    }
  }
 
  fs.writeFileSync('/tmp/dedupe_report.csv', csv.join('\n'));
 
  console.log('════════ DRY-RUN dedupe (SOLO LECTURA) ════════');
  console.log(`Grupos de duplicados (mismo RUC + ciudad, 2+ activos): ${nGroups}`);
  console.log(`Filas a DESACTIVAR (perdedoras claras):                ${nLosers}`);
  console.log(`Grupos RIESGOSOS (2+ verificadas o 2+ con dueño):      ${nRisky}  → NO se tocan, van a REVISAR`);
  console.log(`CSV completo: /tmp/dedupe_report.csv`);
  console.log('───────────────────────────────────────────────');
  console.log('Muestra (primeros 12 grupos):');
  let shown = 0;
  for (const [k, g] of groups) {
    if (shown++ >= 12) break;
    console.log(`\nRUC ${g[0].ruc} · ${g[0].city || '(sin ciudad)'}${(Number(g[0].n_verified)>1||Number(g[0].n_owner)>1)?'  [RIESGOSO → REVISAR]':''}`);
    for (const r of g) {
      const tag = Number(r.rank) === 1 ? '✓ MANTENER ' : '✗ desactiv.';
      console.log(`   ${tag} id=${r.id}  v30=${r.v30} wa=${r.wa30} q=${r.quality} rev=${r.reviews} ${r.verified?'VERIF ':''}${r.has_owner?'DUEÑO ':''} ${r.slug}`);
    }
  }
  if (riskyList.length) {
    console.log(`\n⚠ ${riskyList.length} grupos riesgosos (revisar a mano). Primeros 10:`);
    riskyList.slice(0,10).forEach(x => console.log(`   RUC ${x.ruc} · ${x.city||''}  (verificadas=${x.nVer}, con dueño=${x.nOwn})`));
  }
 
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
 
