/**
 * RetoPA — js/interactions.js
 * Likes, compartir y reclamo de empresas
 */

// ── WhatsApp URL con mensaje pre-cargado ──────────────────────────────────
/**
 * normalizePhone(raw) — S4.5
 * Normaliza teléfonos paraguayos al formato +595XXXXXXXXX
 * Retorna el número limpio para wa.me (sin +, solo dígitos)
 */
function normalizePhoneWa(raw) {
    if (!raw) return '';
    // Solo dígitos
    let digits = raw.replace(/\D/g, '');
    if (!digits) return '';

    // Ya tiene 595 al inicio (ej: 595981...)
    if (digits.startsWith('595') && digits.length >= 11) return digits;

    // Empieza con 0 (ej: 0981123456)
    if (digits.startsWith('0') && digits.length >= 9) return '595' + digits.slice(1);

    // Sin código, solo número local (ej: 981123456 — 9 dígitos)
    if (digits.length >= 7 && digits.length <= 10) return '595' + digits;

    // Ya tiene otro código de país o es muy largo — devolver tal cual
    return digits;
}

function buildWaUrl(biz, context = 'ficha') {
    const raw = (biz.whatsapp || biz.phone || '');
    const waNumber = normalizePhoneWa(raw);
    if (!waNumber) return null;
    if (!raw) return null;

    const bizName = biz.tradeName || biz.trade_name || biz.name || '';
    const pageUrl = window.location.origin + '/negocio/' + (biz.slug || '');

    // Usar mensaje configurable desde site-config, con variables disponibles
    const template = window.SITE_CONFIG?.whatsapp_message ||
        '¡Hola! Te contacto desde RetoPA ({url}) por tu empresa *{empresa}*.\n\nMe gustaría obtener más información.';

    const msg = encodeURIComponent(
        template
            .replace('{empresa}', bizName)
            .replace('{url}', pageUrl)
            .replace('{nombre}', bizName)
    );
    return `https://wa.me/${waNumber}?text=${msg}`;
}

// ── Tracking de clics (WhatsApp, teléfono, web) ───────────────────────────
function trackClick(slug, type) {
    fetch(`${API_BASE}/client/businesses/${slug}/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
            ...(localStorage.getItem('token') ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {})
        },
        body: JSON.stringify({ click_type: type })
    }).catch(() => {}); // fire & forget, no bloquea
}

// ── Globito de WhatsApp: canje al negocio mientras una ficha está abierta ─────
// Evita que la gente confunda el WA de RetoPA con el del negocio que está mirando.
// Mientras la ficha está abierta, el globito ES el WhatsApp de ese negocio (y trackea
// como contacto del negocio). Al cerrar la ficha, vuelve a ser el de RetoPA.
function fabSetForBusiness(biz) {
    const fab = document.getElementById('whatsappFab');
    if (!fab || !biz) return;
    const tip = document.getElementById('whatsappFabTooltip');
    const url = buildWaUrl(biz, 'fab');
    if (url) {
        fab.href = url;
        fab.target = '_blank';
        fab.onclick = () => { trackClick(biz.slug, 'whatsapp'); };
        if (tip) tip.textContent = 'Escribir a ' + (biz.tradeName || biz.trade_name || biz.name || 'este negocio');
        fab.classList.remove('hidden'); fab.classList.add('flex');
        fab.dataset.mode = 'business';
    } else {
        // El negocio no tiene WhatsApp → ocultar el globito (nada de mandar a RetoPA).
        fab.classList.add('hidden'); fab.classList.remove('flex');
        fab.dataset.mode = 'hidden';
    }
}

function fabRestoreRetopa() {
    const fab = document.getElementById('whatsappFab');
    if (!fab) return;
    const tip = document.getElementById('whatsappFabTooltip');
    fab.onclick = null;
    if (tip) tip.textContent = 'Escribinos por WhatsApp';
    if (window._retopaWaUrl) {
        fab.href = window._retopaWaUrl;
        fab.classList.remove('hidden'); fab.classList.add('flex');
    } else {
        fab.classList.add('hidden'); fab.classList.remove('flex');
    }
    fab.dataset.mode = 'retopa';
}

// Ocultar el globito temporalmente (mientras carga la ficha, antes de saber su WA).
function fabHide() {
    const fab = document.getElementById('whatsappFab');
    if (fab) { fab.classList.add('hidden'); fab.classList.remove('flex'); }
}

// ── Colores por categoría para placeholder ────────────────────────────────
const CAT_COLORS = {
    'restaurantes': '#f97316', 'supermercados': '#ea580c', 'alimentos': '#eab308',
    'agropecuario': '#84cc16', 'salud': '#f43f5e', 'farmacias': '#ef4444',
    'hospitales': '#dc2626', 'veterinarias': '#22c55e', 'bancos': '#1d4ed8',
    'financieras': '#2563eb', 'seguros': '#4f46e5', 'cooperativas': '#0d9488',
    'construccion': '#d97706', 'inmobiliarias': '#b45309', 'ferreterias': '#78716c',
    'materiales': '#57534e', 'tecnologia': '#7c3aed', 'telecomunicaciones': '#9333ea',
    'transporte': '#0284c7', 'logistica': '#0369a1', 'automotriz': '#dc2626',
    'combustibles': '#374151', 'profesionales': '#059669', 'juridico': '#047857',
    'contabilidad': '#0f766e', 'consultoras': '#0891b2', 'seguridad': '#4b5563',
    'limpieza': '#60a5fa', 'industria': '#475569', 'agroquimica': '#16a34a',
    'importadoras': '#ec4899', 'exportadoras': '#db2777', 'comercios': '#f472b6',
    'educacion': '#3b82f6', 'turismo': '#06b6d4', 'belleza': '#d946ef',
    'moda': '#c026d3', 'publicidad': '#fb923c', 'medios': '#64748b',
};

function getCatColor(slug) {
    return CAT_COLORS[slug] || '#0ea5e9';
}

// ── Like en tarjeta del listado ───────────────────────────────────────────
async function toggleLike(event, slug, btnEl) {
    event.stopPropagation();
    const token = localStorage.getItem('token');
    const res = await apiPost(`/businesses/${slug}/like`, {}, token
        ? { 'Authorization': `Bearer ${token}` }
        : {});
    if (!res.success) return;

    const icon  = btnEl.querySelector('i');
    const count = btnEl.querySelector('span');

    if (res.liked) {
        icon.className = 'fas fa-heart text-xs text-red-500';
        btnEl.classList.add('border-red-300', 'text-red-500');
        btnEl.dataset.liked = 'true';
    } else {
        icon.className = 'far fa-heart text-xs';
        btnEl.classList.remove('border-red-300', 'text-red-500');
        btnEl.dataset.liked = 'false';
    }
    if (count) {
        count.textContent = res.likeCount > 0 ? res.likeCount : '';
    } else if (res.likeCount > 0) {
        const span = document.createElement('span');
        span.className = 'text-[10px] font-bold';
        span.textContent = res.likeCount;
        btnEl.appendChild(span);
    }
}

// ── Like en modal del perfil ───────────────────────────────────────────────
async function loadProfileLike(slug) {
    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    try {
        const res = await fetch(`${API_BASE}/businesses/${slug}/like`, { headers });
        const data = await res.json();
        if (data.success) updateProfileLikeUI(data.liked, data.likeCount);
    } catch(e) {}
}

function updateProfileLikeUI(liked, count) {
    const icon  = document.getElementById('profileLikeIcon');
    const countEl = document.getElementById('profileLikeCount');
    if (icon)    icon.className = liked ? 'fas fa-heart text-red-400' : 'far fa-heart';
    if (countEl) countEl.textContent = count > 0 ? count : '';
}

async function toggleLikeProfile(slug) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(`${API_BASE}/businesses/${slug}/like`, {
            method: 'POST', headers
        });
        const data = await res.json();
        if (data.success) {
            updateProfileLikeUI(data.liked, data.likeCount);
            // Actualizar también el botón en la tarjeta si está visible
            const cardBtn = document.querySelector(`.like-btn[data-slug="${slug}"]`);
            if (cardBtn) {
                const icon = cardBtn.querySelector('i');
                if (icon) icon.className = data.liked ? 'fas fa-heart text-xs text-red-500' : 'far fa-heart text-xs';
            }
        }
    } catch(e) {}
}

// ── Compartir ──────────────────────────────────────────────────────────────
async function shareBusiness(event, slug, name) {
    event.stopPropagation();
    // Usar la URL actual — profile.js ya hizo replaceState a la URL canónica
    // /negocios/:cat/:ciudad/:slug. Si se llama desde la card del listado, usar /negocio/:slug
    const currentPath = window.location.pathname;
    const siteUrl = window.location.origin;
    const url = (currentPath.startsWith('/negocios/') || currentPath.startsWith('/negocio/'))
        ? siteUrl + currentPath
        : `${siteUrl}/negocio/${slug}`;
    const text = `Encontré ${name} en RetoPA — el ecosistema comercial de Paraguay`;

    if (navigator.share) {
        try {
            await navigator.share({ title: name, text, url });
            return;
        } catch(e) { /* fallback */ }
    }

    // Fallback: copiar al portapapeles
    try {
        await navigator.clipboard.writeText(url);
        showShareToast('¡Link copiado! Compartilo donde quieras 🔗');
    } catch(e) {
        // Fallback final: prompt
        prompt('Copiá este link:', url);
    }
}

function showShareToast(msg) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-24 right-6 bg-gray-900 text-white text-sm px-5 py-3 rounded-2xl shadow-xl z-[100] flex items-center gap-2 fade-in';
    t.innerHTML = `<i class="fas fa-link text-brand-400"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2500);
}

// ── Claim modal ────────────────────────────────────────────────────────────
function openClaimModal(slug, name) {
    // Crear modal de claim dinámicamente
    const existing = document.getElementById('claimModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'claimModal';
    modal.className = 'fixed inset-0 flex items-center justify-center p-4';
    // El modal se abre DESDE la ficha (#profileModal z-[85]) y por encima de la
    // barra de acciones fija (.rp-ficha-actions z-index:86, Etapa 4). Sin un
    // z-index mayor quedaba DETRÁS de la ficha. Lo elevamos por encima de todo
    // el sitio público (las hojas del perfil llegan a 9991).
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/60" onclick="closeClaimModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 z-10" style="max-height:90vh;overflow-y:auto">
            <button onclick="closeClaimModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <i class="fas fa-times text-xs"></i>
            </button>
            <div class="text-center mb-6">
                <div class="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 text-2xl mx-auto mb-3">
                    <i class="fas fa-ribbon"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-900">Reclamar empresa</h3>
                <p class="text-sm text-gray-500 mt-1">¿Sos el dueño o representante de <strong>${name}</strong>?</p>
                <p class="text-xs text-gray-400 mt-1">Completá tus datos. Verificaremos tu identidad y te transferiremos el control en 24-48hs.</p>
            </div>
            <form id="claimForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tu nombre completo *</label>
                    <input type="text" id="claimName" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500" placeholder="Nombre Apellido">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email de contacto *</label>
                    <input type="email" id="claimEmail" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500" placeholder="tu@empresa.com">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono / WhatsApp</label>
                    <input type="tel" id="claimPhone" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500" placeholder="+595 981 000 000">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">¿Cómo podemos verificarte?</label>
                    <textarea id="claimMessage" rows="3" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500" placeholder="Ej: Soy el director. RUC: XXXXXXXX. Puedo enviar documentación..."></textarea>
                </div>
                <div id="claimError" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
                <button type="submit" class="w-full btn-brand text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                    <i class="fas fa-paper-plane"></i> Enviar solicitud de reclamo
                </button>
            </form>
            <div id="claimSuccess" class="hidden text-center py-4">
                <i class="fas fa-check-circle text-4xl text-green-500 mb-3 block"></i>
                <p class="font-bold text-gray-900">¡Solicitud enviada!</p>
                <p class="text-sm text-gray-500 mt-1">Te contactaremos en 24-48hs para completar la verificación.</p>
                <button onclick="closeClaimModal()" class="mt-4 border border-gray-200 text-gray-600 px-6 py-2 rounded-lg text-sm hover:bg-gray-50">Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('claimForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const errEl = document.getElementById('claimError');
        errEl.classList.add('hidden');
        const payload = {
            contact_name:  document.getElementById('claimName').value.trim(),
            contact_email: document.getElementById('claimEmail').value.trim(),
            contact_phone: document.getElementById('claimPhone').value.trim(),
            message:       document.getElementById('claimMessage').value.trim(),
        };
        const res = await apiPost(`/businesses/${slug}/claim`, payload);
        if (res.success) {
            document.getElementById('claimForm').classList.add('hidden');
            document.getElementById('claimSuccess').classList.remove('hidden');
        } else {
            errEl.textContent = res.error || 'Error al enviar la solicitud';
            errEl.classList.remove('hidden');
        }
    });

    // Pre-rellenar con datos del usuario si está logueado
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.name)  document.getElementById('claimName').value  = user.name;
    if (user.email) document.getElementById('claimEmail').value = user.email;
}

function closeClaimModal() {
    document.getElementById('claimModal')?.remove();
}
