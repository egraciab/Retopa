/**
 * RetoPA — js/search.js
 * loadBusinesses(), renderBusinessCard()
 */

/**
 * renderHoursCompact(biz) — v2.6
 * Horario resumido para cards del directorio.
 * Usa hours_json si está disponible, fallback a hours TEXT.
 */
function renderHoursCompact(biz) {
    const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const hj = biz.hoursJson || biz.hours_json;

    if (!hj) return biz.hours || '<span class="text-gray-400">Sin horario</span>';

    try {
        const parsed = typeof hj === 'string' ? JSON.parse(hj) : hj;
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Asuncion' }));
        const dayKey = DAYS[now.getDay()];
        const curMin = now.getHours() * 60 + now.getMinutes();
        const day = parsed[dayKey];

        if (!day || day.closed) {
            // Buscar próximo día abierto
            for (let i = 1; i <= 7; i++) {
                const nextKey = DAYS[(now.getDay() + i) % 7];
                const nd = parsed[nextKey];
                if (nd && !nd.closed) {
                    const label = i === 1 ? 'mañana' : nextKey;
                    return `<span style="color:#ef4444;font-weight:600">Cerrado</span> · abre ${label}`;
                }
            }
            return '<span style="color:#ef4444;font-weight:600">Cerrado</span>';
        }
        if (day.h24) return '<span style="color:#22c55e;font-weight:600">Abierto 24h</span>';

        const [oh, om] = day.open.split(':').map(Number);
        const [ch, cm] = day.close.split(':').map(Number);
        const openMin = oh * 60 + om;
        const closeMin = ch * 60 + cm;

        if (curMin >= openMin && curMin < closeMin) {
            const rem = closeMin - curMin;
            return rem <= 60
                ? `<span style="color:#E8B84B;font-weight:600">Cierra pronto</span> · ${day.close}`
                : `<span style="color:#22c55e;font-weight:600">Abierto</span> · cierra ${day.close}`;
        } else if (curMin < openMin) {
            return `<span style="color:#ef4444;font-weight:600">Cerrado</span> · abre ${day.open}`;
        } else {
            for (let i = 1; i <= 7; i++) {
                const nextKey = DAYS[(now.getDay() + i) % 7];
                const nd = parsed[nextKey];
                if (nd && !nd.closed) {
                    const label = i === 1 ? 'mañana' : nextKey;
                    return `<span style="color:#ef4444;font-weight:600">Cerrado</span> · abre ${label}`;
                }
            }
            return '<span style="color:#ef4444;font-weight:600">Cerrado</span>';
        }
    } catch(e) {
        return biz.hours || '<span class="text-gray-400">Sin horario</span>';
    }
}

// E3.2 — ¿está abierto AHORA? (booleano, según hours_json y hora de Asunción)
function rpIsOpenNow(biz) {
    const hj = biz.hoursJson || biz.hours_json;
    if (!hj) return false;
    try {
        const parsed = typeof hj === 'string' ? JSON.parse(hj) : hj;
        const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Asuncion' }));
        const day = parsed[DAYS[now.getDay()]];
        if (!day || day.closed) return false;
        if (day.h24) return true;
        const cur = now.getHours() * 60 + now.getMinutes();
        const [oh, om] = String(day.open).split(':').map(Number);
        const [ch, cm] = String(day.close).split(':').map(Number);
        return cur >= (oh * 60 + om) && cur < (ch * 60 + cm);
    } catch (e) { return false; }
}

// E3.2 — Home: "Abiertos ahora, cerca tuyo". Toma verificados/destacados (con
// coords si hay ubicación), filtra los que están ABIERTOS ahora y muestra hasta 6
// con la tarjeta compacta. Si no hay ninguno abierto, la sección queda oculta.
async function loadAbiertosAhora() {
    try {
        const section = document.getElementById('abiertosAhoraSection');
        const cont    = document.getElementById('abiertosAhora');
        if (!section || !cont) return;
        const params = new URLSearchParams();
        params.set('verified', 'true');
        params.set('featured_only', 'true');
        params.set('limit', '24');
        const loc = (typeof getUserLocation === 'function') ? getUserLocation() : null;
        if (loc) { params.set('lat', loc.lat); params.set('lng', loc.lng); }
        const data = await apiGet(`/businesses?${params.toString()}`);
        if (!data || !data.success || !Array.isArray(data.data)) return;
        const open = data.data.filter(rpIsOpenNow).slice(0, 6);
        if (!open.length) return; // sin abiertos → se queda oculta
        cont.className = 'space-y-3';
        cont.innerHTML = open.map(renderBusinessCard).join('');
        section.classList.remove('hidden');
    } catch (e) { /* silencioso: la sección simplemente no aparece */ }
}

// FIX — Recarga TODO lo que depende de la ubicación: los resultados Y la sección
// "Abiertos ahora". Antes solo se recargaban los resultados, así que en la primera
// visita las distancias de "Abiertos ahora" no aparecían hasta refrescar la página.
function rpReloadLocationDependent() {
    if (typeof loadBusinesses === 'function') loadBusinesses(true, 'resultsList');
    if (typeof loadAbiertosAhora === 'function') loadAbiertosAhora();
}

async function loadBusinesses(reset = true, targetId = 'resultsList') {
    if (isLoading) return;
    isLoading = true;

    const list    = document.getElementById(targetId);
    const countEl = document.getElementById('resultsCount');
    const btn = document.getElementById('loadMoreBtn');

    if (reset) {
        // Solo resetear el offset si NO viene de goToPage
        // goToPage setea _paginationOffset antes de llamar
        if (!window._paginationOffset) {
            currentOffset = 0;
        }
        window._paginationOffset = false;
        list.innerHTML = '';
    }

    const params = new URLSearchParams();
    if (currentSearch) params.set('q', currentSearch);
    if (currentCategory) params.set('category', currentCategory);
    if (currentCity) params.set('city', currentCity);

    const verified = document.getElementById('filterVerified')?.checked;
    if (verified) params.set('verified', 'true');

    const minRating = document.querySelector('input[name="rating"]:checked')?.value;
    if (minRating) params.set('minRating', minRating);

    const sort = document.getElementById('sortOrder')?.value || 'relevance';
    params.set('sort', sort);

    // Si no hay búsqueda activa, mostrar solo empresas verificadas con planes destacados
    const isSearchActive = !!(currentSearch || currentCategory || currentCity || verified || minRating);
    if (!isSearchActive) {
        params.set('verified', 'true');
        params.set('featured_only', 'true');
    }

    // Sprint 2/7: agregar coords si "Cerca de mí" está activo
    if (typeof getUserLocation === 'function') {
        const _loc = getUserLocation();
        if (_loc) {
            params.set('lat', _loc.lat);
            params.set('lng', _loc.lng);
            // Si las coords están viejas, refrescarlas en segundo plano y recargar
            // con la posición actual (tiempo real al moverse / al recargar).
            if (typeof refreshLocationIfStale === 'function') refreshLocationIfStale();
        } else if (navigator.geolocation && typeof requestLocation === 'function') {
            // Sin ubicación y el usuario está buscando — pedirla y recargar
            requestLocation(() => loadBusinesses(true, 'resultsList'), false);
        }
    }

    params.set('limit', '10');
    params.set('offset', currentOffset.toString());

    // Flag de busqueda semantica: ?modo=semantica en la URL.
    // Solo aplica cuando hay termino; sin termino se navega por filtros.
    // El flag queda pegado a la sesion: ?modo=semantica lo enciende,
    // ?modo=clasico lo apaga. Asi se puede navegar probando sin repetirlo.
    const _p = new URLSearchParams(location.search).get('modo');
    if (_p === 'semantica') sessionStorage.setItem('rp_modo', 'semantica');
    if (_p === 'clasico')   sessionStorage.removeItem('rp_modo');
    const _modoSem = sessionStorage.getItem('rp_modo') === 'semantica';
    const _endpoint = (_modoSem && params.get('q')) ? '/businesses/semantica' : '/businesses';
    const data = await apiGet(`${_endpoint}?${params.toString()}`);

    if (!data.success) {
        list.innerHTML = '<div class="text-center text-gray-500 py-8">Error al cargar empresas</div>';
        isLoading = false;
        updateActiveFilters();
        return;
    }

    const total = data.total || 0;
    const pageSize = 10;
    // currentOffset ya tiene el valor correcto (seteado por goToPage o por acumulación)
    // Al ser reset=true desde goToPage, currentOffset = (page-1)*10
    // Al ser reset=true desde búsqueda, currentOffset = 0 (reseteado arriba)
    const curPage = Math.floor(currentOffset / pageSize) + 1;

    if (countEl) {
        countEl.textContent = total > 0
            ? `${total.toLocaleString()} resultados encontrados`
            : `${data.count} resultados`;
    }

    if (data.data.length === 0 && reset) {
        list.innerHTML = '<div class="text-center text-gray-500 py-12"><i class="fas fa-search text-4xl mb-3 text-gray-300 block"></i><p>No se encontraron resultados</p><p class="text-sm text-gray-400 mt-1">Intentá con otros términos o filtros</p></div>';
        const moreWrap0 = document.getElementById('loadMoreWrap');
        if (moreWrap0) moreWrap0.classList.add('hidden');
        if (typeof rpSetFilterChipsState === 'function') rpSetFilterChipsState();
        isLoading = false;
        updateActiveFilters();
        return;
    }

    // Determinar modo de vista
    const viewMode = isSearchActive ? (currentViewMode || 'cards') : 'cards';

    // Mostrar/ocultar toggle de vista
    const toggleEl = document.getElementById('viewToggle');
    if (toggleEl) {
        if (isSearchActive) {
            toggleEl.classList.remove('hidden');
            toggleEl.classList.add('flex');
        } else {
            toggleEl.classList.add('hidden');
            toggleEl.classList.remove('flex');
        }
    }
    document.getElementById('viewBtnList')?.classList.toggle('active', viewMode === 'list');
    document.getElementById('viewBtnCards')?.classList.toggle('active', viewMode === 'cards');

    // Contenedor: clase diferente según modo
    if (viewMode === 'list') {
        list.className = 'space-y-2 results-section';
    } else {
        list.className = 'space-y-4 results-section';
    }

    const html = data.data.map(biz =>
        viewMode === 'list' ? renderListRow(biz) : renderBusinessCard(biz)
    ).join('');

    if (reset) list.innerHTML = html;
    else list.insertAdjacentHTML('beforeend', html);

    currentOffset += data.data.length;

    // E3.3b — Paginación numerada reemplazada por "Ver más resultados".
    const topPag = document.getElementById('paginationContainerTop');
    if (topPag) topPag.classList.add('hidden');
    const botPag = document.getElementById('paginationContainer');
    if (botPag) botPag.classList.add('hidden');
    const moreWrap = document.getElementById('loadMoreWrap');
    if (moreWrap) moreWrap.classList.toggle('hidden', !(currentOffset < total));

    // Reflejar el estado de los chips de filtro (verificados/rating/cerca/orden).
    if (typeof rpSetFilterChipsState === 'function') rpSetFilterChipsState();

    isLoading = false;
    updateActiveFilters();
}

function rpMapsUrl(biz) {
    if (biz.lat && biz.lng) return `https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}`;
    const q = encodeURIComponent([biz.tradeName || biz.name, biz.address, biz.city, 'Paraguay'].filter(Boolean).join(' '));
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// ETAPA 3 — Tarjeta COMPACTA de resultados (mobile-first).
// Miniatura 64px (fallback con inicial tintada por rubro), nombre + check
// verificado, meta "Rubro · Ciudad · X km", estado abierto/cerrado, rating
// ("Sin reseñas aún" si no hay), y acciones Llamar / WhatsApp / Llegar (≥44px).
// Aro de completitud del perfil (reusa fn_profile_completion → biz.completion).
// Badge compacto sobre la miniatura: mismo "aro" que la ficha, en chico. El color
// y las etiquetas siguen el criterio de renderPublicQualityRing (profile.js).
function renderCardCompletionRing(biz) {
    const comp = biz.completion || null;
    const qs = comp ? (Number(comp.completion) || 0) : (Number(biz.qualityScore || biz.quality_score) || 0);
    if (!qs) return '';
    const qColor = qs >= 80 ? '#22c55e' : qs >= 55 ? '#E8B84B' : qs >= 30 ? '#fb923c' : '#94a3b8';
    const qLabel = qs >= 100 ? '¡Ficha completa!' : qs >= 55 ? 'Perfil en buen camino' : qs >= 30 ? 'Perfil básico' : 'Perfil incompleto';
    const r = 13, circ = 2 * Math.PI * r, dash = (qs / 100) * circ;
    return `
    <div title="${qLabel} · ${qs}% completo" aria-label="Completitud del perfil: ${qs}%"
         style="position:absolute;bottom:-3px;right:-3px;width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center">
        <svg width="34" height="34" viewBox="0 0 34 34" style="position:absolute;inset:0;transform:rotate(-90deg)">
            <circle cx="17" cy="17" r="13" fill="none" stroke="#eef2f7" stroke-width="4"/>
            <circle cx="17" cy="17" r="13" fill="none" stroke="${qColor}" stroke-width="4"
                stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <span style="font-size:9px;font-weight:800;color:${qColor};line-height:1">${qs}</span>
    </div>`;
}

// Likes del negocio (biz.likeCount). Se muestra solo si hay al menos 1, para no
// ensuciar las fichas nuevas con "❤️ 0".
function renderCardLikes(biz) {
    const n = Number(biz.likeCount || biz.like_count || 0);
    if (!n) return '';
    return `<span style="font-weight:600;color:var(--rp-ink-2)" title="${n} ${n === 1 ? 'like' : 'likes'}"><i class="fas fa-heart" style="color:#ef4444"></i> ${n}</span>`;
}

function renderBusinessCard(biz) {
    const esc  = (typeof escHtml === 'function') ? escHtml : (t => String(t == null ? '' : t));
    const name = biz.tradeName || biz.name || 'Empresa';
    const color = (typeof getCatColor === 'function' ? getCatColor(biz.categorySlug) : '') || '#1B3A6B';
    const thumbInner = (biz.imageUrl || biz.coverUrl)
        ? `<img src="${biz.imageUrl || biz.coverUrl}" alt="${esc(name)}" loading="lazy" onerror="imgFallback(this)">`
        : `<div class="rp-thumb-fallback" style="background:${color}">${esc(name.charAt(0).toUpperCase())}</div>`;
    const thumb = thumbInner + renderCardCompletionRing(biz);

    const verified = biz.verified
        ? '<i class="fas fa-circle-check" style="color:#0ea5e9;flex-shrink:0" title="Verificado"></i>'
        : '';

    // Meta: Rubro · Ciudad (+ badge de distancia si hay ubicación)
    const metaBits = [];
    if (biz.categoryName) metaBits.push(esc(biz.categoryName));
    if (biz.city) metaBits.push(esc(biz.city));
    const distBadge = (typeof renderDistanceBadge === 'function') ? renderDistanceBadge(biz) : '';
    const meta = `<span>${metaBits.join(' · ')}</span>${distBadge}`;

    // Estado (abierto/cerrado) + rating o "Sin reseñas aún"
    const hours = renderHoursCompact(biz);
    const hasReviews = (Number(biz.reviewCount) || 0) > 0;
    const rating = hasReviews
        ? `<span style="font-weight:700;color:var(--rp-ink)"><i class="fas fa-star" style="color:#E8B84B"></i> ${Number(biz.rating).toFixed(1)} <span style="color:var(--rp-ink-2);font-weight:500">(${biz.reviewCount})</span></span>`
        : `<span style="color:#94a3b8">Sin reseñas aún</span>`;
    const likes = renderCardLikes(biz);
    const dot = '<span style="color:var(--rp-border)">&middot;</span>';

    // Acciones (≥44px). stopPropagation para no abrir el perfil al tocarlas.
    const tel = biz.phone ? String(biz.phone).replace(/[^\d+]/g, '') : '';
    const call = tel
        ? `<a class="rp-act" href="tel:${tel}" onclick="event.stopPropagation();trackClick&&trackClick('${biz.slug}','call')"><i class="fas fa-phone"></i> Llamar</a>`
        : '';
    const wa = (biz.whatsapp || biz.phone)
        ? `<a class="rp-act rp-act-wa" href="${buildWaUrl(biz)}" target="_blank" rel="noopener" onclick="event.stopPropagation();trackClick&&trackClick('${biz.slug}','whatsapp')"><i class="fab fa-whatsapp"></i> WhatsApp</a>`
        : '';
    const maps = `<a class="rp-act" href="${rpMapsUrl(biz)}" target="_blank" rel="noopener" onclick="event.stopPropagation();trackClick&&trackClick('${biz.slug}','maps')"><i class="fas fa-diamond-turn-right"></i> Llegar</a>`;
    const actions = call + wa + maps;

    return `
    <div class="rp-card" onclick="openProfile('${biz.slug}')">
        <div class="rp-card-thumb">${thumb}</div>
        <div class="rp-card-body">
            <div class="rp-card-title"><span class="rp-name">${esc(name)}</span>${verified}</div>
            <div class="rp-card-meta">${meta}</div>
            <div class="rp-card-status"><span>${hours}</span>${dot}${rating}${likes ? dot + likes : ''}</div>
            <div class="rp-card-actions">${actions}</div>
        </div>
    </div>`;
}

// ============================================
// PERFIL DE EMPRESA (con imagen fija y mapa)
