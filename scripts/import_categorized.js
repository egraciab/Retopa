const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'retopa',
  user: 'retopa',
  password: 'RetopaDB_2026!'
});

// 🔥 mapping
const CATEGORY_MAP = {
  "gastronomia": 1,
  "salud / farmacia": 2,
  "ferreteria": 3,
  "market / almacen": 4,
  "automotriz": 5,
  "hoteleria y turismo": 7,
  "agro y veterinaria": 9,
  "energia y combustibles": 10,
  "servicios profesionales / otros": 11,
  "servicios profesionales": 11,
  "tecnologia y electronica": 12,
  "industria y manufactura": 13,
  "indumentaria y textil": 14,
  "alimentos y bebidas": 15,
  "transporte y logistica": 16,
  "construccion": 17
};

function normalize(str) {
  return (str || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanRuc(ruc) {
  return (ruc || '').replace(/[^\d]/g, '');
}

async function run() {
  const file = fs.readFileSync('/app/mic_clasificado_v2.csv', 'utf-8');
  const lines = file.split('\n');
  lines.shift();

  let updated = 0;
  let skipped = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split(';').map(c => c.replace(/"/g, '').trim());

    const ruc = cleanRuc(cols[2]);
    const categoria = normalize(cols[12]);

    if (!categoria || categoria === 'otros / no especificado') {
      skipped++;
      continue;
    }

    const category_id = CATEGORY_MAP[categoria];

    if (!category_id) {
      console.log('⚠️ SIN MAPEO:', categoria);
      skipped++;
      continue;
    }

    const result = await pool.query(
      `UPDATE businesses
       SET category_id = $1
       WHERE ruc_clean = $2`,
      [category_id, ruc]
    );

    if (result.rowCount > 0) {
      console.log('✔ RUC', ruc, '→', categoria);
      updated++;
    }

  }

  console.log('\n🔥 ACTUALIZADOS:', updated);
  console.log('⏭️ SKIPPED:', skipped);

  process.exit();
}

run();
