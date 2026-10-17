/**
 * RetoPA — helpers/claimFlow.js
 * Piezas puras (y una consulta) del reclamo E1 (2026-10-13).
 *
 *  - mobilePY(raw)          → '5959XXXXXXXX' si es un celular paraguayo, si no null.
 *  - loadRubros(pool)       → rubros HOJA (sin hijos), con el nombre del padre como grupo.
 *  - suggestRubro(biz, rubros, currentIds)
 *        Regla de producto: sugerir CON FUENTE o abstenerse; nunca por verosimilitud.
 *        1) Si la ficha ya tiene un rubro hoja → "Es el rubro que figura hoy en tu ficha".
 *        2) Si una palabra del nombre coincide con UN solo rubro → "Porque el nombre dice «X»".
 *        3) Si no hay coincidencia o hay más de una → sin sugerencia.
 */

function mobilePY(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    const m = d.match(/^(?:595|0)?(9\d{8})$/);
    return m ? '595' + m[1] : null;
}

// 5959XXXXXXXX → 09XX XXX XXX (como lo escribe la gente)
function mobileLocal(wa) {
    const m = String(wa || '').match(/^595(9\d{2})(\d{3})(\d{3})$/);
    return m ? `0${m[1]} ${m[2]} ${m[3]}` : '';
}

async function loadRubros(pool) {
    const { rows } = await pool.query(`
        SELECT c.id, c.name, c.slug, p.name AS grupo
          FROM categories c
          LEFT JOIN categories p ON p.id = c.parent_id
         WHERE NOT EXISTS (SELECT 1 FROM categories h WHERE h.parent_id = c.id)
         ORDER BY c.name ASC`);
    return rows;
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Raíz simple: saca plurales (es/s) para que "Ferretería" coincida con "Ferreterías".
const stem = w => w.replace(/(es|s)$/, '');
// Palabras que no identifican un rubro por sí solas.
const STOP = new Set(['servicio', 'servicios', 'venta', 'ventas', 'tienda', 'tiendas', 'producto', 'productos',
    'comercio', 'comercial', 'general', 'generales', 'empresa', 'empresas', 'centro', 'casa', 'grupo',
    'paraguay', 'asuncion', 'sociedad', 'anonima', 'distribuidora', 'importadora', 'insumos', 'otros']);

function words(s) {
    return norm(s).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 5 && !STOP.has(w));
}

function suggestRubro(biz, rubros, currentIds = []) {
    const leafById = new Map(rubros.map(r => [r.id, r]));
    // 1) El rubro actual de la ficha, si es una hoja (específico).
    for (const id of currentIds) {
        const r = leafById.get(id);
        if (r) return { id: r.id, name: r.name, reason: 'Es el rubro que figura hoy en tu ficha' };
    }
    // 2) Coincidencia del nombre con UN solo rubro.
    const original = `${biz.trade_name || ''} ${biz.name || ''}`;
    const bizWords = new Map(); // raíz → palabra original
    for (const w of String(original).split(/\s+/)) {
        for (const nw of words(w)) bizWords.set(stem(nw), w.replace(/[^\p{L}\p{N}]/gu, ''));
    }
    if (!bizWords.size) return null;
    const hits = [];
    for (const r of rubros) {
        const match = words(r.name).map(stem).find(s => bizWords.has(s));
        if (match) hits.push({ r, word: bizWords.get(match) });
    }
    if (hits.length !== 1) return null; // ninguna o ambigua → abstenerse
    return { id: hits[0].r.id, name: hits[0].r.name, reason: `Porque el nombre dice «${hits[0].word}»` };
}

module.exports = { mobilePY, mobileLocal, loadRubros, suggestRubro };
