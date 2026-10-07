/**
 * RetoPA — utils/phone.js
 * Normaliza teléfonos paraguayos a formato +595XXXXXXXXX
 */

/**
 * normalizePhone(raw) → '+595XXXXXXXXX' o el original si no es paraguayo
 */
function normalizePhone(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Ya tiene código correcto con +
    if (/^\+595\d{7,10}$/.test(trimmed)) return trimmed;

    // Solo dígitos
    let digits = trimmed.replace(/\D/g, '');
    if (!digits) return null;

    // Ya tiene 595 + número local (11-13 dígitos)
    if (digits.startsWith('595') && digits.length >= 11 && digits.length <= 13)
        return '+' + digits;

    // Empieza con 0 (ej: 0981123456)
    if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11)
        return '+595' + digits.slice(1);

    // Solo número local sin 0 (7-10 dígitos — Paraguay)
    if (digits.length >= 7 && digits.length <= 10)
        return '+595' + digits;

    // Número con otro código de país — devolver limpio con +
    if (digits.length > 10 && !digits.startsWith('595'))
        return '+' + digits;

    return '+' + digits;
}

/**
 * phoneToWa(raw) → solo dígitos para wa.me (sin +)
 */
function phoneToWa(raw) {
    const normalized = normalizePhone(raw);
    if (!normalized) return '';
    return normalized.replace(/\D/g, '');
}

module.exports = { normalizePhone, phoneToWa };
