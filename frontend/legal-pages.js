// ═══════════════════════════════════════════════════════════════════════════
// RetoPA — Páginas legales servidas desde el backend (2026-10-28)
//
//   /terminos.html, /privacidad.html  → HTML desde site_config (Markdown ya
//       renderizado y sanitizado por el backend). Indexables, Cache-Control 300 s.
//       ?v=2.0 muestra una versión anterior (historial público).
//       Si el backend no responde, se sirve el .html estático de siempre.
//   /legal/baja, /legal/denuncia      → formularios sin cuenta (noindex, follow).
//   legalFooterHtml()                 → enlaces legales + "marca operada por…"
//       para los pies que genera server.js (fichas, listados, ofertas).
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');

const escH = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Datos del operador para los pies: se refrescan del backend cada 5 min.
const op = { razonSocial: '', ruc: '' };
function refreshOperator(fetchBackend) {
    fetchBackend('/site-config').then(r => {
        if (r && r.success && r.data) { op.razonSocial = r.data.legal_razon_social || ''; op.ruc = r.data.legal_ruc || ''; }
    }).catch(() => {});
}

function legalFooterHtml() {
    const line = op.razonSocial
        ? `<br><span>RetoPA es una marca operada por ${escH(op.razonSocial)}${op.ruc ? ' · RUC ' + escH(op.ruc) : ''}</span>` : '';
    return `<nav class="ftl"><a href="/terminos.html">Términos</a> · <a href="/privacidad.html">Privacidad</a> · ` +
        `<a href="/legal/baja" rel="nofollow">Pedir baja o corrección de una ficha</a> · <a href="/legal/denuncia" rel="nofollow">Denunciar contenido</a></nav>${line}`;
}

const CSS = `
  :root{ --navy:#1B3A6B; --gold:#C9951F; --ink:#0F1E36; --ink2:#52607A; --bg:#F5F7FB; --border:#E3E8F0; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;line-height:1.65}
  header{background:#fff;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10}
  .bar{max-width:820px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .brand{font-weight:900;font-size:20px;color:var(--navy);text-decoration:none;letter-spacing:-.01em}
  .brand span{color:var(--gold)}
  .back{color:var(--navy);text-decoration:none;font-weight:600;font-size:14px;min-height:44px;display:inline-flex;align-items:center}
  main{max-width:820px;margin:0 auto;padding:28px 20px 80px}
  h1{font-size:clamp(24px,5vw,34px);margin:8px 0 4px;color:var(--navy)}
  .updated{color:var(--ink2);font-size:13px;margin:0 0 24px}
  h2{font-size:19px;margin:34px 0 8px;color:var(--navy);scroll-margin-top:80px}
  h3{font-size:16px;margin:22px 0 6px;color:var(--navy)}
  p,li,td,th{color:#26324a;font-size:15.5px}
  ul,ol{padding-left:22px}
  a{color:var(--navy)}
  code{background:#eef2f7;border-radius:6px;padding:1px 6px;font-size:.92em}
  hr{border:0;border-top:1px solid var(--border);margin:28px 0}
  .note{background:#fff8e6;border:1px solid #f2dfa6;border-radius:12px;padding:14px 16px;font-size:13.5px;color:#6b5410;margin:8px 0 26px}
  .old{background:#fdecec;border:1px solid #f5c2c2;border-radius:12px;padding:12px 16px;font-size:14px;color:#7a1d1d;margin:0 0 22px}
  .toc{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 18px;margin:0 0 10px}
  .toc b{display:block;font-size:13px;color:var(--ink2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
  .toc ol{margin:0;padding-left:20px;columns:2;column-gap:28px}
  .toc li{font-size:14px;margin:2px 0;break-inside:avoid}
  @media(max-width:640px){.toc ol{columns:1}}
  .tbl{overflow-x:auto;margin:10px 0 18px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:12px}
  th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--border);font-size:14px}
  th{background:#f0f3f9;color:var(--navy)}
  .vers{font-size:13.5px;color:var(--ink2)}
  footer{max-width:820px;margin:0 auto;padding:24px 20px;border-top:1px solid var(--border);color:var(--ink2);font-size:13px;line-height:1.8}
  footer a{color:var(--navy)}
  form .f{margin:0 0 16px} label{display:block;font-weight:700;font-size:14px;margin:0 0 5px;color:var(--navy)}
  input[type=text],input[type=url],select,textarea{width:100%;border:1px solid #cfd8e6;border-radius:10px;padding:11px 12px;font:inherit;font-size:15px;background:#fff}
  textarea{min-height:110px} .hint{font-size:13px;color:var(--ink2);margin:4px 0 0}
  .chk{display:flex;gap:10px;align-items:flex-start;font-weight:400;color:#26324a}
  .chk input{margin-top:5px;width:18px;height:18px}
  button{background:var(--navy);color:#fff;border:0;border-radius:12px;padding:13px 22px;font-weight:800;font-size:15px;cursor:pointer;min-height:48px}
  button[disabled]{opacity:.6} .hp{position:absolute;left:-5000px}
  .msg{border-radius:12px;padding:14px 16px;margin:0 0 18px;font-size:15px;display:none}
  .msg.ok{background:#e9f9ef;border:1px solid #b7e6c7;color:#14532d}.msg.err{background:#fdecec;border:1px solid #f5c2c2;color:#7a1d1d}`;

function shell({ title, desc, canonical, robots, body, siteUrl }) {
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${robots}">
<title>${escH(title)} — RetoPA</title>
<meta name="description" content="${escH(desc)}">
<link rel="canonical" href="${escH(siteUrl + canonical)}">
<meta property="og:title" content="${escH(title)} — RetoPA">
<meta property="og:description" content="${escH(desc)}">
<meta property="og:url" content="${escH(siteUrl + canonical)}">
<style>${CSS}</style>
</head>
<body>
<header><div class="bar">
  <a class="brand" href="/">Reto<span>PA</span></a>
  <a class="back" href="/">← Volver al inicio</a>
</div></header>
<main>
${body}
</main>
<footer>
  ${legalFooterHtml()}
</footer>
</body>
</html>`;
}

function renderLegal(d, siteUrl) {
    // El Markdown ya trae su "# Título": lo sacamos del cuerpo y usamos el título fijo.
    const html = String(d.html || '').replace(/^\s*<h1[^>]*>.*?<\/h1>\s*/i, '');
    const toc = (d.toc || []).length
        ? `<nav class="toc" aria-label="Índice"><b>Índice</b><ol>${d.toc.map(t => `<li><a href="#${escH(t.id)}">${t.text.replace(/^\d+\.\s*/, '')}</a></li>`).join('')}</ol></nav>` : '';
    const old = d.isCurrent ? '' :
        `<div class="old">Estás viendo la <b>versión ${escH(d.version)}</b>, que ya no está vigente. <a href="${escH(d.url)}">Ver la versión vigente (${escH(d.currentVersion)})</a>.</div>`;
    const nota = d.notaRevision
        ? '<div class="note"><strong>Nota:</strong> este texto está en revisión por nuestra asesoría jurídica. La versión vigente es la publicada en esta página.</div>' : '';
    const banner = d.banner && d.isCurrent
        ? `<div class="note">Actualizamos este documento el ${escH(d.fecha)}. Los cambios importantes rigen desde el ${escH(fechaCorta(d.banner))}.</div>` : '';
    const others = (d.versions || []).filter(v => v.version !== d.version);
    const vers = others.length
        ? `<hr><p class="vers"><b>Versiones anteriores:</b> ${others.map(v => `<a href="${escH(d.url)}?v=${encodeURIComponent(v.version)}" rel="nofollow">${escH(v.version)} (${escH(v.fecha)})</a>`).join(' · ')}</p>` : '';
    return shell({
        title: d.title, desc: d.description, canonical: d.url, siteUrl,
        // Las versiones viejas no compiten con la vigente en buscadores.
        robots: d.isCurrent ? 'index, follow' : 'noindex, follow',
        body: `<h1>${escH(d.title)}</h1>
  <p class="updated">Versión ${escH(d.version)} · ${escH(d.fecha)}</p>
  ${old}${nota}${banner}${toc}
  ${html}
  ${vers}`,
    });
}
const fechaCorta = ymd => { const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd; };

// ── Formularios /legal/baja y /legal/denuncia ───────────────────────────────
function formPage(kind, siteUrl, prefill) {
    const isBaja = kind === 'baja';
    const title = isBaja ? 'Pedir baja o corrección de una ficha' : 'Denunciar un contenido';
    const desc = isBaja
        ? 'Pedí que corrijamos, actualicemos o demos de baja la ficha de tu negocio en RetoPA, sin necesidad de tener cuenta.'
        : 'Denunciá un contenido de RetoPA que sea ilícito o que lesione tus derechos (Ley N.º 4868/2013).';
    const intro = isBaja
        ? `<p>Si tu negocio aparece en RetoPA y querés que corrijamos un dato o que lo demos de baja, completá este formulario. <b>No necesitás tener cuenta.</b> Respondemos dentro de los <b>10 días hábiles</b>.</p>
           <p class="hint">Para confirmar que el pedido viene del negocio, podemos escribirte por WhatsApp al número que figura en la ficha.</p>`
        : `<p>Usá este formulario si un contenido publicado en RetoPA (datos de una ficha, fotos, una reseña) es ilícito o lesiona tus derechos. Lo evaluamos dentro de los <b>5 días hábiles</b> y, si corresponde, lo retiramos y avisamos a quien lo publicó, que puede contestar. Más detalles en los <a href="/terminos.html#denuncia">Términos, sección 8</a>.</p>`;
    const tipo = isBaja ? `
  <div class="f"><label for="tipo">¿Qué querés que hagamos?</label>
    <select id="tipo" name="tipo" required>
      <option value="rectificacion">Corregir un dato que está mal</option>
      <option value="actualizacion">Actualizar datos (cambió el teléfono, la dirección…)</option>
      <option value="baja">Dar de baja la ficha</option>
    </select></div>` : '';
    const urlVal = escH(prefill || '');
    const body = `<h1>${escH(title)}</h1>
  ${intro}
  <div id="msg" class="msg" role="status"></div>
  <form id="lf" novalidate>
  ${tipo}
  <div class="f"><label for="url">Enlace de la ficha</label>
    <input id="url" type="text" name="business_url" required maxlength="300" value="${urlVal}" placeholder="${escH(siteUrl)}/negocio/nombre-del-negocio">
    <p class="hint">Copialo de la barra del navegador. Si no lo tenés, escribí el nombre del negocio y la ciudad.</p></div>
  <div class="f"><label for="nombre">Tu nombre</label><input id="nombre" type="text" name="nombre" required maxlength="120" autocomplete="name"></div>
  <div class="f"><label for="contacto">Tu correo o WhatsApp</label><input id="contacto" type="text" name="contacto" required maxlength="160" autocomplete="email" placeholder="tucorreo@ejemplo.com o 0981 123 456">
    <p class="hint">Solo para responderte sobre este pedido.</p></div>
  ${isBaja ? `<div class="f"><label for="vinculo">Tu vínculo con el negocio</label><input id="vinculo" type="text" name="vinculo" required maxlength="200" placeholder="Ej.: soy el dueño, soy empleado, ya cerró y era mío"></div>` : ''}
  <div class="f"><label for="detalle">${isBaja ? 'Contanos qué hay que cambiar o por qué pedís la baja' : 'Contenido que denunciás (qué parte exactamente)'}</label><textarea id="detalle" name="detalle" required maxlength="4000"></textarea></div>
  ${isBaja ? '' : `<div class="f"><label for="derecho">Derecho afectado y por qué</label><textarea id="derecho" name="derecho" required maxlength="1000" placeholder="Ej.: la foto es mía y no autoricé su uso; la reseña publica mi número personal"></textarea></div>
  <div class="f"><label class="chk"><input id="buena_fe" type="checkbox" required> <span>Declaro que la información que doy es correcta y que actúo de buena fe.</span></label></div>`}
  <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button id="btn" type="submit">Enviar pedido</button>
  </form>
  <p class="hint" style="margin-top:18px">También podés escribirnos por correo; los datos de contacto están en la <a href="/privacidad.html#responsable">Política de Privacidad</a>. Usamos estos datos solo para gestionar tu pedido.</p>
  <script>
  (function(){
    var f=document.getElementById('lf'),btn=document.getElementById('btn'),msg=document.getElementById('msg');
    function show(t,ok){msg.textContent=t;msg.className='msg '+(ok?'ok':'err');msg.style.display='block';msg.scrollIntoView({behavior:'smooth',block:'center'});}
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var v=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
      var body={business_url:v('url'),nombre:v('nombre'),contacto:v('contacto'),detalle:v('detalle'),website:f.website.value};
      ${isBaja ? "body.tipo=v('tipo');body.vinculo=v('vinculo');" : "body.derecho=v('derecho');body.buena_fe=document.getElementById('buena_fe').checked;"}
      if(!body.business_url||!body.nombre||!body.contacto||!body.detalle${isBaja ? '||!body.vinculo' : "||!body.derecho||!body.buena_fe"}){show('Completá todos los campos${isBaja ? '' : ' y marcá la declaración'}.',false);return;}
      btn.disabled=true;btn.textContent='Enviando…';
      fetch('/api/v2/legal/${kind}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json();}).then(function(d){
          if(d&&d.success){f.style.display='none';show('¡Listo! Recibimos tu pedido'+(d.id?' (n.º '+d.id+')':'')+'. Te vamos a responder al contacto que dejaste.',true);}
          else{show((d&&d.error)||'No pudimos enviar el pedido. Probá de nuevo.',false);btn.disabled=false;btn.textContent='Enviar pedido';}
        }).catch(function(){show('No pudimos enviar el pedido. Revisá tu conexión y probá de nuevo.',false);btn.disabled=false;btn.textContent='Enviar pedido';});
    });
  })();
  </script>`;
    return shell({ title, desc, canonical: `/legal/${kind}`, robots: 'noindex, follow', body, siteUrl });
}

function register(app, { fetchBackend, siteUrl, staticDir }) {
    refreshOperator(fetchBackend);
    setInterval(() => refreshOperator(fetchBackend), 5 * 60 * 1000).unref();

    for (const page of ['terminos', 'privacidad']) {
        app.get([`/${page}.html`, `/${page}`], async (req, res) => {
            const v = typeof req.query.v === 'string' ? req.query.v.slice(0, 10) : '';
            try {
                const r = await fetchBackend(`/legal/page/${page}${v ? '?v=' + encodeURIComponent(v) : ''}`);
                if (!r || !r.success || !r.data) {
                    if (v) return res.redirect(302, `/${page}.html`);
                    throw new Error((r && r.error) || 'sin datos');
                }
                res.set('Cache-Control', 'public, max-age=300');
                res.type('html').send(renderLegal(r.data, siteUrl));
            } catch (e) {
                console.error('[legal] página', page, e.message);
                res.set('Cache-Control', 'no-cache');
                res.sendFile(path.join(staticDir, `${page}.html`));
            }
        });
    }
    for (const kind of ['baja', 'denuncia']) {
        app.get(`/legal/${kind}`, (req, res) => {
            const prefill = typeof req.query.ficha === 'string' ? req.query.ficha.slice(0, 300) : '';
            res.set('Cache-Control', 'no-cache');
            res.set('X-Robots-Tag', 'noindex, follow');
            res.type('html').send(formPage(kind, siteUrl, prefill));
        });
    }
}

module.exports = { register, legalFooterHtml, renderLegal, formPage };
