/**
 * RetoPA Admin — auth.js
 * Compatibilidad: este archivo es legacy, la auth real está en config.js
 * Redirige todo al sistema JWT de config.js
 */

// Estas funciones son llamadas por código legacy — redirigen al JWT
function getAdminKey() { return getAdminToken(); }
function setAdminKey(key) { /* no-op, usamos JWT */ }
function clearAdminKey() { adminLogout(); }
function adminHeaders(extra = {}) {
    return { ...extra, 'Authorization': `Bearer ${getAdminToken()}` };
}
function getToken() { return getAdminToken(); }
function authHeaders(extra = {}) { return adminHeaders(extra); }
async function requireAdminSession() { return true; }
async function requireSession() { return true; }
