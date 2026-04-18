const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'retopa',
  user: 'retopa',
  password: 'RetopaDB_2026!'
});

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .trim();
}

async function run() {
  const file = fs.readFileSync(path.join(__dirname, 'mic_full.csv'), 'utf-8');
  const lines = file.split('\n');

  lines.shift(); // header

  const cities = new Set();

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split(';');
    let ciudad = cols[5];

    if (!ciudad || ciudad === 'N/D') continue;

    ciudad = ciudad.trim().replace(/"/g, '');

    cities.add(ciudad);
  }

  console.log('Ciudades detectadas:', cities.size);

  for (const city of cities) {
    const slug = normalize(city).replace(/\s+/g, '-');

    await pool.query(
      `
      INSERT INTO cities (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO NOTHING
      `,
      [city, slug]
    );

    console.log('✔ Ciudad:', city);
  }

  console.log('\n🔥 Ciudades cargadas correctamente');
  process.exit();
}

run();
