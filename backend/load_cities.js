const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'retopa',
  user: process.env.DB_USER || 'retopa',
  password: process.env.DB_PASSWORD || 'RetopaDB_2026!'
});

function slugify(text) {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function run() {
  const file = fs.readFileSync(path.join('/app/', 'mic_full.csv'), 'utf-8');
  const lines = file.split('\n');
  lines.shift();

  const cities = new Set();

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split(';');
    let ciudad = cols[5];

    if (!ciudad || ciudad.trim() === 'N/D') continue;

    ciudad = ciudad.trim().replace(/"/g, '');
    cities.add(ciudad);
  }

  console.log('Ciudades detectadas:', cities.size);

  for (const city of cities) {
    const slug = slugify(city);

    await pool.query(
      `
      INSERT INTO cities (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO NOTHING
      `,
      [city, slug]
    );

    console.log('OK Ciudad:', city);
  }

  await pool.end();
  console.log('\nCiudades cargadas correctamente');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
