/**
 * RetoPA Admin — js/config.js
 * Estado, navegación, utils, API helpers, caches
 */

// ================================================================
// CONFIG & STATE
// ================================================================
// ── Auth JWT ──────────────────────────────────────────────────────────────
(function checkAdminAuth() {
    // No redirigir si ya estamos en login.html
    if (window.location.pathname.includes('login')) return;

    const token = localStorage.getItem('adminToken');
    if (!token) { window.location.href = '/admin/login.html'; return; }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('adminToken');
            window.location.href = '/admin/login.html'; return;
        }
        if (!['admin','godmode'].includes(payload.role)) {
            window.location.href = '/admin/login.html'; return;
        }
        window.ADMIN_USER = payload;
    } catch(e) {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login.html';
    }
})();

function getAdminToken() { return localStorage.getItem('adminToken') || ''; }
function adminLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = '/admin/login.html';
}

// ── Sesión DESLIZANTE (idle): mientras haya actividad, renueva el token antes de
// que venza; si te quedás quieto, el token muere (logout por inactividad). El tope
// absoluto lo impone el backend en /auth/refresh. ──
let _adminRefreshLast = 0;
let _adminRefreshInFlight = false;
async function maybeRefreshAdminToken() {
    const token = getAdminToken();
    if (!token || _adminRefreshInFlight) return;
    const now = Date.now();
    if (now - _adminRefreshLast < 60000) return;      // throttle: máx 1 intento/min
    let exp = 0;
    try { exp = (JSON.parse(atob(token.split('.')[1])).exp || 0) * 1000; } catch (e) { return; }
    if (!exp) return;
    // Solo renovar en la última parte de la ventana (evita spamear al backend).
    if (exp - now > 10 * 60 * 1000) return;           // >10 min de vida → esperar
    _adminRefreshLast = now;
    _adminRefreshInFlight = true;
    try {
        const res = await fetch('/api/v2/auth/refresh', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
        if (res.status === 401) { adminLogout(); return; }   // vencido / tope absoluto → cerrar
        const data = await res.json().catch(() => null);
        if (data && data.success && data.token) localStorage.setItem('adminToken', data.token);
    } catch (e) { /* sin red → se reintenta en la próxima actividad */ }
    finally { _adminRefreshInFlight = false; }
}
(function initAdminTokenRefresh() {
    // SOLO actividad real renueva el token (nada de intervalos de fondo: si el
    // admin se va, el token vence = logout por inactividad, que es el objetivo).
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(ev =>
        document.addEventListener(ev, maybeRefreshAdminToken, { passive: true }));
}());

// ── Session timeout — inactividad (configurable desde Admin → Configuración) ──
(function initAdminSessionTimeout() {
    // D7.6 — valores por defecto; se sobreescriben con site_config al cargar.
    let TIMEOUT_MIN = 30;   // minutos de inactividad hasta cerrar sesión
    let WARN_BEFORE = 5;    // minutos antes del cierre para mostrar el aviso
    let _timeoutId, _warningId, _warnEl;

    function resetTimer() {
        clearTimeout(_timeoutId);
        clearTimeout(_warningId);
        if (_warnEl) _warnEl.remove();
        _warnEl = null;

        const timeoutMs = Math.max(1, TIMEOUT_MIN) * 60 * 1000;
        const warnBefore = Math.min(Math.max(0, WARN_BEFORE), TIMEOUT_MIN);   // no mayor al total
        const warningMs = Math.max(0, timeoutMs - warnBefore * 60 * 1000);

        if (warnBefore > 0) {
            _warningId = setTimeout(() => {
                _warnEl = document.createElement('div');
                _warnEl.id = 'sessionWarnBanner';
                _warnEl.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;background:#1e293b;color:white;padding:14px 24px;border-radius:14px;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.35);display:flex;align-items:center;gap:12px;';
                _warnEl.innerHTML = '<i class="fas fa-clock text-amber-400"></i> Tu sesión expira en ' + warnBefore + ' minuto' + (warnBefore === 1 ? '' : 's') + ' por inactividad. <button onclick="document.getElementById(\'sessionWarnBanner\').remove()" style="background:#0ea5e9;border:none;color:white;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">Continuar</button>';
                document.body.appendChild(_warnEl);
                _warnEl.querySelector('button').addEventListener('click', resetTimer);
            }, warningMs);
        }

        _timeoutId = setTimeout(() => { adminLogout(); }, timeoutMs);
    }

    ['click','keydown','mousemove','touchstart','scroll'].forEach(ev => {
        document.addEventListener(ev, resetTimer, { passive: true });
    });

    // Cargar los tiempos configurables desde site_config y reiniciar el timer.
    (async () => {
        try {
            if (!getAdminToken()) return;
            const res = await apiAdminGet('/site-config');
            if (res && res.success && res.data) {
                const total = parseInt(res.data.admin_idle_timeout_min);
                const warn  = parseInt(res.data.admin_idle_warning_min);
                if (Number.isFinite(total) && total >= 1) TIMEOUT_MIN = total;
                if (Number.isFinite(warn)  && warn  >= 0) WARN_BEFORE = warn;
                resetTimer();
            }
        } catch (e) { /* usa los defaults */ }
    })();

    resetTimer(); // arrancar con defaults
}());

const API_BASE = '/api/v2/admin';
let currentSection = 'dashboard';
let currentBizPage = 1;
let editingBusinessId = null;

// LEADS STATE
let currentLeadPage = 1;
let leadsPerPage = 20;
let selectedLeads = new Set();
let currentSortField = 'created_at';
let currentSortDir = 'desc';
let allLeadsCache = [];
let leadsDebounceTimer = null;
let editingLeadId = null;

const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token || (user.role !== 'godmode' && user.role !== 'admin')) {
    alert('Acceso denegado. Requiere GodMode/Admin.');
    window.location.href = '/';
}

document.getElementById('adminName').textContent = user.name || 'Admin';
document.getElementById('adminRole').textContent = user.role === 'godmode' ? 'GodMode' : 'Admin';
document.getElementById('adminAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase();

// ================================================================
// NAVIGATION
// ================================================================
function showSection(section) {
    document.querySelectorAll('[id^="section-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(`section-${section}`).classList.remove('hidden');
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${section}`).classList.add('active');

    // Auto-expandir el grupo que contiene la sección activa (si estaba colapsado)
    const sectionGroup = {
        businesses:'directorio', uncategorized:'directorio', categories:'directorio', cities:'directorio',
        leads:'comercial', prospectos:'comercial', claims:'comercial', 'promotions-admin':'comercial', users:'comercial', semaforo:'comercial', 'plan-requests':'comercial', monetizacion:'comercial', signals:'comercial',
        import:'marketing', notify:'marketing', templates:'marketing', emaillogs:'marketing',
        plans:'config', services:'config', site:'config', settings:'config', logros:'config'
    };
    const grp = sectionGroup[section];
    if (grp) {
        const grpEl = document.getElementById('group-' + grp);
        const chv = document.getElementById('chev-' + grp);
        if (grpEl && grpEl.classList.contains('nav-collapsed')) {
            grpEl.classList.remove('nav-collapsed');
            if (chv) chv.style.transform = 'rotate(0)';
        }
    }

    const titles = { dashboard: 'Dashboard', businesses: 'Empresas', leads: 'Captación / Leads', prospectos: 'Prospectos', users: 'Usuarios', categories: 'Categorías', plans: 'Planes', cities: 'Ciudades', site: 'Sitio Web', import: 'Importar empresas', settings: 'Configuración', claims: 'Claims', templates: 'Plantillas', emaillogs: 'Logs de correos', notify: 'Notificar empresas', 'promotions-admin': 'Promociones', services: 'Servicios', uncategorized: 'Sin categoría', semaforo: 'Semáforo de ventas', 'plan-requests': 'Solicitudes de plan', monetizacion: 'Informe de monetización', signals: 'Disparadores de venta', logros: 'Logros' };
    document.getElementById('pageTitle').textContent = titles[section] || section;
    currentSection = section;

    if (section === 'dashboard') loadDashboard();
    if (section === 'businesses') { currentBizPage = 1; loadBizKpiStats(); loadAdminBusinesses(1); }
    if (section === 'leads') { currentLeadPage = 1; window.currentLeadView = 'active'; selectedLeads.clear(); clearLeadSelection(); loadAdminLeads(); }
    if (section === 'prospectos') { if (typeof initProspectsSection === 'function') initProspectsSection(); }
    if (section === 'users') loadAdminUsers();
    if (section === 'semaforo') { if (typeof loadSemaforo === 'function') loadSemaforo(); }
    if (section === 'plan-requests') { if (typeof loadPlanRequests === 'function') loadPlanRequests(); }
    if (section === 'monetizacion') { if (typeof loadMonetizationReport === 'function') loadMonetizationReport(); }
    if (section === 'signals') { if (typeof loadSignals === 'function') loadSignals(); }
    if (section === 'categories') loadAdminCategories();
    if (section === 'plans') loadAdminPlans();
    if (section === 'services') { if (typeof loadAdminServices === 'function') loadAdminServices(); }
    if (section === 'cities') { initDeptSelect(); loadAdminCities(); }
    if (section === 'site')     { loadSiteConfig(); loadTestBizOptions(); }
    if (section === 'settings') { loadSiteConfig(); loadTestBizOptions(); }
    if (section === 'emaillogs') loadEmailLogs(1);
    if (section === 'import') initImportSection();
    if (section === 'promotions-admin') initPromosAdmin();
    if (section === 'templates')    initTemplatesSection();
    if (section === 'notify')       initNotifySection();
    if (section === 'claims')        initClaimsSection();
    if (section === 'uncategorized') initUncategorizedSection();
    if (section === 'settings') loadSettings();
    if (section === 'logros') { if (typeof initLogrosSection === 'function') initLogrosSection(); }

    // Detener polling en tiempo real si salimos del dashboard
    if (section !== 'dashboard' && typeof stopLivePolling === 'function') stopLivePolling();

    // En mobile, cerrar el sidebar al elegir una sección
    if (window.matchMedia('(max-width: 1024px)').matches) closeMobileSidebar();
}

// ── Grupos colapsables del menú ───────────────────────────────────────────
function toggleNavGroup(group) {
    const el  = document.getElementById('group-' + group);
    const chv = document.getElementById('chev-' + group);
    if (!el) return;
    const collapsed = el.classList.toggle('nav-collapsed');
    if (chv) chv.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0)';
    // Persistir estado
    try {
        const st = JSON.parse(localStorage.getItem('adminNavGroups') || '{}');
        st[group] = collapsed ? 'closed' : 'open';
        localStorage.setItem('adminNavGroups', JSON.stringify(st));
    } catch(e) {}
}

// Restaurar estado de grupos al cargar
function restoreNavGroups() {
    try {
        const st = JSON.parse(localStorage.getItem('adminNavGroups') || '{}');
        Object.keys(st).forEach(group => {
            if (st[group] === 'closed') {
                const el = document.getElementById('group-' + group);
                const chv = document.getElementById('chev-' + group);
                if (el) el.classList.add('nav-collapsed');
                if (chv) chv.style.transform = 'rotate(-90deg)';
            }
        });
    } catch(e) {}
}

// ── Sidebar mobile (drawer) ───────────────────────────────────────────────
function openMobileSidebar() {
    document.getElementById('adminSidebar')?.classList.add('sidebar-open');
    document.getElementById('sidebarOverlay')?.classList.remove('hidden');
}
function closeMobileSidebar() {
    document.getElementById('adminSidebar')?.classList.remove('sidebar-open');
    document.getElementById('sidebarOverlay')?.classList.add('hidden');
}

// ================================================================
// UTILS
// ================================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const colors = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-[#0ea5e9]';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.className = `toast ${colors} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3`;
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    // Limpiar instancia de mapa al cerrar para evitar memory leaks
    if (id === 'businessModal' && editingBusinessId) {
        delete adminMaps[editingBusinessId];
    }
    editingBusinessId = null;
    editingLeadId = null;
}

async function apiAdminGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${getAdminToken()}` }
        });
        if (res.status === 401 || res.status === 403) { adminLogout(); return { success: false }; }
        return await res.json();
    } catch (err) { return { success: false, error: err.message }; }
}

async function apiAdminPost(endpoint, data, method = 'POST') {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAdminToken()}` },
            body: JSON.stringify(data)
        });
        if (res.status === 401 || res.status === 403) { adminLogout(); return { success: false }; }
        return await res.json();
    } catch (err) { return { success: false, error: err.message }; }
}

async function apiAdminPut(endpoint, data) { return apiAdminPost(endpoint, data, 'PUT'); }
async function apiAdminDelete(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAdminToken()}` }
        });
        if (res.status === 401 || res.status === 403) { adminLogout(); return { success: false }; }
        return await res.json();
    } catch (err) { return { success: false, error: err.message }; }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function highlightMatch(text, search) {
    if (!search || !text) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const regex = new RegExp('(' + search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return escaped.replace(regex, '<span class="search-highlight">$1</span>');
}

// Parse lead data — prioriza campos JOIN del backend, con fallback a notes JSON
function parseLeadNotes(lead) {
    const result = {
        business_name: '',
        ruc: '',
        category_id: '',
        category_name: '',
        description: '',
        address: '',
        city: '',
        website: '',
        image_url: '',
        phone: '',
        contact_email: lead.contact_email || '',
        business_email: '',
        email: '',
        source: '',
        hasJsonData: false,
        rawNotes: ''
    };

    // ── PRIORIDAD 1: campos JOIN del backend (business_*, category_*) ──
    result.business_name = lead.business_name || '';
    result.city          = lead.business_city || '';
    result.phone         = lead.business_phone || '';
    result.description   = lead.business_description || '';
    result.address       = lead.business_address || '';
    result.website       = lead.business_website || '';
    result.ruc           = lead.business_ruc || '';
    result.business_email = lead.business_email || '';
    result.email         = lead.business_email || '';
    result.category_id   = lead.category_id || '';
    result.category_name = lead.category_name || '';

    if (!lead.notes) return result;
    result.rawNotes = String(lead.notes).substring(0, 500);

    // ── PRIORIDAD 2: notes JSON como fallback para campos vacíos ──
    try {
        const p = JSON.parse(lead.notes);
        result.hasJsonData = true;

        if (!result.business_name)
            result.business_name = p.business_name || p.name || p.company_name || p.empresa || '';
        if (!result.ruc)
            result.ruc = p.ruc || p.ruc_number || '';
        if (!result.category_id) {
            const catId = p.category_id || p.category || p.categoryId || p.categoria || '';
            result.category_id = catId;
            if (!result.category_name)
                result.category_name = p.category_name || p.categoryName || getCategoryName(catId) || '';
        }
        if (!result.description)
            result.description = p.description || p.descripcion || p.desc || '';
        if (!result.address)
            result.address = p.address || p.direccion || p.dirección || p.street || '';
        if (!result.city)
            result.city = p.city || p.ciudad || '';
        if (!result.website)
            result.website = p.website || p.web || p.site || '';
        if (!result.image_url)
            result.image_url = p.image_url || p.imageUrl || p.image || '';
        if (!result.phone)
            result.phone = p.phone || p.business_phone || p.company_phone || p.telefono || p.teléfono || '';
        if (!result.email)
            result.email = p.business_email || p.company_email || p.email_empresa || p.email || '';
        if (!result.contact_email && p.contact_email)
            result.contact_email = p.contact_email;
        result.source = p.source || '';

    } catch (e) {
        result.plainNotes = lead.notes;
    }
    return result;
}

// Categories cache for name lookup
let categoriesCache = [];
async function loadCategoriesCache() {
    if (categoriesCache.length > 0) return;
    const data = await apiAdminGet('/categories');
    if (data.success) categoriesCache = data.data || [];
}
function getCategoryName(catId) {
    if (!catId) return '';
    const id = parseInt(catId);
    const cat = categoriesCache.find(c => c.id === id || c.slug === String(catId));
    return cat ? cat.name : '';
}

// Cities cache
let citiesCache = [];
async function loadCitiesCache() {
    if (citiesCache.length > 0) return;
    const data = await apiAdminGet('/cities');
    if (data.success) citiesCache = data.data || [];
}

// Build category <select> options HTML (agrupado padre/hijo con optgroup)
function buildCategoryOptions(selectedId) {
    const none = `<option value="">-- Sin categoría --</option>`;
    return none + buildCategoryGroupedHtml(parseInt(selectedId), new Set());
}

// Devuelve el HTML de las options agrupadas por padre,
// excluyendo IDs presentes en excludeSet. Marca selectedId como selected.
function buildCategoryGroupedHtml(selectedId, excludeSet) {
    if (!categoriesCache || !categoriesCache.length) return '';
    const padres = categoriesCache.filter(c => !c.parent_id)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const hijosBy = new Map();
    for (const c of categoriesCache) {
        if (c.parent_id) {
            const arr = hijosBy.get(c.parent_id) || [];
            arr.push(c);
            hijosBy.set(c.parent_id, arr);
        }
    }
    let html = '';
    for (const p of padres) {
        const hijos = (hijosBy.get(p.id) || []).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        const padreOptHtml = excludeSet.has(p.id)
            ? ''
            : `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (padre)</option>`;
        const hijosOptsHtml = hijos
            .filter(h => !excludeSet.has(h.id))
            .map(h => `<option value="${h.id}" ${selectedId === h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`)
            .join('');
        if (padreOptHtml || hijosOptsHtml) {
            html += `<optgroup label="${escapeHtml(p.name)}">${padreOptHtml}${hijosOptsHtml}</optgroup>`;
        }
    }
    // Huérfanas (padre_id pero el padre no está cacheado)
    const orphans = categoriesCache.filter(c => c.parent_id && !padres.find(p => p.id === c.parent_id) && !excludeSet.has(c.id));
    if (orphans.length) {
        html += `<optgroup label="(sin padre)">` + orphans.map(c =>
            `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
        ).join('') + `</optgroup>`;
    }
    return html;
}

function getCategoryById(id) {
    if (!id) return null;
    const idNum = parseInt(id);
    return categoriesCache.find(c => c.id === idNum) || null;
}

// Devuelve el max_categories del plan (lectura desde cache de plansCache o defaults)
const PLAN_MAX_CATS = { basic: 1, featured: 2, premium: 5 };
function getMaxCategoriesForPlan(planType) {
    if (typeof plansCache !== 'undefined' && Array.isArray(plansCache)) {
        const p = plansCache.find(x => x.id === planType);
        if (p && p.max_categories) return parseInt(p.max_categories);
    }
    return PLAN_MAX_CATS[planType] || 1;
}

// Build city <select> options HTML (grouped by department)
function buildCityOptions(selectedCity) {
    const none = `<option value="">-- Sin ciudad --</option>`;
    const byDept = {};
    citiesCache.forEach(c => {
        if (!byDept[c.department]) byDept[c.department] = [];
        byDept[c.department].push(c);
    });
    let html = none;
    Object.keys(byDept).sort().forEach(dept => {
        html += `<optgroup label="${escapeHtml(dept)}">`;
        byDept[dept].forEach(c => {
            const sel = (c.name === selectedCity) ? 'selected' : '';
            html += `<option value="${escapeHtml(c.name)}" ${sel}>${escapeHtml(c.name)}</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

// Status helpers
const STATUS_CONFIG = {
    pending: { label: 'Pendiente', badgeClass: 'badge-pending', icon: 'fa-clock', color: '#92400e' },
    contacted: { label: 'Contactado', badgeClass: 'badge-contacted', icon: 'fa-phone', color: '#1d4ed8' },
    negotiating: { label: 'Negociando', badgeClass: 'badge-negotiating', icon: 'fa-handshake', color: '#6d28d9' },
    won: { label: 'Ganado', badgeClass: 'badge-won', icon: 'fa-trophy', color: '#065f46' },
    lost: { label: 'Perdido', badgeClass: 'badge-lost', icon: 'fa-times', color: '#991b1b' },
    follow_up: { label: 'Seguimiento', badgeClass: 'badge-followup', icon: 'fa-redo', color: '#c2410c' },
    closed: { label: 'Cerrado', badgeClass: 'badge-won', icon: 'fa-check', color: '#065f46' },
    // Estados legacy de claims: 'new' (recién creado) → Pendiente; 'completed' (aprobado viejo) → Ganado.
    new: { label: 'Pendiente', badgeClass: 'badge-pending', icon: 'fa-clock', color: '#92400e' },
    completed: { label: 'Ganado', badgeClass: 'badge-won', icon: 'fa-trophy', color: '#065f46' },
    // Estados de CAPTACIÓN (registros web autogestionados): Nuevo → Verificado / Descartado
    verificado: { label: 'Verificado', badgeClass: 'badge-verified', icon: 'fa-shield-alt', color: '#065f46' },
    descartado: { label: 'Descartado', badgeClass: 'badge-inactive', icon: 'fa-ban', color: '#6b7280' }
};

// ¿Es un lead de CAPTACIÓN (alta de ficha gratis) y no un lead de venta?
// La ficha gratis = plan 'basic' (o sin plan). Los pedidos de plan pago
// (featured/premium), boosts y reclamos son VENTA/conversión, no captación.
// La marca notes.source='web_register' se respeta como señal explícita extra.
function isCaptacionLead(lead) {
    if (!lead) return false;
    const svc = (lead.service_type || '').toLowerCase();
    // Venta / conversión explícita: nunca es captación.
    if (svc === 'featured' || svc === 'premium' || svc === 'claim' || svc === 'promo_boost') return false;
    // Señal explícita del formulario de registro.
    let src = lead.source || '';
    if (!src) { try { src = JSON.parse(lead.notes || '{}').source || ''; } catch (e) { src = ''; } }
    if (src === 'web_register') return true;
    // Fallback robusto: alta de ficha gratis = plan básico o sin plan.
    return svc === 'basic' || svc === '';
}
// Para captación, "Pendiente" se lee como "Nuevo".
function getCaptacionStatusLabel(status) {
    if (status === 'pending' || !status) return 'Nuevo';
    return getStatusLabel(status);
}

function getStatusBadge(status) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return `<span class="badge ${cfg.badgeClass}"><i class="fas ${cfg.icon}"></i> ${cfg.label}</span>`;
}

function getStatusLabel(status) {
    return (STATUS_CONFIG[status] || STATUS_CONFIG.pending).label;
}

// Pipeline order for visual pipeline
const PIPELINE_STEPS = ['pending', 'contacted', 'negotiating', 'won'];


// ================================================================
// UTILIDADES GLOBALES (Sprint 5)
// ================================================================

// debounce global — disponible para todos los módulos del admin
if (typeof debounce === 'undefined') {
    window.debounce = function(fn, delay) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
    };
}

// formatDateShort global — disponible para todos los módulos
if (typeof formatDateShort === 'undefined') {
    window.formatDateShort = function(dateStr) {
        if (!dateStr) return '—';
        try {
            return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(dateStr));
        } catch (e) { return dateStr.slice(0,10); }
    };
}
