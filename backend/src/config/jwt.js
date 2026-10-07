/**
 * RetoPA — config/jwt.js
 * Secreto JWT centralizado. SEGURIDAD: falla al arrancar si no está configurado,
 * en vez de caer a un default adivinable (antes había 'retopa-secret-key' /
 * 'retopa_secret' repartidos por el código → tokens falsificables si el env
 * quedaba sin setear). En producción el .env define JWT_SECRET, así que esto no
 * afecta el arranque normal; solo evita arrancar de forma insegura.
 */
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET no está configurado. Definilo en el entorno (.env). Abortando arranque.');
  process.exit(1);
}
if (JWT_SECRET.length < 16) {
  console.warn('[WARN] JWT_SECRET es corto (<16 caracteres). Usá un valor aleatorio de 32+ caracteres.');
}

module.exports = JWT_SECRET;
