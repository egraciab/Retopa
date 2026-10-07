/**
 * RetoPA — helpers/notifyOwner.js
 * Helper para notificar al dueño de una empresa por email.
 */

const { Pool } = require('pg');
const { sendEmail } = require('../config/mail');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'postgres',
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || process.env.POSTGRES_DB,
    user:     process.env.DB_USER     || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

async function getOwnerData(businessId) {
    const result = await pool.query(`
        SELECT u.email, u.name, b.plan_type, b.name AS business_name,
               b.trade_name, b.slug, b.like_count
        FROM users u
        JOIN user_businesses ub ON ub.user_id = u.id
        JOIN businesses b ON b.id = ub.business_id
        WHERE ub.business_id = $1 AND ub.is_owner = TRUE
          AND u.email IS NOT NULL AND u.email != ''
        LIMIT 1
    `, [businessId]);
    return result.rows[0] || null;
}

async function getSiteConfig() {
    const result = await pool.query(
        "SELECT key, value FROM site_config WHERE key IN ('site_name','site_url')"
    ).catch(() => ({ rows: [] }));
    const cfg = {};
    result.rows.forEach(r => { cfg[r.key] = r.value; });
    return {
        siteName: cfg.site_name || 'RetoPA',
        siteUrl:  (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, ''),
    };
}

async function notifyOwner(businessId, templateName, extraData = {}) {
    try {
        const owner = await getOwnerData(businessId);
        if (!owner) return;

        const { siteName, siteUrl } = await getSiteConfig();
        const businessName = owner.trade_name || owner.business_name;

        await sendEmail(owner.email, templateName, {
            ownerName:    owner.name,
            businessName,
            businessUrl:  `${siteUrl}/negocio/${owner.slug}`,
            panelUrl:     `${siteUrl}/cliente`,
            siteName,
            siteUrl,
            planType:     owner.plan_type,
            canReply:     owner.plan_type === 'premium',
            ...extraData,
        });
    } catch (err) {
        console.warn(`[notifyOwner] ${templateName} → biz ${businessId}:`, err.message);
    }
}

const LIKE_MILESTONES = new Set([5, 10, 25, 50, 100, 250, 500, 1000]);

module.exports = { notifyOwner, getOwnerData, getSiteConfig, LIKE_MILESTONES };
