/**
 * RetoPA — Panel del Cliente
 * config.js: Auth, estado, API helpers
 */

const API_BASE = '/api/v2';
let currentUser = null;
let myBusinesses = [];
let activeBizSlug = null;

// ── Auth check ────────────────────────────────────────────────────────────
(function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/?login=1'; return; }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('token');
            window.location.href = '/?login=1'; return;
        }
        currentUser = payload;
    } catch(e) {
        localStorage.removeItem('token');
        window.location.href = '/?login=1';
    }
})();

function getToken() { return localStorage.getItem('token') || ''; }

function clientLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

// ── API helpers ───────────────────────────────────────────────────────────
async function clientGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.status === 401) { clientLogout(); return { success: false }; }
        return await res.json();
    } catch(e) { return { success: false, error: e.message }; }
}

async function clientPost(endpoint, data, method = 'POST') {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(data)
        });
        if (res.status === 401) { clientLogout(); return { success: false }; }
        return await res.json();
    } catch(e) { return { success: false, error: e.message }; }
}

async function clientPut(endpoint, data) { return clientPost(endpoint, data, 'PUT'); }

// ── UI helpers ────────────────────────────────────────────────────────────
function showToastClient(msg, type = 'success') {
    const el = document.getElementById('clientToast');
    const msgEl = document.getElementById('clientToastMsg');
    const icon = type === 'error' ? 'fa-exclamation-circle text-red-400' : 'fa-check-circle text-green-400';
    msgEl.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getPlanLabel(plan) {
    return { premium: '⭐ Pro', featured: '🏆 Destacado', basic: '📋 Básico' }[plan] || plan;
}

function getPlanColor(plan) {
    return { premium: 'bg-blue-100 text-blue-700', featured: 'bg-amber-100 text-amber-700', basic: 'bg-gray-100 text-gray-600' }[plan] || 'bg-gray-100 text-gray-600';
}
