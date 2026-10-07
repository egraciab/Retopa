// PROSPECTOS (admin) — route REAL prospects.routes.js contra Postgres REAL.
// Verifica: sources con conteo, agrupación por WhatsApp, fichas sin whatsapp,
// rubro primario, ficha_url, PATCH upsert (fecha al 'enviado'), summary, filtros.
const { execSync, spawnSync } = require('child_process');
const PGDATA = '/tmp/pg_prospects', PORT = 55540, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

process.env.DB_HOST = '/tmp'; process.env.DB_PORT = String(PORT);
process.env.DB_USER = 'postgres'; process.env.DB_NAME = 'postgres'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-prospects-0123456789';

const { Client } = require('pg');
const express = require('express');
const jwt = require('jsonwebtoken');
const BE = '/root/work/opt/retopa/backend';
const TOKEN = jwt.sign({ id: 1, role: 'admin', email: 'a@x.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();

  await c.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text, slug text, whatsapp text, city text, source text DEFAULT 'manual', is_active boolean DEFAULT true)`);
  await c.query(`CREATE TABLE categories (id serial primary key, name text, slug text, parent_id int)`);
  await c.query(`CREATE TABLE business_categories (business_id int, category_id int, is_primary boolean DEFAULT false, "position" int DEFAULT 0)`);
  await c.query(`CREATE TABLE site_config (key text primary key, value text)`);
  // Tabla PRE-EXISTENTE en prod, con OTRO esquema y datos: la migración NO debe tocarla.
  await c.query(`CREATE TABLE prospect_outreach (
     id bigserial primary key, business_id int NOT NULL, canal varchar(20) DEFAULT 'whatsapp',
     telefono varchar(30) NOT NULL, visitas_30d int DEFAULT 0, mensaje text,
     estado varchar(20) DEFAULT 'enviado', enviado_at timestamptz DEFAULT now(),
     enviado_por varchar(80), cerrado_at timestamptz, notas text)`);
  await c.query(`INSERT INTO prospect_outreach (business_id, telefono, mensaje, estado) VALUES
     (1,'0981000001','hola','enviado'),(2,'0981000002','hey','respondio')`);
  // Migración real (crea prospect_WA_outreach, tabla nueva e independiente):
  const fs = require('fs');
  await c.query(fs.readFileSync('/root/work/opt/retopa/sql/2026-09-21_prospect_wa_outreach.sql', 'utf8'));

  await c.query(`INSERT INTO site_config (key,value) VALUES ('site_url','https://retopa.com.py')`);
  await c.query(`INSERT INTO categories (id,name,slug) VALUES (1,'Cerrajería','cerrajeria'),(2,'Farmacia','farmacia'),(3,'Taller mecánico','taller')`);
  // Cadena Nabil x4 (mismo whatsapp) + otras + 2 sin whatsapp + 1 de otro source.
  await c.query(`INSERT INTO businesses (id,name,trade_name,slug,whatsapp,city,source) VALUES
     (1,'Cerrajería Nabil Centro','Cerrajería Nabil','nabil-centro','595981111111','Asunción','prospeccion_agente'),
     (2,'Cerrajería Nabil Luque','Cerrajería Nabil','nabil-luque','595981111111','Luque','prospeccion_agente'),
     (3,'Cerrajería Nabil San Lorenzo','Cerrajería Nabil','nabil-sl','595981111111','San Lorenzo','prospeccion_agente'),
     (4,'Cerrajería Nabil Capiatá','Cerrajería Nabil','nabil-cap','595981111111','Capiatá','prospeccion_agente'),
     (5,'Farmacia Guaraní','Farmacia Guaraní','farma-guarani','595982222222','Luque','prospeccion_agente'),
     (6,'Taller Don José','Taller Don José','taller-jose','595983333333','Luque','prospeccion_agente'),
     (7,'Sin Whats Uno','Sin Whats Uno','sinwa-1',NULL,'Asunción','prospeccion_agente'),
     (8,'Sin Whats Dos','Sin Whats Dos','sinwa-2',NULL,'Luque','prospeccion_agente'),
     (9,'Manual Business','Manual Business','manual-1','595984444444','Asunción','manual')`);
  // Rubro primario
  await c.query(`INSERT INTO business_categories (business_id,category_id,is_primary,"position") VALUES
     (1,1,true,0),(2,1,true,0),(3,1,true,0),(4,1,true,0),(5,2,true,0),(6,3,true,0),(7,1,true,0),(8,2,true,0),(9,1,true,0)`);

  const router = require(BE + '/src/routes/prospects.routes.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/admin/prospects', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/admin/prospects';
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };
  const get = (p) => fetch(base + p, { headers: H }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const patch = (p, b) => fetch(base + p, { method: 'PATCH', headers: H, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

  // ── Auth ──
  const noAuth = await fetch(base + '/sources').then(r => r.status);
  check('sin token → 401', noAuth === 401, 'status=' + noAuth);

  // ── /sources ──
  const src = await get('/sources');
  const proSrc = (src.body?.data || []).find(s => s.source === 'prospeccion_agente');
  check('/sources lista orígenes con conteo', src.status === 200 && proSrc && proSrc.count === 8, JSON.stringify(src.body?.data));

  // ── / (agrupado) ──
  const all = await get('/?source=prospeccion_agente');
  const groups = all.body?.data || [];
  const nabil = groups.find(g => g.whatsapp === '595981111111');
  const sinWa = groups.filter(g => g.whatsapp === null);
  check('/ agrupa por WhatsApp: Nabil = 1 grupo con 4 fichas', !!nabil && nabil.count === 4 && nabil.fichas.length === 4, nabil ? 'count=' + nabil.count : 'no nabil');
  check('fichas sin WhatsApp aparecen como filas individuales (2)', sinWa.length === 2 && sinWa.every(g => g.count === 1));
  check('rubro primario resuelto (Nabil → Cerrajería)', nabil && nabil.fichas[0].rubro === 'Cerrajería', nabil && nabil.fichas[0].rubro);
  check('ficha_url = site_url/negocio/slug', nabil && /^https:\/\/retopa\.com\.py\/negocio\/nabil-/.test(nabil.fichas[0].ficha_url), nabil && nabil.fichas[0].ficha_url);
  check('no incluye otros orígenes (manual afuera)', !groups.some(g => g.whatsapp === '595984444444'));
  check('estado por defecto "pendiente"', nabil && nabil.estado === 'pendiente');
  check('summary presente (total_grupos, enviados_hoy=0)', all.body?.summary && all.body.summary.enviados_hoy === 0 && all.body.summary.total_grupos === groups.length, JSON.stringify(all.body?.summary));

  // ── PATCH 'enviado' → fecha_contacto hoy ──
  const pe = await patch('/outreach/595981111111', { estado: 'enviado', notas: 'Primer contacto' });
  check('PATCH enviado 200 + fecha_contacto seteada', pe.status === 200 && pe.body?.data?.estado === 'enviado' && !!pe.body?.data?.fecha_contacto, JSON.stringify(pe.body?.data));

  const after = await get('/?source=prospeccion_agente');
  const nabil2 = (after.body?.data || []).find(g => g.whatsapp === '595981111111');
  check('el grupo Nabil quedó "enviado" con notas', nabil2 && nabil2.estado === 'enviado' && nabil2.notas === 'Primer contacto');
  check('summary.enviados_hoy = 1', after.body?.summary?.enviados_hoy === 1, JSON.stringify(after.body?.summary));

  // ── PATCH 'respondio' → NO cambia fecha_contacto (solo al enviar) ──
  const fechaEnviado = pe.body.data.fecha_contacto;
  const pr = await patch('/outreach/595981111111', { estado: 'respondio' });
  check('PATCH respondio 200, conserva fecha_contacto', pr.status === 200 && pr.body?.data?.estado === 'respondio' && pr.body?.data?.fecha_contacto === fechaEnviado, JSON.stringify(pr.body?.data));

  // ── estado inválido → 400 ──
  const bad = await patch('/outreach/595981111111', { estado: 'inventado' });
  check('estado inválido → 400', bad.status === 400);

  // ── Filtros ──
  const fCity = await get('/?source=prospeccion_agente&ciudad=Luque');
  check('filtro ciudad=Luque', (fCity.body?.data || []).every(g => g.fichas.every(f => f.ciudad === 'Luque')));
  const fRubro = await get('/?source=prospeccion_agente&rubro=farmacia');
  check('filtro rubro=farmacia', (fRubro.body?.data || []).every(g => g.fichas.every(f => f.rubro_slug === 'farmacia')));
  const fQ = await get('/?source=prospeccion_agente&q=nabil');
  check('búsqueda q=nabil', (fQ.body?.data || []).length === 1 && fQ.body.data[0].whatsapp === '595981111111');
  const fEstado = await get('/?source=prospeccion_agente&estado=respondio');
  check('filtro estado=respondio (Nabil)', (fEstado.body?.data || []).length === 1 && fEstado.body.data[0].whatsapp === '595981111111');

  // ── source requerido ──
  const noSrc = await get('/');
  check('/ sin source → 400', noSrc.status === 400);

  // ── coexistencia: la tabla pre-existente prospect_outreach quedó intacta ──
  const preExist = await c.query(`SELECT count(*)::int AS n FROM prospect_outreach`);
  check('tabla pre-existente prospect_outreach intacta (2 filas)', preExist.rows[0].n === 2, 'n=' + preExist.rows[0].n);
  const waTbl = await c.query(`SELECT to_regclass('public.prospect_wa_outreach') AS t`);
  check('tabla nueva prospect_wa_outreach creada aparte', waTbl.rows[0].t === 'prospect_wa_outreach', String(waTbl.rows[0].t));

  await c.end(); server.close();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
