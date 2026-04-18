const fetch = global.fetch;

const API_BASE = 'http://10.10.50.10/api/admin';
const TOKEN = 'PEGA_TOKEN';

// 🔥 KEYWORDS POTENTES
const rules = [
  { match: /farm|farma|medic/, category: 2 },
  { match: /ferreter|herramient/, category: 3 },
  { match: /supermerc|mini market|despensa/, category: 4 },
  { match: /taller|mecanica|auto/, category: 5 },
  { match: /hotel|hostel|motel/, category: 7 },
  { match: /abogado|juridic|estudio/, category: 8 },
  { match: /clinic|hospital|salud/, category: 6 },
  { match: /restaurant|comedor|bar|pizza|lomo|burger|cafe/, category: 1 }
];

// 🔥 DICCIONARIO (podés crecer esto después)
const known = {
  'PRODISER': 3,
  'ACIRON': 3
};

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '');
}

function inferCategory(name) {
  const n = normalize(name);

  // 🔥 1. Diccionario primero (más confiable)
  for (const key in known) {
    if (n.includes(key.toLowerCase())) {
      return known[key];
    }
  }

  // 🔥 2. Reglas
  for (const r of rules) {
    if (r.match.test(n)) {
      return r.category;
    }
  }

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
      if (b.category) continue;

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

      console.log('✔', b.name);
      updated++;

      await new Promise(r => setTimeout(r, 40));
    }

    page++;
  }

  console.log('\n🔥 Total categorizados:', updated);
}

run();
