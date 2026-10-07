/**
 * RetoPA — js/config.js
 * Estado global, constantes, helpers (imgFallback, apiGet, apiPost)
 */

const API_BASE = '/api/v2';
let currentCategory = null;
let currentSearch = '';
let currentCity = '';
let currentOffset = 0;
let currentViewMode = 'cards'; // 'cards' | 'list'
// ── Placeholders de imagen (sin dependencias externas) ──────────────
function imgFallback(el) {
    el.onerror = null;
    el.src = IMG_PLACEHOLDER_COVER;
}

const IMG_PLACEHOLDER_COVER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect width='400' height='200' fill='%23f1f5f9'/%3E%3Crect x='160' y='60' width='80' height='80' rx='8' fill='%23cbd5e1'/%3E%3Crect x='178' y='100' width='18' height='40' fill='%23f1f5f9'/%3E%3Crect x='204' y='100' width='18' height='40' fill='%23f1f5f9'/%3E%3C/svg%3E";
const IMG_PLACEHOLDER_LOGO  = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Crect x='25' y='20' width='50' height='60' rx='4' fill='%23cbd5e1'/%3E%3C/svg%3E";


let isLoading = false;
let selectedPlan = 'basic';
let allCategories = [];
let allCities = [];
let currentUser = null;
let uploadedImageBase64 = null;

async function apiGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return { success: false, error: err.message };
    }
}

async function apiPost(endpoint, data) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return { success: false, error: err.message };
    }
}

// ============================================
// INICIALIZACIÓN
