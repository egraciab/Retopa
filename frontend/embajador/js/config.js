/**
 * RetoPA — Panel Embajador
 * config.js: Auth, estado, API helpers
 * Misma lógica que panel cliente — reutiliza token del sitio principal
 */

const API_BASE = '/api/v2';
let currentUser = null;

// ── Auth check ─────────────────────────────────────────────────────────────
(function checkAuth() {
    // Reutilizar token del sitio principal; si no existe, redirigir al login
    const token = localStorage.getItem('token') || localStorage.getItem('amb_token');
    if (!token) { window.location.href = '/?login=1'; return; }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('token');
            localStorage.removeItem('amb_token');
            window.location.href = '/?login=1'; return;
        }
        // Verificar que tenga rol válido para este panel
        if (!['ambassador', 'admin', 'godmode'].includes(payload.role)) {
            window.location.href = '/'; return;
        }
        currentUser = payload;
    } catch(e) {
        window.location.href = '/?login=1';
    }
})();

function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('amb_token') || '';
}

// ── Vigilancia de sesión ────────────────────────────────────────────────────
// El token puede vencer mientras el panel está abierto y quieto (sin llamadas
// a la API). Sin esto, el usuario seguía viendo su nombre como si estuviera
// logueado hasta que hacía una acción. Revisamos exp periódicamente y al volver
// a la pestaña, y redirigimos apenas venció.
function _ambTokenExpired() {
    const token = getToken();
    if (!token) return true;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return !payload.exp || (payload.exp * 1000 <= Date.now());
    } catch (e) { return true; }
}

let _ambSessionRedirecting = false;
function _ambCheckSession() {
    if (_ambSessionRedirecting) return;
    if (_ambTokenExpired()) {
        _ambSessionRedirecting = true;
        localStorage.removeItem('token');
        localStorage.removeItem('amb_token');
        try { showToastAmb('Tu sesión venció. Redirigiendo al inicio…', 'warning'); } catch (e) {}
        setTimeout(() => { window.location.href = '/?login=1'; }, 1200);
    }
}
// Cada 60s y cada vez que el usuario vuelve a la pestaña.
setInterval(_ambCheckSession, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) _ambCheckSession(); });

function ambassadorLogout() {
    // Solo cerrar sesión del panel; redirigir al sitio
    window.location.href = '/';
}

// ── API helpers ────────────────────────────────────────────────────────────
async function ambGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.status === 401) { window.location.href = '/?login=1'; return { success: false }; }
        return await res.json();
    } catch(e) { return { success: false, error: e.message }; }
}

async function ambPost(endpoint, data, method = 'POST') {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(data)
        });
        if (res.status === 401) { window.location.href = '/?login=1'; return { success: false }; }
        return await res.json();
    } catch(e) { return { success: false, error: e.message }; }
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showToastAmb(msg, type = 'success') {
    const el    = document.getElementById('clientToast');
    const msgEl = document.getElementById('clientToastMsg');
    if (!el || !msgEl) return;
    const icon = type === 'error'   ? 'fa-exclamation-circle text-red-400'
               : type === 'warning' ? 'fa-exclamation-triangle text-amber-400'
               : 'fa-check-circle text-green-400';
    msgEl.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
}

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(str) {
    if (!str) return '';
    return new Date(str).toLocaleDateString('es-PY', { day:'2-digit', month:'short', year:'numeric' });
}
