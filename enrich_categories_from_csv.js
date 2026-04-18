const fs = require('fs');
const path = require('path');

const API_BASE = 'http://10.10.50.10/api/admin';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiYWRtaW5AcmV0b3BhLmxvY2FsIiwicm9sZSI6InN1cGVyYWRtaW4iLCJmdWxsX25hbWUiOiJFc3RlYmFuIEFkbWluIiwiaWF0IjoxNzc1NjA5NDAwLCJleHAiOjE3NzU2MzgyMDB9.Pvs_JaggFTkOSUVZQHvo1932-8iop_MLRCtqRfGwN44';

// 🔥 MAPEO REAL (acá está la magia)
function inferCategory(name) {
  const n = (name || '').toLowerCase();

  const rules = [
    { cat: 2, keys: ['farma', 'farmacia', 'farmaceut'] },
    { cat: 3, keys: ['ferreter', 'herramienta', 'industrial', 'import', 'export', 'material'] },
    { cat: 4, keys: ['supermerc', 'mini market', 'market', 'almacen'] },
    { cat: 5, keys: ['taller', 'mecanic', 'repuesto', 'motor', 'automotor', 'agromecanica'] },
    { cat: 7, keys: ['hotel', 'hostel', 'hospedaje', 'apart', 'motel'] },
    { cat: 6, keys: ['clinica', 'hospital', 'salud', 'medic', 'sanato'] },
    { cat: 1, keys: ['restaurant', 'comedor', 'gastro', 'cafe', 'food'] }
  ];

  let score = {};

  for (const rule of rules) {
    for (const key of rule.keys) {
      if (n.includes(key)) {
        score[rule.cat] = (score[rule.cat] || 0) + 1;
      }
    }
  }

  // elegir la categoría con mayor score
  let bestCat = null;
  let bestScore = 0;

  for (const cat in score) {
    if (score[cat] > bestScore) {
      bestScore = score[cat];
      bestCat = parseInt(cat);
    }
  }

  return bestCat;
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
  const file = fs.readFileSync(path.join('/opt/retopa/', 'mic_full.csv'), 'utf-8');
  const lines = file.split('\n');

  lines.shift();

  let updated = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split(';');

    const tipo = cols[1];
    const ruc = cols[2];
    const name = cols[3];

    const category_id = inferCategory(tipo, name);
    if (!category_id) continue;

    // 🔥 buscar negocio por RUC
    const cleanRuc = ruc.replace(/[^\d]/g, '');

    const res = await fetch(`${API_BASE}/businesses?ruc=${cleanRuc}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const json = await res.json();
    const business = json.data?.[0];

    if (!business) continue;

    await updateBusiness(business.id, category_id);

    console.log('✔', name, '→ cat', category_id);
    updated++;

    await new Promise(r => setTimeout(r, 30));
  }

  console.log('\n🔥 TOTAL ACTUALIZADOS:', updated);
}

run();
