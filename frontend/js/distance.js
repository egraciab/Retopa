/**
 * RetoPA — js/distance.js
 * Sprint 2: Distancia desde ubicación del usuario
 * v2.6 S1.1: ubicación es opt-in explícito (no se pide en silencio al cargar)
 * Cargar ANTES de app.js en index.html
 */

const LOCATION_KEY = 'retopa_userLocation';
// Frescura: pasada esta antigüedad, la ubicación guardada se considera "vieja"
// y se refresca sola (al recargar o al hacer una nueva búsqueda). Editable.
const LOCATION_TTL_MS = 60000; // 60s

// Recarga lo que depende de la ubicación (resultados + "Abiertos ahora").
// Usa rpReloadLocationDependent (search.js) si está; si no, cae a los resultados.
function _reloadForLocation() {
    if (typeof rpReloadLocationDependent === 'function') return rpReloadLocationDependent();
    if (typeof loadBusinesses === 'function') loadBusinesses(true, 'resultsList');
}

function getUserLocation() {
    try {
        const raw = sessionStorage.getItem(LOCATION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

// ¿La ubicación guardada es reciente? (tiene ts y no superó el TTL)
function isLocationFresh(loc) {
    loc = loc || getUserLocation();
    return !!(loc && loc.ts && (Date.now() - loc.ts) < LOCATION_TTL_MS);
}

function saveUserLocation(lat, lng) {
    try { sessionStorage.setItem(LOCATION_KEY, JSON.stringify({ lat, lng, ts: Date.now() })); } catch (e) {}
}

function clearUserLocation() {
    try { sessionStorage.removeItem(LOCATION_KEY); } catch (e) {}
}

// Opciones de geolocalización: SIEMPRE lectura fresca y de alta precisión.
// maximumAge:0 obliga al navegador a NO devolver una posición cacheada.
const GEO_OPTS = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };

// Refresca la ubicación en segundo plano si está vieja, y recarga resultados
// con las coords nuevas. Evita llamadas duplicadas con un flag en vuelo.
let _locRefreshing = false;
function refreshLocationIfStale() {
    if (_locRefreshing) return;
    if (isLocationFresh()) return;            // ya está fresca → nada que hacer
    if (!getUserLocation()) return;           // no hay ubicación activa
    if (!navigator.geolocation) return;
    _locRefreshing = true;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            _locRefreshing = false;
            saveUserLocation(pos.coords.latitude, pos.coords.longitude);
            _reloadForLocation();
        },
        () => { _locRefreshing = false; },    // si falla, seguimos con las coords que había
        GEO_OPTS
    );
}

// Forzar actualización manual ("Actualizar" en el pill de ubicación activa).
function refreshLocationNow(e) {
    if (e) { e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault(); }
    if (!navigator.geolocation) return;
    updateLocationPill('loading');
    updateNearMeButton('loading');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            saveUserLocation(pos.coords.latitude, pos.coords.longitude);
            updateLocationPill('active');
            updateNearMeButton('active');
            showLocationToast('Ubicación actualizada 📍');
            _reloadForLocation();
        },
        () => {
            updateLocationPill('active');
            updateNearMeButton('active');
            showLocationToast('No se pudo actualizar la ubicación', 'warn');
        },
        GEO_OPTS
    );
}

/**
 * Renderiza el badge de distancia para una card.
 * - Coord real  → "2.7 km"   en Azul Profundo
 * - Coord ciudad → "~5 km"   en gris (aproximado)
 */
function renderDistanceBadge(biz) {
    if (biz.distance_m == null) return '';
    const km = biz.distance_m / 1000;
    const isReal = biz.coordIsReal === true;
    const label = km < 1
        ? (isReal ? `${Math.round(biz.distance_m)} m` : `~${Math.round(biz.distance_m)} m`)
        : (isReal ? `${km.toFixed(1)} km`              : `~${km.toFixed(1)} km`);
    const color = isReal ? '#1B3A6B' : '#999';
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:${color};background:rgba(126,200,227,0.12);border-radius:20px;padding:2px 8px;margin-left:4px;white-space:nowrap;vertical-align:middle;"><svg width="9" height="12" viewBox="0 0 10 14" fill="currentColor"><path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5C4.17 6.5 3.5 5.83 3.5 5S4.17 3.5 5 3.5 6.5 4.17 6.5 5 5.83 6.5 5 6.5z"/></svg>${label}</span>`;
}

function updateNearMeButton(state) {
    const btn = document.getElementById('nearMeBtn');
    const clearBtn = document.getElementById('nearMeClear');
    if (!btn) return;
    const pinIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
    const crosshairIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
    if (state === 'idle') {
        btn.innerHTML = `${crosshairIcon} Cerca de mí`;
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;border:2px solid #1B3A6B;color:#1B3A6B;background:white;white-space:nowrap;';
    } else if (state === 'loading') {
        btn.innerHTML = `<span style="display:inline-block;animation:retopaSpin 0.8s linear infinite">⟳</span> Buscando...`;
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:default;border:2px solid #7EC8E3;color:#7EC8E3;background:white;white-space:nowrap;';
    } else if (state === 'active') {
        btn.innerHTML = `${pinIcon} Cerca de mí`;
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;border:2px solid #1B3A6B;color:white;background:#1B3A6B;white-space:nowrap;';
    }
    if (clearBtn) clearBtn.style.display = state === 'active' ? 'inline-flex' : 'none';
}

/**
 * updateLocationPill(state)
 * Actualiza el pill de ubicación del buscador.
 * IMPORTANTE: el span "Quitar" usa onclick con stopPropagation — no agregar
 * listeners al pill padre que re-disparen requestLocation sin chequear estado.
 */
function updateLocationPill(state) {
    const pill = document.getElementById('locationPill');
    if (!pill) return;
    if (state === 'idle') {
        pill.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> <span>Activar ubicación para ver distancias</span>`;
        pill.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:9px 14px;border-radius:12px;font-size:13px;font-weight:500;cursor:pointer;border:1.5px dashed #cbd5e1;color:#64748b;background:#f8fafc;text-align:left;transition:all 0.2s;';
        pill.dataset.locState = 'idle';
    } else if (state === 'loading') {
        pill.innerHTML = `<span style="display:inline-block;animation:retopaSpin 0.8s linear infinite;font-size:15px;">⟳</span> <span>Obteniendo ubicación...</span>`;
        pill.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:9px 14px;border-radius:12px;font-size:13px;font-weight:500;cursor:default;border:1.5px solid #7EC8E3;color:#0369a1;background:#f0f9ff;text-align:left;transition:all 0.2s;';
        pill.dataset.locState = 'loading';
    } else if (state === 'active') {
        pill.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;color:#1B3A6B"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg> <span style="flex:1">Ubicación activa — resultados ordenados por distancia</span> <span id="locationPillRefresh" title="Actualizar mi ubicación" style="font-size:11px;background:rgba(27,58,107,0.12);padding:2px 8px;border-radius:20px;color:#1B3A6B;font-weight:600;cursor:pointer;flex-shrink:0;" onclick="refreshLocationNow(event)">↻ Actualizar</span> <span id="locationPillClear" style="font-size:11px;background:rgba(27,58,107,0.12);padding:2px 8px;border-radius:20px;color:#1B3A6B;font-weight:600;cursor:pointer;flex-shrink:0;" onclick="clearLocationAndReload(event)">Quitar</span>`;
        pill.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;border-radius:12px;font-size:13px;font-weight:500;cursor:default;border:1.5px solid #1B3A6B;color:#1B3A6B;background:#eff6ff;text-align:left;transition:all 0.2s;';
        pill.dataset.locState = 'active';
    }
}

/**
 * clearLocationAndReload — función global llamada desde el onclick del span "Quitar".
 * Usa stopPropagation + stopImmediatePropagation para evitar que el listener del pill
 * padre capture el evento y vuelva a pedir la ubicación.
 */
function clearLocationAndReload(e) {
    if (e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
    }
    clearUserLocation();
    updateLocationPill('idle');
    updateNearMeButton('idle');
    _reloadForLocation();
}

function showLocationToast(msg, type = 'info') {
    let toast = document.getElementById('_retopaLocToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = '_retopaLocToast';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:24px;font-size:13px;font-weight:500;z-index:9999;transition:opacity 0.4s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.15);white-space:nowrap;';
        document.body.appendChild(toast);
    }
    toast.style.background = type === 'warn' ? '#E8B84B' : '#1B3A6B';
    toast.style.color = type === 'warn' ? '#2C2C2A' : 'white';
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

/**
 * requestLocation — pide la ubicación y actualiza pill + botón.
 */
function requestLocation(reloadFn, silentFail = false) {
    if (!navigator.geolocation) return;
    updateNearMeButton('loading');
    updateLocationPill('loading');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            saveUserLocation(pos.coords.latitude, pos.coords.longitude);
            updateNearMeButton('active');
            updateLocationPill('active');
            if (typeof reloadFn === 'function') reloadFn();
        },
        () => {
            updateNearMeButton('idle');
            updateLocationPill('idle');
            if (!silentFail) showLocationToast('Activá la ubicación para ver distancias', 'warn');
        },
        GEO_OPTS
    );
}

/**
 * initNearMeButton — v2.6 S1.1
 * Ubicación es OPT-IN: NO se pide automáticamente al cargar.
 * Si ya hay coords en sessionStorage se reactivan sin pedir permiso.
 */
function initNearMeButton(reloadFn) {
    // Inyectar keyframe de spin
    if (!document.getElementById('_retopaSpinStyle')) {
        const s = document.createElement('style');
        s.id = '_retopaSpinStyle';
        s.textContent = '@keyframes retopaSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }

    const existing = getUserLocation();
    if (existing) {
        updateNearMeButton('active');
        updateLocationPill('active');
        // Si las coords guardadas están viejas (p.ej. al recargar la página o
        // volver más tarde), refrescarlas en segundo plano → resultados al día.
        refreshLocationIfStale();
    } else {
        updateNearMeButton('idle');
        updateLocationPill('idle');
        // NO llamar requestLocation en silencio — el usuario decide
    }

    // Pill del buscador: solo actuar si el estado actual es 'idle'
    const pill = document.getElementById('locationPill');
    if (pill) {
        pill.addEventListener('click', (e) => {
            // Si el clic vino de "Quitar"/"Actualizar", ya lo manejan sus onclick
            if (e.target.id === 'locationPillClear' || e.target.id === 'locationPillRefresh') return;
            // Solo actuar en estado idle (no en active ni loading)
            if (pill.dataset.locState !== 'idle') return;
            requestLocation(() => {
                _reloadForLocation();
            }, false);
        });
    }

    // Botón nearMeBtn (compacto, fila de búsqueda)
    const btn = document.getElementById('nearMeBtn');
    const clearBtn = document.getElementById('nearMeClear');

    if (btn) {
        btn.addEventListener('click', () => {
            if (getUserLocation()) {
                clearLocationAndReload(null);
            } else {
                requestLocation(reloadFn, false);
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearLocationAndReload(e);
        });
    }
}

/**
 * buildHowToGetUrl — Google Maps navegación desde ubicación del usuario.
 * En mobile abre el selector de apps (Maps, Waze, Apple Maps, etc.)
 */
function buildHowToGetUrl(lat, lng, name) {
    return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * renderHowToGetLink — link "Cómo llegar" en cards y ficha.
 * Solo aparece si hay ubicación activa y la empresa tiene coords.
 */
function renderHowToGetLink(biz, opts = {}) {
    const loc = getUserLocation();
    if (!loc) return '';
    if (!biz.lat && !biz.lng) return '';

    const url = buildHowToGetUrl(biz.lat, biz.lng, biz.name || biz.tradeName);
    const { style = 'badge' } = opts;

    if (style === 'button') {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer"
            class="w-full bg-white border-2 border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition flex items-center justify-center gap-2 block text-center"
            onclick="trackClick && trackClick('${biz.slug || ''}','maps')">
            <i class="fas fa-directions" style="color:#1B3A6B"></i> Cómo llegar
        </a>`;
    }

    return `<a href="${url}" target="_blank" rel="noopener noreferrer"
        title="Cómo llegar"
        style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:#1B3A6B;background:rgba(27,58,107,.08);border-radius:20px;padding:2px 8px;margin-left:4px;white-space:nowrap;text-decoration:none;vertical-align:middle;"
        onmouseover="this.style.background='rgba(27,58,107,.15)'"
        onmouseout="this.style.background='rgba(27,58,107,.08)'">
        <i class="fas fa-directions" style="font-size:10px"></i> llegar
    </a>`;
}
