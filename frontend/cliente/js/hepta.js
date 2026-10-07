/**
 * RetoPA Portal — Integración Hepta Cloud
 * hepta.js: carga instancias del cliente desde la API de HC
 */

const HC_API = 'https://cloud.hepta.com.py/api';

async function hcGet(endpoint) {
    const token = getToken(); // mismo JWT compartido
    try {
        const res = await fetch(`${HC_API}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) return { success: false, error: 'No autenticado en HC' };
        return await res.json();
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// ── Config pública de HC (site_config) — editable desde Admin HC ──
// Se cachea; nunca rompe el flujo si falla.
let HC_CFG = null;
async function loadHCConfig() {
    if (HC_CFG) return HC_CFG;
    try {
        const res  = await fetch(`${HC_API}/site-config`);
        const data = await res.json();
        HC_CFG = (data.success && data.data) ? data.data : {};
    } catch(e) {
        HC_CFG = {};
    }
    return HC_CFG;
}

// Link de contacto WhatsApp. Prioridad:
//  1) enlace de mensaje de WhatsApp Business (wa_business_link, editable en Admin HC)
//  2) número (whatsapp_number de HC) con texto prellenado
function heptaWaHref() {
    const link = ((HC_CFG && HC_CFG.wa_business_link) || '').trim();
    if (link) return link;   // los enlaces wa.me/message/... no admiten ?text=
    const num = (HC_CFG && HC_CFG.whatsapp_number) ||
                (typeof window !== 'undefined' && window._heptaWA) || '595986484905';
    return `https://wa.me/${num}?text=${encodeURIComponent('Hola, quiero información sobre Hepta Cloud')}`;
}

// ── Seguimiento de solicitudes HC (stepper: En revisión → Provisionando → Activo) ──
const REQ_STEPS = ['En revisión', 'Provisionando', '¡Activo!'];
function heptaReqStepIdx(status) {
    if (status === 'provisioned') return 2;
    if (status === 'provisioning') return 1;
    return 0; // pending
}
function renderHeptaRequests(reqs) {
    const active = (reqs || []).filter(r => r.status === 'pending' || r.status === 'provisioning');
    if (!active.length) return '';
    return active.map(r => {
        const idx = heptaReqStepIdx(r.status);
        const steps = REQ_STEPS.map((label, i) => {
            const done = i < idx, current = i === idx;
            const bg = done ? '#10B981' : current ? '#4F46E5' : '#CBD5E1';
            return `
                <div style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative">
                    ${i > 0 ? `<div style="position:absolute;top:11px;left:-50%;width:100%;height:2px;background:${i <= idx ? '#10B981' : '#E2E8F0'}"></div>` : ''}
                    <div style="width:24px;height:24px;border-radius:50%;background:${bg};color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;position:relative;z-index:1">${done ? '✓' : (i + 1)}</div>
                    <span style="font-size:11px;margin-top:6px;color:${current ? '#4F46E5' : '#64748B'};font-weight:${current ? '700' : '500'};text-align:center">${label}</span>
                </div>`;
        }).join('');
        const note = r.status === 'provisioning'
            ? 'Estamos creando tu sistema. Esto puede tardar unos minutos…'
            : 'Recibimos tu solicitud. Verificamos el pago y activamos tu sistema.';
        const planName = r.plan_name || r.plan || 'Plan Hepta Cloud';
        const canPay = r.status === 'pending' && r.tpago_link;
        return `
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px">
                    <div>
                        <div style="font-weight:800;color:#0F172A;font-size:15px">${escHtml(planName)}</div>
                        <div style="font-size:12px;color:#94A3B8">Solicitud #${r.id}${r.amount ? ` · ₲ ${Number(r.amount).toLocaleString('es-PY')}/mes` : ''}</div>
                    </div>
                    <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;background:${r.status === 'provisioning' ? '#EEF2FF' : '#FEF9C3'};color:${r.status === 'provisioning' ? '#4F46E5' : '#A16207'}">${r.status === 'provisioning' ? 'Provisionando' : 'En revisión'}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin:0 8px 16px">${steps}</div>
                <div style="font-size:12px;color:#64748B;background:#F8FAFC;border-radius:10px;padding:10px 12px">${note}</div>
                ${canPay ? `<a href="${r.tpago_link}" target="_blank" style="display:block;text-align:center;margin-top:10px;background:#4F46E5;color:#fff;font-weight:700;font-size:13px;padding:9px;border-radius:10px;text-decoration:none">Completar pago en Tpago</a>` : ''}
            </div>`;
    }).join('');
}

async function loadHeptaSection() {
    const container = document.getElementById('heptaContent');
    if (!container) return;

    await loadHCConfig();   // para el link de contacto WhatsApp
    const [data, reqData] = await Promise.all([
        hcGet('/portal/instance'),
        hcGet('/portal/payment-requests'),
    ]);
    const reqHtml = renderHeptaRequests(reqData && reqData.success ? reqData.data : []);

    if (!data.success || !data.data || !data.data.length) {
        if (reqHtml) {
            // Tiene solicitud en curso, todavía sin instancia → mostrar el seguimiento
            container.innerHTML = reqHtml + `
                <div class="text-center py-3">
                    <span class="text-xs text-gray-400">¿Dudas? </span>
                    <a href="${heptaWaHref()}" target="_blank" class="text-xs font-bold text-indigo-500 hover:underline">Escribinos por WhatsApp</a>
                </div>`;
            return;
        }
        // No tiene instancias ni solicitudes — mostrar upsell
        container.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-6 text-center">
                <div class="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-cloud text-2xl text-indigo-500"></i>
                </div>
                <h2 class="text-xl font-black text-gray-900 mb-2">¿Querés ordenar tu negocio?</h2>
                <p class="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                    Con Hepta Cloud tenés CRM, facturación, inventario y más — todo integrado, 
                    alojado en Paraguay y en días, no meses.
                </p>
                <div class="space-y-3 text-left max-w-xs mx-auto mb-6">
                    <div class="flex items-center gap-2 text-sm text-gray-700">
                        <i class="fas fa-check-circle text-green-500 w-4"></i> Implementación en días
                    </div>
                    <div class="flex items-center gap-2 text-sm text-gray-700">
                        <i class="fas fa-check-circle text-green-500 w-4"></i> Hosting en Paraguay
                    </div>
                    <div class="flex items-center gap-2 text-sm text-gray-700">
                        <i class="fas fa-check-circle text-green-500 w-4"></i> Soporte humano
                    </div>
                    <div class="flex items-center gap-2 text-sm text-gray-700">
                        <i class="fas fa-check-circle text-green-500 w-4"></i> Sin costos ocultos
                    </div>
                </div>
                <button onclick="openHeptaRequest()"
                    class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition-colors w-full">
                    <i class="fas fa-rocket mr-2"></i> Quiero mi sistema
                </button>
                <a href="https://cloud.hepta.com.py#planes" target="_blank"
                    class="block mt-3 text-sm text-indigo-600 hover:underline">
                    Ver planes y precios →
                </a>
            </div>`;
        return;
    }

    // Tiene instancias — mostrarlas (con el seguimiento de solicitudes en curso arriba)
    const statusLabel = { active: 'Activo', suspended: 'Suspendido', provisioning: 'Configurando', cancelled: 'Cancelado' };
    const statusColor = { active: 'bg-green-100 text-green-700', suspended: 'bg-red-100 text-red-700', provisioning: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-gray-100 text-gray-500' };

    container.innerHTML = reqHtml + data.data.map(inst => `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <div class="flex items-start justify-between mb-3">
                <div>
                    <h3 class="font-black text-gray-900">${escHtml(inst.label || 'Mi sistema')}</h3>
                    <p class="text-xs text-gray-400 mt-0.5">${inst.db_name ? inst.db_name.split('.')[0] + '.erp.hepta.com.py' : ''}</p>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 rounded-full ${statusColor[inst.status] || 'bg-gray-100 text-gray-500'}">
                    ${statusLabel[inst.status] || inst.status}
                </span>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div><span class="text-gray-400 text-xs">Plan</span><div class="font-semibold capitalize">${inst.plan}</div></div>
                <div><span class="text-gray-400 text-xs">Versión</span><div class="font-semibold">${inst.odoo_version || '19.0'}</div></div>
                <div><span class="text-gray-400 text-xs">Activo desde</span><div class="font-semibold">${inst.activated_at ? new Date(inst.activated_at).toLocaleDateString('es-PY') : '—'}</div></div>
                <div><span class="text-gray-400 text-xs">Subdominio</span><div class="font-semibold">${inst.db_name ? inst.db_name.split('.')[0] : '—'}</div></div>
            </div>
            ${inst.instance_url && inst.status === 'active' ? `
            <a href="${inst.instance_url}" target="_blank"
                style="display:flex;align-items:center;justify-content:center;gap:8px;background:#4F46E5;color:#ffffff!important;font-weight:700;padding:10px 16px;border-radius:12px;font-size:14px;width:100%;border:none;cursor:pointer;text-decoration:none">
                <i class="fas fa-external-link-alt"></i> Acceder a mi sistema
            </a>` : inst.status === 'suspended' ? `
            <div class="text-center text-sm text-red-500 py-2">
                <i class="fas fa-pause-circle mr-1"></i> Instancia suspendida — contactá soporte
            </div>` : ''}
        </div>`).join('');

    // CTA persuasivo al final
    container.innerHTML += `
        <div class="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-5 mt-2">
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-rocket text-indigo-600"></i>
                </div>
                <div class="flex-1">
                    <h4 class="font-black text-gray-900 mb-1">¿Necesitás más capacidad?</h4>
                    <p class="text-sm text-gray-500 mb-3">Podés agregar más sistemas, cambiar de plan o solicitar módulos adicionales. Nuestro equipo te asesora sin compromiso.</p>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="openHeptaRequest()"
                            style="display:inline-flex;align-items:center;gap:6px;background:#4F46E5;color:#ffffff!important;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;border:none;cursor:pointer">
                            <i class="fas fa-plus"></i> Agregar sistema
                        </button>
                        <a href="https://cloud.hepta.com.py#planes" target="_blank"
                            style="display:inline-flex;align-items:center;gap:6px;background:#EEF2FF;color:#4F46E5!important;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid #C7D2FE;cursor:pointer;text-decoration:none">
                            <i class="fas fa-tag"></i> Ver planes
                        </a>
                        <a href="${heptaWaHref()}" target="_blank"
                            style="display:inline-flex;align-items:center;gap:6px;background:#22C55E;color:#ffffff!important;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;text-decoration:none">
                            <i class="fab fa-whatsapp"></i> WhatsApp
                        </a>
                    </div>
                </div>
            </div>
        </div>
        <div class="text-center py-3">
            <span class="text-xs text-gray-400">Powered by </span>
            <a href="https://cloud.hepta.com.py" target="_blank" class="text-xs font-bold text-indigo-500 hover:underline">Hepta Cloud</a>
        </div>`;
}

// ── PLANES HC dinámicos desde API HC ─────────────────────────
let HC_PLANS = [];
const PLAN_COLORS = { starter:'#4F46E5', professional:'#7C3AED', enterprise:'#0F172A' };

async function loadHCPlans() {
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
            amount:   price,   // monto numérico (0 = "A consultar")
            // Precio derivado del monto real que se cobra (mismo número que payment-request)
            price:    price > 0 ? `₲ ${price.toLocaleString('es-PY')}/mes` : (p.price_label || 'A consultar'),
            color:    PLAN_COLORS[p.slug] || '#4F46E5',
            features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
            badge:    p.badge_text || null,
        };
    });
    return HC_PLANS;
}

// Modal de solicitud de instancia HC — diseño de planes estilo cloud.hepta.com.py
// Mobile-first: 1 columna en móvil, grid de 3 en desktop.
async function openHeptaRequest() {
    try {
        await Promise.all([loadHCPlans(), loadHCConfig()]);
    } catch (e) {
        if (typeof showToastClient === 'function')
            showToastClient('No pudimos cargar los planes de Hepta Cloud. Probá de nuevo en un momento.', 'error');
        return;
    }
    const existing = document.getElementById('heptaRequestModal');
    if (existing) { existing.classList.remove('hidden'); return; }

    // Estilos del modal (una sola vez)
    if (!document.getElementById('heptaModalStyles')) {
        const st = document.createElement('style');
        st.id = 'heptaModalStyles';
        st.textContent = `
        #heptaRequestModal *{box-sizing:border-box}
        #heptaRequestModal .hp-card{background:#fff;border-radius:20px;padding:22px;width:100%;max-width:920px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)}
        #heptaRequestModal .hp-grid{display:grid;grid-template-columns:1fr;gap:14px;margin:16px 0 6px}
        @media(min-width:768px){#heptaRequestModal .hp-grid{grid-template-columns:repeat(3,1fr)}}
        #heptaRequestModal .hp-plan{position:relative;border:1.5px solid #E2E8F0;border-radius:16px;padding:20px 18px;display:flex;flex-direction:column;background:#fff}
        #heptaRequestModal .hp-plan.featured{border-width:2px;box-shadow:0 6px 24px rgba(79,70,229,.12)}
        #heptaRequestModal .hp-ribbon{position:absolute;top:-11px;left:50%;transform:translateX(-50%);color:#fff;font-size:10px;font-weight:800;letter-spacing:.3px;padding:3px 12px;border-radius:999px;white-space:nowrap}
        #heptaRequestModal .hp-name{font-size:16px;font-weight:800;color:#0F172A}
        #heptaRequestModal .hp-price{font-size:24px;font-weight:800;margin:4px 0 12px}
        #heptaRequestModal .hp-feats{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:7px;flex:1}
        #heptaRequestModal .hp-feats li{font-size:13px;color:#334155;padding-left:22px;position:relative;line-height:1.45}
        #heptaRequestModal .hp-feats li::before{content:'✓';position:absolute;left:0;top:0;color:#10B981;font-weight:800}
        #heptaRequestModal .hp-cta{display:block;width:100%;text-align:center;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:800;color:#fff;cursor:pointer;text-decoration:none}
        #heptaRequestModal .hp-cta:hover{filter:brightness(1.07)}
        #heptaRequestModal .hp-cta:disabled{opacity:.6;cursor:default}`;
        document.head.appendChild(st);
    }

    const div = document.createElement('div');
    div.id = 'heptaRequestModal';
    div.className = 'fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-4';
    div.innerHTML = `
        <div class="hp-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <h3 style="font-size:19px;font-weight:900;color:#0F172A;margin:0 0 2px">Elegí tu plan</h3>
                    <p style="font-size:13px;color:#64748B;margin:0">Todos incluyen implementación, capacitación y soporte local</p>
                </div>
                <button onclick="document.getElementById('heptaRequestModal').classList.add('hidden')"
                    style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:22px;line-height:1">✕</button>
            </div>

            <div id="heptaReqErr" style="display:none;background:#FEF2F2;color:#DC2626;font-size:13px;border-radius:8px;padding:10px 14px;margin-top:12px"></div>
            <div id="heptaReqOk"  style="display:none;background:#F0FDF4;color:#16A34A;font-size:13px;border-radius:8px;padding:10px 14px;margin-top:12px"></div>

            <div style="margin-top:14px">
                <label style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Nombre de tu empresa (opcional)</label>
                <input id="heptaReqBiz" placeholder="Ej: Panadería San Pedro"
                    style="width:100%;border:1.5px solid #E2E8F0;border-radius:10px;padding:10px 14px;font-size:13px;outline:none"/>
            </div>

            <div class="hp-grid">
                ${HC_PLANS.map(p => {
                    const isEnt = (Number(p.amount) || 0) === 0;
                    return `
                    <div class="hp-plan ${p.badge ? 'featured' : ''}" style="${p.badge ? `border-color:${p.color}` : ''}">
                        ${p.badge ? `<span class="hp-ribbon" style="background:${p.color}">${p.badge}</span>` : ''}
                        <div class="hp-name">${p.name}</div>
                        <div class="hp-price" style="color:${p.color}">${p.price}</div>
                        <ul class="hp-feats">${p.features.map(f => `<li>${f}</li>`).join('')}</ul>
                        <button class="hp-cta" data-plan="${p.slug}" style="background:${p.color}"
                            onclick="chooseHeptaPlan('${p.slug}')">${isEnt ? 'Consultanos' : 'Elegir plan'}</button>
                    </div>`;
                }).join('')}
            </div>

            <p style="text-align:center;font-size:11px;color:#94A3B8;margin:4px 0 0">
                Pago seguro con Tpago · Podés cambiar de plan cuando quieras
            </p>
        </div>`;
    document.body.appendChild(div);
}

// Decide destino según el plan: Enterprise (monto 0) → WhatsApp; resto → Tpago
function chooseHeptaPlan(slug) {
    const p = HC_PLANS.find(x => x.slug === slug);
    const isEnt = p && (Number(p.amount) || 0) === 0;
    if (isEnt) {
        // Enterprise → contacto por WhatsApp Business (enlace de mensaje editable en Admin HC)
        window.open(heptaWaHref(), '_blank');
        return;
    }
    submitHeptaRequest(slug);
}

async function submitHeptaRequest(slug) {
    const plan = slug || 'professional';
    const biz  = document.getElementById('heptaReqBiz')?.value || '';
    const err  = document.getElementById('heptaReqErr');
    const ok   = document.getElementById('heptaReqOk');
    const btn  = document.querySelector(`.hp-cta[data-plan="${plan}"]`);
    const btnLabel = btn ? btn.textContent.trim() : 'Elegir plan';

    if (err) err.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

    try {
        // Llamar a HC API para registrar la solicitud
        const res = await fetch('https://cloud.hepta.com.py/api/portal/payment-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ plan, business_name: biz })
        });
        const data = await res.json();

        if (data.success) {
            if (data.data.type === 'tpago') {
                // Mostrar confirmación y redirigir a Tpago
                if (ok) {
                    ok.style.display = 'block';
                    ok.textContent = '✓ Redirigiendo a Tpago para completar el pago...';
                }
                setTimeout(() => {
                    window.open(data.data.tpago_link, '_blank');
                    document.getElementById('heptaRequestModal')?.classList.add('hidden');
                    // Mostrar mensaje de seguimiento
                    showToastClient('¡Listo! Completá el pago en Tpago. Te avisaremos cuando tu sistema esté listo.', 'success');
                }, 1500);
            } else if (data.data.type === 'contact') {
                if (ok) {
                    ok.style.display = 'block';
                    ok.textContent = '✓ ' + data.data.message;
                }
                setTimeout(() => document.getElementById('heptaRequestModal')?.classList.add('hidden'), 2500);
            }
        } else {
            if (err) { err.style.display = 'block'; err.textContent = data.error || 'Error al procesar'; }
            if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
        }
    } catch(e) {
        if (err) { err.style.display = 'block'; err.textContent = 'Error de conexión con Hepta Cloud'; }
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    }
}

// Auto-cargar si la URL apunta a #hepta
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash === '#hepta') {
        setTimeout(() => {
            if (typeof showSection === 'function') showSection('hepta');
        }, 300);
    }
});

// Hook directo en el botón del sidebar para asegurar carga
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('nav-hepta');
    if (btn) btn.addEventListener('click', () => setTimeout(loadHeptaSection, 50));
});

document.addEventListener('DOMContentLoaded', () => {
    // Autoload con retry — esperar a que app.js esté listo
    function tryAutoload(attempts) {
        if (attempts <= 0) return;
        if (window.location.hash === '#hepta') {
            if (typeof showSection === 'function') {
                showSection('hepta');
            } else {
                setTimeout(() => tryAutoload(attempts - 1), 200);
            }
        }
    }
    tryAutoload(10);

    // Hook directo en el botón
    function hookBtn() {
        const btn = document.getElementById('nav-hepta');
        if (btn) {
            btn.addEventListener('click', () => setTimeout(loadHeptaSection, 50));
        } else {
            setTimeout(hookBtn, 200);
        }
    }
    hookBtn();
});