const fetch = global.fetch;

const API_BASE = 'http://10.10.50.10/api/admin';
const TOKEN = 'PEGA_TOKEN';

// 🔥 misma lógica
function inferCategory(name) {
  const n = name.toLowerCase();

  if (n.includes('farma')) return 2;
  if (n.includes('ferreteria')) return 3;
  if (n.includes('supermercado')) return 4;
  if (n.includes('taller')) return 5;
  if (n.includes('hotel')) return 7;
  if (n.includes('abogado')) return 8;
  if (n.includes('clinica') || n.includes('hospital')) return 6;
  if (n.includes('restaurante') || n.includes('comedor') || n.includes('gastro')) return 1;

  return null;
}

async function run() {
  let page = 1;
  let updated = 0;

  while (true) {
    const res = await fetch(`${API_BASE}/businesses?page=${page}&limit=100`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    });

    const json = await res.json();
    const data = json.data || [];

    if (!data.length) break;

    for (const b of data) {
      if (b.category) continue; // ya tiene

      const category_id = inferCategory(b.name);
      if (!category_id) continue;

      await fetch(`${API_BASE}/businesses/${b.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ category_id })
      });

      console.log('Categorized:', b.name);
      updated++;

      await new Promise(r => setTimeout(r, 50));
    }

    page++;
  }

  console.log('\nActualizados:', updated);
}

run();
