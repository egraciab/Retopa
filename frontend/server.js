/**
 * RETOPA — Frontend server con SSR ligero para SEO
 *
 * Estrategia:
 *  - /empresa/:slug       → HTML completo con meta tags + Schema.org (Googlebot indexa)
 *  - /sitemap.xml         → sitemap dinámico con todas las empresas + categorías
 *  - /robots.txt          → permite todo, apunta al sitemap
 *  - /                    → index.html + meta tags del sitio inyectados
 *  - todo lo demás        → index.html normal (SPA)
 *
 * El servidor llama al backend internamente (red Docker) para obtener datos.
 * El browser recibe HTML completo → JS hidrata la SPA normalmente.
 */

const express = require('express');
const path    = require('path');
const http    = require('http');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Configuración ──────────────────────────────────────────────────────────
const SITE_URL      = process.env.SITE_URL      || 'https://retopa.com.py';
const SITE_NAME     = process.env.SITE_NAME     || 'RetoPA';
const SITE_DESC     = process.env.SITE_DESC     || 'El ecosistema comercial de Paraguay. Encontrá negocios, empresas y profesionales en todo el país.';
const BACKEND_HOST  = process.env.BACKEND_HOST  || 'retopa-backend';
const BACKEND_PORT  = parseInt(process.env.BACKEND_PORT || '3000');
const DEFAULT_OG    = `${SITE_URL}/og-default.png`;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Llamada HTTP al backend interno (sin pasar por nginx) */
function fetchBackend(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: `/api/v2${path}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Backend timeout')); });
    req.end();
  });
}

/** Escapa HTML para evitar XSS en meta tags */
function postBackend(p, body, fwd = {}) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || {});
    const options = {
      hostname: BACKEND_HOST, port: BACKEND_PORT,
      path: `/api/v2${p}`, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(fwd['x-forwarded-for'] ? { 'X-Forwarded-For': fwd['x-forwarded-for'] } : {}),
        ...(fwd['user-agent']      ? { 'User-Agent': fwd['user-agent'] } : {}),
        ...(fwd['referer']         ? { 'Referer': fwd['referer'] } : {}),
      },
    };
    const rq = http.request(options, r => { r.on('data', () => {}); r.on('end', resolve); });
    rq.on('error', () => resolve());
    rq.setTimeout(3000, () => { rq.destroy(); resolve(); });
    rq.write(payload); rq.end();
  });
}

// Bots conocidos — para NO contar sus visitas como vistas humanas
function isCrawler(ua) {
  return /(googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|applebot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|bot\b|crawler|spider)/i.test(ua || '');
}

// Espeja plan-limits (defaults vigentes): basic NO incluye horarios/redes/galeria;
// featured/premium SI. server.js no puede importar plan-limits (contenedor distinto),
// se gatea por tier — reproduce exactamente los has_* por defecto de la tabla plans.
function planShowsFeature(planType) {
  return planType === 'featured' || planType === 'premium';
}

// Redes: espeja EXACTO a la SPA (profile.js: buildSocialUrl + SOCIAL_DEFS + maxSocial)
const SOCIAL_DEFS = [
  ['socialInstagram', 'https://instagram.com/',        'Instagram'],
  ['socialFacebook',  'https://facebook.com/',         'Facebook'],
  ['socialTiktok',    'https://tiktok.com/@',          'TikTok'],
  ['socialLinkedin',  'https://linkedin.com/company/', 'LinkedIn'],
  ['socialTwitter',   'https://x.com/',                'X'],
  ['socialYoutube',   'https://youtube.com/@',         'YouTube'],
];
function buildSocialUrl(value, base) {
  if (!value) return null;
  const v = String(value).trim();
  return v.startsWith('http') ? v : base + v.replace(/^@/, '');
}
function socialLinksFor(biz) {
  const max = biz.planType === 'premium' ? 6 : biz.planType === 'featured' ? 2 : 0;
  if (!max) return [];
  return SOCIAL_DEFS
    .map(([key, base, label]) => ({ label, url: buildSocialUrl(biz[key], base) }))
    .filter(s => s.url)
    .slice(0, max);
}

// Página 404 real (status 404, noindex) — evita soft-404 (200 con el home)
function send404(req, res) {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  res.status(404).type('text/html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Página no encontrada — RetoPA</title>
<style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px;text-align:center}
.b{max-width:420px}.c{font-size:64px;font-weight:900;color:#0284c7;line-height:1}h1{font-size:20px;margin:12px 0 6px}p{color:#64748b;font-size:14px;margin:0 0 20px}
a{display:inline-block;background:#0284c7;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px;font-size:14px}</style>
</head><body><div class="b"><div class="c">404</div><h1>No encontramos esta página</h1>
<p>El negocio o la dirección que buscás no existe o cambió de lugar.</p>
<a href="${siteUrl}/">Ir al inicio</a></div></body></html>`);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Trunca texto para meta description (máx 160 chars) */
function truncate(str, max = 160) {
  if (!str) return '';
  const clean = str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 3) + '...' : clean;
}

/** Genera el bloque de Schema.org LocalBusiness */
function buildLocalBusinessSchema(biz, siteUrl) {
  const _cat  = biz.categorySlug || biz.category_slug || 'general';
  const _city = biz.city ? slugify(biz.city) : 'paraguay';
  const _canon = `${siteUrl}/negocios/${_cat}/${_city}/${biz.slug}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': _canon,
    name: biz.name,
    url: _canon,
    description: biz.description || '',
    image: biz.imageUrl || biz.image_url || DEFAULT_OG,
  };
  if (biz.phone)   schema.telephone = biz.phone;
  if (biz.email)   schema.email = biz.email;
  // RUC: identificador inequívoco de la empresa en Paraguay. Se declara solo
  // porque la ficha lo muestra (SSR y SPA).
  if (biz.ruc) schema.taxID = String(biz.ruc).trim();
  // Razón social vs nombre de fantasía: ambos se buscan.
  const _trade = biz.tradeName || biz.trade_name;
  if (_trade && _trade !== biz.name) schema.alternateName = _trade;
  // sameAs: el sitio propio es la señal de entidad más fuerte y la ficha lo
  // muestra en todos los planes. Las redes siguen gateadas por plan.
  const _sameAs = socialLinksFor(biz).map(s => s.url);
  if (biz.website) {
    const _w = String(biz.website).trim();
    const _wAbs = /^https?:\/\//i.test(_w) ? _w : `https://${_w}`;
    if (!_sameAs.includes(_wAbs)) _sameAs.unshift(_wAbs);
  }
  if (_sameAs.length) schema.sameAs = _sameAs;
  if (biz.address || biz.city) {
    schema.address = {
      '@type': 'PostalAddress',
      streetAddress: biz.address || '',
      addressLocality: biz.city || '',
      addressRegion: biz.department || 'Paraguay',
      addressCountry: 'PY',
    };
  }
  if (biz.lat && biz.lng) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: parseFloat(biz.lat),
      longitude: parseFloat(biz.lng),
    };
  }
  const _revCount = parseInt(biz.reviewCount || biz.review_count || 0) || 0;
  if (biz.rating && parseFloat(biz.rating) > 0 && _revCount >= 1) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: parseFloat(biz.rating).toFixed(1),
      reviewCount: _revCount,
      bestRating: '5',
      worstRating: '1',
    };
  }
  // openingHours desde hours_json (estructurado) o fallback a hours TEXT
  const hoursJson = planShowsFeature(biz.planType || biz.plan_type) ? (biz.hoursJson || biz.hours_json) : null;
  if (hoursJson) {
    try {
      const hj = typeof hoursJson === 'string' ? JSON.parse(hoursJson) : hoursJson;
      const DAY_MAP = { 'Lun':'Mo','Mar':'Tu','Mié':'We','Jue':'Th','Vie':'Fr','Sáb':'Sa','Dom':'Su' };
      const specs = [];
      Object.entries(hj).forEach(([day, s]) => {
        if (s.closed) return;
        const d = DAY_MAP[day]; if (!d) return;
        specs.push(s.h24 ? `${d} 00:00-24:00` : `${d} ${s.open}-${s.close}`);
      });
      if (specs.length) schema.openingHours = specs;
    } catch(e) { if (biz.hours) schema.openingHours = biz.hours; }
  } else if (planShowsFeature(biz.planType || biz.plan_type) && biz.hours) {
    schema.openingHours = biz.hours;
  }
  if (biz.categoryName) {
    schema['@type'] = mapCategoryToSchema(biz.categoryName, biz.categorySlug || biz.category_slug);
  }
  // Escapar '<' para que ningún dato de usuario rompa el bloque <script type=ld+json>
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}

/** Mapea slug de categoría RetoPA a tipo Schema.org */
function mapCategoryToSchema(categoryName, categorySlug) {
  const slug = (categorySlug || '').toLowerCase();
  const name = (categoryName || '').toLowerCase();

  // Mapeo por slug (preciso)
  if (['restaurantes','comida-rapida','comida-tipica','pizzerias','parrilladas',
       'cafeterias','bares','gastronomia','comida-bebida','catering'].some(s => slug.includes(s) || name.includes(s.replace('-',' ')))) return 'Restaurant';
  if (['hoteles','hostels','apart-hotels','cabanas','estancias-turisticas'].some(s => slug.includes(s))) return 'LodgingBusiness';
  if (['hospitales','clinicas','consultorios-medicos','salud','laboratorios',
       'imagenes-medicas','pediatria','ginecologia','cardiologia','dermatologia',
       'oftalmologia','traumatologia','geriatricos'].some(s => slug.includes(s))) return 'MedicalBusiness';
  if (['farmacias'].some(s => slug.includes(s))) return 'Pharmacy';
  if (['veterinarias','veterinarias-mascotas'].some(s => slug.includes(s))) return 'VeterinaryCare';
  if (['colegios','universidades','institutos','academias-idiomas','educacion',
       'jardines-infantes','academias-musica','autoescuelas'].some(s => slug.includes(s))) return 'EducationalOrganization';
  if (['juridico','abogados','escribanos'].some(s => slug.includes(s))) return 'LegalService';
  if (['bancos','cooperativas','financieras','finanzas','casas-cambio',
       'billeteras','fintech','prestamos'].some(s => slug.includes(s))) return 'FinancialService';
  if (['seguros','seguros-financiero'].some(s => slug.includes(s))) return 'InsuranceAgency';
  if (['peluquerias','barberias','esteticas','belleza','belleza-bienestar',
       'manicuria','depilacion','maquillaje'].some(s => slug.includes(s))) return 'BeautySalon';
  if (['gimnasios','crossfit','deporte-fitness','yoga-pilates','natacion',
       'artes-marciales','tenis-padel'].some(s => slug.includes(s))) return 'SportsActivityLocation';
  if (['talleres-mecanicos','chapa-pintura','gomerias','lubricentros',
       'automotriz','transporte-autos'].some(s => slug.includes(s))) return 'AutoRepair';
  if (['concesionarias'].some(s => slug.includes(s))) return 'AutoDealer';
  if (['inmobiliarias','loteamientos','alquileres'].some(s => slug.includes(s))) return 'RealEstateAgent';
  if (['hoteles','alojamiento','turismo'].some(s => slug.includes(s))) return 'LodgingBusiness';
  if (['desarrollo-software','desarrollo-web','tecnologia','hosting','cloud',
       'ciberseguridad','ia-data'].some(s => slug.includes(s))) return 'ProfessionalService';
  if (['comercios','moda','calzados','electronica','mueblerias',
       'joyerias','perfumerias','librerias','jugueterias'].some(s => slug.includes(s))) return 'Store';
  if (['supermercados','despensas','mercados'].some(s => slug.includes(s))) return 'GroceryStore';
  if (['construccion','arquitectura','construccion-hogar'].some(s => slug.includes(s))) return 'HomeAndConstructionBusiness';
  if (['salon-eventos','eventos-entretenimiento','quinceanos','bodas'].some(s => slug.includes(s))) return 'EventVenue';
  if (['contabilidad','consultoras','rrhh','auditoria'].some(s => slug.includes(s))) return 'AccountingService';
  return 'LocalBusiness';
}

/** HTML completo para una empresa — el que indexa Google */
function buildBusinessHTML(biz, siteConfig) {
  const siteName    = siteConfig.site_name   || SITE_NAME;
  const siteUrl     = (siteConfig._canonicalOverride ? '' : (siteConfig.site_url || SITE_URL));
  const catSlug     = biz.categorySlug || 'general';
  const citySlug    = biz.city ? slugify(biz.city) : 'paraguay';
  const pageUrl     = siteConfig._canonicalOverride
    || `${siteConfig.site_url || SITE_URL}/negocios/${catSlug}/${citySlug}/${biz.slug}`;
  const ogImage     = biz.coverUrl || biz.cover_url || biz.imageUrl || biz.image_url || DEFAULT_OG;
  const absOgImage  = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;
  const title       = `${biz.name} — ${biz.categoryName || 'Empresa'} en ${biz.city || 'Paraguay'} | ${siteName}`;
  const ogImageAlt  = `${biz.name} — ${biz.categoryName || 'Empresa'} en ${biz.city || 'Paraguay'}`;
  // Descripción SEO: usar la real si existe, generar automática si no
  // La automática es específica y única por empresa para evitar thin content
  function buildAutoDesc(b) {
    const parts = [];
    const name = b.tradeName || b.trade_name || b.name;
    const cat  = b.categoryName || b.category_name || 'servicios';
    const city = b.city || 'Paraguay';
    const dept = b.department ? `, ${b.department}` : '';

    parts.push(`${name} es una empresa de ${cat} en ${city}${dept}, Paraguay.`);
    if (b.phone)   parts.push(`Contacto: ${b.phone}.`);
    if (b.email)   parts.push(`Email: ${b.email}.`);
    if (b.website) parts.push(`Web: ${b.website}.`);
    if (b.ruc)     parts.push(`RUC ${b.ruc}.`);
    parts.push(`Encontrala en ${siteName} — el ecosistema comercial de Paraguay.`);
    return parts.join(' ');
  }

  const rawDesc = (biz.description
    ? biz.description
    : buildAutoDesc(biz)
  ).replace(/\s+/g, ' ').trim();
  // D1.3 — meta-description estructurada (rubro, ciudad, teléfono, horario) <=155.
  // Sólo el snippet: el body sigue mostrando la descripción real del dueño (rawDesc).
  function compactHours(b) {
    const hj = b.hoursJson || b.hours_json; if (!hj) return '';
    let p; try { p = typeof hj === 'string' ? JSON.parse(hj) : hj; } catch (e) { return ''; }
    const order = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const open = order.filter(d => p[d] && !p[d].closed);
    if (!open.length) return '';
    const idxs = open.map(d => order.indexOf(d));
    const contiguous = idxs.every((v, i) => i === 0 || v === idxs[i - 1] + 1);
    const days = open.length === 1 ? open[0] : (contiguous ? `${open[0]}–${open[open.length - 1]}` : open.join(', '));
    const times = open.map(d => p[d].h24 ? '24h' : `${p[d].open || ''}–${p[d].close || ''}`);
    const allSame = times.every(t => t === times[0] && t !== '–');
    return allSame ? `${days} ${times[0]}` : days;
  }
  const _mdCat  = biz.categoryName || biz.category_name || 'Negocios';
  const _mdCity = biz.city || 'Paraguay';
  const _mdDept = biz.department ? `, ${biz.department}` : '';
  const _mdRuc  = (biz.ruc || biz.RUC || '').toString().trim();
  // Orden pensado para búsqueda de entidad: el usuario googlea el nombre de la
  // empresa y quiere confirmar que llegó a la correcta. Nombre primero, después
  // rubro/ciudad, después el dato de verificación (RUC) y el contacto.
  // "en RetoPA" se omite: el dominio ya aparece en el resultado de búsqueda.
  const _mdSeg  = [`${biz.name} — ${_mdCat} en ${_mdCity}${_mdDept}.`];
  if (_mdRuc)    _mdSeg.push(`RUC ${_mdRuc}.`);
  if (biz.phone) _mdSeg.push(`Tel: ${biz.phone}.`);
  if (planShowsFeature(biz.planType)) { const _h = compactHours(biz); if (_h) _mdSeg.push(`Horario: ${_h}.`); }
  let desc = _mdSeg.join(' ').replace(/\s+/g, ' ').trim();
  if (desc.length > 155) desc = desc.slice(0, desc.lastIndexOf(' ', 152)).replace(/[.,;:\s]+$/, '') + '…';
  // Indexabilidad UNIFICADA por calidad de ficha (configurable via site_config)
  const minScore = parseInt(siteConfig.seo_min_quality_score) || 15;
  const qScore   = parseInt(biz.qualityScore ?? biz.quality_score ?? 0) || 0;
  const robotsContent = qScore >= minScore ? 'index, follow' : 'noindex, follow';
  const keywords    = [biz.name, biz.categoryName, biz.city, biz.department, 'Paraguay', siteName, ...(biz.tags || [])].filter(Boolean).join(', ');
  const schema      = buildLocalBusinessSchema(biz, siteUrl);

  // Breadcrumb Schema
  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName, item: siteConfig.site_url || SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Negocios', item: `${siteConfig.site_url || SITE_URL}/negocios` },
      { '@type': 'ListItem', position: 3, name: biz.categoryName || 'Empresa', item: `${siteConfig.site_url || SITE_URL}/negocios/${catSlug}` },
      { '@type': 'ListItem', position: 4, name: biz.city || 'Paraguay', item: `${siteConfig.site_url || SITE_URL}/negocios/${catSlug}/${citySlug}` },
      { '@type': 'ListItem', position: 5, name: biz.name, item: pageUrl },
    ],
  }).replace(/</g, '\\u003c');

  // ── Contenido del body (server-rendered, escapado) ──
  const _cover   = biz.coverUrl || biz.cover_url || biz.imageUrl || biz.image_url || '';
  const _waNum   = String(biz.whatsapp || biz.phone || '').replace(/\D/g, '');
  const _rating  = parseFloat(biz.rating) || 0;
  const _rc      = parseInt(biz.reviewCount || biz.review_count || 0) || 0;
  const _rr      = Math.max(0, Math.min(5, Math.round(_rating)));
  const _ratingHtml = _rating > 0
    ? `<div class="rating"><span class="stars">${'★'.repeat(_rr)}${'☆'.repeat(5-_rr)}</span> <b>${_rating.toFixed(1)}</b> <span class="muted">(${_rc} ${_rc === 1 ? 'reseña' : 'reseñas'})</span></div>`
    : '';
  let _hoursHtml = '';
  if (planShowsFeature(biz.planType)) {
    const _hj = biz.hoursJson || biz.hours_json; let _p = null;
    if (_hj) { try { _p = typeof _hj === 'string' ? JSON.parse(_hj) : _hj; } catch(e){} }
    if (_p) {
      const _ord = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
      const _rows = _ord.filter(d => _p[d] && !_p[d].closed)
        .map(d => `<div><dt>${d}</dt><dd>${_p[d].h24 ? '24 h' : esc((_p[d].open||'') + '–' + (_p[d].close||''))}</dd></div>`).join('');
      if (_rows) _hoursHtml = `<h2>Horario</h2><dl class="info">${_rows}</dl>`;
    }
  }
  const _socs = socialLinksFor(biz);
  const _socialHtml = _socs.length
    ? `<div class="social"><h2>Redes</h2>${_socs.map(x => `<a rel="nofollow" target="_blank" href="${esc(x.url)}">${esc(x.label)}</a>`).join('')}</div>`
    : '';
  const _revs = Array.isArray(biz.reviews) ? biz.reviews.filter(r => r.isApproved !== false).slice(0, 3) : [];
  const _reviewsHtml = _revs.length
    ? `<div class="reviews"><h2>Reseñas</h2>${_revs.map(r => { const _s = Math.max(0, Math.min(5, Math.round(parseFloat(r.rating)||0)));
        return `<div class="rev"><div class="stars">${'★'.repeat(_s)}${'☆'.repeat(5-_s)}</div><p>${esc(r.comment||'')}</p><span class="who">— ${esc(r.authorName||'Anónimo')}</span></div>`; }).join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="FFwNJvSBBALDWQpUO8c4q8nVtlHS58xDBrj0nMSx1t0">

  <!-- ── Title & Meta description ── -->
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="keywords" content="${esc(keywords)}">
  <meta name="robots" content="${robotsContent}">
  <link rel="canonical" href="${esc(pageUrl)}">

  <!-- ── Open Graph (Facebook, WhatsApp, Telegram) ── -->
  <meta property="og:type"        content="business.business">
  <meta property="og:site_name"   content="${esc(siteName)}">
  <meta property="og:title"       content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url"         content="${esc(pageUrl)}">
  <meta property="og:image"       content="${esc(absOgImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type"  content="image/png">
  <meta property="og:image:alt"   content="${esc(ogImageAlt)}">
  <meta property="og:locale"      content="es_PY">
  ${biz.phone ? `<meta property="business:contact_data:phone_number" content="${esc(biz.phone)}">` : ''}
  ${biz.city  ? `<meta property="business:contact_data:locality"     content="${esc(biz.city)}">` : ''}
  <meta property="business:contact_data:country_name" content="Paraguay">

  <!-- ── Twitter / X Card ── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="@retopa_py">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image"       content="${esc(absOgImage)}">
  <meta name="twitter:image:alt"   content="${esc(ogImageAlt)}">

  <!-- ── Schema.org JSON-LD ── -->
  <script type="application/ld+json">${schema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.5}
    .page{max-width:820px;margin:0 auto;padding:16px}
    .crumbs{font-size:12px;color:#64748b;padding:8px 2px}.crumbs a{color:#0284c7;text-decoration:none}
    .card{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    .cover{width:100%;height:230px;object-fit:cover;background:#e2e8f0;display:block}
    .cbody{padding:22px}
    .badge{display:inline-block;font-size:12px;font-weight:700;color:#0369a1;background:#e0f2fe;padding:4px 10px;border-radius:999px;margin-bottom:10px}
    h1{font-size:1.7rem;font-weight:800;color:#0f172a;line-height:1.2}.verif{color:#22c55e;font-size:1rem}
    .rating{margin:6px 0;font-size:14px;color:#475569}.stars{color:#f59e0b;letter-spacing:1px}.muted{color:#94a3b8}
    .desc{color:#475569;margin:12px 0 18px}
    .actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
    .btn{display:inline-block;padding:10px 16px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;background:#f1f5f9;color:#0f172a}.btn.wa{background:#25D366;color:#fff}
    .info{display:grid;gap:8px;margin:6px 0}.info div{display:flex;gap:8px;font-size:14px}.info dt{color:#94a3b8;min-width:82px}.info dd{color:#0f172a;font-weight:600}
    h2{font-size:1rem;color:#0f172a;margin:18px 0 8px}
    .social a{display:inline-block;margin:0 8px 8px 0;color:#0284c7;text-decoration:none;font-weight:600;font-size:14px}
    .reviews .rev{border-top:1px solid #eef2f7;padding:10px 0}.reviews p{color:#475569;font-size:14px;margin:4px 0}.reviews .who{color:#94a3b8;font-size:12px}
    .cta{margin-top:20px}.cta a{color:#0284c7;font-weight:700;text-decoration:none}
    .ft{text-align:center;color:#94a3b8;font-size:12px;padding:18px}.ft a{color:#0284c7;text-decoration:none;font-weight:700}
    @media(max-width:640px){.cover{height:160px}h1{font-size:1.4rem}.cbody{padding:16px}}
  </style>
</head>
<body>
  <div class="page">
    <nav class="crumbs" aria-label="breadcrumb">
      <a href="/">Inicio</a> &rsaquo;
      <a href="/negocios">Negocios</a> &rsaquo;
      <a href="/negocios/${esc(catSlug)}">${esc(biz.categoryName || 'Empresa')}</a> &rsaquo;
      <a href="/negocios/${esc(catSlug)}/${esc(citySlug)}">${esc(biz.city || 'Paraguay')}</a>
    </nav>

    <article class="card">
      ${_cover ? `<img class="cover" src="${esc(_cover)}" alt="${esc(biz.name)}" loading="lazy" width="1200" height="460">` : ''}
      <div class="cbody">
        <span class="badge">${esc(biz.categoryName || 'Empresa')}${biz.city ? ' · ' + esc(biz.city) : ''}</span>
        <h1>${esc(biz.name)}${biz.verified ? ' <span class="verif" title="Verificado">✔</span>' : ''}</h1>
        ${_ratingHtml}
        <p class="desc">${esc(rawDesc)}</p>

        <div class="actions">
          ${_waNum   ? `<a class="btn wa" rel="nofollow" href="/go/whatsapp/${esc(biz.slug)}">WhatsApp</a>` : ''}
          ${biz.phone   ? `<a class="btn" rel="nofollow" href="/go/phone/${esc(biz.slug)}">Llamar</a>` : ''}
          ${biz.website ? `<a class="btn" rel="nofollow" href="/go/website/${esc(biz.slug)}">Sitio web</a>` : ''}
          ${(biz.lat && biz.lng) ? `<a class="btn" rel="nofollow" target="_blank" href="https://maps.google.com/?q=${biz.lat},${biz.lng}">Cómo llegar</a>` : ''}
        </div>

        <dl class="info">
          ${biz.ruc     ? `<div><dt>RUC</dt><dd>${esc(biz.ruc)}</dd></div>` : ''}
          ${biz.phone   ? `<div><dt>Teléfono</dt><dd>${esc(biz.phone)}</dd></div>` : ''}
          ${biz.email   ? `<div><dt>Email</dt><dd>${esc(biz.email)}</dd></div>` : ''}
          ${biz.website ? `<div><dt>Web</dt><dd>${esc(biz.website)}</dd></div>` : ''}
          ${biz.address ? `<div><dt>Dirección</dt><dd>${esc(biz.address)}${biz.city ? ', ' + esc(biz.city) : ''}</dd></div>` : ''}
        </dl>
        ${_hoursHtml}
        ${_socialHtml}
        ${_reviewsHtml}

        <div class="cta"><a href="/?empresa=${esc(biz.slug)}">Ver galería, dejar una reseña y más →</a></div>
        <div class="cta"><a href="/negocios/${esc(catSlug)}/${esc(citySlug)}">Ver más ${esc(biz.categoryName || 'negocios')} en ${esc(biz.city || 'Paraguay')} →</a></div>
      </div>
    </article>

    <footer class="ft"><a href="/">RetoPA</a> — El ecosistema comercial de Paraguay</footer>
  </div>

  <noscript><p style="text-align:center;color:#94a3b8;font-size:13px;padding:12px">Para la experiencia completa, activá JavaScript.</p></noscript>
  <script>window.__RETOPA_PRELOAD__ = { type: 'business', slug: ${JSON.stringify(biz.slug)} };</script>
</body>
</html>`;
}

/** Página de una promoción individual — OG tags propios para compartir en redes */
function buildPromoHTML(promo, siteConfig) {
  const siteName = siteConfig.site_name || SITE_NAME;
  const siteUrl  = siteConfig.site_url || SITE_URL;
  const bizName  = promo.trade_name || promo.business_name;
  const bizSlug  = promo.business_slug;
  const catSlug  = promo.category_slug || 'general';
  const citySlug = promo.city ? slugify(promo.city) : 'paraguay';

  // URL canónica de la promo + URL de destino (ficha con promo abierta)
  const promoUrl  = `${siteUrl}/promo/${promo.id}`;
  const targetUrl = `/negocios/${catSlug}/${citySlug}/${bizSlug}?promo=${promo.id}`;

  // Imagen del preview: la de la promo, o el logo de la empresa, o el default
  const ogImage    = promo.image_url || promo.business_logo || DEFAULT_OG;
  const absOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;

  // Texto del precio para el título/descripción
  let precioTxt = '';
  if (promo.promo_price) {
    const pl = promo.price_label || 'Gs.';
    precioTxt = `${pl} ${Number(promo.promo_price).toLocaleString('es-PY')}`;
    if (promo.discount_pct) precioTxt += ` (-${promo.discount_pct}%)`;
  }

  const title = `${esc(promo.title)}${precioTxt ? ' — ' + esc(precioTxt) : ''} | ${esc(bizName)}`;
  const rawDesc = (promo.description
    ? promo.description
    : `Promoción de ${bizName} en ${promo.city || 'Paraguay'}. Encontrala en ${siteName}.`
  ).replace(/\s+/g, ' ').trim();
  const desc = rawDesc.length > 160 ? rawDesc.slice(0, rawDesc.lastIndexOf(' ', 160)) + '…' : rawDesc;
  const ogImageAlt = `${promo.title} — ${bizName}`;

  // Si la promo venció, igual mostramos preview pero con nota
  const vigente = promo.vigente !== false;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${title}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${vigente ? 'index, follow' : 'noindex, follow'}">
  <link rel="canonical" href="${esc(promoUrl)}">

  <!-- ── Open Graph (Facebook, WhatsApp, Instagram, Telegram) ── -->
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="${esc(siteName)}">
  <meta property="og:title"       content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url"         content="${esc(promoUrl)}">
  <meta property="og:image"       content="${esc(absOgImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt"   content="${esc(ogImageAlt)}">
  <meta property="og:locale"      content="es_PY">
  ${promo.promo_price ? `<meta property="product:price:amount" content="${esc(String(promo.promo_price))}">
  <meta property="product:price:currency" content="PYG">` : ''}

  <!-- ── Twitter / X Card ── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="@retopa_py">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image"       content="${esc(absOgImage)}">
  <meta name="twitter:image:alt"   content="${esc(ogImageAlt)}">

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#1e293b}
    .promo-card{max-width:560px;margin:40px auto;padding:24px;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    .promo-img{width:100%;height:300px;object-fit:cover;border-radius:12px;margin-bottom:20px;background:#e2e8f0}
    .promo-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#b45309;font-weight:700;margin-bottom:12px}
    .promo-title{font-size:1.6rem;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:8px}
    .promo-biz{color:#0ea5e9;font-weight:600;font-size:.95rem;margin-bottom:12px}
    .promo-desc{color:#64748b;font-size:1rem;line-height:1.6;margin-bottom:16px}
    .promo-price{font-size:2rem;font-weight:900;color:#1B3A6B}
    .promo-old{font-size:1.1rem;color:#94a3b8;text-decoration:line-through;margin-left:8px}
    .loading{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <noscript>
    <div class="promo-card">
      ${promo.image_url ? `<img src="${esc(promo.image_url)}" alt="${esc(ogImageAlt)}" class="promo-img" loading="eager">` : ''}
      <span class="promo-badge">🔥 ${vigente ? 'Promoción' : 'Promoción finalizada'}</span>
      <h1 class="promo-title">${esc(promo.title)}</h1>
      <p class="promo-biz">${esc(bizName)}${promo.city ? ' · ' + esc(promo.city) : ''}</p>
      <p class="promo-desc">${esc(desc)}</p>
      ${promo.promo_price ? `<div><span class="promo-price">${esc(precioTxt)}</span>${promo.original_price ? `<span class="promo-old">${esc(promo.price_label || 'Gs.')} ${Number(promo.original_price).toLocaleString('es-PY')}</span>` : ''}</div>` : ''}
    </div>
  </noscript>

  <div id="app">
    <div class="promo-card">
      ${promo.image_url ? `<img src="${esc(promo.image_url)}" alt="${esc(ogImageAlt)}" class="promo-img" loading="eager">` : ''}
      <span class="promo-badge">🔥 ${vigente ? 'Promoción' : 'Promoción finalizada'}</span>
      <h1 class="promo-title">${esc(promo.title)}</h1>
      <p class="promo-biz">${esc(bizName)}${promo.city ? ' · ' + esc(promo.city) : ''}</p>
      <p class="promo-desc">${esc(desc)}</p>
      ${promo.promo_price ? `<div style="margin-bottom:20px"><span class="promo-price">${esc(precioTxt)}</span>${promo.original_price ? `<span class="promo-old">${esc(promo.price_label || 'Gs.')} ${Number(promo.original_price).toLocaleString('es-PY')}</span>` : ''}</div>` : ''}
      <div class="loading">
        <div style="width:36px;height:36px;border:3px solid #e2e8f0;border-top-color:#0ea5e9;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 12px"></div>
        Abriendo ${esc(bizName)}...
      </div>
    </div>
  </div>

  <script>
    // Guardar qué drawer abrir (sobrevive a la navegación), luego ir a la ficha de inmediato.
    // Los crawlers de redes (WhatsApp/Facebook) no ejecutan JS: leen los OG tags y no redirigen.
    try { sessionStorage.setItem('retopa_open_drawer', JSON.stringify({ slug: ${JSON.stringify(bizSlug)}, promo: ${JSON.stringify(String(promo.id))} })); } catch(e) {}
    window.location.replace(${JSON.stringify(targetUrl)});
  </script>
</body>
</html>`;
}

/** Página de un producto individual — OG tags propios para compartir en redes */
function buildProductHTML(prod, siteConfig) {
  const siteName = siteConfig.site_name || SITE_NAME;
  const siteUrl  = siteConfig.site_url || SITE_URL;
  const bizName  = prod.trade_name || prod.business_name;
  const bizSlug  = prod.business_slug;
  const catSlug  = prod.category_slug || 'general';
  const citySlug = prod.city ? slugify(prod.city) : 'paraguay';

  const prodUrl   = `${siteUrl}/producto/${prod.id}`;
  const targetUrl = `/negocios/${catSlug}/${citySlug}/${bizSlug}?producto=${prod.id}`;

  const ogImage    = prod.image_url || prod.business_logo || DEFAULT_OG;
  const absOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;

  const nombre = prod.caption || 'Producto';
  let precioTxt = '';
  if (prod.price) {
    const pl = prod.price_label || 'Gs.';
    precioTxt = `${pl} ${Number(prod.price).toLocaleString('es-PY')}`;
  } else if (prod.price_label === 'Consultar') {
    precioTxt = 'Consultar precio';
  }

  const title = `${esc(nombre)}${precioTxt ? ' — ' + esc(precioTxt) : ''} | ${esc(bizName)}`;
  const rawDesc = (prod.description
    ? prod.description
    : `${nombre} de ${bizName} en ${prod.city || 'Paraguay'}. Encontralo en ${siteName}.`
  ).replace(/\s+/g, ' ').trim();
  const desc = rawDesc.length > 160 ? rawDesc.slice(0, rawDesc.lastIndexOf(' ', 160)) + '…' : rawDesc;
  const ogImageAlt = `${nombre} — ${bizName}`;
  const disponible = prod.is_available !== false;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${title}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${disponible ? 'index, follow' : 'noindex, follow'}">
  <link rel="canonical" href="${esc(prodUrl)}">

  <!-- ── Open Graph (Facebook, WhatsApp, Instagram, Telegram) ── -->
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="${esc(siteName)}">
  <meta property="og:title"       content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url"         content="${esc(prodUrl)}">
  <meta property="og:image"       content="${esc(absOgImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt"   content="${esc(ogImageAlt)}">
  <meta property="og:locale"      content="es_PY">
  ${prod.price ? `<meta property="product:price:amount" content="${esc(String(prod.price))}">
  <meta property="product:price:currency" content="PYG">` : ''}

  <!-- ── Twitter / X Card ── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="@retopa_py">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image"       content="${esc(absOgImage)}">
  <meta name="twitter:image:alt"   content="${esc(ogImageAlt)}">

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#1e293b}
    .prod-card{max-width:560px;margin:40px auto;padding:24px;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    .prod-img{width:100%;height:300px;object-fit:cover;border-radius:12px;margin-bottom:20px;background:#e2e8f0}
    .prod-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:700;margin-bottom:12px}
    .prod-title{font-size:1.6rem;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:8px}
    .prod-biz{color:#0ea5e9;font-weight:600;font-size:.95rem;margin-bottom:12px}
    .prod-desc{color:#64748b;font-size:1rem;line-height:1.6;margin-bottom:16px}
    .prod-price{font-size:1.8rem;font-weight:900;color:#1B3A6B}
    .loading{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <noscript>
    <div class="prod-card">
      ${prod.image_url ? `<img src="${esc(prod.image_url)}" alt="${esc(ogImageAlt)}" class="prod-img" loading="eager">` : ''}
      <span class="prod-badge">🛍 ${disponible ? 'Producto' : 'No disponible'}</span>
      <h1 class="prod-title">${esc(nombre)}</h1>
      <p class="prod-biz">${esc(bizName)}${prod.city ? ' · ' + esc(prod.city) : ''}</p>
      <p class="prod-desc">${esc(desc)}</p>
      ${precioTxt ? `<div><span class="prod-price">${esc(precioTxt)}</span></div>` : ''}
    </div>
  </noscript>

  <div id="app">
    <div class="prod-card">
      ${prod.image_url ? `<img src="${esc(prod.image_url)}" alt="${esc(ogImageAlt)}" class="prod-img" loading="eager">` : ''}
      <span class="prod-badge">🛍 ${disponible ? 'Producto' : 'No disponible'}</span>
      <h1 class="prod-title">${esc(nombre)}</h1>
      <p class="prod-biz">${esc(bizName)}${prod.city ? ' · ' + esc(prod.city) : ''}</p>
      <p class="prod-desc">${esc(desc)}</p>
      ${precioTxt ? `<div style="margin-bottom:20px"><span class="prod-price">${esc(precioTxt)}</span></div>` : ''}
      <div class="loading">
        <div style="width:36px;height:36px;border:3px solid #e2e8f0;border-top-color:#0ea5e9;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 12px"></div>
        Abriendo ${esc(bizName)}...
      </div>
    </div>
  </div>

  <script>
    try { sessionStorage.setItem('retopa_open_drawer', JSON.stringify({ slug: ${JSON.stringify(bizSlug)}, producto: ${JSON.stringify(String(prod.id))} })); } catch(e) {}
    window.location.replace(${JSON.stringify(targetUrl)});
  </script>
  </script>
</body>
</html>`;
}

/** Meta tags enriquecidos para la home */
function buildHomeHTML(siteConfig, stats) {
  const siteName = siteConfig.site_name || SITE_NAME;
  const siteUrl  = siteConfig.site_url  || SITE_URL;
  const desc     = SITE_DESC;
  const ogImage  = `${siteUrl}/og-default.png`;

  const orgSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    publisher: { '@id': `${siteUrl}/#organization` },
    name: siteName,
    url: siteUrl,
    description: desc,
    inLanguage: 'es-PY',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  });

  const orgBizSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: siteName,
    url: siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/img/icon-512.png`,
      width: 512,
      height: 512,
    },
    image: `${siteUrl}/og-default.png`,
    description: 'El ecosistema comercial más completo de Paraguay. Encontrá negocios, empresas y profesionales en todo el país.',
    areaServed: { '@type': 'Country', name: 'Paraguay' },
    contactPoint: siteConfig.contact_phone ? [{
      '@type': 'ContactPoint',
      telephone: siteConfig.contact_phone,
      contactType: 'customer service',
      areaServed: 'PY',
      availableLanguage: 'Spanish',
    }] : [],
    sameAs: [
      siteConfig.social_facebook,
      siteConfig.social_instagram,
      siteConfig.social_linkedin,
      siteConfig.social_twitter,
      `${siteUrl}`,
    ].filter(Boolean),
  });

  return { orgSchema, orgBizSchema, title: `${siteName} — Directorio Comercial de Paraguay`, desc, ogImage };
}

// ── SEGURIDAD: no servir código fuente ni config del propio server ─────────
// express.static(__dirname) expondría /server.js, /package.json, /Dockerfile,
// /node_modules, dotfiles, source maps, etc. (recon: "descargar la estructura de
// cómo está hecha la web"). Los bloqueamos ANTES del static. Los .js del cliente
// (bajo /js, /admin/js, ...) NO se ven afectados: solo se bloquea la raíz sensible.
const BLOCKED_FILES = new Set([
  '/server.js', '/package.json', '/package-lock.json', '/dockerfile',
  '/tailwind.config.js', '/.env', '/.env.example',
]);
const BLOCKED_PREFIXES = ['/node_modules/', '/.git/'];
app.use((req, res, next) => {
  const p = (req.path || '').toLowerCase();
  if (BLOCKED_FILES.has(p) || p.endsWith('.map') || BLOCKED_PREFIXES.some(pre => p.startsWith(pre))) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});

// ── Archivos estáticos (antes de las rutas dinámicas) ─────────────────────
// Cache-busting: los .js/.css/.html se revalidan SIEMPRE (Cache-Control:no-cache).
// Con ETag activo, si el archivo no cambió el navegador recibe 304 (liviano); si
// cambió tras un deploy, baja la versión nueva al instante. Así nunca se queda un
// app.js viejo sirviendo una UI rota hasta el hard refresh. Imágenes/fuentes del
// frontend mantienen cache de 1 día (las subidas van por nginx /uploads, 30d).
app.use(express.static(__dirname, {
  index: false,     // no servir index.html automáticamente
  dotfiles: 'ignore', // no servir ocultos (.env, .git…) sin romper /.well-known (ACME)
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  },
}));

/** Registra una visita en el backend (fire & forget, nunca bloquea el render) */
function trackPageview(req) {
  try {
    const payload = JSON.stringify({ path: (req.path || '').slice(0, 300) });
    const options = {
      hostname: BACKEND_HOST, port: BACKEND_PORT,
      path: '/api/v2/track/pageview', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        // Propagar la IP real del visitante para el conteo de únicos
        'x-forwarded-for': (req.headers['x-forwarded-for'] || req.ip || '').toString(),
      },
    };
    const r = http.request(options, res => { res.on('data', () => {}); res.on('end', () => {}); });
    r.on('error', () => {});
    r.setTimeout(2000, () => r.destroy());
    r.write(payload); r.end();
  } catch (e) { /* nunca afecta al usuario */ }
}

// Middleware: trackea solo páginas HTML públicas (no assets, no sitemaps, no robots)
// y SOLO visitas humanas — se saltean crawlers/bots (igual que las vistas de ficha),
// para no inflar "Conexiones" con Googlebot y demás. Antes esto contaba a los bots
// como visitantes únicos, por eso "Sitio" salía muy por encima de "fichas".
app.use((req, res, next) => {
  const p = req.path || '';
  const isPage = req.method === 'GET' && (
    p === '/' || p.startsWith('/negocios')
  ) && !p.includes('.'); // excluir cualquier cosa con extensión (assets)
  if (isPage && !isCrawler(req.headers['user-agent'])) trackPageview(req);
  next();
});

// ── robots.txt ─────────────────────────────────────────────────────────────
app.get('/go/:tipo/:slug', async (req, res) => {
  const { tipo, slug } = req.params;
  const valid = ['whatsapp', 'phone', 'website'];
  if (!valid.includes(tipo) || !/^[a-z0-9\-_]+$/i.test(slug)) return res.redirect(302, '/');
  try {
    const [bizData, cfgData] = await Promise.allSettled([
      fetchBackend(`/businesses/${slug}`),
      fetchBackend('/site-config'),
    ]);
    if (bizData.status !== 'fulfilled' || !bizData.value.success || !bizData.value.data)
      return res.redirect(302, '/');
    const biz = bizData.value.data;
    const cfg = cfgData.status === 'fulfilled' && cfgData.value.success ? cfgData.value.data : {};

    // Registrar el clic (condición dura: el tracking no se pierde) ANTES de entregar
    await postBackend(`/client/businesses/${slug}/click`, { click_type: tipo }, {
      'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      'user-agent': req.headers['user-agent'] || '',
      'referer': req.headers['referer'] || '',
    });

    const backTo = `/negocio/${biz.slug}`;

    if (tipo === 'phone') {
      // tel: no se sigue con 302 → interstitial que lanza el marcador (con fallback tappable sin JS)
      const tel = biz.phone ? String(biz.phone).replace(/[^\d+]/g, '') : '';
      if (!tel) return res.redirect(302, backTo);
      return res.type('text/html').send(
`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Llamar</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:48px 20px;color:#0f172a">
<p style="color:#64748b;font-size:14px">Abriendo tu teléfono…</p>
<p style="font-size:22px;font-weight:800;margin:14px 0"><a id="l" href="tel:${esc(tel)}" style="color:#0284c7;text-decoration:none">${esc(biz.phone)}</a></p>
<p><a href="${esc(backTo)}" style="color:#94a3b8;font-size:13px">← Volver a la ficha</a></p>
<script>var l=document.getElementById('l');if(l)location.href=l.getAttribute('href');</script>
</body></html>`);
    }

    let dest = backTo;
    if (tipo === 'whatsapp') {
      const num = String(biz.whatsapp || biz.phone || '').replace(/\D/g, '');
      if (num) {
        const bizName = biz.tradeName || biz.trade_name || biz.name || '';
        const pageUrl = `${cfg.site_url || SITE_URL}/negocio/${biz.slug}`;
        const template = cfg.whatsapp_message || '¡Hola! Te contacto desde RetoPA ({url}) por tu empresa *{empresa}*.';
        const msg = encodeURIComponent(template.replace('{empresa}', bizName).replace('{url}', pageUrl).replace('{nombre}', bizName));
        dest = `https://wa.me/${num}?text=${msg}`;
      }
    } else if (tipo === 'website') {
      if (biz.website) dest = /^https?:\/\//i.test(biz.website) ? biz.website : `https://${biz.website}`;
    }

    res.redirect(302, dest);
  } catch (e) {
    console.error('[/go]', e.message);
    res.redirect(302, '/');
  }
});

app.get('/robots.txt', (req, res) => {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /go/
Disallow: /cliente/
Disallow: /embajador/

Sitemap: ${siteUrl}/sitemap.xml
Sitemap: ${siteUrl}/sitemap-empresas.xml
Sitemap: ${siteUrl}/sitemap-ofertas.xml
`);
});

// ── sitemap.xml — índice principal ─────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  const today   = new Date().toISOString().split('T')[0];
  try {
    const [catsData, citiesData] = await Promise.allSettled([
      fetchBackend('/categories'),
      fetchBackend('/cities'),
    ]);
    const cats   = catsData.status   === 'fulfilled' && catsData.value.success   ? catsData.value.data   : [];
    const cities = citiesData.status === 'fulfilled' && citiesData.value.success ? citiesData.value.data : [];

    const staticUrls = [
      { url: siteUrl, priority: '1.0', freq: 'daily' },
      { url: `${siteUrl}/#directorio`, priority: '0.9', freq: 'daily' },
      { url: `${siteUrl}/#planes`, priority: '0.7', freq: 'weekly' },
    ];

    const catUrls = cats.map(c => ({
      url: `${siteUrl}/?categoria=${c.slug}`,
      priority: '0.8',
      freq: 'daily',
    }));

    const cityUrls = cities.slice(0, 50).map(c => ({
      url: `${siteUrl}/?ciudad=${c.name}`,
      priority: '0.6',
      freq: 'weekly',
    }));

    const allUrls = [...staticUrls, ...catUrls, ...cityUrls];

    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/sitemap-main.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/sitemap-empresas.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/sitemap-cat-ciudad.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/sitemap-ofertas.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`
    );
  } catch (e) {
    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}</loc><priority>1.0</priority></url>
</urlset>`
    );
  }
});

// ── sitemap-main.xml — páginas estáticas + categorías + ciudades ───────────
app.get('/sitemap-main.xml', async (req, res) => {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  const today   = new Date().toISOString().split('T')[0];
  try {
    const [catsData, citiesData] = await Promise.allSettled([
      fetchBackend('/categories'),
      fetchBackend('/cities'),
    ]);
    const cats   = catsData.status   === 'fulfilled' && catsData.value.success   ? catsData.value.data   : [];
    const cities = citiesData.status === 'fulfilled' && citiesData.value.success ? citiesData.value.data : [];

    const urls = [
      `<url><loc>${siteUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority><lastmod>${today}</lastmod></url>`,
      `<url><loc>${siteUrl}/negocios</loc><changefreq>daily</changefreq><priority>0.9</priority><lastmod>${today}</lastmod></url>`,
      ...cats.filter(c => !c.parent_id).map(c =>
        `<url><loc>${siteUrl}/negocios/${encodeURIComponent(c.slug)}</loc><changefreq>daily</changefreq><priority>0.8</priority><lastmod>${today}</lastmod></url>`
      ),
    ];

    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.join('\n')}
</urlset>`
    );
  } catch(e) {
    res.status(500).send('Error generating sitemap');
  }
});

// ── sitemap-empresas.xml — todas las empresas activas ─────────────────────
let _smEmpresas = { xml: null, ts: 0 };
let _smEmpresasInflight = null;
const SM_TTL_MS = 24 * 60 * 60 * 1000;

// Fetch-all de negocios (cacheado 24h) — compartido por los sitemaps que lo necesitan.
let _allBiz = { data: null, ts: 0 };
let _allBizInflight = null;
async function fetchAllBusinesses() {
  if (_allBiz.data && (Date.now() - _allBiz.ts) < SM_TTL_MS) return _allBiz.data;
  if (_allBizInflight) return _allBizInflight;
  _allBizInflight = (async () => {
    const limit = 500;
    const first = await fetchBackend(`/businesses?limit=${limit}&offset=0&sort=recent`);
    let all = (first && first.success && Array.isArray(first.data)) ? first.data.slice() : [];
    const total = (first && first.total) || all.length;
    const pages = Math.min(Math.ceil(total / limit), 100); // hasta ~50k
    const reqs = [];
    for (let pg = 1; pg < pages; pg++) reqs.push(fetchBackend(`/businesses?limit=${limit}&offset=${pg * limit}&sort=recent`).catch(() => null));
    const results = await Promise.all(reqs);
    for (const r of results) if (r && r.success && Array.isArray(r.data)) all = all.concat(r.data);
    _allBiz = { data: all, ts: Date.now() };
    return all;
  })();
  try { return await _allBizInflight; } finally { _allBizInflight = null; }
}

async function buildSitemapEmpresasXml() {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  const all = await fetchAllBusinesses();

  // Umbral unificado de indexabilidad (seo_min_quality_score); default 15
  let minScore = 15;
  try { const cfg = await fetchBackend('/site-config'); if (cfg && cfg.success && cfg.data && cfg.data.seo_min_quality_score) minScore = parseInt(cfg.data.seo_min_quality_score) || 15; } catch (e) {}

  const urls = all
    .filter(b => (b.qualityScore || b.quality_score || 0) >= minScore)
    .map(b => {
      const lastmod = (b.updated_at || b.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0];
      const qs = b.qualityScore || b.quality_score || 0;
      let priority;
      if      (b.planType === 'premium')  priority = '0.9';
      else if (b.planType === 'featured') priority = '0.8';
      else if (qs >= 80)                  priority = '0.8';
      else if (qs >= 55)                  priority = '0.7';
      else if (qs >= 30)                  priority = '0.6';
      else                                priority = '0.4';
      const catSlug  = b.categorySlug || 'general';
      const citySlug = b.city ? slugify(b.city) : 'paraguay';
      const canonUrl = `${siteUrl}/negocios/${catSlug}/${citySlug}/${b.slug}`;
      const img = b.imageUrl || b.image_url;
      return `<url>
    <loc>${esc(canonUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
    ${img ? `<image:image><image:loc>${esc(img)}</image:loc><image:title>${esc(b.name)}</image:title></image:image>` : ''}
  </url>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.join('\n')}
</urlset>`;
  _smEmpresas = { xml, ts: Date.now() };
  return xml;
}

// ── sitemap-cat-ciudad.xml — combos categoría×ciudad con >=3 fichas activas ──
let _smCatCiudad = { xml: null, ts: 0 };
let _smCatCiudadInflight = null;
async function buildSitemapCatCiudadXml() {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  const all = await fetchAllBusinesses();
  const groups = new Map();
  for (const b of all) {
    const catSlug = b.categorySlug || b.category_slug;
    if (!catSlug || !b.city) continue;
    const citySlug = slugify(b.city);
    if (!citySlug) continue;
    const key = catSlug + '/' + citySlug;
    const lm = (b.updated_at || b.created_at || '').split('T')[0] || '';
    let g = groups.get(key);
    if (!g) { g = { count: 0, lastmod: lm, catSlug, citySlug }; groups.set(key, g); }
    g.count++;
    if (lm > g.lastmod) g.lastmod = lm;
  }
  const today = new Date().toISOString().split('T')[0];
  const urls = [];
  for (const g of groups.values()) {
    if (g.count < 3) continue; // umbral anti thin content (garantiza <= total de la página)
    const priority = g.count >= 20 ? '0.7' : g.count >= 8 ? '0.6' : '0.5';
    urls.push(`<url><loc>${esc(siteUrl + '/negocios/' + g.catSlug + '/' + g.citySlug)}</loc><lastmod>${g.lastmod || today}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  _smCatCiudad = { xml, ts: Date.now() };
  return xml;
}
app.get('/sitemap-cat-ciudad.xml', async (req, res) => {
  const now = Date.now();
  if (_smCatCiudad.xml && (now - _smCatCiudad.ts) < SM_TTL_MS) return res.type('application/xml').send(_smCatCiudad.xml);
  if (!_smCatCiudadInflight) _smCatCiudadInflight = buildSitemapCatCiudadXml().finally(() => { _smCatCiudadInflight = null; });
  try { res.type('application/xml').send(await _smCatCiudadInflight); }
  catch (e) { console.error('[sitemap-cat-ciudad]', e.message); if (_smCatCiudad.xml) return res.type('application/xml').send(_smCatCiudad.xml); res.status(503).send('Sitemap temporarily unavailable'); }
});

// ── sitemap-ofertas.xml — /ofertas, /ofertas/:ciudad (>=3 promos) y /promo/:id vigentes ──
// TTL corto: las ofertas son time-sensitive y vencen. Todas las promos que devuelve
// el endpoint público ya vienen filtradas por vigencia (expires_at > NOW()).
let _smOfertas = { xml: null, ts: 0 };
let _smOfertasInflight = null;
const SM_OFERTAS_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchAllOfertas() {
  const limit = 200;
  let all = [];
  for (let offset = 0; offset < 5000; offset += limit) {
    const r = await fetchBackend(`/promotions?limit=${limit}&offset=${offset}`).catch(() => null);
    const rows = (r && r.success && Array.isArray(r.data)) ? r.data : [];
    all = all.concat(rows);
    if (rows.length < limit) break;
  }
  return all;
}

async function buildSitemapOfertasXml() {
  const siteUrl = process.env.SITE_URL || SITE_URL;
  const today   = new Date().toISOString().split('T')[0];
  const promos  = await fetchAllOfertas();
  const urls = [];

  // 1) Página país /ofertas — sólo si hay >=3 (mismo umbral anti-thin que la página SSR)
  if (promos.length >= 3) {
    urls.push(`<url><loc>${esc(siteUrl + '/ofertas')}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`);
  }

  // 2) /ofertas/:ciudad — sólo ciudades con >=3 promos vigentes (garantiza index, no thin)
  const byCity = new Map();
  for (const p of promos) {
    if (!p.city) continue;
    const slug = slugify(p.city);
    if (!slug) continue;
    byCity.set(slug, (byCity.get(slug) || 0) + 1);
  }
  for (const [slug, count] of byCity) {
    if (count < 3) continue;
    const priority = count >= 15 ? '0.6' : '0.5';
    urls.push(`<url><loc>${esc(siteUrl + '/ofertas/' + slug)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${priority}</priority></url>`);
  }

  // 3) /promo/:id — cada promo vigente (indexable individualmente, robots index si vigente)
  for (const p of promos) {
    if (p.id == null) continue;
    urls.push(`<url><loc>${esc(siteUrl + '/promo/' + p.id)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.5</priority></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  _smOfertas = { xml, ts: Date.now() };
  return xml;
}

app.get('/sitemap-ofertas.xml', async (req, res) => {
  const now = Date.now();
  if (_smOfertas.xml && (now - _smOfertas.ts) < SM_OFERTAS_TTL_MS) return res.type('application/xml').send(_smOfertas.xml);
  if (!_smOfertasInflight) _smOfertasInflight = buildSitemapOfertasXml().finally(() => { _smOfertasInflight = null; });
  try { res.type('application/xml').send(await _smOfertasInflight); }
  catch (e) { console.error('[sitemap-ofertas]', e.message); if (_smOfertas.xml) return res.type('application/xml').send(_smOfertas.xml); res.status(503).send('Sitemap temporarily unavailable'); }
});

app.get('/sitemap-empresas.xml', async (req, res) => {
  const now = Date.now();
  if (_smEmpresas.xml && (now - _smEmpresas.ts) < SM_TTL_MS) {
    return res.type('application/xml').send(_smEmpresas.xml);
  }
  if (!_smEmpresasInflight) {
    _smEmpresasInflight = buildSitemapEmpresasXml().finally(() => { _smEmpresasInflight = null; });
  }
  try {
    const xml = await _smEmpresasInflight;
    res.type('application/xml').send(xml);
  } catch (e) {
    console.error('[sitemap-empresas]', e.message);
    if (_smEmpresas.xml) return res.type('application/xml').send(_smEmpresas.xml); // stale mejor que timeout
    res.status(503).send('Sitemap temporarily unavailable');
  }
});

// ── Helper: convertir nombre a slug ──────────────────────────────────────────
function slugify(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── D2.4 interlinking: rubros relacionados (por parent_id) y ciudades hermanas
function relatedCategories(categories, catSlug, limit) {
  if (!Array.isArray(categories)) return [];
  const cur = categories.find(c => c.slug === catSlug);
  if (!cur) return [];
  let sibs;
  if (cur.parentId) sibs = categories.filter(c => c.parentId === cur.parentId && c.slug !== catSlug);
  else sibs = categories.filter(c => c.parentId === cur.id);
  if (!sibs.length) sibs = categories.filter(c => (c.parentId == null) && c.slug !== catSlug);
  return sibs.slice(0, limit).map(c => ({ name: c.name, slug: c.slug }));
}
function siblingCities(byDept, currentSlug, limit) {
  if (!Array.isArray(byDept) || !currentSlug) return [];
  // Departamento derivado de la TABLA de ciudades (autoritativa), no del negocio.
  const grp = byDept.find(d => Array.isArray(d.cities) && d.cities.some(c => c.slug === currentSlug));
  if (!grp) return [];
  return grp.cities.filter(c => c.slug && c.slug !== currentSlug).slice(0, limit).map(c => ({ name: c.name, slug: c.slug }));
}

// ── buildCategoryHTML — página categoría (país) y categoría×ciudad, server-rendered
function buildCategoryHTML(o) {
  const items = (o.businesses || []).map(b => {
    const bCat  = b.categorySlug || b.category_slug || o.catSlug || 'general';
    const bCity = b.city ? slugify(b.city) : (o.citySlug || 'paraguay');
    const url   = `/negocios/${bCat}/${bCity}/${b.slug}`;
    const img   = b.coverUrl || b.cover_url || b.imageUrl || b.image_url || '';
    const rating= parseFloat(b.rating) || 0;
    const rc    = parseInt(b.reviewCount || b.review_count || 0) || 0;
    const plan  = b.planType || b.plan_type;
    const badge = plan === 'premium' ? '<span class="pl plp">Premium</span>'
                : plan === 'featured' ? '<span class="pl plf">Destacado</span>' : '';
    const initial = esc((String(b.name || '?').trim().charAt(0) || '?').toUpperCase());
    return `<li><a class="biz" href="${esc(url)}">
      ${img ? `<img class="th" src="${esc(img)}" alt="${esc(b.name)}" loading="lazy" width="72" height="72">` : `<span class="th the">${initial}</span>`}
      <span class="bi">
        <span class="bn">${esc(b.name)}${b.verified ? ' <span class="vf" title="Verificado">✔</span>' : ''}${badge}</span>
        <span class="bm">${esc(b.categoryName || o.catName || '')}${b.city ? ' · ' + esc(b.city) : ''}</span>
        ${rating > 0 ? `<span class="br">★ ${rating.toFixed(1)} <span class="mu">(${rc})</span></span>` : ''}
      </span>
    </a></li>`;
  }).join('');
  const listHtml = o.total > 0
    ? `<ul class="bl">${items}</ul>`
    : `<p class="empty">Todavía no hay negocios cargados en esta categoría. <a href="/negocios">Ver todo el directorio →</a></p>`;
  const countLabel = o.total > 0
    ? `${o.total.toLocaleString('es-PY')} ${o.total === 1 ? 'negocio' : 'negocios'}${o.cityName ? ' en ' + esc(o.cityName) : ' en Paraguay'}`
    : '';
  const introHtml = (() => {
    if (!o.total) return '';
    const loc = o.cityName || 'Paraguay';
    const dept = (o.businesses[0] && o.businesses[0].department) || '';
    const deptTxt = (o.cityName && dept && slugify(dept) !== slugify(o.cityName)) ? `, ${dept}` : '';
    const negocios = o.total === 1 ? 'negocio' : 'negocios';
    const rated = o.businesses.filter(b => (parseFloat(b.rating) || 0) > 0);
    const avg = rated.length ? (rated.reduce((a, b) => a + parseFloat(b.rating), 0) / rated.length) : 0;
    const full = o.total <= o.businesses.length;
    const vt = o.verifiedTotal || 0;
    const s1 = `${o.catName} en ${loc}${deptTxt}: ${o.total.toLocaleString('es-PY')} ${negocios} en ${o.siteName}.`;
    const clauses = [];
    if (vt > 0) clauses.push(`${vt} ${vt === 1 ? 'está verificado' : 'están verificados'} por nuestro equipo`);
    if (rated.length) {
      const who = full ? `${rated.length} ${rated.length === 1 ? 'tiene' : 'tienen'}` : 'varios tienen';
      clauses.push(`${who} reseñas de clientes (promedio ${avg.toFixed(1)}★)`);
    }
    const s2 = clauses.length ? `De ellos, ${clauses.join(' y ')}.` : '';
    const s3 = 'Compará contacto, horarios y opiniones para elegir con confianza.';
    return `<p class="intro">${esc(s1)}${s2 ? ' ' + esc(s2) : ''} ${esc(s3)}</p>`;
  })();
  const _rel = o.relatedCats || [], _sib = o.siblingCities || [];
  const linksHtml = (() => {
    let h = '';
    if (_sib.length) {
      h += `<section class="ilk"><h2>${esc(o.catName)} en otras ciudades</h2><div class="chips">` +
        _sib.map(c => `<a href="/negocios/${esc(o.catSlug)}/${esc(c.slug)}">${esc(c.name)}</a>`).join('') +
        `</div></section>`;
    }
    if (_rel.length) {
      const cityPart = o.citySlug ? `/${esc(o.citySlug)}` : '';
      const label = o.cityName ? `Otros rubros en ${esc(o.cityName)}` : 'Rubros relacionados';
      h += `<section class="ilk"><h2>${label}</h2><div class="chips">` +
        _rel.map(c => `<a href="/negocios/${esc(c.slug)}${cityPart}">${esc(c.name)}</a>`).join('') +
        `</div></section>`;
    }
    return h;
  })();
  const _page = o.page || 1, _tp = o.totalPages || 1;
  const pagHtml = _tp > 1 ? (() => {
    const pl = (n, label) => n <= 1
      ? `<a class="pg" href="${esc(o.canonical)}">${label}</a>`
      : `<a class="pg" href="${esc(o.canonical)}?page=${n}">${label}</a>`;
    let out = '<nav class="pag" aria-label="Paginación">';
    if (_page > 1) out += pl(_page - 1, '\u2039 Anterior');
    out += `<span class="pgi">Página ${_page} de ${_tp}</span>`;
    if (_page < _tp) out += pl(_page + 1, 'Siguiente \u203a');
    return out + '</nav>';
  })() : '';
  const crumbTail = o.cityName
    ? ` &rsaquo; <a href="/negocios/${esc(o.catSlug)}">${esc(o.catName)}</a> &rsaquo; ${esc(o.cityName)}`
    : ` &rsaquo; ${esc(o.catName)}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.desc)}">
  <meta name="robots" content="${o.robots}">
  <link rel="canonical" href="${esc(o.canonical)}">
  ${(o.page || 1) > 1 ? `<link rel="prev" href="${esc((o.page - 1) <= 1 ? o.canonical : o.canonical + '?page=' + (o.page - 1))}">` : ''}
  ${(o.page || 1) < (o.totalPages || 1) ? `<link rel="next" href="${esc(o.canonical + '?page=' + ((o.page || 1) + 1))}">` : ''}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(o.siteName)}">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.desc)}">
  <meta property="og:url" content="${esc(o.canonical)}">
  <meta property="og:image" content="${esc(o.ogImage)}">
  <meta property="og:image:alt" content="${esc(o.ogImageAlt)}">
  <meta property="og:locale" content="es_PY">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@retopa_py">
  <meta name="twitter:title" content="${esc(o.title)}">
  <meta name="twitter:description" content="${esc(o.desc)}">
  <meta name="twitter:image" content="${esc(o.ogImage)}">
  <script type="application/ld+json">${o.breadcrumbJson}</script>
  <script type="application/ld+json">${o.itemListJson}</script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.5}
    .page{max-width:900px;margin:0 auto;padding:16px}
    .crumbs{font-size:12px;color:#64748b;padding:8px 2px}.crumbs a{color:#0284c7;text-decoration:none}
    h1{font-size:clamp(22px,4vw,32px);font-weight:800;color:#0f172a;margin:6px 0 4px;line-height:1.2}
    .cnt{color:#64748b;font-size:14px;margin-bottom:16px}
    .intro{color:#475569;font-size:14px;background:#fff;border-radius:14px;padding:14px 16px;margin:0 0 16px;line-height:1.6}
    .pag{display:flex;gap:10px;align-items:center;justify-content:center;margin:18px 0;flex-wrap:wrap}.pg{color:#0284c7;text-decoration:none;font-weight:700;font-size:14px;padding:8px 12px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)}.pgi{color:#64748b;font-size:13px}
    .ilk{margin:20px 0}.ilk h2{font-size:15px;color:#0f172a;margin:0 0 8px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chips a{background:#fff;color:#0369a1;text-decoration:none;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
    .bl{list-style:none;display:grid;gap:10px}
    .biz{display:flex;gap:12px;align-items:center;background:#fff;border-radius:14px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-decoration:none;color:inherit}
    .th{width:72px;height:72px;border-radius:10px;object-fit:cover;background:#e2e8f0;flex-shrink:0}
    .the{display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#0284c7}
    .bi{display:flex;flex-direction:column;gap:2px;min-width:0}
    .bn{font-weight:700;color:#0f172a;font-size:15px}.vf{color:#22c55e}
    .bm{color:#64748b;font-size:13px}.br{color:#475569;font-size:13px}.mu{color:#94a3b8}
    .pl{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;margin-left:6px;vertical-align:middle}
    .plp{background:#fef3c7;color:#b45309}.plf{background:#e0f2fe;color:#0369a1}
    .empty{color:#64748b;background:#fff;border-radius:14px;padding:20px;text-align:center}.empty a{color:#0284c7;text-decoration:none;font-weight:700}
    .mapph{margin:16px 0;background:#e2e8f0;border-radius:14px;height:110px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px}
    .cta{margin:20px 0;text-align:center}.cta a{color:#0284c7;font-weight:700;text-decoration:none}
    .ft{text-align:center;color:#94a3b8;font-size:12px;padding:18px}.ft a{color:#0284c7;text-decoration:none;font-weight:700}
    @media(max-width:640px){.th{width:60px;height:60px}}
  </style>
</head>
<body>
  <div class="page">
    <nav class="crumbs" aria-label="breadcrumb"><a href="/">Inicio</a> &rsaquo; <a href="/negocios">Negocios</a>${crumbTail}</nav>
    <h1>${esc(o.h1)}</h1>
    ${countLabel ? `<p class="cnt">${countLabel}</p>` : ''}
    ${introHtml}
    ${listHtml}
    ${pagHtml}
    ${linksHtml}
    <div class="mapph" id="mapPlaceholder">📍 Ubicaciones disponibles en el buscador</div>
    <div class="cta"><a href="/negocios">Buscar y filtrar todo el directorio →</a></div>
    <footer class="ft"><a href="/">RetoPA</a> — El ecosistema comercial de Paraguay</footer>
  </div>
</body>
</html>`;
}

// ── /negocios — listado general ───────────────────────────────────────────────
app.get('/negocios', async (req, res) => {
  try {
    const [configData, statsData, catsData] = await Promise.allSettled([
      fetchBackend('/site-config'), fetchBackend('/stats'), fetchBackend('/categories'),
    ]);
    const cfg   = configData.status==='fulfilled'&&configData.value.success ? configData.value.data : {};
    const stats = statsData.status ==='fulfilled'&&statsData.value.success  ? statsData.value.data  : {};
    const cats  = catsData.status  ==='fulfilled'&&catsData.value.success   ? catsData.value.data   : [];
    const siteName = cfg.site_name||SITE_NAME, siteUrl = cfg.site_url||SITE_URL;
    const total = stats.businesses||0;
    const title = `Directorio de Negocios en Paraguay (${total.toLocaleString()}+) — ${siteName}`;
    const desc  = truncate(`Encontrá entre ${total.toLocaleString()} empresas y profesionales en Paraguay. Buscá por categoría, ciudad o nombre. ${siteName}.`);
    const breadcrumb = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:siteName,item:siteUrl},
      {'@type':'ListItem',position:2,name:'Directorio de Negocios',item:`${siteUrl}/negocios`},
    ]});
    const itemList = JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:'Directorio de Empresas Paraguay',numberOfItems:total,
      itemListElement:cats.slice(0,10).map((c,i)=>({'@type':'ListItem',position:i+1,name:c.name,url:`${siteUrl}/negocios/${c.slug}`}))});
    const fs = require('fs');
    let html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
    const meta = `\n  <meta name="description" content="${esc(desc)}">\n  <link rel="canonical" href="${esc(siteUrl)}/negocios">\n  <meta property="og:title" content="${esc(title)}">\n  <meta property="og:description" content="${esc(desc)}">\n  <meta property="og:image" content="${siteUrl}/og-default.png">\n  <meta property="og:image:alt" content="${esc(siteName)} — Directorio Comercial de Paraguay">\n  <meta property="og:url" content="${esc(siteUrl)}/negocios">\n  <meta property="og:type" content="website">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:site" content="@retopa_py">\n  <meta name="twitter:title" content="${esc(title)}">\n  <meta name="twitter:description" content="${esc(desc)}">\n  <meta name="twitter:image" content="${siteUrl}/og-default.png">\n  <meta name="robots" content="index, follow">\n  <script type="application/ld+json">${breadcrumb}</script>\n  <script type="application/ld+json">${itemList}</script>`;
    html = html.replace('<head>','<head>'+meta).replace(/<title>.*?<\/title>/,`<title>${esc(title)}</title>`);
    res.type('text/html').send(html);
  } catch(e){ res.sendFile(path.join(__dirname,'index.html')); }
});

// ── /negocios/:cat — por categoría ───────────────────────────────────────────
app.get('/negocios/:cat', async (req, res) => {
  const { cat } = req.params;
  if(!/^[a-z0-9\-]+$/i.test(cat)) return res.redirect(301,'/negocios');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * 24;
  try {
    const [bizData,vData,configData,catData] = await Promise.allSettled([
      fetchBackend(`/businesses?category=${encodeURIComponent(cat)}&limit=24&offset=${offset}&sort=relevance`),
      fetchBackend(`/businesses?category=${encodeURIComponent(cat)}&verified=true&limit=1`),
      fetchBackend('/site-config'),
      fetchBackend('/categories'),
    ]);
    const businesses = bizData.status==='fulfilled'&&bizData.value.success ? bizData.value.data : [];
    const total = bizData.status==='fulfilled'&&bizData.value.success ? (bizData.value.total ?? businesses.length) : 0;
    const totalPages = Math.max(1, Math.ceil(total / 24));
    if (page > totalPages && total > 0) return res.redirect(301, req.path);
    const verifiedTotal = vData.status==='fulfilled'&&vData.value.success ? (vData.value.total || 0) : 0;
    const cfg = configData.status==='fulfilled'&&configData.value.success ? configData.value.data : {};
    const siteName=cfg.site_name||SITE_NAME, siteUrl=cfg.site_url||SITE_URL;
    const catName = businesses[0]?.categoryName || (cat.charAt(0).toUpperCase()+cat.slice(1).replace(/-/g,' '));
    const title = `${catName} en Paraguay (${total}+)${page>1?` — Página ${page}`:''} — ${siteName}`;
    const desc  = truncate(`Encontrá ${total} empresas de ${catName} en Paraguay. Buscá por ciudad, compará y contactá directo. ${siteName}.`);
    const pageUrl = `${siteUrl}/negocios/${cat}`;
    const ogImg = businesses.find(b=>b.coverUrl)?.coverUrl||businesses.find(b=>b.imageUrl)?.imageUrl||`${siteUrl}/og-default.png`;
    const absOg = ogImg.startsWith('http') ? ogImg : siteUrl+ogImg;
    const breadcrumb = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:siteName,item:siteUrl},
      {'@type':'ListItem',position:2,name:'Negocios',item:`${siteUrl}/negocios`},
      {'@type':'ListItem',position:3,name:catName,item:pageUrl},
    ]});
    const itemList = JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:`${catName} en Paraguay`,numberOfItems:total,
      itemListElement:businesses.slice(0,10).map((b,i)=>({'@type':'ListItem',position:i+1,
        item:{'@type':mapCategoryToSchema(catName),name:b.name,url:`${siteUrl}/negocios/${cat}/${slugify(b.city||'paraguay')}/${b.slug}`}}))});
    const robots = total >= 3 ? 'index, follow' : 'noindex, follow';
    const relatedCats = relatedCategories(catData.status==='fulfilled'&&catData.value.success ? catData.value.data : [], cat, 8);
    res.type('text/html').status(200).send(buildCategoryHTML({
      title, desc, canonical:pageUrl, siteName, siteUrl, h1:`${catName} en Paraguay`,
      catName, cityName:null, catSlug:cat, citySlug:null, total, businesses, robots, verifiedTotal, page, totalPages, relatedCats,
      ogImage:absOg, ogImageAlt:`${catName} en Paraguay — ${siteName}`,
      breadcrumbJson:breadcrumb, itemListJson:itemList,
    }));
  } catch(e){
    console.error(`[SSR /negocios/${req.params.cat}]`,e.message);
    res.sendFile(path.join(__dirname,'index.html'));
  }
});

// ── /negocios/:cat/:ciudad — categoría + ciudad (server-rendered) ────────────
app.get('/negocios/:cat/:ciudad', async (req, res) => {
  const {cat,ciudad} = req.params;
  if(!/^[a-z0-9\-]+$/i.test(cat)||!/^[a-z0-9\-]+$/i.test(ciudad)) return res.redirect(301,`/negocios/${cat}`);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * 24;
  try {
    const citySlugName = ciudad.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    const [bizData,vData,configData,catData,cityData] = await Promise.allSettled([
      fetchBackend(`/businesses?category=${encodeURIComponent(cat)}&city=${encodeURIComponent(citySlugName)}&limit=24&offset=${offset}&sort=relevance`),
      fetchBackend(`/businesses?category=${encodeURIComponent(cat)}&city=${encodeURIComponent(citySlugName)}&verified=true&limit=1`),
      fetchBackend('/site-config'),
      fetchBackend('/categories'),
      fetchBackend('/cities/by-department'),
    ]);
    const businesses = bizData.status==='fulfilled'&&bizData.value.success ? bizData.value.data : [];
    const total = bizData.status==='fulfilled'&&bizData.value.success ? (bizData.value.total ?? businesses.length) : 0;
    const totalPages = Math.max(1, Math.ceil(total / 24));
    if (page > totalPages && total > 0) return res.redirect(301, req.path);
    const verifiedTotal = vData.status==='fulfilled'&&vData.value.success ? (vData.value.total || 0) : 0;
    const cfg = configData.status==='fulfilled'&&configData.value.success ? configData.value.data : {};
    const siteName=cfg.site_name||SITE_NAME, siteUrl=cfg.site_url||SITE_URL;
    const catName = businesses[0]?.categoryName || cat.replace(/-/g,' ');
    const cityName = businesses[0]?.city || citySlugName;
    const title = `${catName} en ${cityName}, Paraguay (${total}+)${page>1?` — Página ${page}`:''} — ${siteName}`;
    const desc  = truncate(`Las mejores empresas de ${catName} en ${cityName}, Paraguay. ${total} negocios en ${siteName}.`);
    const pageUrl = `${siteUrl}/negocios/${cat}/${ciudad}`;
    const ogImg = businesses.find(b=>b.coverUrl)?.coverUrl||businesses.find(b=>b.imageUrl)?.imageUrl||`${siteUrl}/og-default.png`;
    const absOg = ogImg.startsWith('http') ? ogImg : siteUrl+ogImg;
    const breadcrumb = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:siteName,item:siteUrl},
      {'@type':'ListItem',position:2,name:'Negocios',item:`${siteUrl}/negocios`},
      {'@type':'ListItem',position:3,name:catName,item:`${siteUrl}/negocios/${cat}`},
      {'@type':'ListItem',position:4,name:cityName,item:pageUrl},
    ]});
    const itemList = JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:`${catName} en ${cityName}`,numberOfItems:total,
      itemListElement:businesses.slice(0,10).map((b,i)=>({'@type':'ListItem',position:i+1,
        item:{'@type':mapCategoryToSchema(catName),name:b.name,url:`${siteUrl}/negocios/${cat}/${ciudad}/${b.slug}`}}))});
    const robots = total >= 3 ? 'index, follow' : 'noindex, follow';
    const relatedCats = relatedCategories(catData.status==='fulfilled'&&catData.value.success ? catData.value.data : [], cat, 6);
    const sibCities = siblingCities(cityData.status==='fulfilled'&&cityData.value.success ? cityData.value.data : [], ciudad, 8);
    res.type('text/html').status(200).send(buildCategoryHTML({
      title, desc, canonical:pageUrl, siteName, siteUrl, h1:`${catName} en ${cityName}`,
      catName, cityName, catSlug:cat, citySlug:ciudad, total, businesses, robots, verifiedTotal, page, totalPages, relatedCats, siblingCities:sibCities,
      ogImage:absOg, ogImageAlt:`${catName} en ${cityName} — ${siteName}`,
      breadcrumbJson:breadcrumb, itemListJson:itemList,
    }));
  } catch(e){
    console.error(`[SSR /negocios/${req.params.cat}/${req.params.ciudad}]`,e.message);
    res.sendFile(path.join(__dirname,'index.html'));
  }
});

// ── /negocios/:cat/:ciudad/:slug — URL jerárquica completa ────────────────────
// Sirve la SPA (ficha rica de RetoPA) para HUMANOS, con meta/canonical/OG/JSON-LD
// inyectados (así ni un bot mal detectado pierde SEO) + preload que abre el perfil.
// Los crawlers reciben el SSR (buildBusinessHTML), sin cambios — el SEO no se toca.
function serveBusinessSpa(res, biz, cfg, canonicalUrl) {
  const fs = require('fs');
  const siteUrl  = cfg.site_url  || SITE_URL;
  const siteName = cfg.site_name || SITE_NAME;
  const _cat  = biz.categorySlug || biz.category_slug || 'general';
  const _city = biz.city ? slugify(biz.city) : 'paraguay';
  const canonical = canonicalUrl || `${siteUrl}/negocios/${_cat}/${_city}/${biz.slug}`;
  const nm      = biz.tradeName || biz.trade_name || biz.name || '';
  const catName = biz.categoryName || biz.category_name || 'Empresa';
  const city    = biz.city || 'Paraguay';
  const title   = `${nm} — ${catName} en ${city} | ${siteName}`;
  const desc    = truncate(biz.description || `${catName} en ${city}. ${nm} en ${siteName}.`, 155);
  const og      = biz.coverUrl || biz.cover_url || biz.imageUrl || biz.image_url || DEFAULT_OG;
  const absOg   = og.startsWith('http') ? og : `${siteUrl}${og}`;
  const minScore = parseInt(cfg.seo_min_quality_score) || 15;
  const qScore   = parseInt(biz.qualityScore ?? biz.quality_score ?? 0) || 0;
  const robots   = qScore >= minScore ? 'index, follow' : 'noindex, follow';
  const schema   = buildLocalBusinessSchema(biz, siteUrl);
  const meta = `\n  <meta name="description" content="${esc(desc)}">\n  <meta name="robots" content="${robots}">\n  <link rel="canonical" href="${esc(canonical)}">\n  <meta property="og:type" content="business.business">\n  <meta property="og:site_name" content="${esc(siteName)}">\n  <meta property="og:title" content="${esc(title)}">\n  <meta property="og:description" content="${esc(desc)}">\n  <meta property="og:url" content="${esc(canonical)}">\n  <meta property="og:image" content="${esc(absOg)}">\n  <meta property="og:locale" content="es_PY">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:site" content="@retopa_py">\n  <meta name="twitter:title" content="${esc(title)}">\n  <meta name="twitter:description" content="${esc(desc)}">\n  <meta name="twitter:image" content="${esc(absOg)}">\n  <script type="application/ld+json">${schema}</script>`;
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  html = html.replace('<head>', '<head>' + meta)
             .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
             .replace('<script>', `<script>window.__RETOPA_PRELOAD__={type:'business',slug:${JSON.stringify(biz.slug)}};</script>\n<script>`);
  res.type('text/html').status(200).send(html);
}

app.get('/negocios/:cat/:ciudad/:slug', async (req, res) => {
  const {cat,ciudad,slug} = req.params;
  if(!/^[a-z0-9\-_]+$/i.test(slug)) return res.redirect(301,`/negocios/${cat}/${ciudad}`);
  try {
    const [bizData,configData] = await Promise.allSettled([
      fetchBackend(`/businesses/${slug}`),
      fetchBackend('/site-config'),
    ]);
    if(bizData.status!=='fulfilled'||!bizData.value.success||!bizData.value.data)
      return res.redirect(302,`/negocios/${cat}`);
    const biz = bizData.value.data;
    const cfg = configData.status==='fulfilled'&&configData.value.success ? configData.value.data : {};
    const siteUrl = cfg.site_url||SITE_URL;
    // Canónica REAL desde la categoría/ciudad/slug ACTUALES del negocio resuelto.
    // El backend ya mapea slugs viejos (duplicados desactivados) al negocio activo
    // correcto por RUC, así que redirigir a su canónica es seguro y consolida el SEO.
    const trueCatSlug  = biz.categorySlug || 'general';
    const trueCitySlug = biz.city ? slugify(biz.city) : 'paraguay';
    const canonicalPath = `/negocios/${trueCatSlug}/${trueCitySlug}/${biz.slug}`;
    if (decodeURIComponent(req.path) !== canonicalPath) {
      return res.redirect(301, canonicalPath);
    }
    const canonicalUrl = `${siteUrl}${canonicalPath}`;
    // Registrar la visita server-side (salteando crawlers). Fire & forget.
    if (!isCrawler(req.headers['user-agent'])) {
      postBackend(`/client/businesses/${biz.slug}/view`, {}, {
        'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
        'user-agent': req.headers['user-agent'] || '',
        'referer': req.headers['referer'] || '',
      });
    }
    if (isCrawler(req.headers['user-agent'])) {
      // Crawler/buscador/preview → SSR completo (indexable + OG). Idéntico a antes.
      res.type('text/html').status(200).send(buildBusinessHTML(biz,{...cfg,_canonicalOverride:canonicalUrl}));
    } else {
      // Humano → ficha rica de la SPA (misma URL), con meta/OG/JSON-LD inyectados.
      serveBusinessSpa(res, biz, cfg, canonicalUrl);
    }
  } catch(e){
    console.error(`[SSR /negocios/.../${req.params.slug}]`,e.message);
    res.sendFile(path.join(__dirname,'index.html'));
  }
});

// ── /ofertas y /ofertas/:ciudad — vitrina pública de promociones (server-rendered PRO) ──
async function fetchOfertas(cityName) {
  const qs = `limit=60${cityName ? `&city=${encodeURIComponent(cityName)}` : ''}`;
  const r = await fetchBackend(`/promotions?${qs}`).catch(() => null);
  return (r && r.success && Array.isArray(r.data)) ? r.data : [];
}
function ofertasCityChips(promos, excludeSlug) {
  const seen = new Set(); const out = [];
  for (const p of (promos || [])) {
    if (!p.city) continue;
    const slug = slugify(p.city);
    if (!slug || slug === excludeSlug || seen.has(slug)) continue;
    seen.add(slug); out.push({ name: p.city, slug });
    if (out.length >= 12) break;
  }
  return out;
}
function ofertasCatChips(promos) {
  const map = new Map();
  for (const p of (promos || [])) {
    if (!p.category_name) continue;
    const slug = p.category_slug || slugify(p.category_name);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, { name: p.category_name, slug, n: 0 });
    map.get(slug).n++;
  }
  return Array.from(map.values()).sort((a, b) => b.n - a.n);
}
function buildOfertasHTML(o) {
  const fmt = n => Number(n || 0).toLocaleString('es-PY');
  const cards = (o.promos || []).map(p => {
    const img = p.image_url || p.business_logo || '';
    const bizName = p.trade_name || p.business_name || '';
    const bizSlug = p.business_slug || '';
    const wa = String(p.whatsapp || p.phone || '').replace(/\D/g, '');
    const disc = p.discount_pct ? parseInt(p.discount_pct) : 0;
    const label = p.price_label || 'Gs.';
    const priceHtml = p.promo_price
      ? `<div class="oc-price"><b>${esc(label)} ${fmt(p.promo_price)}</b>${p.original_price ? ` <s>${esc(label)} ${fmt(p.original_price)}</s>` : ''}</div>` : '';
    let expLabel = '';
    if (p.expires_at) {
      const days = Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / 86400000);
      expLabel = days <= 1 ? 'Último día' : `Quedan ${days} días`;
    }
    const fire = (p.boost_type === 'boost_home_30d' || p.boost_type === 'boost_15d') ? '<span class="oc-fire">🔥 Destacada</span>' : '';
    const catSlug = p.category_slug || (p.category_name ? slugify(p.category_name) : '');
    return `<article class="oc" data-cat="${esc(catSlug)}">
      <a class="oc-top" href="/promo/${p.id}">
        <div class="oc-img">${img ? `<img loading="lazy" src="${esc(img)}" alt="${esc(p.title)}" width="400" height="240">` : '<span class="oc-ph">%</span>'}${disc ? `<span class="oc-badge">-${disc}%</span>` : ''}${fire}</div>
        <div class="oc-b">
          <h3 class="oc-t">${esc(p.title)}</h3>
          <div class="oc-biz">${esc(bizName)}${p.verified ? ' <span class="vf" title="Verificado">✔</span>' : ''}${p.city ? ' · ' + esc(p.city) : ''}</div>
          ${priceHtml}
          ${expLabel ? `<div class="oc-exp">⏳ ${expLabel}</div>` : ''}
        </div>
      </a>
      <div class="oc-acts">
        ${wa ? `<a class="oc-wa" rel="nofollow" href="/go/whatsapp/${esc(bizSlug)}">WhatsApp</a>` : ''}
        <a class="oc-ver" href="/promo/${p.id}">Ver oferta</a>
      </div>
    </article>`;
  }).join('');
  const grid = o.count > 0
    ? `<div class="ogrid">${cards}</div>`
    : `<div class="oempty"><div class="oempty-e">🏷️</div><p>Todavía no hay ofertas vigentes${o.cityName ? ` en ${esc(o.cityName)}` : ''}.</p><a href="/negocios">Explorá los negocios →</a></div>`;
  const chips = (o.cityChips && o.cityChips.length)
    ? `<section class="ochips"><h2>${o.scope === 'ciudad' ? 'Ofertas en otras ciudades' : 'Ofertas por ciudad'}</h2><div class="chips">${o.cityChips.map(c => `<a href="/ofertas/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div></section>`
    : '';
  const backLink = o.scope === 'ciudad' ? `<a class="oback" href="/ofertas">← Todas las ofertas de Paraguay</a>` : '';
  const countLabel = o.count > 0 ? `${o.count}${o.count >= 60 ? '+' : ''} ${o.count === 1 ? 'oferta vigente' : 'ofertas vigentes'}` : '';
  const catChips = o.catChips || [];
  const filterBar = (o.count > 0 && catChips.length >= 2)
    ? `<div class="ofilter" id="ofilter"><button class="ofl active" data-f="">Todas <span>${o.count}</span></button>${catChips.map(c => `<button class="ofl" data-f="${esc(c.slug)}">${esc(c.name)} <span>${c.n}</span></button>`).join('')}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.desc)}">
  <meta name="robots" content="${o.robots}">
  <link rel="canonical" href="${esc(o.canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(o.siteName)}">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.desc)}">
  <meta property="og:url" content="${esc(o.canonical)}">
  <meta property="og:image" content="${esc(o.ogImage)}">
  <meta property="og:locale" content="es_PY">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@retopa_py">
  <meta name="twitter:title" content="${esc(o.title)}">
  <meta name="twitter:description" content="${esc(o.desc)}">
  <meta name="twitter:image" content="${esc(o.ogImage)}">
  <script type="application/ld+json">${o.breadcrumbJson}</script>
  <script type="application/ld+json">${o.itemListJson}</script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.5}
    .wrap{max-width:1100px;margin:0 auto;padding:16px}
    .crumbs{font-size:12px;color:#64748b;padding:6px 2px}.crumbs a{color:#0284c7;text-decoration:none}
    .ohero{background:linear-gradient(135deg,#0284c7,#1B3A6B);color:#fff;border-radius:18px;padding:30px 22px;margin:8px 0 16px;text-align:center}
    .ohero h1{font-size:clamp(24px,5vw,36px);font-weight:900;line-height:1.15}
    .ohero p{margin-top:6px;font-size:14px;color:#e0f2fe;font-weight:600}
    .oback{display:inline-block;color:#0284c7;text-decoration:none;font-weight:700;font-size:13px;margin:0 0 12px}
    .ofilter{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 0 8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
    .ofilter::-webkit-scrollbar{display:none}
    .ofl{flex:0 0 auto;background:#fff;color:#334155;border:1px solid #e2e8f0;font-size:13px;font-weight:700;padding:8px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background .12s}
    .ofl span{color:#94a3b8;font-weight:600;margin-left:2px}
    .ofl.active{background:#0284c7;color:#fff;border-color:#0284c7}
    .ofl.active span{color:#bae6fd}
    .ogrid{display:grid;grid-template-columns:1fr;gap:14px}
    @media(min-width:600px){.ogrid{grid-template-columns:repeat(2,1fr)}}
    @media(min-width:920px){.ogrid{grid-template-columns:repeat(3,1fr)}}
    .oc{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column}
    .oc-top{text-decoration:none;color:inherit;display:block}
    .oc-img{position:relative;aspect-ratio:5/3;background:#e2e8f0;overflow:hidden}
    .oc-img img{width:100%;height:100%;object-fit:cover;display:block}
    .oc-ph{display:flex;align-items:center;justify-content:center;height:100%;font-size:40px;color:#cbd5e1;font-weight:900}
    .oc-badge{position:absolute;top:10px;left:10px;background:#ef4444;color:#fff;font-weight:800;font-size:13px;padding:3px 10px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.2)}
    .oc-fire{position:absolute;top:10px;right:10px;background:rgba(15,23,42,.82);color:#fff;font-weight:700;font-size:11px;padding:3px 9px;border-radius:999px}
    .oc-b{padding:12px 14px}
    .oc-t{font-size:15px;font-weight:800;color:#0f172a;line-height:1.25;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .oc-biz{font-size:12.5px;color:#64748b}.vf{color:#22c55e}
    .oc-price{margin-top:6px;color:#0f172a;font-size:15px}.oc-price b{color:#0284c7;font-weight:900}.oc-price s{color:#94a3b8;font-size:12.5px;margin-left:4px}
    .oc-exp{margin-top:6px;font-size:12px;color:#b45309;background:#fef3c7;display:inline-block;padding:2px 8px;border-radius:999px}
    .oc-acts{display:flex;gap:8px;padding:0 14px 14px;margin-top:auto}
    .oc-acts a{flex:1;text-align:center;text-decoration:none;font-weight:700;font-size:13px;padding:9px 0;border-radius:10px}
    .oc-wa{background:#25D366;color:#fff}.oc-ver{background:#f1f5f9;color:#0f172a}
    .oempty{background:#fff;border-radius:16px;padding:40px 20px;text-align:center;color:#64748b}.oempty-e{font-size:44px;margin-bottom:10px}.oempty a{color:#0284c7;font-weight:700;text-decoration:none}
    .ochips{margin:22px 0}.ochips h2{font-size:16px;color:#0f172a;margin-bottom:10px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chips a{background:#fff;color:#0369a1;text-decoration:none;font-size:13px;font-weight:600;padding:7px 13px;border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
    .octa{text-align:center;margin:22px 0}.octa a{color:#0284c7;font-weight:700;text-decoration:none}
    .oft{text-align:center;color:#94a3b8;font-size:12px;padding:18px}.oft a{color:#0284c7;text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="crumbs"><a href="/">Inicio</a> &rsaquo; <a href="/ofertas">Ofertas</a>${o.cityName ? ` &rsaquo; ${esc(o.cityName)}` : ''}</nav>
    <header class="ohero">
      <h1>${esc(o.h1)}</h1>
      ${countLabel ? `<p id="ocount" data-all="${esc(countLabel)}">${countLabel}</p>` : ''}
    </header>
    ${backLink}
    ${filterBar}
    ${grid}
    ${chips}
    <div class="octa"><a href="/negocios">Ver todo el directorio &rarr;</a></div>
    <footer class="oft"><a href="/">RetoPA</a> — El ecosistema comercial de Paraguay</footer>
  </div>
  <script>
  (function(){
    var bar=document.getElementById('ofilter');if(!bar)return;
    var grid=document.querySelector('.ogrid');if(!grid)return;
    var cards=[].slice.call(grid.querySelectorAll('.oc'));
    var cnt=document.getElementById('ocount');
    bar.addEventListener('click',function(e){
      var b=e.target.closest('.ofl');if(!b)return;
      var f=b.getAttribute('data-f')||'';
      var btns=bar.querySelectorAll('.ofl');
      for(var i=0;i<btns.length;i++)btns[i].classList.toggle('active',btns[i]===b);
      var n=0;
      for(var j=0;j<cards.length;j++){
        var show=!f||cards[j].getAttribute('data-cat')===f;
        cards[j].style.display=show?'':'none';if(show)n++;
      }
      if(cnt)cnt.textContent=f?(n+(n===1?' oferta vigente':' ofertas vigentes')):cnt.getAttribute('data-all');
    });
  })();
  </script>
</body>
</html>`;
}

app.get('/ofertas', async (req, res) => {
  try {
    const [promos, configData] = await Promise.all([
      fetchOfertas(null),
      fetchBackend('/site-config').catch(() => null),
    ]);
    const cfg = (configData && configData.success) ? configData.data : {};
    const siteName = cfg.site_name || SITE_NAME, siteUrl = cfg.site_url || SITE_URL;
    const count = promos.length;
    const title = `Ofertas y Promociones en Paraguay — ${siteName}`;
    const desc  = truncate(`${count} ofertas y promociones vigentes de negocios en Paraguay. Aprovechá descuentos y contactá directo por WhatsApp. ${siteName}.`);
    const pageUrl = `${siteUrl}/ofertas`;
    const ogImg = promos.find(p => p.image_url)?.image_url || `${siteUrl}/og-default.png`;
    const absOg = ogImg.startsWith('http') ? ogImg : siteUrl + ogImg;
    const breadcrumb = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:siteName,item:siteUrl},
      {'@type':'ListItem',position:2,name:'Ofertas',item:pageUrl},
    ]});
    const itemList = JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:'Ofertas en Paraguay',numberOfItems:count,
      itemListElement:promos.slice(0,20).map((p,i)=>({'@type':'ListItem',position:i+1,name:p.title,url:`${siteUrl}/promo/${p.id}`}))});
    res.type('text/html').status(200).send(buildOfertasHTML({
      title, desc, canonical:pageUrl, siteName, siteUrl, h1:'Ofertas en Paraguay',
      scope:'pais', cityName:null, count, promos, cityChips:ofertasCityChips(promos, null), catChips:ofertasCatChips(promos),
      robots: count >= 3 ? 'index, follow' : 'noindex, follow', ogImage:absOg,
      breadcrumbJson:breadcrumb, itemListJson:itemList,
    }));
  } catch(e){ console.error('[SSR /ofertas]', e.message); res.sendFile(path.join(__dirname,'index.html')); }
});

app.get('/ofertas/:ciudad', async (req, res) => {
  const { ciudad } = req.params;
  if(!/^[a-z0-9\-]+$/i.test(ciudad)) return res.redirect(301,'/ofertas');
  try {
    const cityName = ciudad.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    const [promos, allPromos, configData] = await Promise.all([
      fetchOfertas(cityName),
      fetchOfertas(null),
      fetchBackend('/site-config').catch(() => null),
    ]);
    const cfg = (configData && configData.success) ? configData.data : {};
    const siteName = cfg.site_name || SITE_NAME, siteUrl = cfg.site_url || SITE_URL;
    const cityDisplay = promos[0]?.city || cityName;
    const count = promos.length;
    const title = `Ofertas en ${cityDisplay}, Paraguay — ${siteName}`;
    const desc  = truncate(`${count} ofertas y promociones vigentes en ${cityDisplay}. Descuentos de negocios locales, contactá directo. ${siteName}.`);
    const pageUrl = `${siteUrl}/ofertas/${ciudad}`;
    const ogImg = promos.find(p => p.image_url)?.image_url || `${siteUrl}/og-default.png`;
    const absOg = ogImg.startsWith('http') ? ogImg : siteUrl + ogImg;
    const breadcrumb = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:siteName,item:siteUrl},
      {'@type':'ListItem',position:2,name:'Ofertas',item:`${siteUrl}/ofertas`},
      {'@type':'ListItem',position:3,name:cityDisplay,item:pageUrl},
    ]});
    const itemList = JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:`Ofertas en ${cityDisplay}`,numberOfItems:count,
      itemListElement:promos.slice(0,20).map((p,i)=>({'@type':'ListItem',position:i+1,name:p.title,url:`${siteUrl}/promo/${p.id}`}))});
    res.type('text/html').status(200).send(buildOfertasHTML({
      title, desc, canonical:pageUrl, siteName, siteUrl, h1:`Ofertas en ${cityDisplay}`,
      scope:'ciudad', cityName:cityDisplay, count, promos, cityChips:ofertasCityChips(allPromos, ciudad), catChips:ofertasCatChips(promos),
      robots: count >= 3 ? 'index, follow' : 'noindex, follow', ogImage:absOg,
      breadcrumbJson:breadcrumb, itemListJson:itemList,
    }));
  } catch(e){ console.error(`[SSR /ofertas/${req.params.ciudad}]`, e.message); res.sendFile(path.join(__dirname,'index.html')); }
});

// ── /reclamar — página de claim desde link del email de notificación ──────────
app.get('/reclamar', (req, res) => {
  res.sendFile(path.join(__dirname, 'reclamar', 'index.html'));
});

// ── /promo/:id — página de promoción individual con preview propio (redes) ────
app.get('/promo/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.redirect(302, '/');
  try {
    const [promoData, configData] = await Promise.allSettled([
      fetchBackend(`/promotions/${id}`),
      fetchBackend('/site-config'),
    ]);
    if (promoData.status !== 'fulfilled' || !promoData.value.success || !promoData.value.data)
      return res.redirect(302, '/');
    const promo = promoData.value.data;
    const cfg = configData.status === 'fulfilled' && configData.value.success ? configData.value.data : {};
    res.type('text/html').status(200).send(buildPromoHTML(promo, cfg));
  } catch (e) {
    console.error(`[SSR /promo/${req.params.id}]`, e.message);
    res.redirect(302, '/');
  }
});

// ── /producto/:id — página de producto individual con preview propio (redes) ──
app.get('/producto/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.redirect(302, '/');
  try {
    const [prodData, configData] = await Promise.allSettled([
      fetchBackend(`/gallery/${id}`),
      fetchBackend('/site-config'),
    ]);
    if (prodData.status !== 'fulfilled' || !prodData.value.success || !prodData.value.data)
      return res.redirect(302, '/');
    const prod = prodData.value.data;
    const cfg = configData.status === 'fulfilled' && configData.value.success ? configData.value.data : {};
    res.type('text/html').status(200).send(buildProductHTML(prod, cfg));
  } catch (e) {
    console.error(`[SSR /producto/${req.params.id}]`, e.message);
    res.redirect(302, '/');
  }
});

// ── /empresa/:slug y /negocio/:slug — redirect 301 a URL canónica ────────────
async function redirectToCanonical(req, res) {
  const { slug } = req.params;
  if (!/^[a-z0-9\-_]+$/i.test(slug)) return res.redirect(301, '/');

  try {
    const bizData = await fetchBackend(`/businesses/${slug}`);
    if (bizData.success && bizData.data) {
      const biz      = bizData.data;
      const catSlug  = biz.categorySlug || 'general';
      const citySlug = biz.city ? slugify(biz.city) : 'paraguay';
      return res.redirect(301, `/negocios/${catSlug}/${citySlug}/${biz.slug}`);
    }
  } catch(e) { /* fallback */ }

  // Fallback: servir SSR directo si el backend falla
  try {
    const [bizData, configData] = await Promise.allSettled([
      fetchBackend(`/businesses/${slug}`),
      fetchBackend('/site-config'),
    ]);
    if (bizData.status !== 'fulfilled' || !bizData.value.success || !bizData.value.data)
      return res.redirect(302, '/');
    const biz = bizData.value.data;
    const cfg = configData.status === 'fulfilled' && configData.value.success ? configData.value.data : {};
    res.type('text/html').status(200).send(buildBusinessHTML(biz, cfg));
  } catch (err) {
    console.error(`[SSR ${req.path}]`, err.message);
    res.sendFile(path.join(__dirname, 'index.html'));
  }
}
// ── /empresa/:slug — redirect 301 a URL canónica ─────────────────────────────
app.get('/empresa/:slug', redirectToCanonical);

// ── /negocio/:slug — sirve HTML con OG completo (WhatsApp no sigue redirects) ─
app.get('/negocio/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9\-_]+$/i.test(slug)) return res.redirect(301, '/');
  try {
    const [bizData, configData] = await Promise.allSettled([
      fetchBackend(`/businesses/${slug}`),
      fetchBackend('/site-config'),
    ]);
    if (bizData.status !== 'fulfilled' || !bizData.value.success || !bizData.value.data)
      return res.redirect(302, '/');
    const biz = bizData.value.data;
    const cfg = configData.status === 'fulfilled' && configData.value.success ? configData.value.data : {};
    if (isCrawler(req.headers['user-agent'])) {
      // Crawler/preview (WhatsApp/Telegram/…): HTML completo con OG, sin redirect.
      res.type('text/html').status(200).send(buildBusinessHTML(biz, cfg));
    } else {
      // Humano → ficha rica de la SPA.
      serveBusinessSpa(res, biz, cfg, null);
    }
  } catch (err) {
    console.error(`[SSR /negocio/${slug}]`, err.message);
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// ── Home con meta tags enriquecidos ───────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    const [configData, statsData] = await Promise.allSettled([
      fetchBackend('/site-config'),
      fetchBackend('/stats'),
    ]);
    const siteConfig = configData.status === 'fulfilled' && configData.value.success ? configData.value.data : {};
    const stats      = statsData.status  === 'fulfilled' && statsData.value.success  ? statsData.value.data : {};

    const { orgSchema, orgBizSchema, title, desc, ogImage } = buildHomeHTML(siteConfig, stats);
    const siteUrl  = siteConfig.site_url  || SITE_URL;
    const siteName = siteConfig.site_name || SITE_NAME;

    // Leer index.html e inyectar meta tags en el <head>
    const fs = require('fs');
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    const metaInject = `
  <!-- ── SEO ── -->
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${esc(siteUrl)}">
  <meta property="og:type"        content="website">
  <meta property="og:site_name"   content="${esc(siteName)}">
  <meta property="og:title"       content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url"         content="${esc(siteUrl)}">
  <meta property="og:image"       content="${esc(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type"  content="image/png">
  <meta property="og:image:alt"   content="${esc(siteName)} — El ecosistema comercial de Paraguay">
  <meta property="og:locale"      content="es_PY">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="@retopa_py">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image"       content="${esc(ogImage)}">
  <meta name="twitter:image:alt"   content="${esc(siteName)} — El ecosistema comercial de Paraguay">
  <script type="application/ld+json">${orgSchema}</script>
  <script type="application/ld+json">${orgBizSchema}</script>`;

    // Inyectar después del <head>
    html = html.replace('<head>', '<head>' + metaInject);

    // También reemplazar el <title> existente si hay uno
    html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`);

    res.type('text/html').send(html);
  } catch (err) {
    console.error('[SSR home]', err.message);
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// ── Fallback: todo lo demás → SPA ─────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.redirect('/admin/index.html');
});

app.get('/embajador', (req, res) => {
  res.redirect('/embajador/index.html');
});
app.get('/embajador/', (req, res) => {
  res.sendFile(path.join(__dirname, 'embajador', 'index.html'));
});

app.get('/cliente', (req, res) => {
  res.redirect('/cliente/index.html');
});

app.get('/cliente/', (req, res) => {
  res.sendFile(path.join(__dirname, 'cliente', 'index.html'));
});

// /:cat/:ciudad/:slug SIN prefijo /negocios → 301 a la canónica; si no existe → 404 real
app.get('/:cat/:ciudad/:slug', async (req, res) => {
  const { cat, ciudad, slug } = req.params;
  const ok = v => /^[a-z0-9-]+$/i.test(v);
  if (!ok(cat) || !ok(ciudad) || !ok(slug)) return send404(req, res);
  try {
    const r = await fetchBackend(`/businesses/${slug}`);
    if (r && r.success && r.data) {
      const b  = r.data;
      const c  = b.categorySlug || cat || 'general';
      const ci = b.city ? slugify(b.city) : (ciudad || 'paraguay');
      return res.redirect(301, `/negocios/${c}/${ci}/${b.slug}`);
    }
  } catch (e) {}
  return send404(req, res);
});

// Cualquier otra URL desconocida → 404 real (nunca 200 con el home)
app.get('*', (req, res) => send404(req, res));

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RetoPA Frontend] SSR server running on port ${PORT}`);
  console.log(`[RetoPA Frontend] Backend: http://${BACKEND_HOST}:${BACKEND_PORT}`);
  console.log(`[RetoPA Frontend] Site URL: ${SITE_URL}`);
});
