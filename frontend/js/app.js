/**
 * RetoPA — js/app.js
 * init(), loadPublicSiteConfig(), loadStats()
 */

async function init() {
    await loadStats();
    await loadCategories();
    loadHomePromos(); // async, no bloquea
    if (typeof loadAbiertosAhora === 'function') loadAbiertosAhora(); // E3.2 — home: abiertos ahora
    await loadCities();
    await loadPopularTags();
    await loadBusinesses(true, 'resultsList');
    loadPlans();
    loadServices();
    loadPublicSiteConfig(); // footer, redes, contacto
    checkSession();
    if (typeof initNearMeButton === 'function') initNearMeButton(() => rpReloadLocationDependent()); // Sprint 2: distancia (+ Abiertos ahora)
    checkSession();

    // Manejar preloads del SSR
    const preload = window.__RETOPA_PRELOAD__;
    if (preload?.type === 'business' && preload?.slug) {
        openProfile(preload.slug);
    } else if (preload?.type === 'category' && preload?.categorySlug) {
        // Pre-filtrar por categoría
        const catSel = document.getElementById('categorySelect');
        if (catSel) { catSel.value = preload.categorySlug; loadBusinesses(true, 'resultsList'); }
    } else if (preload?.type === 'category-city' && preload?.categorySlug) {
        // Pre-filtrar por categoría + ciudad
        const catSel = document.getElementById('categorySelect');
        const citySel = document.getElementById('citySelect');
        if (catSel) catSel.value = preload.categorySlug;
        if (citySel && preload.city) citySel.value = preload.city;
        loadBusinesses(true, 'resultsList');
        // Scroll al directorio
        setTimeout(() => document.getElementById('directorio')?.scrollIntoView({ behavior: 'smooth' }), 500);
    }
    // Fallback: ?empresa= en query string
    const urlParams = new URLSearchParams(window.location.search);
    const empresaSlug = urlParams.get('empresa');
    if (empresaSlug) openProfile(empresaSlug);

    // SearchAction (JSON-LD del home): ?q= ejecuta la búsqueda al cargar
    const qParam = (urlParams.get('q') || '').trim();
    if (!empresaSlug && qParam && typeof quickSearch === 'function') {
        quickSearch(qParam);
        setTimeout(() => document.getElementById('directorio')?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
}

async function loadPublicSiteConfig() {
    try {
        const data = await apiGet('/site-config');
        if (!data.success || !data.data) return;
        const s = data.data;

        // Guardar config global para uso en buildWaUrl y otros
        window.SITE_CONFIG = s;

        // Cargar Google Maps dinámicamente con la key de site_config (no hardcodeada)
        if (s.google_maps_key && !window.__GMAPS_LOADED__) {
            window.__GMAPS_LOADED__ = true;
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(s.google_maps_key)}&libraries=places`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }

        // Nombre del sitio
        if (s.site_name) {
            // Título de pestaña: preferir site_title explícito, luego construir desde site_name
            const pageTitle = s.site_title || (s.site_name + ' — Directorio Comercial de Paraguay');
            document.title = pageTitle;
            const el = document.getElementById('footerSiteName');
            if (el) el.textContent = s.site_name;
        } else if (s.site_title) {
            document.title = s.site_title;
        }

        // Tagline en logos (navbar + footer)
        if (s.site_tagline) {
            document.querySelectorAll('.brand-tagline').forEach(el => {
                el.textContent = s.site_tagline;
            });
        }

        // Logo del sitio — reemplaza el SVG del navbar si hay logo_url configurado
        if (s.logo_url) {
            document.querySelectorAll('.brand-logo-container').forEach(container => {
                container.style.background = 'transparent';
                container.style.boxShadow  = 'none';
                container.innerHTML = '<img src="' + s.logo_url + '" alt="' + (s.site_name || 'RetoPA') + '" class="h-10 w-auto max-w-[160px] object-contain" onerror="this.parentElement.style.background=\'linear-gradient(135deg,#1B3A6B,#2a5298)\';this.remove()">';
            });
        }


        // Secciones activables — ocultar secciones desactivadas
        const sectionsMap = {
            'section_planes_enabled':    ['#planes',    'a[href="#planes"]',    '.footer-link-planes'],
            'section_servicios_enabled': ['#servicios', 'a[href="#servicios"]', '.footer-link-servicios'],
            'section_promos_enabled':    ['#homePromos','a[href="#promociones"]'],
        };
        Object.entries(sectionsMap).forEach(([key, selectors]) => {
            const enabled = s[key] !== '0' && s[key] !== 'false';
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    el.style.display = enabled ? '' : 'none';
                });
            });
        });

        // WhatsApp — usa whatsapp_url directo si está, sino construye desde contact_phone
        const waUrl = s.whatsapp_url ||
            (s.contact_phone ? `https://wa.me/${s.contact_phone.replace(/\D/g, '')}` : null);
        // Guardar la URL de RetoPA para poder restaurar el globito al cerrar una ficha
        // (mientras una ficha está abierta, el globito se canjea por el WA del negocio).
        window._retopaWaUrl = waUrl;

        if (waUrl) {
            // Footer phone link
            const phoneEl = document.getElementById('footerPhone');
            const phoneText = document.getElementById('footerPhoneText');
            if (phoneEl && phoneText) {
                phoneEl.href = waUrl;
                phoneEl.classList.remove('hidden');
                phoneEl.classList.add('flex');
                phoneText.textContent = s.contact_phone || 'WhatsApp';
            }

            // FAB flotante
            const fab = document.getElementById('whatsappFab');
            if (fab) {
                fab.href = waUrl;
                fab.classList.remove('hidden');
                fab.classList.add('flex');
            }
        }

        // Email
        if (s.contact_email) {
            const emailEl = document.getElementById('footerEmail');
            const emailText = document.getElementById('footerEmailText');
            if (emailEl && emailText) {
                emailEl.href = `mailto:${s.contact_email}`;
                emailEl.classList.remove('hidden');
                emailEl.classList.add('flex');
                emailText.textContent = s.contact_email;
            }
        }

        // Redes sociales
        const socials = {
            footerFacebook:  s.social_facebook,
            footerInstagram: s.social_instagram,
            footerLinkedin:  s.social_linkedin,
            footerWhatsapp:  s.whatsapp_url || (s.social_whatsapp ? `https://wa.me/${s.social_whatsapp.replace(/\D/g,'')}` : null),
            footerTwitter:   s.social_twitter,
            footerTiktok:    s.social_tiktok,
            footerYoutube:   s.social_youtube,
        };
        Object.entries(socials).forEach(([id, url]) => {
            if (url) {
                const el = document.getElementById(id);
                if (el) {
                    el.href = url;
                    el.classList.remove('hidden');
                    el.classList.add('flex');
                }
            }
        });

        // Hero dinámico
        function applyEmphasis(text) {
            if (!text) return '';
            return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
        }
        if (s.hero_title) {
            const el = document.getElementById('heroTitle');
            if (el) el.innerHTML = rpBicolorTitle(s.hero_title);
        }
        if (s.hero_subtitle) {
            const el = document.getElementById('heroSubtitle');
            if (el) el.textContent = s.hero_subtitle;
        }
        if (s.hero_description) {
            const el = document.getElementById('heroDescription');
            if (el) el.innerHTML = applyEmphasis(s.hero_description);
        }
        if (s.hero_cta_text) {
            const el = document.getElementById('heroCta');
            if (el) { const icon = el.querySelector('i'); el.innerHTML = ''; if(icon) el.appendChild(icon); el.appendChild(document.createTextNode(' ' + s.hero_cta_text)); }
        }
        if (s.hero_cta_link && s.hero_cta_link !== '#registro') {
            const el = document.getElementById('heroCta');
            if (el) el.onclick = () => window.location.href = s.hero_cta_link;
        }
        if (s.hero_bg_from || s.hero_bg_to) {
            const hero = document.getElementById('inicio');
            if (hero) hero.style.background = `linear-gradient(135deg, ${s.hero_bg_from || '#0f2554'}, ${s.hero_bg_to || '#1B3A6B'})`;
        }

        // Planes header
        if (s.plans_label) { const el = document.getElementById('plansLabel'); if (el) el.textContent = s.plans_label; }
        if (s.plans_title) { const el = document.getElementById('plansTitle'); if (el) el.textContent = s.plans_title; }
        if (s.plans_desc)  { const el = document.getElementById('plansDesc');  if (el) el.innerHTML = applyEmphasis(s.plans_desc); }

        // Footer dinámico
        if (s.footer_tagline)   { const el = document.getElementById('footerTagline');   if (el) el.textContent = s.footer_tagline; }
        if (s.footer_copyright) { const el = document.getElementById('footerCopyright'); if (el) el.innerHTML = s.footer_copyright; }

        function renderFooterLinks(colId, linksJson) {
            const ul = document.getElementById(colId);
            if (!ul || !linksJson) return;
            try {
                const links = JSON.parse(linksJson);
                ul.innerHTML = links.map(l =>
                    `<li><a href="${l.url || '#'}" class="hover:text-brand-400 transition flex items-center gap-2">
                        <i class="fas fa-chevron-right text-xs text-gray-600"></i> ${l.label}
                    </a></li>`
                ).join('');
            } catch(e) {}
        }
        if (s.footer_col2_title) { const el = document.getElementById('footerCol2Title'); if (el) el.textContent = s.footer_col2_title; }
        if (s.footer_col3_title) { const el = document.getElementById('footerCol3Title'); if (el) el.textContent = s.footer_col3_title; }
        if (s.footer_col4_title) { const el = document.getElementById('footerCol4Title'); if (el) el.textContent = s.footer_col4_title; }
        renderFooterLinks('footerCol2Links', s.footer_col2_links);
        renderFooterLinks('footerCol3Links', s.footer_col3_links);
        renderFooterLinks('footerCol4Links', s.footer_col4_links);
        if (s.services_label) {
            const el = document.getElementById('servicesLabel');
            if (el) el.textContent = s.services_label;
        }
        if (s.services_title) {
            const el = document.getElementById('servicesTitle');
            if (el) el.textContent = s.services_title;
        }
        if (s.services_desc) {
            const el = document.getElementById('servicesDesc');
            if (el) el.innerHTML = renderEmphasis(s.services_desc);
        }
    } catch(e) {
        console.warn('[Site config]', e.message);
    }
}

// Renderiza el H1 del hero en BI-COLOR desde site_config.hero_title.
// El segmento dorado: lo marcado con **…** (p.ej. "¿Qué necesitás **hoy?**");
// si no hay marcas, se resalta la última palabra. Escapa HTML (config = dato).
function rpBicolorTitle(str) {
    const esc = t => String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const gold = t => '<span style="color:#E8B84B">' + esc(t) + '</span>';
    const s = String(str || '').trim();
    const m = s.match(/^(.*?)\*\*(.+?)\*\*(.*)$/);
    if (m) return esc(m[1]) + gold(m[2]) + esc(m[3]);
    const parts = s.split(' ');
    if (parts.length <= 1) return gold(s);
    const last = parts.pop();
    return esc(parts.join(' ') + ' ') + gold(last);
}

async function loadStats() {
    const data = await apiGet('/stats');
    if (data.success) {
        const stats = data.data;
        document.getElementById('heroStats').textContent =
            `${Number(stats.businesses).toLocaleString('es-PY')} empresas y profesionales en Paraguay`;
    }
}

// ── Event listeners globales ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

// Abrir modal de registro si viene del Panel Cliente
if (sessionStorage.getItem('openRegistro') === '1') {
    sessionStorage.removeItem('openRegistro');
    // Esperar que el DOM y los scripts estén listos
    window.addEventListener('load', () => {
        setTimeout(() => openRegistroEmpresaCheck && openRegistroEmpresaCheck(), 500);
    });
}

document.getElementById('mainSearch').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        document.getElementById('searchSuggestions').classList.add('hidden');
        performSearch();
    }
});

document.getElementById('categorySelect').addEventListener('change', function() {
    if (this.value) {
        currentCategory = this.value;
        document.querySelectorAll('.category-card').forEach(p => p.classList.remove('active'));
        document.querySelector(`[data-slug="${this.value}"]`)?.classList.add('active');
        performSearch();
    }
});

document.getElementById('citySelect').addEventListener('change', function() {
    if (this.value) {
        currentCity = this.value;
        performSearch();
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeModal();
        closeRegistroModal();
        closeLoginModal();
    }
});

// ============================================
// SERVICIOS — carga dinámica (Sprint 6)
// ============================================
async function loadServices() {
    const grid     = document.getElementById('servicesGrid');
    const carousel = document.getElementById('servicesCarousel');
    const dots     = document.getElementById('servicesDots');
    if (!grid && !carousel) return;

    try {
        const data = await apiGet('/services');
        if (!data.success || !data.data.length) return;

        const cardHtml = (s, forCarousel = false) => {
            const features = Array.isArray(s.features) ? s.features : [];
            const ctaBtn = s.cta_text && s.cta_url
                ? `<a href="${escHtml(s.cta_url)}" class="inline-flex items-center gap-2 text-sm font-bold text-brand-600 hover:text-brand-800 transition">
                       ${escHtml(s.cta_text)} <i class="fas fa-arrow-right text-xs"></i>
                   </a>`
                : '';
            const wrapClass = forCarousel
                ? 'flex-shrink-0 w-[80vw] max-w-xs snap-center'
                : '';
            return `
            <div class="group ${wrapClass} bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:border-brand-200 hover:shadow-xl transition-all duration-300 flex flex-col">
                <div class="w-14 h-14 ${s.icon_bg || 'bg-brand-100'} rounded-2xl flex items-center justify-center text-2xl ${s.icon_color || 'text-brand-600'} mb-5 group-hover:scale-110 transition">
                    <i class="fas ${s.icon || 'fa-star'}"></i>
                </div>
                <h4 class="text-lg font-bold text-gray-900 mb-2">${escHtml(s.title)}</h4>
                <p class="text-sm text-gray-500 mb-4 leading-relaxed flex-1">${escHtml(s.description || '')}</p>
                ${features.length ? `
                <ul class="text-xs text-gray-500 space-y-1.5 mb-5">
                    ${features.map(f => `<li class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i> ${escHtml(f)}</li>`).join('')}
                </ul>` : ''}
                ${ctaBtn}
            </div>`;
        };

        // Desktop grid
        if (grid) grid.innerHTML = data.data.map(s => cardHtml(s, false)).join('');

        // Mobile carrusel
        if (carousel) {
            carousel.innerHTML = data.data.map(s => cardHtml(s, true)).join('');

            // Dots
            if (dots) {
                dots.innerHTML = data.data.map((s, i) =>
                    `<button onclick="scrollServiceTo(${i})" class="svc-dot w-2 h-2 rounded-full transition-all ${i === 0 ? 'bg-brand-500 w-4' : 'bg-gray-300'}" data-idx="${i}"></button>`
                ).join('');
            }

            // Actualizar dot activo al hacer scroll
            carousel.addEventListener('scroll', () => {
                const cardW = carousel.firstElementChild?.offsetWidth || 0;
                const gap = 16;
                const idx = Math.round(carousel.scrollLeft / (cardW + gap));
                document.querySelectorAll('.svc-dot').forEach((d, i) => {
                    d.classList.toggle('bg-brand-500', i === idx);
                    d.classList.toggle('w-4', i === idx);
                    d.classList.toggle('bg-gray-300', i !== idx);
                    d.classList.toggle('w-2', i !== idx);
                });
            }, { passive: true });
        }
    } catch (e) {
        console.warn('loadServices error:', e);
    }
}

function scrollServiceTo(idx) {
    const carousel = document.getElementById('servicesCarousel');
    if (!carousel) return;
    const card = carousel.children[idx];
    if (!card) return;
    // Scroll horizontal interno — NO usar scrollIntoView (arrastra la página en mobile)
    carousel.scrollTo({ left: card.offsetLeft - 16, behavior: 'smooth' });
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Promociones Home ──────────────────────────────────────────────────────────
async function loadHomePromos() {
    try {
        const res  = await fetch('/api/v2/promotions/home?limit=20');
        const data = await res.json();
        if (!data.success || !data.data.length) return;

        const section = document.getElementById('homePromos');
        const track   = document.getElementById('homePromosTrack');
        const dots    = document.getElementById('homePromosDots');
        if (!section || !track) return;

        const promos = data.data;
        let _current = 0;
        let _timer   = null;

        // Carrusel: 3 cards visibles en desktop, 2 en mobile
        // Cada "slide" es un grupo de cards
        const COLS_DESKTOP = 3;
        const COLS_MOBILE  = 2;
        // Detectar columnas actuales
        function getCols() { return window.innerWidth >= 768 ? COLS_DESKTOP : COLS_MOBILE; }

        function buildCard(p) {
            const bname = p.trade_name || p.business_name || '';
            const hasDiscount = p.discount_pct || (p.original_price && p.promo_price);
            const daysLeft = p.expires_at ? Math.max(0, Math.ceil((new Date(p.expires_at) - Date.now()) / 86400000)) : null;
            const key = `_promo_${p.id}`;
            window[key] = p;
            return `<div class="promo-card" onclick="if(typeof openPromoDrawer==='function')openPromoDrawer(window['${key}'],'home')" style="cursor:pointer;flex:none">
                <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);transition:transform .2s,box-shadow .2s;height:100%" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.14)'" onmouseout="this.style.transform='';this.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'">
                    <div style="position:relative;aspect-ratio:4/3;overflow:hidden;background:#f8fafc">
                        ${p.image_url
                            ? `<img src="${p.image_url}" alt="${(p.title||'').replace(/"/g,'')}" loading="lazy" style="width:100%;height:100%;object-fit:cover;transition:transform .3s" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform=''">`
                            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;background:linear-gradient(135deg,#fff7ed,#ffedd5)">🔥</div>`}
                        ${hasDiscount ? `<div style="position:absolute;top:10px;left:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.02em">${p.discount_pct ? '-'+p.discount_pct+'%' : 'OFERTA'}</div>` : ''}
                        ${daysLeft !== null && daysLeft <= 3 ? `<div style="position:absolute;top:10px;right:10px;background:rgba(249,115,22,0.9);backdrop-filter:blur(4px);color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px">⏰ ${daysLeft}d</div>` : ''}
                    </div>
                    <div style="padding:12px 14px 14px">
                        <h3 style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.title||''}</h3>
                        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px;flex-wrap:wrap">
                            ${p.promo_price ? `<span style="font-size:15px;font-weight:900;color:#1B3A6B">${Number(p.promo_price).toLocaleString('es-PY')} <span style="font-size:11px;font-weight:600">${p.price_label||'Gs.'}</span></span>` : ''}
                            ${p.original_price && p.promo_price ? `<span style="font-size:11px;color:#94a3b8;text-decoration:line-through">${Number(p.original_price).toLocaleString('es-PY')}</span>` : ''}
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;padding-top:8px;border-top:1px solid #f1f5f9">
                            ${p.business_logo ? `<img src="${p.business_logo}" style="width:18px;height:18px;border-radius:4px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">` : ''}
                            <span style="font-size:11px;color:#64748b;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bname}</span>
                            ${p.city ? `<span style="font-size:10px;color:#94a3b8;margin-left:auto;white-space:nowrap">${p.city}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // Insertar cards en el track
        track.innerHTML = promos.map(p => buildCard(p)).join('');

        // Sistema de carrusel: avanza de a N columnas (3 desktop, 2 mobile)
        const totalGroups = () => Math.ceil(promos.length / getCols());

        const GAP  = 16;   // debe coincidir con el gap CSS de #homePromosTrack
        const MAXW = 380;  // ancho máximo de una card (evita cards gigantes con pocas promos)
        let _cardW = 0;    // ancho actual de card en px (lo fija layout())
        const viewport = document.getElementById('homePromosViewport');

        function goToGroup(idx) {
            const cols = getCols();
            const groups = Math.ceil(promos.length / cols);
            _current = ((idx % groups) + groups) % groups;
            const offset = _current * cols * (_cardW + GAP); // px
            track.style.transform = `translateX(-${offset}px)`;
            // Actualizar dots
            document.querySelectorAll('.promo-dot').forEach((d, i) =>
                d.classList.toggle('active', i === _current));
            resetTimer();
        }

        function resetTimer() {
            if (_timer) clearInterval(_timer);
            if (promos.length > getCols()) {
                _timer = setInterval(() => goToGroup(_current + 1), 4000);
            }
        }

        // Layout responsivo en px. Cards visibles = getCols() (2 mobile / 3 desktop),
        // pero nunca más que las promos que existen. Si todo entra sin scroll, se centra
        // (evita la card suelta pegada a la izquierda con un vacío enorme al lado).
        function layout() {
            const n       = promos.length;
            const cols    = getCols();
            const visible = Math.min(cols, n);
            const contW   = (viewport ? viewport.clientWidth : track.clientWidth) || 0;
            if (!contW) return;
            let cardW = (contW - GAP * (visible - 1)) / visible;
            if (cardW > MAXW) cardW = MAXW; // no dejar cards gigantes con 1–2 promos
            if (cardW < 1)    cardW = contW;
            _cardW = cardW;
            track.querySelectorAll('.promo-card').forEach(c => { c.style.width = cardW + 'px'; c.style.flex = 'none'; });
            const trackW = n * cardW + (n - 1) * GAP;
            track.style.width = trackW + 'px';
            // Centrar cuando no hay scroll (todo entra en el viewport)
            const fits = trackW <= contW + 1;
            track.style.marginLeft     = fits ? 'auto' : '0';
            track.style.marginRight    = fits ? 'auto' : '0';
            track.style.justifyContent = fits ? 'center' : 'flex-start';
        }

        // Mostrar la sección ANTES de medir (layout necesita el ancho real del viewport)
        section.classList.remove('hidden');
        layout();
        window.addEventListener('resize', () => { layout(); goToGroup(0); });

        // Dots — uno por grupo
        if (dots) {
            const groups = Math.ceil(promos.length / getCols());
            if (groups > 1) {
                dots.innerHTML = Array.from({length: groups}, (_, i) =>
                    `<button class="promo-dot${i===0?' active':''}" onclick="window._promoCarousel&&window._promoCarousel.go(${i})"></button>`
                ).join('');
                dots.style.display = 'flex';
            }
        }

        window._promoCarousel = {
            prev: () => goToGroup(_current - 1),
            next: () => goToGroup(_current + 1),
            go:   (i) => goToGroup(i),
        };
        window.goToPromo = goToGroup;

        // Touch/swipe
        let _tx = 0;
        track.addEventListener('touchstart', e => { _tx = e.touches[0].clientX; }, { passive: true });
        track.addEventListener('touchend',   e => {
            const diff = _tx - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) goToGroup(diff > 0 ? _current + 1 : _current - 1);
        }, { passive: true });

        goToGroup(0);
        resetTimer();
    } catch(e) { /* silencioso */ }
}

async function trackPromoClick(id) {
    // Contar una sola visita por sesión por promo (apertura o cualquier CTA).
    // Evita inflar la métrica si el visitante abre/interactúa varias veces.
    try {
        const key = 'promoSeen:' + id;
        if (sessionStorage.getItem(key)) return; // ya contada en esta sesión
        sessionStorage.setItem(key, '1');
    } catch(e) { /* sessionStorage no disponible → cuenta igual, sin guard */ }
    fetch(`/api/v2/promotions/${id}/click`, { method: 'POST' }).catch(()=>{});
}

function openPromoDetail(id, bizSlug) {
    trackPromoClick(id);
    if (bizSlug && typeof openProfile === 'function') openProfile(bizSlug);
}
