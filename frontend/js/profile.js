/**
 * RetoPA — js/profile.js
 * openProfile(), resolveImgUrl(), renderProfileMap(), reviews, closeModal()
 */

/**
 * renderPublicQualityRing(biz) — v2.6
 * Apple ring compacto para la ficha pública.
 * Solo el círculo + label — el desglose de ítems es solo para el dueño en el panel cliente.
 */
function renderPublicQualityRing(biz) {
    // S29/S30 — completitud autocompletable (fn_profile_completion). Fallback al score viejo.
    const comp = biz.completion || null;
    const qs = comp ? (Number(comp.completion) || 0) : (biz.qualityScore || biz.quality_score || 0);
    if (!qs) return '';
    const complete = qs >= 100;
    const qColor = qs >= 80 ? '#22c55e' : qs >= 55 ? '#E8B84B' : qs >= 30 ? '#fb923c' : '#d1d5db';
    const qEmoji = complete ? '✨' : qs >= 55 ? '🔥' : qs >= 30 ? '⚡' : '🌱';
    const qLabel = complete ? '¡Ficha completa!' : qs >= 55 ? 'Perfil en buen camino' : qs >= 30 ? 'Perfil básico' : 'Perfil incompleto';
    const circumference = 2 * Math.PI * 22;
    const dash = (qs / 100) * circumference;
    return `
    <div class="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50"
         title="${qLabel} · ${qs}% completo">
        <div class="relative flex-shrink-0" style="width:64px;height:64px">
            <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)">
                <circle cx="32" cy="32" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
                <circle cx="32" cy="32" r="22" fill="none" stroke="${qColor}" stroke-width="6"
                    stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
                    stroke-linecap="round"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <span style="font-size:16px;line-height:1">${qEmoji}</span>
                <span style="font-size:11px;font-weight:800;color:${qColor};line-height:1.3">${qs}%</span>
            </div>
        </div>
        <div>
            <p style="font-size:13px;font-weight:700;color:#111827">${qLabel}</p>
            ${complete
                ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#16a34a;background:#dcfce7;padding:2px 8px;border-radius:999px;margin-top:3px"><i class="fas fa-circle-check"></i> Ficha completa</span>`
                : `<p style="font-size:11px;color:#9ca3af;margin-top:2px">Completitud del perfil</p>`}
        </div>
    </div>`;
}

/**
 * renderHoursStatus(biz) — v2.6 S3.1
 * Lee biz.hoursJson (JSONB del backend) y retorna HTML con estado actual.
 * Zona horaria Paraguay: America/Asuncion (UTC-4 / UTC-3 en verano)
 * Fallback a biz.hours (TEXT) si no hay hoursJson.
 */
function renderHoursStatus(biz) {
    const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

    if (!biz.hoursJson) {
        return biz.hours || 'Consultar horarios';
    }

    try {
        const hj = typeof biz.hoursJson === 'string' ? JSON.parse(biz.hoursJson) : biz.hoursJson;
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Asuncion' }));
        const dayKey = DAYS[now.getDay()];
        const curMin = now.getHours() * 60 + now.getMinutes();

        const day = hj[dayKey];
        if (!day || day.closed) {
            // Buscar próximo día abierto
            for (let i = 1; i <= 7; i++) {
                const nextKey = DAYS[(now.getDay() + i) % 7];
                const nextDay = hj[nextKey];
                if (nextDay && !nextDay.closed) {
                    const label = i === 1 ? 'mañana' : nextKey;
                    const opens = nextDay.h24 ? '00:00' : nextDay.open;
                    return `<span style="color:#ef4444;font-weight:700">Cerrado</span> · abre ${label} ${opens}`;
                }
            }
            return `<span style="color:#ef4444;font-weight:700">Cerrado</span>`;
        }

        if (day.h24) {
            return `<span style="color:#22c55e;font-weight:700">Abierto 24h</span>`;
        }

        const [oh, om] = day.open.split(':').map(Number);
        const [ch, cm] = day.close.split(':').map(Number);
        const openMin  = oh * 60 + om;
        const closeMin = ch * 60 + cm;

        if (curMin >= openMin && curMin < closeMin) {
            // Abierto — advertir si cierra en menos de 60 min
            const remaining = closeMin - curMin;
            if (remaining <= 60) {
                return `<span style="color:#E8B84B;font-weight:700">Cierra pronto</span> · a las ${day.close}`;
            }
            return `<span style="color:#22c55e;font-weight:700">Abierto</span> · cierra a las ${day.close}`;
        } else if (curMin < openMin) {
            return `<span style="color:#ef4444;font-weight:700">Cerrado</span> · abre a las ${day.open}`;
        } else {
            // Ya cerró hoy — buscar próximo día
            for (let i = 1; i <= 7; i++) {
                const nextKey = DAYS[(now.getDay() + i) % 7];
                const nextDay = hj[nextKey];
                if (nextDay && !nextDay.closed) {
                    const label = i === 1 ? 'mañana' : nextKey;
                    const opens = nextDay.h24 ? '00:00' : nextDay.open;
                    return `<span style="color:#ef4444;font-weight:700">Cerrado</span> · abre ${label} ${opens}`;
                }
            }
            return `<span style="color:#ef4444;font-weight:700">Cerrado</span>`;
        }
    } catch(e) {
        return biz.hours || 'Consultar horarios';
    }
}

// ── Sincronía automática con Panel Cliente ───────────────────────────────
// Si el dueño edita desde el Panel Cliente en la misma pestaña, recarga la ficha
window.addEventListener('retopa:biz:updated', (e) => {
    const active = window._currentProfileSlug;
    if (active && (!e.detail?.slug || e.detail.slug === active)) {
        console.log('[Profile] Recargando ficha por cambio del cliente...');
        openProfile(active);
    }
});

async function openProfile(slug) {
    window._currentProfileSlug = slug;
    currentRating = 0; // resetear valoración al abrir cada ficha

    // Capturar qué drawer abrir: primero de sessionStorage (lo deja el SSR de /promo /producto),
    // y como fallback del query string ?promo= / ?producto=.
    // sessionStorage sobrevive a la navegación entre páginas; el query se pierde al reescribir la URL.
    try {
        let fromStore = null;
        try {
            const raw = sessionStorage.getItem('retopa_open_drawer');
            if (raw) fromStore = JSON.parse(raw);
        } catch (e) {}
        if (fromStore && fromStore.slug === slug && (fromStore.promo || fromStore.producto)) {
            window._pendingDrawer = { slug, promo: fromStore.promo || null, producto: fromStore.producto || null };
            try { sessionStorage.removeItem('retopa_open_drawer'); } catch (e) {} // consumir una sola vez
        } else if (!window._pendingDrawer || window._pendingDrawer.slug !== slug) {
            const _qs = new URLSearchParams(window.location.search);
            const _p  = _qs.get('promo');
            const _pr = _qs.get('producto');
            if (_p || _pr) {
                window._pendingDrawer = { slug, promo: _p || null, producto: _pr || null };
            }
        }
    } catch (e) {}

    const modal = document.getElementById('profileModal');
    const content = document.getElementById('modalContent');

    content.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-spinner fa-spin text-3xl text-brand-500"></i></div>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Ocultar el globito de RetoPA mientras carga la ficha (se canjea por el del negocio abajo)
    if (typeof fabHide === 'function') fabHide();

    // Registrar visita — fire & forget (no bloquea)
    fetch(`${API_BASE}/client/businesses/${slug}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
            ...(localStorage.getItem('token') ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {})
        }
    }).catch(() => {});

    // Actualizar URL para que el link sea compartible
    if (window.history && window.history.pushState) {
        // Si tenemos la data de la empresa, usar URL jerárquica canónica
        // Se actualiza de nuevo después de cargar la data completa
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith('/negocios/') && !currentPath.startsWith('/empresa/')) {
            window.history.pushState({ empresa: slug }, '', `/negocio/${slug}`);
        }
    }

    const data = await apiGet(`/businesses/${slug}`);

    if (!data.success) {
        content.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Error al cargar el perfil</div>';
        return;
    }

    const biz = data.data;

    // Upgradar la URL a la canónica jerárquica si tenemos categoría y ciudad
    if (window.history && window.history.pushState && biz.categorySlug && biz.city) {
        const citySlug = biz.city.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonicalUrl = `/negocios/${biz.categorySlug}/${citySlug}/${biz.slug}`;
        if (window.location.pathname !== canonicalUrl) {
            window.history.replaceState({ empresa: biz.slug }, '', canonicalUrl);
        }
    }
    const planBanner = biz.planType === 'premium' 
        ? '<div class="bg-brand-600 text-white px-4 py-2 text-sm font-bold flex items-center gap-2"><i class="fas fa-gem"></i> Cliente Empresa Pro</div>'
        : biz.planType === 'featured'
        ? '<div class="bg-gold-500 text-white px-4 py-2 text-sm font-bold flex items-center gap-2"><i class="fas fa-crown"></i> Cliente Negocio Digital</div>'
        : '';

    const verifiedBadge = biz.verified 
        ? '<span class="bg-green-500/90 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1"><i class="fas fa-check-circle"></i> Verificado</span>'
        : '<span class="bg-gray-500/90 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1"><i class="fas fa-exclamation-circle"></i> No verificado</span>';

    const websiteLink = biz.website 
        ? `<a href="${biz.website.startsWith('http') ? biz.website : 'https://' + biz.website}" target="_blank" rel="noopener noreferrer" class="font-semibold text-brand-600 hover:text-brand-800 text-xs underline">${biz.website}</a>`
        : '<span class="text-gray-400 text-xs">-</span>';

    // ── Redes sociales + Cómo llegar ────────────────────────────
    function buildSocialUrl(value, base) {
        if (!value) return null;
        const v = value.trim();
        return v.startsWith('http') ? v : base + v.replace(/^@/, '');
    }
    const SOCIAL_DEFS = [
        { key: 'socialInstagram', base: 'https://instagram.com/',        icon: 'fab fa-instagram',   label: 'Instagram', color: '#E1306C', bg: '#fce4ec' },
        { key: 'socialFacebook',  base: 'https://facebook.com/',         icon: 'fab fa-facebook-f',  label: 'Facebook',  color: '#1877F2', bg: '#e3f2fd' },
        { key: 'socialTiktok',    base: 'https://tiktok.com/@',          icon: 'fab fa-tiktok',      label: 'TikTok',    color: '#010101', bg: '#f0f0f0' },
        { key: 'socialLinkedin',  base: 'https://linkedin.com/company/', icon: 'fab fa-linkedin-in', label: 'LinkedIn',  color: '#0A66C2', bg: '#e8f4fd' },
        { key: 'socialTwitter',   base: 'https://x.com/',                icon: 'fab fa-x-twitter',   label: 'X',         color: '#000000', bg: '#f5f5f5' },
        { key: 'socialYoutube',   base: 'https://youtube.com/@',         icon: 'fab fa-youtube',     label: 'YouTube',   color: '#FF0000', bg: '#ffebee' },
    ];
    const maxSocial = biz.planType === 'premium' ? 6 : biz.planType === 'featured' ? 2 : 0;
    const socialLinks = SOCIAL_DEFS
        .map(def => ({ ...def, url: buildSocialUrl(biz[def.key], def.base) }))
        .filter(s => s.url)
        .slice(0, maxSocial);

    // Botón "Cómo llegar" como ícono circular (igual estilo que redes)
    const howToGetIconHtml = (typeof getUserLocation === 'function' && getUserLocation() && biz.lat && biz.lng)
        ? `<a href="https://maps.google.com/?q=${biz.lat},${biz.lng}" target="_blank" rel="noopener noreferrer"
            title="Cómo llegar"
            style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:#e8f4fd;color:#1B3A6B;font-size:18px;text-decoration:none;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;"
            onmouseover="this.style.transform='scale(1.12)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'"
            onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
            <i class="fas fa-directions"></i></a>`
        : '';

    const socialIconsHtml = (howToGetIconHtml || socialLinks.length > 0) ? `
        <div class="flex flex-wrap gap-3 py-4 border-t border-gray-100">
            ${howToGetIconHtml}
            ${socialLinks.map(s => `<a href="${s.url}" target="_blank" rel="noopener noreferrer"
                onclick="trackClick('${slug}','${s.label.toLowerCase()}')"
                title="${s.label}"
                style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:${s.bg};color:${s.color};font-size:18px;text-decoration:none;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;"
                onmouseover="this.style.transform='scale(1.12)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'"
                onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
                <i class="${s.icon}"></i></a>`).join('')}
        </div>` : '';

    // URL de "Cómo llegar" para la barra de acciones fija (E4).
    const _mapsUrl = (biz.lat && biz.lng)
        ? `https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([biz.tradeName || biz.name, biz.address, biz.city, 'Paraguay'].filter(Boolean).join(' '))}`;

    // Barra de acciones FIJA al pie (mobile): Llamar · WhatsApp · Llegar (≥44px).
    const fichaActionsBar = `
        <div class="lg:hidden" style="height:88px" aria-hidden="true"></div>
        <div class="rp-ficha-actions">
            ${biz.phone ? `<a class="rp-fa" href="tel:${String(biz.phone).replace(/[^\d+]/g, '')}" onclick="trackClick('${slug}','call')"><i class="fas fa-phone"></i> Llamar</a>` : ''}
            ${(biz.whatsapp || biz.phone) ? `<a class="rp-fa rp-fa-wa" href="${buildWaUrl(biz)}" target="_blank" rel="noopener" onclick="trackClick('${slug}','whatsapp')"><i class="fab fa-whatsapp"></i> WhatsApp</a>` : ''}
            <a class="rp-fa" href="${_mapsUrl}" target="_blank" rel="noopener" onclick="trackClick('${slug}','maps')"><i class="fas fa-diamond-turn-right"></i> Llegar</a>
        </div>`;

    // Canjear el globito de WhatsApp por el de este negocio (o ocultarlo si no tiene WA)
    if (typeof fabSetForBusiness === 'function') fabSetForBusiness(biz);

    // Guardar URLs de galería en variable global para el lightbox
    if (biz.gallery && biz.gallery.length > 0) {
        window._galleryUrls = biz.gallery.map(g => g.image_url);
        window._currentBiz  = biz;

        // Si se pedía abrir un producto específico, abrir su drawer
        try {
            const pd = window._pendingDrawer;
            if (pd && pd.slug === slug && pd.producto) {
                const idx = biz.gallery.findIndex(g => String(g.id) === String(pd.producto));
                if (idx >= 0) {
                    setTimeout(() => openProductDrawer(idx), 700);
                    window._pendingDrawer = null; // ya consumido
                }
            }
        } catch (e) {}
    }
    function resolveImgUrl(url, fallback) {
        if (!url || url.trim() === '') return fallback;
        if (url.startsWith('http')) return url;
        return url; // relativa — el browser la resuelve desde el mismo origen
    }

    // Imagen de portada — placeholder con inicial si no tiene
    const hasCover  = !!(biz.coverUrl || biz.imageUrl);
    const initial   = (biz.name || 'E').charAt(0).toUpperCase();
    const catColor  = biz.categorySlug ? getCatColor(biz.categorySlug) : '#0ea5e9';
    const bannerUrl = biz.coverUrl || biz.imageUrl || '';
    const focalX    = biz.coverFocalX ?? biz.cover_focal_x ?? 50;
    const focalY    = biz.coverFocalY ?? biz.cover_focal_y ?? 50;

    content.innerHTML = `
        ${planBanner}
        <div class="relative">
            <div class="h-56 md:h-72 relative overflow-hidden bg-gray-100"
                style="${!hasCover ? `background: linear-gradient(135deg, ${catColor}22, ${catColor}44)` : ''}">
                ${hasCover
                    ? `<img src="${bannerUrl}" class="w-full h-full" style="object-fit:cover;object-position:${focalX}% ${focalY}%" onerror="imgFallback(this)" alt="${biz.name}">`
                    : `<div class="w-full h-full flex flex-col items-center justify-center gap-3">
                        <div class="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl font-black text-white shadow-xl" style="background:${catColor}">
                            ${initial}
                        </div>
                        ${(!biz.hasOwner && !biz.claimedBy && biz.claimStatus !== 'approved') ? (
                            biz.verified
                            ? `<div class="bg-green-500 text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                                <i class="fas fa-check-circle"></i> Datos verificados — ¿Sos el dueño?
                               </div>`
                            : `<div class="bg-amber-400 text-amber-900 text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                                <i class="fas fa-ribbon"></i> Empresa sin verificar — ¿Sos el dueño?
                               </div>`
                        ) : ''}
                      </div>`
                }
                <!-- Degradado superior (para iconos) + inferior (para título), siempre visible aun sobre portadas claras -->
                <div class="absolute inset-0" style="background:linear-gradient(to bottom, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.05) 22%, rgba(15,23,42,0) 45%, rgba(15,23,42,0.35) 68%, rgba(15,23,42,0.82) 100%)"></div>
                <button onclick="closeModal()" title="Cerrar" class="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white transition z-20"
                    style="background:rgba(15,23,42,0.55);backdrop-filter:blur(6px)"
                    onmouseover="this.style.background='rgba(15,23,42,0.8)'" onmouseout="this.style.background='rgba(15,23,42,0.55)'">
                    <i class="fas fa-times"></i>
                </button>
                <!-- Like + Share en la ficha -->
                <div class="absolute top-4 left-4 flex items-center gap-2 z-20">
                    <button id="profileLikeBtn" onclick="toggleLikeProfile('${slug}')"
                        class="flex items-center gap-1.5 text-white px-3 py-2 rounded-full text-sm font-bold transition"
                        style="background:rgba(15,23,42,0.55);backdrop-filter:blur(6px)"
                        onmouseover="this.style.background='rgba(15,23,42,0.8)'" onmouseout="this.style.background='rgba(15,23,42,0.55)'">
                        <i class="far fa-heart" id="profileLikeIcon"></i>
                        <span id="profileLikeCount">0</span>
                    </button>
                    <button onclick="shareBusiness(event, '${slug}', '${(biz.tradeName || biz.name).replace(/'/g,"\\'")}')"
                        class="flex items-center gap-1.5 text-white px-3 py-2 rounded-full text-sm font-bold transition"
                        style="background:rgba(15,23,42,0.55);backdrop-filter:blur(6px)"
                        onmouseover="this.style.background='rgba(15,23,42,0.8)'" onmouseout="this.style.background='rgba(15,23,42,0.55)'">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
                <div class="absolute bottom-6 left-6 md:left-10 right-6 text-white z-10">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        ${(() => {
                            const cats = (Array.isArray(biz.categories) && biz.categories.length
                                ? biz.categories
                                : [{ name: biz.categoryName, slug: biz.categorySlug, isPrimary: true }]
                            ).filter(c => c && c.name);
                            const primary = cats.find(c => c.isPrimary) || cats[0];
                            const rest = cats.filter(c => c !== primary).length;
                            let html = '';
                            if (primary) html += `<span class="text-white text-xs font-bold px-3 py-1 rounded-full" style="background:rgba(15,23,42,0.5);backdrop-filter:blur(4px)">${escHtml(primary.name)}</span>`;
                            if (rest > 0) html += `<span class="text-white/90 text-xs font-semibold px-2.5 py-1 rounded-full" style="background:rgba(15,23,42,0.35);backdrop-filter:blur(4px)">+${rest}</span>`;
                            return html;
                        })()}
                        ${verifiedBadge}
                    </div>
                    <h2 class="text-3xl md:text-4xl font-black font-display">${biz.tradeName || biz.name}</h2>
                    ${biz.tradeName && biz.tradeName !== biz.name ? `<p class="text-white/60 text-xs mt-1 font-medium">${biz.name}</p>` : ''}
                    <div class="flex items-center gap-3 mt-2 text-sm">
                        ${(Number(biz.reviewCount) || 0) > 0
                            ? `<span class="flex items-center gap-1"><i class="fas fa-star text-yellow-400"></i> ${Number(biz.rating).toFixed(1)}</span><span>•</span><span>${biz.reviewCount} ${Number(biz.reviewCount) === 1 ? 'reseña' : 'reseñas'}</span>`
                            : `<span style="color:rgba(255,255,255,.85)">Sin reseñas aún</span>`}
                        <span>•</span><span><i class="fas fa-clock mr-1"></i> ${renderHoursStatus(biz)}</span>
                    </div>
                </div>
            </div>

            <!-- Barra de pestañas (sticky) — se llena en initProfileTabs -->
            <div id="_profileTabBar" style="position:sticky;top:0;z-index:20;background:white;border-bottom:2px solid #f1f5f9;display:flex;overflow-x:auto;scrollbar-width:none"></div>

            <div class="p-6 md:p-10 max-w-5xl mx-auto">

                <!-- Acciones móviles: barra FIJA al pie (ver .rp-ficha-actions más abajo) -->


                <div class="grid md:grid-cols-3 gap-8">
                    <!-- ===== Columna principal: paneles por pestaña ===== -->
                    <div class="md:col-span-2 space-y-8" style="min-width:0">

                        <!-- Banner propietario — solo si no tiene dueño -->
                        ${(!biz.hasOwner && !biz.claimedBy && biz.claimStatus !== 'approved' && biz.claimStatus !== 'pending') ? `
                        <div class="rounded-2xl border-2 border-brand-200 bg-gradient-to-r from-brand-50 to-sky-50 px-5 py-4 flex items-center gap-4">
                            <div class="w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
                                <i class="fas fa-store text-white text-lg"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-bold text-brand-900 text-sm leading-tight">¿Es tu negocio?</p>
                                <p class="text-brand-700 text-xs mt-0.5 leading-snug">Registrate como propietario, gestioná tu ficha, respondé reseñas y accedé a estadísticas gratuitas.</p>
                            </div>
                            <button onclick="openClaimModal('${slug}', '${biz.name.replace(/'/g, "\\'")}')"
                                class="shrink-0 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition whitespace-nowrap">
                                Sí, es mío
                            </button>
                        </div>` : ''}

                        <!-- ===== PANEL: INICIO ===== -->
                        <div id="_panelInicio" class="space-y-8" style="min-width:0">
                            <div id="_promoSlot"></div>

                            ${biz.description ? `
                            <div>
                                <h3 class="text-xl font-bold text-gray-900 mb-3">Sobre nosotros</h3>
                                <p class="text-gray-600 leading-relaxed">${biz.description}</p>
                            </div>` : ''}

                            ${(biz.tags && biz.tags.length) ? `
                            <div>
                                <h3 class="text-xl font-bold text-gray-900 mb-3">Servicios y especialidades</h3>
                                <div class="flex flex-wrap gap-2">
                                    ${biz.tags.map(tag => `<span class="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium border border-brand-100">${escHtml(tag)}</span>`).join('')}
                                </div>
                            </div>` : ''}

                            ${socialIconsHtml}

                            <div>
                                <h3 class="text-xl font-bold text-gray-900 mb-3">Ubicación</h3>
                                ${biz.lat && biz.lng ? `
                                <div id="businessMap" class="rounded-2xl overflow-hidden border border-gray-200" style="height:300px;"></div>
                                <p class="text-sm text-gray-500 mt-2 flex items-center gap-1">
                                    <i class="fas fa-map-marker-alt text-red-500"></i>
                                    ${biz.address || ''}${biz.city ? ' &middot; ' + biz.city : ''}
                                </p>` : `
                                <div class="bg-gray-100 rounded-2xl h-48 flex items-center justify-center border-2 border-dashed border-gray-300">
                                    <div class="text-center text-gray-400">
                                        <i class="fas fa-map-marked-alt text-4xl mb-2"></i>
                                        <p class="font-medium">${biz.address || 'Dirección no especificada'}</p>
                                        <p class="text-xs mt-1">${biz.city || ''}${biz.department ? ', ' + biz.department : ''}</p>
                                    </div>
                                </div>`}
                            </div>
                        </div>

                        <!-- ===== PANEL: PRODUCTOS Y SERVICIOS ===== -->
                        <div id="_panelProducts" style="display:none">
                            ${(biz.gallery && biz.gallery.filter(g => g.is_available !== false).length > 0) ? `
                            <h3 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <i class="fas fa-store text-brand-500 text-base"></i> Productos y servicios
                            </h3>
                            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px">
                                ${biz.gallery.filter(g => g.is_available !== false).map((img) => `
                                <div onclick="openProductDrawer(${biz.gallery.indexOf(img)})"
                                     style="cursor:pointer;border-radius:16px;overflow:hidden;border:1px solid #f1f5f9;background:white;transition:transform .2s,box-shadow .2s;box-shadow:0 2px 8px rgba(0,0,0,0.06)"
                                     onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 24px rgba(27,58,107,0.15)'"
                                     onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'">
                                    <div style="aspect-ratio:1;overflow:hidden;background:#f8fafc">
                                        <img src="${img.image_url}" alt="${escHtml(img.caption || biz.name)}"
                                            style="width:100%;height:100%;object-fit:cover" onerror="imgFallback(this)">
                                    </div>
                                    <div style="padding:10px 12px 13px">
                                        ${img.caption ? `<p style="font-size:12px;font-weight:700;color:#0f172a;margin:0 0 4px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escHtml(img.caption)}</p>` : ''}
                                        ${img.price ? `<p style="font-size:13px;font-weight:800;color:#1B3A6B;margin:0">${Number(img.price).toLocaleString('es-PY')} <span style="font-size:11px;color:#64748b">${img.price_label||'Gs.'}</span></p>` :
                                          img.price_label === 'Consultar' ? `<p style="font-size:12px;font-weight:600;color:#64748b;margin:0">Consultar precio</p>` : ''}
                                    </div>
                                </div>`).join('')}
                            </div>` : `
                            <div style="text-align:center;padding:48px 0;color:#94a3b8">
                                <i class="fas fa-store" style="font-size:34px;display:block;margin-bottom:12px"></i>
                                <p style="font-weight:600">Esta empresa todavía no cargó productos</p>
                            </div>`}
                        </div>

                        <!-- ===== PANEL: RESEÑAS ===== -->
                        <div id="_panelReviews" style="display:none">
                            <h3 class="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <i class="fas fa-star" style="color:#f59e0b"></i> Reseñas
                                ${biz.reviewCount > 0 ? `<span class="text-sm font-semibold text-gray-500">(${biz.reviewCount})</span>` : ''}
                                ${biz.rating ? `<span class="text-sm font-extrabold ml-auto" style="color:#f59e0b">★ ${biz.rating}</span>` : ''}
                            </h3>
                            <div class="space-y-4" id="reviewsList">
                                ${(biz.reviews || []).length ? biz.reviews.map(r => renderReview(r)).join('') : '<div style="text-align:center;padding:32px 0;color:#94a3b8"><i class="fas fa-star" style="font-size:30px;display:block;margin-bottom:10px"></i><p style="font-weight:600">Aún no hay reseñas. ¡Sé el primero!</p></div>'}
                            </div>
                            <div class="mt-6 bg-gray-50 rounded-xl p-5 border border-gray-100">
                                <h4 class="font-semibold text-gray-800 mb-3">Dejá tu reseña</h4>
                                <form id="reviewForm" onsubmit="submitReview(event, '${slug}')">
                                    <!-- Selector de estrellas -->
                                    <div id="starRating" style="display:flex;gap:6px;margin-bottom:14px;font-size:26px">
                                        ${[1,2,3,4,5].map(n => `<i class="far fa-star star-rating text-gray-300" style="cursor:pointer;transition:transform .1s" onclick="setRating(${n})" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></i>`).join('')}
                                    </div>
                                    <input type="hidden" id="reviewRating">
                                    <div class="grid md:grid-cols-2 gap-3 mb-3">
                                        <input type="text" id="reviewName" required placeholder="Tu nombre" class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500" value="${currentUser ? (currentUser.name || '') : ''}">
                                        <input type="email" id="reviewEmail" placeholder="Tu email (opcional)" class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500" value="${currentUser ? (currentUser.email || '') : ''}">
                                    </div>
                                    <textarea id="reviewComment" rows="3" required placeholder="Contanos tu experiencia..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 mb-3"></textarea>
                                    <button type="submit" class="btn-brand text-white px-5 py-2 rounded-lg text-sm font-bold"><i class="fas fa-paper-plane mr-1"></i> Enviar reseña</button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <!-- ===== Columna derecha: datos SIEMPRE visibles ===== -->
                    <div class="space-y-4">
                        <div class="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                            <h4 class="font-bold text-gray-900 mb-4">Información de contacto</h4>
                            <div class="space-y-3">
                                ${biz.phone ? `<div class="flex items-center gap-3 text-sm"><div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600"><i class="fas fa-phone"></i></div><div><div class="text-gray-500 text-xs">Teléfono</div><div class="font-semibold text-gray-900">${biz.phone}</div></div></div>` : ''}
                                ${biz.email ? `<div class="flex items-center gap-3 text-sm"><div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600"><i class="fas fa-envelope"></i></div><div><div class="text-gray-500 text-xs">Email</div><div class="font-semibold text-gray-900 text-xs break-all">${biz.email}</div></div></div>` : ''}
                                ${biz.website ? `<div class="flex items-center gap-3 text-sm"><div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600"><i class="fas fa-globe"></i></div><div><div class="text-gray-500 text-xs">Web</div>${websiteLink}</div></div>` : ''}
                                ${biz.ruc ? `<div class="flex items-center gap-3 text-sm"><div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600"><i class="fas fa-id-card"></i></div><div><div class="text-gray-500 text-xs">RUC</div><div class="font-mono font-semibold text-gray-900">${biz.ruc}</div></div></div>` : ''}
                                ${biz.address ? `<div class="flex items-center gap-3 text-sm"><div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600"><i class="fas fa-map-marker-alt"></i></div><div><div class="text-gray-500 text-xs">Dirección</div><div class="font-semibold text-gray-900 text-xs">${biz.address}</div></div></div>` : ''}
                                ${biz.city ? `<div class="flex items-center gap-3 text-sm"><div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600"><i class="fas fa-city"></i></div><div><div class="text-gray-500 text-xs">Ciudad</div><div class="font-semibold text-gray-900 text-xs">${biz.city}${biz.department ? ', ' + biz.department : ''}</div></div></div>` : ''}
                            </div>
                            <div class="mt-6 space-y-2">
                                ${renderPublicQualityRing(biz)}
                                ${(biz.whatsapp || biz.phone) ? `<a href="${buildWaUrl(biz)}" target="_blank" rel="noopener noreferrer" onclick="trackClick('${slug}','whatsapp')" class="w-full btn-brand text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 block text-center"><i class="fab fa-whatsapp"></i> Contactar por WhatsApp</a>` : ''}
                                ${biz.phone ? `<a href="tel:${biz.phone}" class="w-full bg-white border-2 border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition flex items-center justify-center gap-2 block text-center"><i class="fas fa-phone"></i> Llamar ahora</a>` : ''}
                                ${(!biz.hasOwner && !biz.claimedBy && biz.claimStatus !== 'approved' && biz.claimStatus !== 'pending') ? `<button onclick="openClaimModal('${slug}', '${biz.name.replace(/'/g, "\\'")}')" class="w-full bg-brand-50 border-2 border-brand-200 text-brand-700 py-3 rounded-xl font-bold hover:bg-brand-100 transition flex items-center justify-center gap-2 text-sm"><i class="fas fa-store"></i> Soy el propietario</button>` : ''}
                            </div>
                        </div>

                        ${biz.planType !== 'basic' ? `
                        <div class="bg-gold-50 rounded-2xl p-5 border border-gold-200">
                            <div class="flex items-center gap-2 mb-2"><i class="fas fa-crown text-gold-500"></i><span class="font-bold text-gold-800">${(() => {
                                const p = (typeof _publicPlans !== 'undefined' ? _publicPlans : []).find(x => x.id === biz.planType);
                                return p ? escHtml(p.name) : (biz.planType === 'premium' ? 'Empresa Pro' : 'Negocio Digital');
                            })()}</span></div>
                            <p class="text-xs text-gold-700">${(() => {
                                const p = (typeof _publicPlans !== 'undefined' ? _publicPlans : []).find(x => x.id === biz.planType);
                                return p && p.subtitle ? escHtml(p.subtitle) : 'Esta empresa cuenta con visibilidad premium y servicios digitales de RetoPA.';
                            })()}</p>
                            <div class="mt-3 flex flex-wrap gap-1.5">
                                ${(() => {
                                    const p = (typeof _publicPlans !== 'undefined' ? _publicPlans : []).find(x => x.id === biz.planType);
                                    const features = p && Array.isArray(p.features) ? p.features.filter(f => !f.startsWith('-')).slice(0, 5) : [];
                                    if (features.length) {
                                        return features.map(f => `<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-1 rounded font-bold">${escHtml(f)}</span>`).join('');
                                    }
                                    return (biz.planType === 'premium' ? '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-1 rounded font-bold">ERP</span>' : '') +
                                        '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-1 rounded font-bold">WEB</span>' +
                                        '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-1 rounded font-bold">CRM</span>';
                                })()}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
        ${fichaActionsBar}
    `;
    // ── Pestañas de la ficha pública ──────────────────────────────────────
    initProfileTabs(biz, slug);

    // Inicializar mapa de Google Maps si tiene coordenadas
    if (biz.lat && biz.lng) {
        renderProfileMap(parseFloat(biz.lat), parseFloat(biz.lng), biz.name);
    } else if (biz.city) {
        // Sin coords — centrar en la ciudad
        fetch(`/api/v2/cities?q=${encodeURIComponent(biz.city)}`)
            .then(r => r.json())
            .then(data => {
                const city = (data.data || []).find(c => c.lat && c.lng);
                if (city) renderProfileMap(parseFloat(city.lat), parseFloat(city.lng), biz.city, true);
            }).catch(() => {});
    }
    // Inicializar carrusel si hay galería
    if (biz.gallery && biz.gallery.length > 1) {
        initCarousel(biz.gallery.length);
    }
    // Cargar estado del like para este perfil
    loadProfileLike(slug);
}

// Inicializar mapa en la ficha pública - usa la misma API key que el admin
function renderProfileMap(lat, lng, name, isCityFallback = false) {
    function tryInit(attempts) {
        const container = document.getElementById('businessMap');
        if (!container) return;
        if (typeof google === 'undefined' || !google.maps) {
            if (attempts > 0) setTimeout(() => tryInit(attempts - 1), 400);
            else container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;">Google Maps no disponible</div>';
            return;
        }
        const map = new google.maps.Map(container, {
            center: { lat, lng },
            zoom: isCityFallback ? 13 : 15,
            mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        });
        if (!isCityFallback) {
            new google.maps.Marker({ position: { lat, lng }, map, title: name, animation: google.maps.Animation.DROP });
        } else {
            new google.maps.Circle({ map, center: { lat, lng }, radius: 800,
                fillColor: '#0ea5e9', fillOpacity: 0.08,
                strokeColor: '#0ea5e9', strokeOpacity: 0.3, strokeWeight: 1 });
        }
    }
    setTimeout(() => tryInit(10), 200);
}

function renderReview(r) {
    const ownerReplyHtml = r.ownerReply ? `
        <div class="mt-3 pl-3 border-l-2 border-brand-200 bg-brand-50 rounded-r-lg p-2.5">
            <p class="text-xs font-bold text-brand-700 mb-0.5"><i class="fas fa-reply mr-1"></i> Respuesta del negocio</p>
            <p class="text-xs text-brand-800">${r.ownerReply}</p>
        </div>` : '';
    return `
    <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
        <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-sm">${(r.authorName || 'A').charAt(0)}</div>
            <div>
                <div class="font-bold text-sm text-gray-900">${r.authorName || 'Anónimo'}</div>
                <div class="flex text-yellow-400 text-xs">${Array(5).fill(0).map((_, i) => `<i class="${i < r.rating ? 'fas' : 'far'} fa-star"></i>`).join('')}</div>
            </div>
            <span class="ml-auto text-xs text-gray-400">${new Date(r.createdAt).toLocaleDateString('es-PY')}</span>
        </div>
        <p class="text-sm text-gray-600">${r.comment}</p>
        ${ownerReplyHtml}
    </div>
    `;
}

let currentRating = 0;
function setRating(rating) {
    currentRating = rating;
    document.getElementById('reviewRating').value = rating;
    const stars = document.querySelectorAll('#starRating .star-rating');
    stars.forEach((star, i) => {
        if (i < rating) {
            star.classList.remove('far', 'text-gray-300');
            star.classList.add('fas', 'text-yellow-400');
        } else {
            star.classList.remove('fas', 'text-yellow-400');
            star.classList.add('far', 'text-gray-300');
        }
    });
}

async function submitReview(e, slug) {
    e.preventDefault();
    if (!currentRating) { alert('Por favor seleccioná una valoración'); return; }

    const data = {
        authorName: document.getElementById('reviewName').value,
        authorEmail: document.getElementById('reviewEmail')?.value || null,
        rating: currentRating,
        comment: document.getElementById('reviewComment').value
    };

    const res = await apiPost(`/businesses/${slug}/reviews`, data);
    if (res.success) {
        alert('¡Reseña enviada! Gracias por tu feedback.');
        openProfile(slug);
    } else {
        alert('Error: ' + (res.error || 'No se pudo enviar la reseña'));
    }
}

function closeModal() {
    document.getElementById('profileModal').classList.add('hidden');
    document.body.style.overflow = '';
    // Restaurar el globito de WhatsApp de RetoPA al cerrar la ficha
    if (typeof fabRestoreRetopa === 'function') fabRestoreRetopa();
    // Restaurar URL al cerrar el modal
    if (window.history && window.history.pushState) {
        const p = window.location.pathname;
        if (p.startsWith('/empresa/') || p.startsWith('/negocios/')) {
            window.history.pushState({}, '', '/');
        }
    }
}

// ── Carrusel de galería ────────────────────────────────────────────────────
let _carouselIdx = 0, _carouselTotal = 0, _touchStartX = 0;

function carouselGoTo(idx) {
    const track = document.getElementById('carouselTrack');
    const dots  = document.querySelectorAll('.carousel-dot');
    if (!track) return;
    _carouselIdx = Math.max(0, Math.min(idx, _carouselTotal - 1));
    track.style.transform = `translateX(-${_carouselIdx * 100}%)`;
    dots.forEach((d, i) => {
        d.classList.toggle('bg-white', i === _carouselIdx);
        d.classList.toggle('bg-white/40', i !== _carouselIdx);
    });
}
function carouselNext() { carouselGoTo(_carouselIdx + 1); }
function carouselPrev() { carouselGoTo(_carouselIdx - 1); }

function initCarousel(total) {
    _carouselIdx = 0; _carouselTotal = total;
    if (total <= 1) return;
    const wrap = document.getElementById('carouselWrap');
    if (!wrap) return;
    wrap.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend',   e => {
        const diff = _touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) diff > 0 ? carouselNext() : carouselPrev();
    }, { passive: true });
}

// ============================================
// BÚSQUEDA Y FILTROS

// ============================================
// LIGHTBOX DE GALERÍA
// ============================================
function openGalleryLightbox(startIdx) {
    const images = window._galleryUrls || [];
    if (!images.length) return;
    let current = startIdx;

    const lb = document.createElement('div');
    lb.id = '_retopa_lightbox';
    lb.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;';

    const render = () => {
        lb.innerHTML = `
            <!-- Cerrar -->
            <button onclick="document.getElementById('_retopa_lightbox').remove()"
                style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:white;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:10;">
                <i class="fas fa-times"></i>
            </button>
            <!-- Imagen -->
            <img src="${images[current]}"
                style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:8px;user-select:none;"
                onerror="this.src='/img/placeholder.jpg'">
            <!-- Contador -->
            ${images.length > 1 ? `<div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;">
                ${current + 1} / ${images.length}
            </div>` : ''}
            <!-- Prev -->
            ${current > 0 ? `<button onclick="event.stopPropagation();_lbGo(${current - 1})"
                style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:white;font-size:18px;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-chevron-left"></i></button>` : ''}
            <!-- Next -->
            ${current < images.length - 1 ? `<button onclick="event.stopPropagation();_lbGo(${current + 1})"
                style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:white;font-size:18px;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-chevron-right"></i></button>` : ''}
        `;
    };

    window._lbGo = (idx) => { current = idx; render(); };

    // Cerrar al clicar el fondo
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.remove(); });

    // Swipe mobile
    let _tx = 0;
    lb.addEventListener('touchstart', e => { _tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => {
        const diff = _tx - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            if (diff > 0 && current < images.length - 1) { current++; render(); }
            if (diff < 0 && current > 0) { current--; render(); }
        }
    }, { passive: true });

    // Teclado
    const onKey = (e) => {
        if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey); }
        if (e.key === 'ArrowRight' && current < images.length - 1) { current++; render(); }
        if (e.key === 'ArrowLeft'  && current > 0) { current--; render(); }
    };
    document.addEventListener('keydown', onKey);

    render();
    document.body.appendChild(lb);
}

// ── Product Drawer — S4.2 Tiendita Virtual ───────────────────────────────
function openProductDrawer(idxStr) {
    const idx = typeof idxStr === 'string' ? parseInt(idxStr) : idxStr;
    const biz = window._currentBiz;
    if (!biz || !biz.gallery || !biz.gallery[idx]) return;
    const img = biz.gallery[idx];

    document.getElementById('_productDrawer')?.remove();

    const drawer = document.createElement('div');
    drawer.id = '_productDrawer';

    const waNumber = normalizePhoneWa((biz.whatsapp || biz.phone || ''));
    let waLines = [`Hola! Vi *${img.caption || 'un producto'}* en RetoPA y me interesa.`];
    if (img.price) waLines.push(`Precio: ${Number(img.price).toLocaleString('es-PY')} ${img.price_label || 'Gs.'}`);
    waLines.push('¿Podés darme más info?');
    const waMsg = encodeURIComponent(waLines.join('\n'));
    const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMsg}` : '';

    const priceHtml = img.price
        ? `<div style="margin:14px 0 4px">
             <span style="font-size:26px;font-weight:900;color:#1B3A6B">${Number(img.price).toLocaleString('es-PY')}</span>
             <span style="font-size:16px;color:#64748b;margin-left:4px">${img.price_label||'Gs.'}</span>
           </div>`
        : img.price_label === 'Consultar'
        ? `<p style="font-size:14px;color:#64748b;font-weight:600;margin:14px 0">Consultá el precio por WhatsApp</p>`
        : '';

    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    drawer.dataset.mobile = isMobile ? '1' : '0';

    const panelStyle = isMobile
        ? `position:fixed;left:0;right:0;bottom:0;max-height:92vh;width:100%;background:white;z-index:9991;
           display:flex;flex-direction:column;transform:translateY(100%);border-radius:20px 20px 0 0;
           transition:transform .35s cubic-bezier(.4,0,.2,1);box-shadow:0 -8px 40px rgba(0,0,0,0.2)`
        : `position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);background:white;z-index:9991;
           display:flex;flex-direction:column;transform:translateX(100%);
           transition:transform .35s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 40px rgba(0,0,0,0.15)`;

    drawer.innerHTML = `
    <div id="_drawerOverlay" onclick="closeProductDrawer()"
         style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9990;opacity:0;transition:opacity .3s"></div>
    <div id="_drawerPanel" style="${panelStyle}">

        ${isMobile ? `<div style="display:flex;justify-content:center;padding:10px 0 2px;flex-shrink:0"><div style="width:40px;height:4px;border-radius:4px;background:#cbd5e1"></div></div>` : ''}

        <!-- Header -->
        <div style="padding:${isMobile?'8px 18px 14px':'16px 20px'};border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
            <p style="font-size:13px;font-weight:600;color:#64748b;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${biz.tradeName || biz.name}</p>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                ${img.id ? `<button onclick="shareProduct(event, ${img.id})"
                        title="Compartir producto"
                        style="width:32px;height:32px;border-radius:50%;border:none;background:#e0f2fe;cursor:pointer;font-size:14px;color:#0284c7;display:flex;align-items:center;justify-content:center">
                    <i class="fas fa-share-alt"></i>
                </button>` : ''}
                <button onclick="closeProductDrawer()"
                        style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:16px;color:#475569;display:flex;align-items:center;justify-content:center">×</button>
            </div>
        </div>

        <!-- Imagen COMPLETA (contain) -->
        <div style="flex-shrink:0;background:#0f172a;display:flex;align-items:center;justify-content:center;max-height:46vh">
            <img src="${img.image_url}" alt="${(img.caption||'').replace(/"/g,'')}"
                 style="width:100%;max-height:46vh;object-fit:contain;display:block" onerror="imgFallback(this)">
        </div>

        <!-- Contenido scrollable -->
        <div style="flex:1;overflow-y:auto;padding:18px 20px 16px;-webkit-overflow-scrolling:touch">
            ${img.caption ? `<h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 4px;line-height:1.3">${img.caption}</h2>` : ''}
            ${priceHtml}
            ${img.description ? `<p style="font-size:14px;color:#475569;line-height:1.7;margin:14px 0 0">${img.description}</p>` : ''}

            <!-- Navegación entre productos -->
            ${biz.gallery.length > 1 ? `
            <div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9">
                ${idx > 0 ? `<button onclick="openProductDrawer(${idx-1})" style="display:flex;align-items:center;gap:6px;border:none;cursor:pointer;color:#1B3A6B;font-size:13px;font-weight:600;padding:8px 12px;border-radius:10px;background:#eff6ff">
                    <i class="fas fa-chevron-left text-xs"></i> Anterior</button>` : '<span></span>'}
                ${idx < biz.gallery.length - 1 ? `<button onclick="openProductDrawer(${idx+1})" style="display:flex;align-items:center;gap:6px;border:none;cursor:pointer;color:#1B3A6B;font-size:13px;font-weight:600;padding:8px 12px;border-radius:10px;background:#eff6ff">
                    Siguiente <i class="fas fa-chevron-right text-xs"></i></button>` : '<span></span>'}
            </div>` : ''}
        </div>

        <!-- CTAs fijos abajo -->
        ${(waUrl || img.link_url) ? `
        <div style="flex-shrink:0;padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid #f1f5f9;background:white;display:flex;flex-direction:column;gap:10px">
            ${waUrl ? `
            <a href="${waUrl}" target="_blank" rel="noopener"
               onclick="fetch('/api/v2/client/gallery/${img.id}/click',{method:'POST'}).catch(()=>{})"
               style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:white;text-decoration:none;padding:15px;border-radius:14px;font-size:16px;font-weight:700">
                <i class="fab fa-whatsapp" style="font-size:21px"></i> Consultar por WhatsApp
            </a>` : ''}
            ${img.link_url ? `
            <a href="${img.link_url.startsWith('http') ? img.link_url : 'https://'+img.link_url}"
               target="_blank" rel="noopener"
               onclick="fetch('/api/v2/client/gallery/${img.id}/click',{method:'POST'}).catch(()=>{})"
               style="display:flex;align-items:center;justify-content:center;gap:8px;background:white;color:#1B3A6B;text-decoration:none;padding:13px;border-radius:14px;font-size:15px;font-weight:700;border:2px solid #1B3A6B">
                <i class="fas fa-external-link-alt" style="font-size:13px"></i> ${img.link_label || 'Ver producto'}
            </a>` : ''}
        </div>` : ''}
    </div>`;

    document.body.appendChild(drawer);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.getElementById('_drawerOverlay').style.opacity = '1';
            document.getElementById('_drawerPanel').style.transform = isMobile ? 'translateY(0)' : 'translateX(0)';
        });
    });

    drawer._escHandler = e => { if (e.key === 'Escape') closeProductDrawer(); };
    document.addEventListener('keydown', drawer._escHandler);
}

function closeProductDrawer() {
    const drawer = document.getElementById('_productDrawer');
    if (!drawer) return;
    const isMobile = drawer.dataset.mobile === '1';
    document.getElementById('_drawerOverlay').style.opacity = '0';
    document.getElementById('_drawerPanel').style.transform = isMobile ? 'translateY(100%)' : 'translateX(100%)';
    document.removeEventListener('keydown', drawer._escHandler);
    setTimeout(() => drawer.remove(), 350);
}

// Compartir un producto individual (link con preview propio para redes)
async function shareProduct(event, prodId) {
    if (event) event.stopPropagation();
    const url = `${window.location.origin}/producto/${prodId}`;
    // Obtener el nombre del producto desde la galería en memoria (sin pasarlo por el onclick)
    let caption = 'este producto';
    try {
        const g = window._currentBiz && window._currentBiz.gallery
            ? window._currentBiz.gallery.find(x => String(x.id) === String(prodId)) : null;
        if (g && g.caption) caption = g.caption;
    } catch (e) {}
    const text = `🛍 ${caption} — Mirá este producto en RetoPA`;

    if (navigator.share) {
        try {
            await navigator.share({ title: caption, text, url });
            return;
        } catch (e) { /* fallback a copiar */ }
    }
    try {
        await navigator.clipboard.writeText(url);
        if (typeof showShareToast === 'function') showShareToast('¡Link del producto copiado! 🔗');
        else alert('Link copiado: ' + url);
    } catch (e) {
        prompt('Copiá este link:', url);
    }
}

// ── Promo Drawer — desde Home o ficha de empresa ──────────────────────────────
function openPromoDrawer(p, origin) {
    document.getElementById('_promoDrawer')?.remove();
    window._currentPromo = p; // para que sharePromo acceda al título sin pasarlo por el onclick

    // Trazabilidad: contar la visita a la promo (única por sesión)
    if (p && p.id && typeof trackPromoClick === 'function') trackPromoClick(p.id);

    // origin: 'home' → mostrar botón "Ver ficha"; 'profile' (default) → no, ya estás en la ficha
    const fromHome = origin === 'home';
    const bizName  = p.trade_name || p.business_name || '';
    const bizSlug  = p.business_slug || '';
    const waNumber = normalizePhoneWa(p.whatsapp || p.phone || '');

    // Mensaje de WhatsApp enriquecido con datos de la promo
    let waLines = [`Hola! Vi la promoción *${p.title}* en RetoPA y me interesa.`];
    if (p.promo_price) {
        waLines.push(`Precio: ${Number(p.promo_price).toLocaleString('es-PY')} ${p.price_label || 'Gs.'}`);
    }
    waLines.push('¿Me podés dar más info?');
    const waMsg = encodeURIComponent(waLines.join('\n'));
    const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMsg}` : '';

    const daysLeft = p.expires_at
        ? Math.max(0, Math.ceil((new Date(p.expires_at) - Date.now()) / 86400000))
        : null;

    const hasDiscount = p.discount_pct || (p.original_price && p.promo_price);

    let priceHtml = '';
    if (p.promo_price) {
        priceHtml = `<div style="margin:14px 0 4px">
            <span style="font-size:28px;font-weight:900;color:#1B3A6B">${Number(p.promo_price).toLocaleString('es-PY')}</span>
            <span style="font-size:16px;color:#64748b;margin-left:4px">${p.price_label||'Gs.'}</span>
            ${p.original_price ? `<span style="font-size:14px;color:#94a3b8;text-decoration:line-through;margin-left:8px">${Number(p.original_price).toLocaleString('es-PY')}</span>` : ''}
            ${p.discount_pct ? `<span style="font-size:13px;font-weight:800;color:#16a34a;margin-left:6px">-${p.discount_pct}%</span>` : ''}
        </div>`;
    } else if (p.price_label === 'Consultar') {
        priceHtml = `<p style="font-size:14px;color:#64748b;font-weight:600;margin:14px 0">Consultá el precio por WhatsApp</p>`;
    }

    const isMobile = window.matchMedia('(max-width: 640px)').matches;

    // Mobile → bottom sheet (entra desde abajo). Desktop → panel lateral derecho.
    const panelStyle = isMobile
        ? `position:fixed;left:0;right:0;bottom:0;max-height:92vh;width:100%;background:white;z-index:9991;
           display:flex;flex-direction:column;transform:translateY(100%);border-radius:20px 20px 0 0;
           transition:transform .35s cubic-bezier(.4,0,.2,1);box-shadow:0 -8px 40px rgba(0,0,0,0.2)`
        : `position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);background:white;z-index:9991;
           display:flex;flex-direction:column;transform:translateX(100%);
           transition:transform .35s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 40px rgba(0,0,0,0.15)`;

    const drawer = document.createElement('div');
    drawer.id = '_promoDrawer';
    drawer.dataset.mobile = isMobile ? '1' : '0';
    drawer.innerHTML = `
    <div id="_promoDrawerOverlay" onclick="closePromoDrawer()"
         style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9990;opacity:0;transition:opacity .3s"></div>
    <div id="_promoDrawerPanel" style="${panelStyle}">

        ${isMobile ? `<div style="display:flex;justify-content:center;padding:10px 0 2px;flex-shrink:0"><div style="width:40px;height:4px;border-radius:4px;background:#cbd5e1"></div></div>` : ''}

        <!-- Header -->
        <div style="padding:${isMobile?'8px 18px 14px':'16px 20px'};border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
                ${p.business_logo
                    ? `<img src="${p.business_logo}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
                    : `<div style="width:32px;height:32px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">${bizName.charAt(0)}</div>`
                }
                <div style="min-width:0">
                    <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bizName}</p>
                    ${p.city ? `<p style="font-size:11px;color:#64748b;margin:0">${p.city}</p>` : ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <button onclick="sharePromo(event, ${p.id})"
                        title="Compartir promoción"
                        style="width:32px;height:32px;border-radius:50%;border:none;background:#e0f2fe;cursor:pointer;font-size:14px;color:#0284c7;display:flex;align-items:center;justify-content:center">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button onclick="closePromoDrawer()"
                        style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:18px;color:#475569;display:flex;align-items:center;justify-content:center">×</button>
            </div>
        </div>

        <!-- Imagen COMPLETA (contain, sin recortar) -->
        <div style="flex-shrink:0;position:relative;background:#0f172a;display:flex;align-items:center;justify-content:center;max-height:46vh">
            ${p.image_url
                ? `<img src="${p.image_url}" alt="${(p.title||'').replace(/"/g,'')}" style="width:100%;max-height:46vh;object-fit:contain;display:block" onerror="imgFallback(this)">`
                : `<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;font-size:56px;background:linear-gradient(135deg,#fff7ed,#ffedd5)">🔥</div>`
            }
            <!-- Badges -->
            <div style="position:absolute;top:12px;left:12px;display:flex;gap:6px">
                ${hasDiscount ? `<span style="background:linear-gradient(135deg,#ef4444,#dc2626);color:white;font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px">${p.discount_pct ? '-'+p.discount_pct+'%' : 'OFERTA'}</span>` : ''}
                ${daysLeft !== null && daysLeft <= 3 ? `<span style="background:rgba(249,115,22,0.92);backdrop-filter:blur(4px);color:white;font-size:10px;font-weight:700;padding:4px 8px;border-radius:20px">⏰ ${daysLeft}d</span>` : ''}
            </div>
        </div>

        <!-- Contenido scrollable -->
        <div style="flex:1;overflow-y:auto;padding:18px 20px 24px;-webkit-overflow-scrolling:touch">
            <h2 style="font-size:19px;font-weight:900;color:#0f172a;margin:0 0 4px;line-height:1.3">${p.title||''}</h2>
            ${daysLeft !== null ? `<p style="font-size:12px;color:#94a3b8;margin:0 0 8px;display:flex;align-items:center;gap:4px"><i class="fas fa-clock" style="font-size:10px"></i> ${daysLeft} días restantes</p>` : ''}
            ${priceHtml}
            ${p.description ? `<div style="font-size:14px;color:#475569;line-height:1.75;margin:16px 0;padding:14px;background:#f8fafc;border-radius:12px;white-space:pre-line">${p.description}</div>` : ''}
        </div>

        <!-- CTA fijo abajo (sticky), pulgar-friendly en mobile -->
        ${(waUrl || (p.cta_label && p.cta_url) || (fromHome && bizSlug)) ? `
        <div style="flex-shrink:0;padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid #f1f5f9;background:white;display:flex;flex-direction:column;gap:10px">
            ${waUrl ? `
            <a href="${waUrl}" target="_blank" rel="noopener"
               onclick="trackPromoClick(${p.id})"
               style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:white;text-decoration:none;padding:15px;border-radius:14px;font-size:16px;font-weight:700">
                <i class="fab fa-whatsapp" style="font-size:21px"></i> Consultar por WhatsApp
            </a>` : ''}
            ${(p.cta_label && p.cta_url) ? `
            <a href="${p.cta_url.startsWith('http') ? p.cta_url : 'https://'+p.cta_url}" target="_blank" rel="noopener"
               onclick="trackPromoClick(${p.id})"
               style="display:flex;align-items:center;justify-content:center;gap:8px;background:#1B3A6B;color:white;text-decoration:none;padding:14px;border-radius:14px;font-size:15px;font-weight:700">
                <i class="fas fa-arrow-up-right-from-square" style="font-size:13px"></i> ${escHtml(p.cta_label)}
            </a>` : ''}
            ${(fromHome && bizSlug) ? `
            <button type="button" onclick="closePromoDrawer();setTimeout(()=>openProfile('${bizSlug}'),300)"
               style="display:flex;align-items:center;justify-content:center;gap:8px;background:white;color:#1B3A6B;border:2px solid #1B3A6B;padding:13px;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;width:100%">
                <i class="fas fa-store" style="font-size:13px"></i> Ver ficha de ${bizName}
            </button>` : ''}
        </div>` : ''}
    </div>`;

    document.body.appendChild(drawer);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.getElementById('_promoDrawerOverlay').style.opacity = '1';
            document.getElementById('_promoDrawerPanel').style.transform = isMobile ? 'translateY(0)' : 'translateX(0)';
        });
    });

    drawer._escHandler = e => { if (e.key === 'Escape') closePromoDrawer(); };
    document.addEventListener('keydown', drawer._escHandler);
}

function closePromoDrawer() {
    const drawer = document.getElementById('_promoDrawer');
    if (!drawer) return;
    const isMobile = drawer.dataset.mobile === '1';
    document.getElementById('_promoDrawerOverlay').style.opacity = '0';
    document.getElementById('_promoDrawerPanel').style.transform = isMobile ? 'translateY(100%)' : 'translateX(100%)';
    setTimeout(() => {
        document.removeEventListener('keydown', drawer._escHandler);
        drawer.remove();
    }, 350);
}

// Compartir una promoción individual (link con preview propio para redes)
async function sharePromo(event, promoId) {
    if (event) event.stopPropagation();
    const url = `${window.location.origin}/promo/${promoId}`;
    let title = 'esta promoción';
    try {
        if (window._currentPromo && String(window._currentPromo.id) === String(promoId) && window._currentPromo.title)
            title = window._currentPromo.title;
    } catch (e) {}
    const text = `🔥 ${title} — Mirá esta promoción en RetoPA`;

    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
            return;
        } catch (e) { /* fallback a copiar */ }
    }
    try {
        await navigator.clipboard.writeText(url);
        if (typeof showShareToast === 'function') showShareToast('¡Link de la promo copiado! 🔗');
        else alert('Link copiado: ' + url);
    } catch (e) {
        prompt('Copiá este link:', url);
    }
}

// ── Pestañas de la ficha pública ─────────────────────────────────────────────
async function initProfileTabs(biz, slug) {
    const content = document.getElementById('modalContent');
    if (!content) return;

    const panelInicio   = content.querySelector('#_panelInicio');
    const panelProducts = content.querySelector('#_panelProducts');
    const panelReviews  = content.querySelector('#_panelReviews');
    const tabBar        = content.querySelector('#_profileTabBar');
    if (!tabBar) return;

    const hasProducts = !!(biz.gallery && biz.gallery.filter(g => g.is_available !== false).length > 0);

    // Cargar promociones activas e inyectarlas en el slot de Inicio
    let hasPromos = false;
    try {
        const pRes  = await fetch(`/api/v2/promotions?business=${encodeURIComponent(slug)}&limit=12`);
        const pData = await pRes.json();
        if (pData.success && pData.data && pData.data.length) {
            hasPromos = true;
            const slot = content.querySelector('#_promoSlot');
            if (slot) slot.innerHTML = buildProfilePromos(pData.data, slug);

            // Si se pedía abrir una promo específica, abrir su drawer.
            // Leemos de window._pendingDrawer porque estamos en otra función (scope distinto a openProfile).
            try {
                const pd = window._pendingDrawer;
                if (pd && pd.slug === slug && pd.promo) {
                    const promo = pData.data.find(p => String(p.id) === String(pd.promo));
                    if (promo) {
                        setTimeout(() => openPromoDrawer(promo, 'profile'), 600);
                        window._pendingDrawer = null; // ya consumido
                    }
                }
            } catch (e) {}
        }
    } catch(e) {}

    // Construir las pestañas disponibles
    const tabs = [
        { id: 'inicio',   label: 'Inicio',                icon: 'fas fa-home',  show: true },
        { id: 'products', label: 'Productos y Servicios', icon: 'fas fa-store', show: hasProducts },
        { id: 'reviews',  label: 'Reseñas',               icon: 'fas fa-star',  show: true },
    ].filter(t => t.show);

    tabBar.innerHTML = tabs.map((t, i) => `
        <button id="_tab_${t.id}" data-tab="${t.id}"
            style="flex:none;padding:14px 20px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;white-space:nowrap;
                   color:${i===0?'#1B3A6B':'#64748b'};border-bottom:${i===0?'2px solid #1B3A6B':'2px solid transparent'};
                   margin-bottom:-2px;transition:all .2s;display:flex;align-items:center;gap:6px">
            <i class="${t.icon}" style="font-size:12px"></i>${t.label}
        </button>`).join('');

    window.switchProfileTab = function(tabId) {
        tabs.forEach(t => {
            const btn = document.getElementById('_tab_' + t.id);
            if (btn) {
                const active = t.id === tabId;
                btn.style.color = active ? '#1B3A6B' : '#64748b';
                btn.style.borderBottom = active ? '2px solid #1B3A6B' : '2px solid transparent';
            }
        });
        if (panelInicio)   panelInicio.style.display   = (tabId === 'inicio')   ? '' : 'none';
        if (panelProducts) panelProducts.style.display = (tabId === 'products') ? '' : 'none';
        if (panelReviews)  panelReviews.style.display  = (tabId === 'reviews')  ? '' : 'none';
        // Re-render del mapa al volver a Inicio (Google Maps necesita el contenedor visible)
        if (tabId === 'inicio' && biz.lat && biz.lng && typeof renderProfileMap === 'function') {
            setTimeout(() => renderProfileMap(parseFloat(biz.lat), parseFloat(biz.lng), biz.name), 60);
        }
    };

    // Click handlers
    tabBar.querySelectorAll('button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchProfileTab(btn.dataset.tab));
    });

    // Estado inicial
    window.switchProfileTab('inicio');
}

function buildProfilePromos(promos, slug) {
    if (!promos.length) return '';
    const cid = '_promoCar_' + Math.random().toString(36).slice(2, 8);
    const cards = promos.map(p => {
        const key = '_biz_promo_' + p.id;
        window[key] = p;
        const hasDisc  = p.discount_pct || (p.original_price && p.promo_price);
        const daysLeft = p.expires_at ? Math.max(0, Math.ceil((new Date(p.expires_at) - Date.now()) / 86400000)) : null;
        // Ancho fluido: en mobile ~78% del contenedor (asoma la siguiente); en desktop fijo 220px
        return `<div onclick="if(typeof openPromoDrawer==='function')openPromoDrawer(window['${key}'],'profile')"
            class="_promoCard"
            style="scroll-snap-align:start;flex:0 0 auto;cursor:pointer;background:white;border-radius:16px;overflow:hidden;border:1.5px solid #f1f5f9;box-shadow:0 2px 10px rgba(0,0,0,0.06);transition:transform .2s,box-shadow .2s"
            onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 10px 26px rgba(27,58,107,0.15)'"
            onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 10px rgba(0,0,0,0.06)'">
            <div style="position:relative;aspect-ratio:4/3;overflow:hidden;background:#f8fafc">
                ${p.image_url
                    ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover" onerror="imgFallback(this)">`
                    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:34px;background:linear-gradient(135deg,#fff7ed,#ffedd5)">🔥</div>`}
                ${hasDisc ? `<div style="position:absolute;top:8px;left:8px;background:#ef4444;color:white;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px">${p.discount_pct ? '-' + p.discount_pct + '%' : 'OFERTA'}</div>` : ''}
                ${daysLeft !== null && daysLeft <= 3 ? `<div style="position:absolute;top:8px;right:8px;background:rgba(249,115,22,0.92);color:white;font-size:10px;font-weight:700;padding:3px 7px;border-radius:20px">⏰ ${daysLeft}d</div>` : ''}
            </div>
            <div style="padding:11px 13px 13px">
                <p style="font-size:12.5px;font-weight:700;color:#0f172a;margin:0 0 5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:33px">${p.title || ''}</p>
                ${p.promo_price ? `<p style="font-size:15px;font-weight:900;color:#1B3A6B;margin:0">${Number(p.promo_price).toLocaleString('es-PY')} <span style="font-size:11px;font-weight:600;color:#64748b">${p.price_label || 'Gs.'}</span></p>` : ''}
                ${p.original_price && p.promo_price ? `<p style="font-size:11px;color:#94a3b8;text-decoration:line-through;margin:2px 0 0">${Number(p.original_price).toLocaleString('es-PY')}</p>` : ''}
            </div>
        </div>`;
    }).join('');

    const arrows = promos.length > 1 ? `
        <button type="button" onclick="document.getElementById('${cid}').scrollBy({left:-document.getElementById('${cid}').clientWidth*0.8,behavior:'smooth'})"
            style="width:34px;height:34px;border-radius:50%;border:1.5px solid #e2e8f0;background:white;cursor:pointer;color:#1B3A6B;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.06);flex-shrink:0">
            <i class="fas fa-chevron-left" style="font-size:12px"></i></button>
        <button type="button" onclick="document.getElementById('${cid}').scrollBy({left:document.getElementById('${cid}').clientWidth*0.8,behavior:'smooth'})"
            style="width:34px;height:34px;border-radius:50%;border:1.5px solid #e2e8f0;background:white;cursor:pointer;color:#1B3A6B;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.06);flex-shrink:0">
            <i class="fas fa-chevron-right" style="font-size:12px"></i></button>` : '';

    // min-width:0 en el wrapper es CLAVE para que el track no desborde el grid en mobile
    return `
    <div style="margin-bottom:8px;min-width:0">
        <style>
            #${cid}{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-ms-overflow-style:none;padding:4px 2px 10px;max-width:100%}
            #${cid}::-webkit-scrollbar{display:none}
            #${cid} ._promoCard{width:220px}
            @media (max-width:640px){ #${cid} ._promoCard{width:78%} }
        </style>
        <div style="display:flex;align-items:center;gap:8px;margin:0 0 14px">
            <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin:0;display:flex;align-items:center;gap:8px;min-width:0">
                <span style="font-size:19px">🔥</span> Promociones activas
                <span style="font-size:12px;font-weight:700;color:#fff;background:#ef4444;border-radius:20px;padding:2px 9px">${promos.length}</span>
            </h3>
            <div style="margin-left:auto;display:flex;gap:8px;flex-shrink:0">${arrows}</div>
        </div>
        <div id="${cid}">
            ${cards}
        </div>
    </div>`;
}
