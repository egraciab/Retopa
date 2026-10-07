// ============================================
// RETOPA — Kit QR imprimible (A5)
// QR a la ficha pública (con utm de kit) + CTA de reseña.
// Server-side con pdfkit + qrcode (puro JS, sin headless browser).
// Lo usan el panel del cliente (kit individual) y el batch admin/embajador.
// ============================================
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads/images';
const RETOPA_LOGO_PATH = path.join(__dirname, '../assets/retopa-logo.png');
let _retopaLogo;
function retopaLogo() {
  if (_retopaLogo === undefined) {
    try { _retopaLogo = fs.readFileSync(RETOPA_LOGO_PATH); } catch (e) { _retopaLogo = null; }
  }
  return _retopaLogo;
}
// Logo/foto del negocio desde /uploads/images (webp→png con sharp, ya es dependencia). Null si falta.
async function loadBizLogo(imageUrl) {
  if (!imageUrl) return null;
  try {
    const file = path.join(UPLOADS_DIR, path.basename(String(imageUrl).split('?')[0]));
    if (!fs.existsSync(file)) return null;
    return await sharp(file).resize(320, 320, { fit: 'inside' }).png().toBuffer();
  } catch (e) { return null; }
}

// Logo de RetoPA para el kit: DINÁMICO desde site_config.logo_url (editado en el Admin),
// con fallback al asset bundleado si no está cargado o no se puede leer.
async function loadSiteLogo(cfg) {
  const dyn = await loadBizLogo(cfg && cfg.logo_url);
  return dyn || retopaLogo();
}

const BRAND = '#0284c7';
const DARK  = '#1B3A6B';
const INK   = '#0f172a';
const MUTE  = '#64748b';
const LINE  = '#e2e8f0';

function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Quita emojis/símbolos que la fuente Helvetica (WinAnsi) no puede dibujar (evita "tofu").
function safeText(s) {
  return String(s || '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Nombre visible: comercial (trade_name) con fallback al legal (name).
function displayName(biz) {
  return biz.tradeName || biz.trade_name || biz.name || '';
}

// Texto del kit: override del dueño (kit_cta) → default global (site_config) → default de marca.
const DEFAULT_KIT_CTA = '¿Te gustó la atención? Dejanos tu reseña en RetoPA';
function resolveCta(biz, cfg) {
  return biz.kit_cta || cfg.qr_kit_cta || DEFAULT_KIT_CTA;
}

// URL canónica de la ficha + utm del kit (no rompe la canónica — ver D1.2).
function fichaUrl(siteUrl, biz) {
  const cat  = biz.categorySlug || biz.category_slug || 'general';
  const city = biz.city ? slugify(biz.city) : 'paraguay';
  return `${siteUrl}/negocios/${cat}/${city}/${biz.slug}?utm_source=qr&utm_medium=offline`;
}

// Dibuja UNA hoja A5 "Pro" con el kit del negocio en el documento actual.
async function renderKitPage(doc, biz, cfg) {
  const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
  const siteName = cfg.site_name || 'RetoPA';
  const cta      = safeText(resolveCta(biz, cfg));
  const url      = fichaUrl(siteUrl, biz);
  const host     = siteUrl.replace(/^https?:\/\//, '');
  const rubro    = safeText(biz.categoryName || biz.category_name || ''); // rubro principal; sin ciudad
  const W  = doc.page.width;   // A5 ~ 419.5pt
  const H  = doc.page.height;
  const cx = W / 2;
  const M  = 40;

  // Borde de corte punteado (material imprimible)
  doc.save().dash(4, { space: 4 }).lineWidth(1).strokeColor('#cbd5e1').roundedRect(18, 18, W - 36, H - 36, 14).stroke().undash().restore();

  // Header: banda + logo DINÁMICO (site_config.logo_url) + wordmark + tagline
  doc.save().fillColor('#f1f5f9').roundedRect(30, 30, W - 60, 74, 12).fill().restore();
  const logo = await loadSiteLogo(cfg);
  if (logo) doc.image(logo, 44, 42, { fit: [50, 50] });
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(24).text(safeText(siteName), 104, 50);
  doc.fillColor(MUTE).font('Helvetica').fontSize(9).text('El ecosistema comercial de Paraguay', 104, 81);

  // Centro (flow): logo del negocio (si tiene) + nombre comercial + rubro
  let y = 122;
  const bizLogo = await loadBizLogo(biz.imageUrl || biz.image_url);
  if (bizLogo) {
    const bs = 66;
    doc.save().lineWidth(1).strokeColor(LINE).roundedRect(cx - bs / 2 - 4, y - 4, bs + 8, bs + 8, 14).stroke().restore();
    doc.image(bizLogo, cx - bs / 2, y, { fit: [bs, bs] });
    y += bs + 14;
  }
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(21).text(safeText(displayName(biz)), M, y, { align: 'center', width: W - 2 * M });
  y = doc.y + 2;
  if (rubro) {
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(10.5).text(rubro.toUpperCase(), M, y, { align: 'center', width: W - 2 * M, characterSpacing: 0.5 });
    y = doc.y + 12;
  } else { y += 10; }

  // Caja del QR
  const box = 190, bx = cx - box / 2;
  doc.save().lineWidth(1).roundedRect(bx, y, box, box, 16).fillAndStroke('#ffffff', LINE).restore();
  const qrPng = await QRCode.toBuffer(url, { type: 'png', width: 600, margin: 0, errorCorrectionLevel: 'M' });
  const qs = box - 32;
  doc.image(qrPng, cx - qs / 2, y + 16, { width: qs, height: qs });
  y += box + 16;

  // CTA de reseña + instrucción
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(cta, M, y, { align: 'center', width: W - 2 * M });
  doc.moveDown(0.4);
  doc.fillColor(MUTE).font('Helvetica').fontSize(10.5).text('Escaneá el código con la cámara de tu celular', { align: 'center', width: W - 2 * M });

  // Footer: banda oscura con el dominio (link a la ficha)
  const fy = H - 64;
  doc.save().fillColor(DARK).roundedRect(30, fy, W - 60, 34, 10).fill().restore();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(host, 30, fy + 11, { align: 'center', width: W - 60, link: url });
}

// Reúne el stream de pdfkit en un Buffer.
function _collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// PDF de una sola hoja (kit de un negocio).
async function buildKitPdf(biz, cfg = {}) {
  const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: `Kit RetoPA - ${safeText(displayName(biz))}` } });
  const done = _collect(doc);
  await renderKitPage(doc, biz, cfg);
  doc.end();
  return done;
}

// PDF multipágina (batch admin/embajador): una hoja por negocio.
async function buildKitBatchPdf(list, cfg = {}) {
  const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: 'Kits RetoPA (lote)' } });
  const done = _collect(doc);
  for (let i = 0; i < list.length; i++) {
    if (i > 0) doc.addPage();
    await renderKitPage(doc, list[i], cfg);
  }
  doc.end();
  return done;
}

module.exports = { buildKitPdf, buildKitBatchPdf, fichaUrl, slugify, safeText, displayName, resolveCta, DEFAULT_KIT_CTA, loadSiteLogo, loadBizLogo };
