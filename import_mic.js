const fs = require('fs');
const path = require('path');

const API_BASE = 'http://10.10.50.10/api/admin';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiYWRtaW5AcmV0b3BhLmxvY2FsIiwicm9sZSI6InN1cGVyYWRtaW4iLCJmdWxsX25hbWUiOiJFc3RlYmFuIEFkbWluIiwiaWF0IjoxNzc2MTE3ODYzLCJleHAiOjE3NzYxNDY2NjN9.Y8nLmb4-jxSsM3_hPdNu_XRj-nHkPyWbKEu78Pk4QEA';

// 🔥 mapping FINAL (tu DB real)
const CATEGORY_MAP = {
  "Gastronomía": 1,
  "Salud / Farmacia": 2,
  "Ferretería": 3,
  "Market / Almacén": 4,
  "Automotriz": 5,
  "Hotelería y Turismo": 7,

  "Agro y Veterinaria": 9,
  "Energía y Combustibles": 10,
  "Servicios Profesionales / Otros": 11,
  "Servicios Profesionales": 11,
  "Tecnología y Electrónica": 12,
  "Industria y Manufactura": 13,
  "Indumentaria y Textil": 14,
  "Alimentos y Bebidas": 15,
  "Transporte y Logística": 16,
  "Construcción": 17
};

function cleanRuc(ruc) {
  return (ruc || '').replace(/[^\d]/g, '');
}

async function findBusinessByRuc(ruc) {
  const res = await fetch(`${API_BASE}/businesses?ruc=${ruc}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });

  const json = await res.json();
  return json.data?.[0];
}

async function updateBusiness(id, category_id) {
  await fetch(`${API_BASE}/businesses/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify({ category_id })
  });
}

async function run() {
  const file = fs.readFileSync(
    path.join('/opt/retopa/', 'mic_clasificado_v2.csv'),
    'utf-8'
  );

  const lines = file.split('\n');
  lines.shift();

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split(';');

    const rucRaw = cols[2];
    const name = cols[3];
    const categoria = cols[12]; // ⚠️ ajustar si cambia

    if (!categoria || categoria === 'Otros / No especificado') {
      skipped++;
      continue;
    }

    const category_id = CATEGORY_MAP[categoria];

    if (!category_id) {
      console.log('⚠️ SIN MAPEO:', categoria);
      skipped++;
      continue;
    }

    const ruc = cleanRuc(rucRaw);

    const business = await findBusinessByRuc(ruc);

    if (!business) {
      console.log('❌ NO ENCONTRADO:', name, ruc);
      notFound++;
      continue;
    }

    await updateBusiness(business.id, category_id);

    console.log('✔', name, '→', categoria);
    updated++;

    await new Promise(r => setTimeout(r, 20));
  }

  console.log('\n🔥 ACTUALIZADOS:', updated);
  console.log('⏭️ SKIPPED:', skipped);
  console.log('❌ NO ENCONTRADOS:', notFound);
}

run();
