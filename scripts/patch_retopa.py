#!/usr/bin/env python3
"""
SANEO ecosistema — Correr en RetoPA VM (10.10.50.10) SOLAMENTE.

Cambios:
  1. hepta.js: planes 100% dinamicos desde /api/plans, precio derivado del
     monto real. Fuera el fallback hardcodeado y el HC_PLANS_PLACEHOLDER muerto.
  2. client.js: elimina ruta muerta /client/hepta-request (+ webhook huerfano).
  3. Borra codigo muerto del filesystem (backups, .bak, scripts viejos, dir roto).

Idempotente: se puede correr varias veces sin romper nada.
"""
import os, shutil

# ── 1. hepta.js — planes dinamicos, sin hardcode ──────────────
HEPTA = '/opt/retopa/frontend/cliente/js/hepta.js'
with open(HEPTA, 'r', encoding='utf-8') as f:
    hjs = f.read()

if 'Fuente única' in hjs:
    print("- hepta.js ya saneado")
else:
    old_hepta = """async function loadHCPlans() {
    if (HC_PLANS.length) return HC_PLANS;
    try {
        const res = await fetch('https://cloud.hepta.com.py/api/plans');
        const data = await res.json();
        if (data.success && data.data.length) {
            HC_PLANS = data.data.map(p => ({
                slug:     p.slug,
                name:     p.name,
                price:    p.price_label || 'A consultar',
                color:    PLAN_COLORS[p.slug] || '#4F46E5',
                features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
                badge:    p.badge_text || null,
            }));
            return HC_PLANS;
        }
    } catch(e) {}
    // Fallback
    HC_PLANS = [
        { slug:'starter',      name:'Plan Despegue',   price:'₲ 169.000/mes', color:'#4F46E5', features:['CRM de ventas','Facturación básica','Hasta 3 usuarios','Soporte por email'], badge:null },
        { slug:'professional', name:'Plan Crecimiento', price:'₲ 319.000/mes', color:'#7C3AED', features:['Todo lo de Despegue','Usuarios ilimitados','Módulos avanzados','Soporte prioritario'], badge:'Más popular' },
        { slug:'enterprise',   name:'Plan Empresa',     price:'A consultar',   color:'#0F172A', features:['Todo lo de Crecimiento','Implementación dedicada','SLA garantizado','Soporte 24/7'], badge:null },
    ];
    return HC_PLANS;
}

const HC_PLANS_PLACEHOLDER = [
    {
        slug: 'starter',
        name: 'Plan Despegue',
        price: '₲ 169.000/mes',
        color: '#4F46E5',
        features: ['CRM de ventas', 'Facturación básica', 'Hasta 3 usuarios', 'Soporte por email'],
        badge: null,
    },
    {
        slug: 'professional',
        name: 'Plan Crecimiento',
        price: '₲ 319.000/mes',
        color: '#7C3AED',
        features: ['Todo lo de Despegue', 'Usuarios ilimitados', 'Módulos avanzados', 'Soporte prioritario'],
        badge: 'Más popular',
    },
    {
        slug: 'enterprise',
        name: 'Plan Empresa',
        price: 'A consultar',
        color: '#0F172A',
        features: ['Todo lo de Crecimiento', 'Implementación dedicada', 'SLA garantizado', 'Soporte 24/7'],
        badge: null,
    },
];

// Modal de solicitud de instancia HC
async function openHeptaRequest() {
    await loadHCPlans();
    const modal = document.getElementById('heptaRequestModal');"""

    new_hepta = """async function loadHCPlans() {
    if (HC_PLANS.length) return HC_PLANS;
    // Fuente única: la API de HC (/api/plans lee la tabla `plans`). Sin fallback hardcodeado.
    const res  = await fetch('https://cloud.hepta.com.py/api/plans');
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || !data.data.length)
        throw new Error('No se pudieron cargar los planes de Hepta Cloud');

    HC_PLANS = data.data.map(p => {
        const price = Number(p.price) || 0;
        return {
            slug:     p.slug,
            name:     p.name,
            // Precio derivado del monto real que se cobra (mismo número que payment-request)
            price:    price > 0 ? `₲ ${price.toLocaleString('es-PY')}/mes` : (p.price_label || 'A consultar'),
            color:    PLAN_COLORS[p.slug] || '#4F46E5',
            features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
            badge:    p.badge_text || null,
        };
    });
    return HC_PLANS;
}

// Modal de solicitud de instancia HC
async function openHeptaRequest() {
    try {
        await loadHCPlans();
    } catch (e) {
        if (typeof showToastClient === 'function')
            showToastClient('No pudimos cargar los planes de Hepta Cloud. Probá de nuevo en un momento.', 'error');
        return;
    }
    const modal = document.getElementById('heptaRequestModal');"""

    if old_hepta in hjs:
        hjs = hjs.replace(old_hepta, new_hepta, 1)
        with open(HEPTA, 'w', encoding='utf-8') as f:
            f.write(hjs)
        print("OK hepta.js saneado (planes dinamicos, sin hardcode)")
    else:
        print("WARN: no encontre el bloque loadHCPlans/placeholder en hepta.js — revisar manualmente")

# ── 2. client.js — quitar ruta muerta /hepta-request ──────────
CLIENT = '/opt/retopa/backend/src/routes/client.js'
with open(CLIENT, 'r', encoding='utf-8') as f:
    cjs = f.read()

if "router.post('/hepta-request'" not in cjs:
    print("- client.js ya sin /hepta-request")
else:
    old_route = """});


// ── POST /client/hepta-request ── Solicitar sistema Hepta Cloud ──────────
router.post('/hepta-request', async (req, res) => {
  const { plan, message } = req.body;
  const user = req.user;
  try {
    // Notificar vía webhook a HC si está configurado
    const hcWebhookUrl = process.env.HC_WEBHOOK_URL || '';
    if (hcWebhookUrl) {
      fetch(hcWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Key': process.env.HC_WEBHOOK_KEY || '',
        },
        body: JSON.stringify({
          type: 'hepta_request', email: user.email,
          name: user.name, plan: plan || 'professional',
          message: message || '',
        }),
      }).catch(() => {});
    }
    console.log(`[hepta-request] ${user.email} solicitó plan ${plan}`);
    res.json({ success: true, message: 'Solicitud recibida. Te contactamos en menos de 24 horas hábiles.' });
  } catch(err) {
    console.error('[client/hepta-request]', err.message);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;"""

    new_route = """});

module.exports = router;"""

    if old_route in cjs:
        cjs = cjs.replace(old_route, new_route, 1)
        with open(CLIENT, 'w', encoding='utf-8') as f:
            f.write(cjs)
        print("OK client.js — ruta muerta /hepta-request eliminada")
    else:
        print("WARN: no encontre el bloque /hepta-request exacto en client.js — revisar manualmente")

# ── 3. Borrar codigo muerto del filesystem ────────────────────
dead_files = [
    '/opt/retopa/backend/src/routes/admin.js.bak',
    '/opt/retopa/_limpiar_codigo_muerto.sh',
    '/opt/retopa/retopa_hepta_endpoint.js',
]
dead_dirs = [
    '/opt/retopa/_backup_codigo_muerto_20260609_161423',
    '/opt/retopa/frontend/{embajador',
]

for p in dead_files:
    if os.path.isfile(p):
        os.remove(p); print(f"OK borrado: {p}")
    else:
        print(f"- ya no existe: {p}")

for d in dead_dirs:
    if os.path.isdir(d):
        shutil.rmtree(d); print(f"OK borrado dir: {d}")
    else:
        print(f"- ya no existe: {d}")

print("Done RetoPA!")
