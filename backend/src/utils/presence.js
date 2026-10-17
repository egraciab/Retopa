// presence.js — marca de actividad para "usuarios conectados" del panel admin.
// CUALQUIER usuario logueado cuenta (cliente, embajador, admin/godmode); antes
// solo se marcaba en el portal del cliente. Throttled: solo escribe si pasó
// más de 60s desde la última marca. Fire & forget (no bloquea la request).
//
// 2026-10-12: además fija first_seen_at (primer ingreso real) la primera vez —
// last_seen_at se pisa y no sirve para medir "cuánto tardó en entrar después de
// reclamar". Si la migración todavía no agregó la columna (42703), cae a la
// consulta anterior: la marca de presencia nunca se pierde.
const SQL_NEW = "UPDATE users SET last_seen_at=NOW(), first_seen_at=COALESCE(first_seen_at, NOW()) WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '60 seconds')";
const SQL_OLD = "UPDATE users SET last_seen_at=NOW() WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '60 seconds')";

function touchLastSeen(pool, decoded) {
    try {
        const uid = decoded && (decoded.id || decoded.userId);
        if (!uid || !pool) return Promise.resolve();
        // Devuelve la promesa (los call sites la ignoran = fire & forget; los tests la pueden await).
        return pool.query(SQL_NEW, [uid])
            .catch(e => (e && e.code === '42703') ? pool.query(SQL_OLD, [uid]) : undefined)
            .catch(() => {});
    } catch (e) { /* nunca romper la auth por esto */ return Promise.resolve(); }
}

module.exports = { touchLastSeen };
