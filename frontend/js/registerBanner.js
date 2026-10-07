/**
 * RetoPA — Banner de captación "Registrá tu negocio" (público)
 * ---------------------------------------------------------------
 * Aparece unos segundos después de abrir una ficha (la mayoría llega desde
 * Google). Mobile-first, persuasión full, un solo CTA claro al registro.
 *
 * Robusto y respetuoso:
 *   · No se muestra a usuarios logueados (ya tienen cuenta/negocio).
 *   · Una sola vez por sesión; si lo descartan, cooldown configurable.
 *   · Si tocan el CTA o "no mostrar más", no vuelve a aparecer.
 *   · Todo editable desde site_config (reg_banner_*), con defaults PRO.
 * Sin dependencias externas. Se auto-inicializa; expone window.RegisterBanner.
 */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true,
    delay_s: 6,
    cooldown_days: 7,
    title: '¿Tenés un negocio o emprendimiento?',
    subtitle: 'Registralo GRATIS en RetoPA y aparecé cuando te busquen en Google.',
    cta: 'Registrar mi negocio gratis',
    note: 'Sin tarjeta · Lo hacés en 2 minutos',
  };
  var LS_OFF = 'retopa_regbanner_off';     // '1' = no volver a mostrar nunca
  var LS_UNTIL = 'retopa_regbanner_until'; // timestamp (ms) hasta el que no mostrar
  var SS_SEEN = 'retopa_regbanner_seen';   // '1' = ya se mostró en esta sesión

  var cfg = null, statsCount = null, timer = null, wasVisible = false, inited = false;

  // ── helpers ──────────────────────────────────────────────────────────────
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function truthy(v, d) { if (v == null || v === '') return d; return !(v === '0' || v === 'false' || v === false); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function loggedIn() { return !!(lsGet('token') && lsGet('user')); }
  function fmt(n) { try { return Number(n).toLocaleString('es-PY'); } catch (e) { return String(n); } }

  // Id anónimo del visitante (para contar sesiones únicas en la medición).
  function sessionId() {
    var s = lsGet('retopa_sid');
    if (!s) {
      s = 'sid_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      lsSet('retopa_sid', s);
    }
    return s;
  }
  // Slug de la ficha donde apareció el banner (mejor esfuerzo).
  function currentSlug() {
    try {
      if (window._currentProfileSlug) return window._currentProfileSlug;
      if (window.__RETOPA_PRELOAD__ && window.__RETOPA_PRELOAD__.slug) return window.__RETOPA_PRELOAD__.slug;
    } catch (e) {}
    return null;
  }
  // Telemetría del embudo: impression | cta | dismiss | never | login. Fire & forget.
  function track(event) {
    try {
      var payload = JSON.stringify({ event: event, sid: sessionId(), slug: currentSlug() });
      var url = '/api/v2/track/reg-banner';
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  function suppressed() {
    if (lsGet(LS_OFF) === '1') return true;
    var until = parseInt(lsGet(LS_UNTIL) || '0', 10);
    if (until && Date.now() < until) return true;
    return false;
  }
  function shouldShow() {
    return cfg && cfg.enabled && !loggedIn() && !suppressed()
      && ssGet(SS_SEEN) !== '1' && !document.getElementById('rpRegBanner');
  }

  // ── config ───────────────────────────────────────────────────────────────
  function loadConfig() {
    var get = (typeof apiGet === 'function') ? apiGet : function () { return Promise.resolve(null); };
    return Promise.all([get('/site-config'), get('/stats')]).then(function (r) {
      var sc = (r[0] && r[0].success && r[0].data) || {};
      cfg = {
        enabled: truthy(sc.reg_banner_enabled, DEFAULTS.enabled),
        delay_s: num(sc.reg_banner_delay_s, DEFAULTS.delay_s),
        cooldown_days: num(sc.reg_banner_cooldown_days, DEFAULTS.cooldown_days),
        title: sc.reg_banner_title || DEFAULTS.title,
        subtitle: sc.reg_banner_subtitle || DEFAULTS.subtitle,
        cta: sc.reg_banner_cta || DEFAULTS.cta,
        note: sc.reg_banner_note || DEFAULTS.note,
      };
      var st = (r[1] && r[1].success && r[1].data) || {};
      statsCount = (st.businesses != null && isFinite(parseInt(st.businesses, 10))) ? parseInt(st.businesses, 10) : null;
    }).catch(function () { cfg = Object.assign({}, DEFAULTS); });
  }

  // ── estilos (una vez) ────────────────────────────────────────────────────
  function ensureStyle() {
    if (document.getElementById('rpRegBannerStyle')) return;
    var s = document.createElement('style');
    s.id = 'rpRegBannerStyle';
    s.textContent = [
      '@keyframes rpRBup{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '@keyframes rpRBfade{from{opacity:0}to{opacity:1}}',
      '#rpRegScrim{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.5);animation:rpRBfade .25s ease}',
      '#rpRegBanner{position:fixed;z-index:9999;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:460px;',
      '  background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(2,6,23,.28);',
      '  padding:10px 20px 22px;animation:rpRBup .34s cubic-bezier(.22,1,.36,1);box-sizing:border-box}',
      '@media(min-width:640px){#rpRegBanner{bottom:20px;border-radius:22px;animation:rpRBup .34s cubic-bezier(.22,1,.36,1)}}',
      '#rpRegBanner *{box-sizing:border-box}',
      '.rpRB-grab{width:40px;height:4px;border-radius:99px;background:#e2e8f0;margin:0 auto 12px}',
      '.rpRB-x{position:absolute;top:12px;right:14px;width:30px;height:30px;border:none;background:#f1f5f9;color:#64748b;border-radius:50%;font-size:15px;cursor:pointer;line-height:1}',
      '.rpRB-chip{display:inline-flex;align-items:center;gap:5px;background:#f0f9ff;color:#0369a1;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px}',
      '.rpRB-cta{display:block;width:100%;border:none;cursor:pointer;color:#fff;font-weight:800;font-size:16px;padding:15px;border-radius:14px;',
      '  background:linear-gradient(135deg,#0ea5e9,#1B3A6B);box-shadow:0 8px 20px rgba(14,165,233,.35);transition:transform .12s}',
      '.rpRB-cta:active{transform:scale(.98)}',
      '.rpRB-link{background:none;border:none;color:#64748b;font-size:13px;cursor:pointer;padding:6px}',
      '.rpRB-link.b{font-weight:700;color:#0369a1}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── mostrar / ocultar ────────────────────────────────────────────────────
  function show() {
    if (!shouldShow()) return;
    ensureStyle();
    ssSet(SS_SEEN, '1');

    var scrim = document.createElement('div');
    scrim.id = 'rpRegScrim';
    scrim.addEventListener('click', function () { dismiss('soft'); });

    var social = (statsCount && statsCount > 0)
      ? '<p style="text-align:center;font-size:12.5px;color:#0369a1;font-weight:700;margin:0 0 14px">'
        + '<i class="fas fa-store" style="margin-right:5px;opacity:.8"></i>Sumate a las ' + esc(fmt(statsCount)) + ' empresas que ya están en RetoPA</p>'
      : '';

    var el = document.createElement('div');
    el.id = 'rpRegBanner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Registrá tu negocio gratis');
    el.innerHTML =
      '<div class="rpRB-grab"></div>' +
      '<button class="rpRB-x" aria-label="Cerrar" id="rpRBClose">&times;</button>' +
      '<div style="text-align:center">' +
        '<div style="width:56px;height:56px;border-radius:16px;margin:2px auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;background:linear-gradient(135deg,#e0f2fe,#dbeafe)">🚀</div>' +
        '<h3 style="font-size:20px;font-weight:900;color:#0f172a;margin:0 0 6px;line-height:1.25">' + esc(cfg.title) + '</h3>' +
        '<p style="font-size:14px;color:#475569;line-height:1.5;margin:0 0 14px">' + esc(cfg.subtitle) + '</p>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 14px">' +
        '<span class="rpRB-chip"><i class="fas fa-gift"></i> 100% gratis</span>' +
        '<span class="rpRB-chip"><i class="fab fa-google"></i> Aparecés en Google</span>' +
        '<span class="rpRB-chip"><i class="fas fa-location-dot"></i> Te encuentran</span>' +
      '</div>' +
      social +
      '<button class="rpRB-cta" id="rpRBCta">' + esc(cfg.cta) + ' <i class="fas fa-arrow-right" style="margin-left:6px;font-size:14px"></i></button>' +
      '<p style="text-align:center;font-size:12px;color:#94a3b8;margin:10px 0 12px"><i class="fas fa-shield-halved" style="margin-right:4px"></i>' + esc(cfg.note) + '</p>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:6px">' +
        '<button class="rpRB-link b" id="rpRBLogin">Ya tengo cuenta</button>' +
        '<span style="color:#cbd5e1">·</span>' +
        '<button class="rpRB-link" id="rpRBLater">Ahora no</button>' +
      '</div>' +
      '<div style="text-align:center;margin-top:2px"><button class="rpRB-link" id="rpRBNever" style="font-size:11px;color:#cbd5e1">No volver a mostrar</button></div>';

    document.body.appendChild(scrim);
    document.body.appendChild(el);
    track('impression');

    el.querySelector('#rpRBCta').addEventListener('click', onCta);
    el.querySelector('#rpRBClose').addEventListener('click', function () { dismiss('soft'); });
    el.querySelector('#rpRBLater').addEventListener('click', function () { dismiss('soft'); });
    el.querySelector('#rpRBNever').addEventListener('click', function () { dismiss('never'); });
    el.querySelector('#rpRBLogin').addEventListener('click', function () {
      remove();
      track('login');
      lsSet(LS_UNTIL, String(Date.now() + cfg.cooldown_days * 86400000));
      if (typeof openLoginModal === 'function') openLoginModal();
    });
  }

  function remove() {
    var b = document.getElementById('rpRegBanner'); if (b) b.remove();
    var s = document.getElementById('rpRegScrim'); if (s) s.remove();
  }
  // Descartes: 'soft' = cooldown; 'never' = permanente.
  function dismiss(kind) {
    remove();
    track(kind === 'never' ? 'never' : 'dismiss');
    if (kind === 'never') lsSet(LS_OFF, '1');
    else lsSet(LS_UNTIL, String(Date.now() + (cfg ? cfg.cooldown_days : 7) * 86400000));
  }
  function onCta() {
    remove();
    track('cta');
    lsSet(LS_OFF, '1'); // van a registrarse → no volver a molestar
    if (typeof openRegistroEmpresaCheck === 'function') openRegistroEmpresaCheck();
    else if (typeof openRegistroModal === 'function') openRegistroModal();
  }

  // ── ciclo: agendar al abrir ficha, cancelar al cerrar ────────────────────
  function onFichaOpen() {
    if (!shouldShow()) return;
    clearTimeout(timer);
    timer = setTimeout(show, Math.max(0, cfg.delay_s) * 1000);
  }
  function onFichaClose() {
    clearTimeout(timer);
    remove(); // si estaba abierto el banner y cierran la ficha, lo sacamos (sin penalizar)
  }

  function watch() {
    var modal = document.getElementById('profileModal');
    if (!modal) return;
    wasVisible = !modal.classList.contains('hidden');
    var obs = new MutationObserver(function () {
      var vis = !modal.classList.contains('hidden');
      if (vis && !wasVisible) onFichaOpen();
      else if (!vis && wasVisible) onFichaClose();
      wasVisible = vis;
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
    if (wasVisible) onFichaOpen(); // ficha ya abierta al cargar (página SSR del negocio)
  }

  function init() {
    if (inited) return; inited = true;
    loadConfig().then(watch);
  }

  // API pública (para pruebas / disparo manual)
  window.RegisterBanner = {
    init: init,
    showNow: function () { if (!cfg) { loadConfig().then(show); } else show(); },
    reset: function () { try { localStorage.removeItem(LS_OFF); localStorage.removeItem(LS_UNTIL); sessionStorage.removeItem(SS_SEEN); } catch (e) {} },
    _state: function () { return { cfg: cfg, statsCount: statsCount, hasTimer: !!timer }; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
