/**
 * RetoPA — utils/plan-limits.js
 * Cache de límites de planes — se lee de la BD, configurable desde Panel Admin
 * Cache en memoria por 60s para no golpear la BD en cada request
 */

const pool = require('../db');

let _cache   = null;
let _cacheAt = 0;
const CACHE_MS = 60_000;

// Defaults — fallback si la BD falla o no tiene el plan
const DEFAULTS = {
    basic: {
        max_categories: 1, max_gallery: 0, max_social: 0, max_tags: 5,
        has_whatsapp: true, has_hours: false, has_gallery: false,
        has_map: false, has_social: false, has_reviews_reply: false,
        priority_boost: 0,
    },
    featured: {
        max_categories: 2, max_gallery: 5, max_social: 2, max_tags: 10,
        has_whatsapp: true, has_hours: true, has_gallery: true,
        has_map: true, has_social: true, has_reviews_reply: false,
        priority_boost: 3,
    },
    premium: {
        max_categories: 5, max_gallery: 10, max_social: 6, max_tags: 20,
        has_whatsapp: true, has_hours: true, has_gallery: true,
        has_map: true, has_social: true, has_reviews_reply: true,
        priority_boost: 6,
    },
};

async function loadAll() {
    const now = Date.now();
    if (_cache && (now - _cacheAt) < CACHE_MS) return _cache;

    try {
        const r = await pool.query(`
            SELECT id,
                   COALESCE(max_categories,   1)    AS max_categories,
                   COALESCE(max_gallery,       0)    AS max_gallery,
                   COALESCE(max_social,        0)    AS max_social,
                   COALESCE(max_tags,          5)    AS max_tags,
                   COALESCE(has_whatsapp,      true) AS has_whatsapp,
                   COALESCE(has_hours,         false) AS has_hours,
                   COALESCE(has_gallery,       false) AS has_gallery,
                   COALESCE(has_map,           false) AS has_map,
                   COALESCE(has_social,        false) AS has_social,
                   COALESCE(has_reviews_reply, false) AS has_reviews_reply,
                   COALESCE(priority_boost,    0)    AS priority_boost
            FROM plans WHERE is_active = TRUE
        `);
        _cache = {};
        for (const row of r.rows) {
            _cache[row.id] = row;
        }
        _cacheAt = now;
    } catch(e) {
        console.warn('[plan-limits] BD no disponible, usando defaults:', e.message);
        _cache   = { ...DEFAULTS };
        _cacheAt = now;
    }
    return _cache;
}

async function getPlanLimits(planId) {
    const all = await loadAll();
    return all[planId] || all.basic || DEFAULTS.basic;
}

async function getAllLimits() {
    return loadAll();
}

function invalidate() {
    _cache   = null;
    _cacheAt = 0;
}

module.exports = { getPlanLimits, getAllLimits, invalidate };
