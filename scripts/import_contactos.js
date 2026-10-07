/**
 * RetoPA — import_contactos.js
 * Importa empresas + leads desde retopa_import_contactos.json
 * Uso: node import_contactos.js
 *
 * - Inserta cada empresa en `businesses`
 * - Crea un lead en `service_leads` con el contacto (solo visible en admin)
 * - Transacción por registro: si falla el lead, no se pierde el business
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || process.env.POSTGRES_DB,
  user:     process.env.DB_USER     || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

// Categorías: slug → id (se carga dinámicamente)
let catMap = {};

async function loadCategories() {
  const res = await pool.query('SELECT id, slug FROM categories');
  res.rows.forEach(r => { catMap[r.slug] = r.id; });
  console.log(`✅ ${res.rows.length} categorías cargadas`);
}

function slugUnique(slug, usedSlugs) {
  let final = slug;
  let i = 2;
  while (usedSlugs.has(final)) { final = `${slug}-${i++}`; }
  usedSlugs.add(final);
  return final;
}

async function run() {
  const filePath = path.join(__dirname, 'retopa_import_contactos.json');
  const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`📦 ${records.length} registros a importar`);

  await loadCategories();

  const usedSlugs = new Set(
    (await pool.query('SELECT slug FROM businesses WHERE slug IS NOT NULL')).rows.map(r => r.slug)
  );

  let inserted = 0, skippedBiz = 0, leadsCreated = 0, errors = 0;

  for (const rec of records) {
    const b = rec.business;
    const l = rec.lead;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── 1. Verificar duplicado por slug o email ──
      if (b.email) {
        const dup = await client.query('SELECT id FROM businesses WHERE email = $1', [b.email]);
        if (dup.rows.length > 0) { skippedBiz++; await client.query('ROLLBACK'); continue; }
      }

      const finalSlug = slugUnique(b.slug, usedSlugs);
      const catId = b.category_slug ? (catMap[b.category_slug] || null) : null;

      // ── 2. INSERT business ──
      const bizRes = await client.query(`
        INSERT INTO businesses
          (name, trade_name, slug, category_id, phone, email, website, whatsapp,
           address, city, department, plan_type, verified, is_active, source, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
        RETURNING id
      `, [
        b.name, b.trade_name, finalSlug, catId,
        b.phone, b.email, b.website, b.whatsapp,
        b.address, b.city, b.department,
        b.plan_type, b.verified, b.is_active, b.source
      ]);

      const bizId = bizRes.rows[0].id;
      inserted++;

      // ── 3. INSERT lead (datos de contacto — solo admin) ──
      if (l.contact_name || l.contact_email) {
        await client.query(`
          INSERT INTO service_leads
            (business_id, business_name, contact_name, contact_email, contact_phone,
             service_type, status, notes, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
        `, [
          bizId, l.business_name, l.contact_name, l.contact_email, l.contact_phone,
          l.service_type, l.status, l.notes
        ]);
        leadsCreated++;
      }

      await client.query('COMMIT');

      if (inserted % 100 === 0) console.log(`  → ${inserted} insertadas...`);

    } catch (e) {
      await client.query('ROLLBACK');
      errors++;
      console.error(`✗ ERROR [${b.name}]: ${e.message}`);
    } finally {
      client.release();
    }
  }

  console.log('\n══════════════════════════════');
  console.log(`✅ Empresas insertadas: ${inserted}`);
  console.log(`⏭  Salteadas (duplicado): ${skippedBiz}`);
  console.log(`👤 Leads creados: ${leadsCreated}`);
  console.log(`❌ Errores: ${errors}`);
  console.log('══════════════════════════════');

  await pool.end();
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
