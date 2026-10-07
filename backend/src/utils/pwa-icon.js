// ============================================
// RETOPA — Íconos PWA dinámicos
// Genera PNG cuadrados (192/512/180) desde el logo del sitio (site_config.logo_url),
// con padding para la "safe zone" del maskable. Fallback al logo bundleado.
// sharp ya es dependencia del backend.
// ============================================
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads/images';
const FALLBACK = path.join(__dirname, '../assets/retopa-logo.png');
const _cache = new Map(); // `${logoUrl}:${size}` → Buffer

function _sourceBuffer(logoUrl) {
  if (logoUrl) {
    try {
      const file = path.join(UPLOADS_DIR, path.basename(String(logoUrl).split('?')[0]));
      if (fs.existsSync(file)) return fs.readFileSync(file);
    } catch (e) {}
  }
  try { return fs.readFileSync(FALLBACK); } catch (e) { return null; }
}

// PNG cuadrado size×size: logo al 82% centrado sobre fondo blanco opaco (maskable-safe).
async function getPwaIcon(size, logoUrl) {
  const key = `${logoUrl || 'default'}:${size}`;
  if (_cache.has(key)) return _cache.get(key);
  const src = _sourceBuffer(logoUrl);
  if (!src) return null;
  const inner = Math.round(size * 0.82);
  const logoPng = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png().toBuffer();
  const icon = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: logoPng, gravity: 'center' }])
    .png().toBuffer();
  if (_cache.size > 24) _cache.clear();
  _cache.set(key, icon);
  return icon;
}

module.exports = { getPwaIcon };
