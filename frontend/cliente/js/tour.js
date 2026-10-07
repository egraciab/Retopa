/**
 * RetoPA — Tour guiado de "primeros pasos" (Onboarding 3/3)
 * ---------------------------------------------------------------
 * Spotlight + globito, SIN dependencias externas (no driver.js, no CDN).
 * Reproducible:
 *   · se muestra 1 sola vez automáticamente  → maybeAutoStartTour()
 *     (flag localStorage 'retopa_tour_seen')
 *   · se reactiva cuando el usuario quiera    → startPortalTour()
 *     (botón "Ver tour" en el Dashboard)
 *
 * Robusto: cada paso apunta a un selector (o lista de selectores; se usa el
 * primero VISIBLE). Si el ancla no está visible (p.ej. sidebar en mobile vs
 * bottom-nav), el paso se saltea solo. Reposiciona en resize/scroll.
 */
(function () {
  'use strict';

  var PAD = 6;               // padding del spotlight alrededor del elemento
  var state = null;          // { tour, steps, i, el, section, onResize }

  // Clave localStorage de "ya visto" por tour (portal mantiene la clave vieja).
  var SEEN_KEYS = { portal: 'retopa_tour_seen' };
  function seenKey(name) { return SEEN_KEYS[name] || ('retopa_tour_' + name + '_seen'); }

  // ── Definición de pasos por TOUR ────────────────────────────────────────
  // target: string | [strings] | null (globito centrado, sin spotlight)
  // section: showSection() a ejecutar antes de mostrar el paso (opcional)
  var TOURS = {
    // Tour general del portal (onboarding 3/3)
    portal: function () {
      return [
        { target: null, section: 'dashboard',
          title: '¡Bienvenido a Mi Portal! 👋',
          body: 'En menos de un minuto te muestro cómo aparecer primero en RetoPA y sacarle el jugo a tu ficha.' },
        { target: '#navBizBtn',
          title: 'Tus empresas',
          body: 'Si administrás más de una, cambiás entre ellas desde acá arriba.' },
        { target: '#kpiGrid', section: 'dashboard',
          title: 'Tus números',
          body: 'Visitas, clics de WhatsApp, me gusta y tu rating — al día, todos los días.' },
        { target: '#dashBizCard', section: 'dashboard',
          title: 'Completá tu ficha',
          body: 'Acá ves cuánto te falta. Tocá cualquier paso pendiente y te llevo directo al dato que hay que cargar.' },
        { target: ['#nav-businesses', '#bnav-businesses'],
          title: 'Mis empresas',
          body: 'Editás los datos, el logo, los horarios y la ubicación de tu empresa. ¡Ahí adentro hay una guía propia!' },
        { target: ['#nav-promotions', '#bnav-promotions'],
          title: 'Promociones',
          body: 'Impulsá tu ficha para aparecer destacada y llegar a más clientes.' },
        { target: ['#nav-reviews', '#bnav-reviews'],
          title: 'Reseñas',
          body: 'Respondé lo que dicen tus clientes: responder mejora tu reputación y tu posición.' },
        { target: ['#tourReplayBtn', '#tourReplayBtnM'], section: 'dashboard',
          title: '¿Lo repetimos cuando quieras? 🔁',
          body: 'Podés volver a ver esta guía las veces que necesites tocando “Ver tour” acá. ¡Listo para empezar!' },
      ];
    },
    // Guía específica del submenú "Mis empresas"
    businesses: function () {
      return [
        { target: '#bizList', section: 'businesses',
          title: 'Tus empresas, una por una 🏢',
          body: 'Cada tarjeta muestra los números de una empresa. Te muestro qué podés hacer con cada una.' },
        { target: '[data-tour="edit"]', section: 'businesses',
          title: 'Editá tu información',
          body: 'Acá cargás y actualizás todo: datos de contacto, descripción, logo y portada, horarios, ubicación en el mapa y tus redes.' },
        { target: '[data-tour="products"]', section: 'businesses',
          title: 'Productos y servicios',
          body: 'Cargá tu catálogo con fotos y precios para que te encuentren por lo que ofrecés. (Disponible en planes Destacado y Pro.)' },
        { target: '[data-tour="viewpublic"]', section: 'businesses',
          title: 'Así te ven tus clientes',
          body: 'Abrí tu ficha pública tal cual la ve alguien que te busca en RetoPA o llega desde Google.' },
        { target: '[data-tour="kit"]', section: 'businesses',
          title: 'Tu kit QR',
          body: 'Descargá tu código QR listo para imprimir y pegar en tu local: la gente lo escanea y cae en tu ficha.' },
        { target: '[data-tour="upgrade"]', section: 'businesses',
          title: 'Mejorá tu plan',
          body: 'Más fotos, más redes, catálogo y mejor posición en las búsquedas. Cuando quieras dar el salto, es por acá.' },
        { target: ['#bizGuideBtn', '#bizGuideBtnM'], section: 'businesses',
          title: '¿La repetimos? 🔁',
          body: 'Volvé a ver esta guía cuando quieras tocando “Ver guía” acá arriba. ¡A cargar tu ficha!' },
      ];
    },
    // Guía del submenú "Promociones" (enfocada en conversión: impulsos)
    promotions: function () {
      return [
        { target: '#promosList', section: 'promotions',
          title: 'Promociones = más clientes 🔥',
          body: 'Un impulso pone tu ficha ARRIBA de las demás por unos días: más visitas y más contactos. Te muestro cómo en 20 segundos.' },
        { target: '[data-tour="boosts"]',
          title: 'Elegí tu impulso',
          body: 'Definí por cuántos días querés aparecer destacada. Cuantos más días, más gente te ve.' },
        { target: '[data-tour="boost-home"]',
          title: 'El más elegido ⭐',
          body: 'Además de destacarte en las búsquedas, te muestra en la PORTADA de RetoPA. Es la opción de mayor visibilidad.' },
        { target: '[data-tour="boost-cta"]',
          title: 'Activalo en 1 toque',
          body: 'Tocá “Solicitar”, hacés el pago y en minutos lo confirmamos. Tu ficha empieza a destacarse enseguida.' },
        { target: '#newPromoBtn',
          title: 'Creá tu promo',
          body: 'Con un impulso activo (o Plan Pro) publicás tu oferta con foto, texto y fecha de vencimiento. ¡Así engancha!' },
        { target: ['#promoGuideBtn'],
          title: '¿La repetimos? 🔁',
          body: 'Volvé a ver esta guía cuando quieras tocando “Ver guía” acá arriba. ¡A vender!' },
      ];
    },
  };

  // ── Helpers de visibilidad / resolución de ancla ────────────────────────
  function isVisible(el) {
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return (r.width > 0 || r.height > 0);
  }
  function resolveTarget(target) {
    if (!target) return null;
    var sels = Array.isArray(target) ? target : [target];
    for (var k = 0; k < sels.length; k++) {
      var el = document.querySelector(sels[k]);
      if (el && isVisible(el)) return el;
    }
    return null; // ninguno visible → el paso se saltea
  }

  // ── DOM del tour (se crea una sola vez) ─────────────────────────────────
  function ensureDom() {
    if (document.getElementById('rpTourOverlay')) return;

    var style = document.createElement('style');
    style.id = 'rpTourStyle';
    style.textContent = [
      '#rpTourOverlay{position:fixed;inset:0;z-index:9998;pointer-events:auto;opacity:0;transition:opacity .2s}',
      '#rpTourOverlay.rp-on{opacity:1}',
      '#rpTourHole{position:absolute;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,23,42,.66);',
      '  transition:top .3s cubic-bezier(.4,0,.2,1),left .3s cubic-bezier(.4,0,.2,1),width .3s,height .3s;pointer-events:none}',
      '#rpTourHole.rp-center{box-shadow:0 0 0 9999px rgba(15,23,42,.66);top:50%;left:50%;width:0;height:0}',
      '#rpTourTip{position:fixed;z-index:10000;max-width:320px;width:calc(100vw - 32px);background:#fff;border-radius:16px;',
      '  box-shadow:0 20px 50px rgba(0,0,0,.35);padding:18px 18px 14px;opacity:0;transform:translateY(6px);',
      '  transition:opacity .25s,transform .25s,top .3s,left .3s}',
      '#rpTourTip.rp-on{opacity:1;transform:translateY(0)}',
      '#rpTourTip .rp-t{font-size:16px;font-weight:900;color:#0f172a;margin:0 0 6px;line-height:1.25}',
      '#rpTourTip .rp-b{font-size:13px;color:#475569;line-height:1.5;margin:0 0 14px}',
      '#rpTourTip .rp-row{display:flex;align-items:center;gap:8px}',
      '#rpTourTip .rp-dots{display:flex;gap:5px;flex:1}',
      '#rpTourTip .rp-dot{width:6px;height:6px;border-radius:50%;background:#e2e8f0;transition:background .2s,width .2s}',
      '#rpTourTip .rp-dot.on{background:#4F46E5;width:16px;border-radius:3px}',
      '#rpTourTip button{border:none;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;padding:9px 14px}',
      '#rpTourTip .rp-next{background:#4F46E5;color:#fff}',
      '#rpTourTip .rp-back{background:#f1f5f9;color:#475569}',
      '#rpTourTip .rp-skip{background:none;color:#94a3b8;font-size:12px;font-weight:600;padding:9px 6px}',
      '#rpTourArrow{position:fixed;z-index:10000;width:0;height:0;opacity:0;transition:opacity .2s}'
    ].join('\n');
    document.head.appendChild(style);

    var ov = document.createElement('div');
    ov.id = 'rpTourOverlay';
    ov.innerHTML = '<div id="rpTourHole"></div>';
    // clic en la zona oscura = no hace nada (evita cierres accidentales); Skip está en el globo
    ov.addEventListener('click', function (e) { if (e.target === ov) { /* no-op */ } });
    document.body.appendChild(ov);

    var tip = document.createElement('div');
    tip.id = 'rpTourTip';
    document.body.appendChild(tip);
  }

  // ── Posicionamiento ─────────────────────────────────────────────────────
  function place(step, el) {
    var hole = document.getElementById('rpTourHole');
    var tip = document.getElementById('rpTourTip');
    var vw = window.innerWidth, vh = window.innerHeight;

    if (!el) {
      // Paso centrado (sin spotlight)
      hole.classList.add('rp-center');
      var tr = tip.getBoundingClientRect();
      tip.style.top = Math.max(16, (vh - tr.height) / 2) + 'px';
      tip.style.left = Math.max(16, (vw - tr.width) / 2) + 'px';
      return;
    }
    hole.classList.remove('rp-center');
    var r = el.getBoundingClientRect();
    var top = r.top - PAD, left = r.left - PAD, w = r.width + PAD * 2, h = r.height + PAD * 2;
    hole.style.top = top + 'px';
    hole.style.left = left + 'px';
    hole.style.width = w + 'px';
    hole.style.height = h + 'px';

    // Colocar el globo: debajo si hay lugar, si no arriba, si no al costado
    var tr2 = tip.getBoundingClientRect();
    var tipW = tr2.width || 320, tipH = tr2.height || 160, gap = 14;
    var tTop, tLeft;
    if (r.bottom + gap + tipH <= vh) {            // debajo
      tTop = r.bottom + gap;
      tLeft = r.left + r.width / 2 - tipW / 2;
    } else if (r.top - gap - tipH >= 0) {          // arriba
      tTop = r.top - gap - tipH;
      tLeft = r.left + r.width / 2 - tipW / 2;
    } else if (r.right + gap + tipW <= vw) {       // derecha
      tLeft = r.right + gap;
      tTop = r.top + r.height / 2 - tipH / 2;
    } else {                                       // izquierda / fallback
      tLeft = Math.max(16, r.left - gap - tipW);
      tTop = r.top + r.height / 2 - tipH / 2;
    }
    // Clamp al viewport (deja margen para bottom-nav en mobile)
    tLeft = Math.min(Math.max(16, tLeft), vw - tipW - 16);
    tTop = Math.min(Math.max(16, tTop), vh - tipH - 16);
    tip.style.top = tTop + 'px';
    tip.style.left = tLeft + 'px';
  }

  // ── Render de un paso ───────────────────────────────────────────────────
  function showStep(i, dir) {
    if (!state) return;
    var steps = state.steps;
    if (i < 0) i = 0;
    if (i >= steps.length) { endTour(true); return; }

    var step = steps[i];
    // Cambiar de sección SOLO si difiere de la actual (evita re-cargar el
    // dashboard —y su fetch de stats— en cada paso o reposición).
    if (step.section && step.section !== state.section && typeof showSection === 'function') {
      try { showSection(step.section); state.section = step.section; } catch (e) {}
    }

    // Resolver ancla; si no hay ninguna visible (y el paso pedía una), saltear
    var el = resolveTarget(step.target);
    if (step.target && !el) {
      var nextI = i + (dir < 0 ? -1 : 1);
      if (nextI < 0 || nextI >= steps.length) { endTour(true); return; }
      return showStep(nextI, dir);
    }
    state.i = i;
    state.el = el;   // cacheado para reposicionar en scroll/resize sin re-ejecutar el paso

    var tip = document.getElementById('rpTourTip');
    var isLast = i === steps.length - 1;
    var isFirst = i === 0;
    var dots = steps.map(function (_, k) { return '<span class="rp-dot' + (k === i ? ' on' : '') + '"></span>'; }).join('');
    tip.innerHTML =
      '<p class="rp-t">' + step.title + '</p>' +
      '<p class="rp-b">' + step.body + '</p>' +
      '<div class="rp-row">' +
        '<div class="rp-dots">' + dots + '</div>' +
        (isFirst ? '' : '<button class="rp-back" id="rpTourBack">Atrás</button>') +
        '<button class="rp-next" id="rpTourNext">' + (isLast ? 'Listo 🎉' : (isFirst ? 'Empezar' : 'Siguiente')) + '</button>' +
      '</div>' +
      (isLast ? '' : '<div style="text-align:center;margin-top:8px"><button class="rp-skip" id="rpTourSkip">Saltar guía</button></div>');

    document.getElementById('rpTourNext').onclick = function () { showStep(state.i + 1, 1); };
    var back = document.getElementById('rpTourBack'); if (back) back.onclick = function () { showStep(state.i - 1, -1); };
    var skip = document.getElementById('rpTourSkip'); if (skip) skip.onclick = function () { endTour(true); };

    // Scroll al ancla y luego posicionar (2 pasadas: layout + medida real del globo)
    if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); } }
    requestAnimationFrame(function () {
      place(step, el);
      requestAnimationFrame(function () { place(step, el); });
    });
  }

  // Reposiciona el spotlight/globo del paso actual SIN re-ejecutar el paso
  // (sin cambiar sección, sin scrollIntoView, sin reconstruir el tip).
  // Es lo único que corre en scroll/resize → evita bucles de re-entrada.
  var _repoQueued = false;
  function reposition() {
    if (!state || _repoQueued) return;
    _repoQueued = true;
    requestAnimationFrame(function () {
      _repoQueued = false;
      if (!state) return;
      place(state.steps[state.i], state.el);
    });
  }

  // ── Ciclo de vida ───────────────────────────────────────────────────────
  function startPortalTour(name) {
    if (state) return;                 // ya está corriendo
    name = (typeof name === 'string' && TOURS[name]) ? name : 'portal';
    if (typeof closeWelcomeWizard === 'function') closeWelcomeWizard();
    if (typeof closeOnboardNudge === 'function') closeOnboardNudge();
    ensureDom();
    state = { tour: name, steps: TOURS[name](), i: 0, el: null, section: null };

    var ov = document.getElementById('rpTourOverlay');
    var tip = document.getElementById('rpTourTip');
    requestAnimationFrame(function () { ov.classList.add('rp-on'); tip.classList.add('rp-on'); });

    // En scroll/resize SOLO reposicionamos (nunca re-ejecutamos el paso).
    state.onResize = reposition;
    window.addEventListener('resize', state.onResize);
    window.addEventListener('scroll', state.onResize, true);
    document.addEventListener('keydown', onKey, true);

    showStep(0, 1);
  }

  function onKey(e) {
    if (!state) return;
    if (e.key === 'Escape') { e.preventDefault(); endTour(true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); showStep(state.i + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); showStep(state.i - 1, -1); }
  }

  function endTour(markSeen) {
    if (!state) return;
    if (markSeen) { try { localStorage.setItem(seenKey(state.tour), '1'); } catch (e) {} }
    window.removeEventListener('resize', state.onResize);
    window.removeEventListener('scroll', state.onResize, true);
    document.removeEventListener('keydown', onKey, true);
    state = null;
    var ov = document.getElementById('rpTourOverlay');
    var tip = document.getElementById('rpTourTip');
    if (ov) ov.classList.remove('rp-on');
    if (tip) tip.classList.remove('rp-on');
    setTimeout(function () { if (ov) ov.remove(); if (tip) tip.remove(); var s = document.getElementById('rpTourStyle'); if (s) s.remove(); }, 250);
  }

  // Primera vez (automático) para el tour indicado. 'portal' por defecto.
  // No arranca si el wizard de bienvenida está abierto ni si ya se vio.
  function maybeAutoStartTour(name) {
    name = (typeof name === 'string' && TOURS[name]) ? name : 'portal';
    if (state) return;                                       // no apilar sobre otro tour
    try { if (localStorage.getItem(seenKey(name)) === '1') return; } catch (e) {}
    if (document.getElementById('welcomeWizard')) return;    // no apilar con el wizard
    if (typeof myBusinesses !== 'undefined' && (!myBusinesses || !myBusinesses.length)) return; // sin fichas, sin anclas
    startPortalTour(name);
  }

  window.startPortalTour = startPortalTour;
  window.maybeAutoStartTour = maybeAutoStartTour;
})();
