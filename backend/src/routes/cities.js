const express = require('express');
const router = express.Router();
const pool = require('../db');
const redisClient = require('../config/redis');

const CACHE_TTL = 600;

async function getCache(key) {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}

async function setCache(key, data, ttl = CACHE_TTL) {
    try {
        await redisClient.setEx(key, ttl, JSON.stringify(data));
    } catch (e) {}
}

// ============================================
// CIUDADES
// ============================================
router.get('/cities', async (req, res) => {
    try {
        const { department, q } = req.query;
        const cacheKey = `dir:cities:${department || 'all'}:${q || ''}`;
        let data = await getCache(cacheKey);

        if (!data) {
            let query = 'SELECT id, name, department, slug, lat, lng FROM cities WHERE is_active = TRUE';
            let params = [];
            let idx = 1;

            if (department) {
                query += ` AND department = $${idx}`;
                params.push(department);
                idx++;
            }
            if (q) {
                query += ` AND (unaccent(name) ILIKE unaccent($${idx}) OR similarity(name, $${idx+1}) > 0.3)`;
                params.push(`%${q}%`, q);
                idx += 2;
            }

            query += ' ORDER BY department, name';

            const result = await pool.query(query, params);
            data = result.rows;
            await setCache(cacheKey, data, 600);
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Ciudades por departamento (para dropdowns agrupados)
router.get('/cities/by-department', async (req, res) => {
    try {
        const cacheKey = 'dir:cities:by-dept';
        let data = await getCache(cacheKey);

        if (!data) {
            const result = await pool.query(`
                SELECT department, 
                       json_agg(json_build_object('id', id, 'name', name, 'slug', slug, 'lat', lat, 'lng', lng) ORDER BY name) as cities
                FROM cities 
                WHERE is_active = TRUE 
                GROUP BY department 
                ORDER BY department
            `);
            data = result.rows;
            await setCache(cacheKey, data, 600);
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
