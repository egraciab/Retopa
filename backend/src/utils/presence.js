// presence.js — marca de actividad para "usuarios conectados" del panel admin.
// CUALQUIER usuario logueado cuenta (cliente, embajador, admin/godmode); antes
// solo se marcaba en el portal del cliente. Throttled: solo escribe si pasó
// más de 60s desde la última marca. Fire & forget (no bloquea la request).
function touchLastSeen(pool, decoded) {
    try {
        const uid = decoded && (decoded.id || decoded.userId);
        if (!uid || !pool) return Promise.resolve();
        // Devuelve la promesa (los call sites la ignoran = fire & forget; los tests la pueden await).
        return pool.query(
            "UPDATE users SET last_seen_at=NOW() WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '60 seconds')",
            [uid]
        ).catch(() => {});
    } catch (e) { /* nunca romper la auth por esto */ return Promise.resolve(); }
}

module.exports = { touchLastSeen };
