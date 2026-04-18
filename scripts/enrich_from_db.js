const fetch = global.fetch;

const API_BASE = 'http://10.10.50.10/api/admin';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiYWRtaW5AcmV0b3BhLmxvY2FsIiwicm9sZSI6InN1cGVyYWRtaW4iLCJmdWxsX25hbWUiOiJFc3RlYmFuIEFkbWluIiwiaWF0IjoxNzc1NjA5NDAwLCJleHAiOjE3NzU2MzgyMDB9.Pvs_JaggFTkOSUVZQHvo1932-8iop_MLRCtqRfGwN44';

function inferCategory(name) {
  const n = (name || '').toLowerCase();

  // 🔥 limpiar ruido
  const clean = n
    .replace(/sociedad anonima|s\.a\.|e\.a\.s\.|unipersonal|srl|ltda|group|holding/gi, '')
    .trim();

  // 🔥 reglas fuertes primero
  if (/farmacia|farma/.test(clean)) return 2;
  if (/ferreter|herramienta/.test(clean)) return 3;
  if (/supermerc|market|almacen/.test(clean)) return 4;
  if (/taller|mecanic|repuesto|motor/.test(clean)) return 5;
  if (/hotel|hostel|motel/.test(clean)) return 7;
  if (/clinica|hospital|salud|sanato/.test(clean)) return 6;
  if (/restaurant|comedor|gastro|cafe|resto/.test(clean)) return 1;

  return null;
}

async function run() {
  let page = 1;
  let updated = 0;

  while (true) {
    const res = await fetch(`${API_BASE}/businesses?page=${page}&limit=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const json = await res.json();
    const data = json.data || [];

    if (!data.length) break;

    for (const b of data) {
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

      console.log('✔', b.name, '→ cat', category_id);
      updated++;

      await new Promise(r => setTimeout(r, 20));
    }

    page++;
  }

  console.log('\n🔥 TOTAL ACTUALIZADOS:', updated);
}

run();
