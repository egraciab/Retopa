/**
 * RetoPA — Panel del Cliente
 * dashboard.js: Dashboard multi-empresa con selector
 */

let activeDashBiz = null;

async function loadDashboard() {
    if (!myBusinesses.length) {
        document.getElementById('dashBizCard').innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-building text-4xl text-gray-200 mb-3 block"></i>
                <p class="font-bold text-gray-700 mb-2">No tenés empresas registradas</p>
                <p class="text-sm text-gray-400 mb-4">Registrá tu empresa para aparecer en el directorio</p>
                <a href="/" onclick="sessionStorage.setItem('openRegistro','1')"
                    class="bg-brand-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-brand-600 transition inline-flex items-center gap-2">
                    <i class="fas fa-plus"></i> Registrar empresa
                </a>
            </div>`;
        ['kpiViews','kpiWhatsapp','kpiLikes','kpiRating'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        return;
    }

    if (!activeDashBiz) activeDashBiz = myBusinesses[0].slug;
    const biz = myBusinesses.find(b => b.slug === activeDashBiz) || myBusinesses[0];
    renderDashBizSelector(biz);

    const isPremium  = biz.plan_type === 'premium';
    const isFeatured = biz.plan_type === 'featured';
    const isBasic    = !isPremium && !isFeatured;
    const days       = parseInt(document.getElementById('chartDaysToggle')?.dataset?.days || (isPremium ? 30 : isFeatured ? 7 : 7));

    const data = await clientGet(`/client/businesses/${biz.slug}/stats?days=${days}`);

    // ── CARDS KPI — siempre históricas, no cambian con el selector ──────
    if (isBasic) {
        document.getElementById('kpiViews').textContent    = '—';
        document.getElementById('kpiWhatsapp').textContent = '—';
    } else if (data.success) {
        // Visitas: total histórico
        document.getElementById('kpiViews').textContent =
            Number(data.data.totals?.views_total || 0).toLocaleString('es-PY');
        // WhatsApp: total histórico
        const waTotalRow = (data.data.clicks_total || []).find(c => c.click_type === 'whatsapp');
        document.getElementById('kpiWhatsapp').textContent =
            Number(waTotalRow?.count || 0).toLocaleString('es-PY');
    } else {
        document.getElementById('kpiViews').textContent    = '—';
        document.getElementById('kpiWhatsapp').textContent = '—';
    }

    // Me gusta: siempre histórico
    document.getElementById('kpiLikes').textContent =
        Number(biz.like_count || 0).toLocaleString('es-PY');

    // Rating
    document.getElementById('kpiRating').textContent =
        biz.rating > 0 ? Number(biz.rating).toFixed(1) : '—';

    // Breakdown reseñas por estrella
    const breakdownEl = document.getElementById('kpiRatingBreakdown');
    if (breakdownEl && data.success && data.data.rating_breakdown?.length > 0) {
        const bd = data.data.rating_breakdown;
        const totalR = bd.reduce((s, r) => s + parseInt(r.count), 0);
        const html = [5,4,3,2,1].map(star => {
            const row = bd.find(r => parseInt(r.rating) === star);
            if (!row) return '';
            const cnt = parseInt(row.count);
            const pct = totalR > 0 ? Math.round(cnt / totalR * 100) : 0;
            return `<div class="flex items-center gap-1">
                <span class="text-amber-400 leading-none" style="font-size:8px;letter-spacing:-1px">${'★'.repeat(star)}</span>
                <div class="flex-1 bg-gray-100 rounded-full overflow-hidden" style="height:3px">
                    <div class="bg-amber-400 h-full rounded-full" style="width:${pct}%"></div>
                </div>
                <span class="text-gray-400 tabular-nums" style="font-size:9px;min-width:12px;text-align:right">${cnt}</span>
            </div>`;
        }).join('');
        if (html.trim()) {
            breakdownEl.innerHTML = html;
            breakdownEl.classList.remove('hidden');
        }
    }

    // Gráfico por plan
    const chartWrap = document.getElementById('viewsChart')?.closest('.bg-white');
    if (isBasic) {
        if (chartWrap) chartWrap.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-chart-area text-3xl text-gray-200 mb-2 block"></i>
                <p class="text-sm font-bold text-gray-600">Estadísticas disponibles desde el plan Destacado</p>
                <button onclick="openUpgradePlanModal('${biz.slug}','${biz.plan_type}')"
                    class="mt-3 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-xl font-bold hover:bg-amber-100 transition">
                    <i class="fas fa-crown mr-1"></i> Mejorar plan
                </button>
            </div>`;
    } else {
        const days = parseInt(document.getElementById('chartDaysToggle')?.dataset?.days || (isPremium ? 30 : 7));
        renderChartSection(biz, data, isPremium, isFeatured, days);
    }

    document.getElementById('dashSubtitle').textContent = `${biz.trade_name || biz.name} · Últimos 30 días`;
    const navBizLabel = document.getElementById('navBizLabel');
    if (navBizLabel) navBizLabel.textContent = biz.trade_name || biz.name || '';
    // Mostrar chevron solo si hay más de una empresa
    const chevron = document.getElementById('navBizChevron');
    if (chevron) chevron.style.display = myBusinesses.length > 1 ? '' : 'none';
}

function renderChartSection(biz, data, isPremium, isFeatured, days) {
    const wrap = document.getElementById('viewsChart')?.closest('.bg-white');
    if (!wrap) return;
    wrap.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-gray-900 text-sm">Visitas — últimos ${days} días</h3>
            ${isPremium ? `
            <div class="flex gap-1 bg-gray-100 rounded-lg p-0.5" id="chartDaysToggle" data-days="${days}">
                <button onclick="setChartDays(7)"
                    class="text-xs font-bold px-3 py-1 rounded-md transition ${days===7  ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}">7d</button>
                <button onclick="setChartDays(30)"
                    class="text-xs font-bold px-3 py-1 rounded-md transition ${days===30 ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}">30d</button>
                <button onclick="setChartDays(90)"
                    class="text-xs font-bold px-3 py-1 rounded-md transition ${days===90 ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}">90d</button>
            </div>` : `<span class="text-xs text-gray-400">${isFeatured ? 'últimos 7 días' : ''}</span>`}
        </div>
        <div id="viewsChart" style="height:100px;" class="flex items-end w-full"></div>`;

    if (data.success && data.data.views_chart?.length > 0) {
        renderViewsChart(data.data.views_chart, days);
    } else {
        document.getElementById('viewsChart').innerHTML =
            '<p class="text-sm text-gray-400 w-full text-center self-center py-4">Sin datos aún</p>';
    }
}

function setChartDays(days) {
    const toggle = document.getElementById('chartDaysToggle');
    if (toggle) toggle.dataset.days = days;
    loadDashboard();
}

function switchDashBiz(slug) {
    activeDashBiz = slug;
    // Actualizar el selector maestro de la barra superior
    const biz = (myBusinesses || []).find(b => b.slug === slug);
    if (biz && typeof updateNavBizDisplay === 'function') updateNavBizDisplay(biz);
    // Resetear KPIs a estado neutro
    ['kpiViews','kpiWhatsapp','kpiLikes','kpiRating'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    // Limpiar el chart sin destruir el id — solo vaciar el canvas
    const chartEl = document.getElementById('viewsChart');
    if (chartEl) chartEl.innerHTML = '';
    loadDashboard();
}

function renderDashBizSelector(activeBiz) {
    const container = document.getElementById('dashBizCard');
    if (!container) return;
    // El selector maestro en la barra superior maneja el cambio de empresa.
    // Aquí solo mostramos la mini-card de la empresa activa.
    container.innerHTML = renderBizMiniCard(activeBiz);
}

function renderBizMiniCard(biz) {
    return `
        <div class="flex items-start gap-4 pt-4 border-t border-gray-100">
            ${biz.image_url
                ? `<img src="${escHtml(biz.image_url)}" class="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-100">`
                : `<div class="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl font-black text-white" style="background:#0ea5e9">${(biz.name||'E').charAt(0)}</div>`
            }
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-bold text-gray-900">${escHtml(biz.trade_name || biz.name)}</h3>
                    <span class="text-xs px-2 py-0.5 rounded-full font-bold ${getPlanColor(biz.plan_type)}">${getPlanLabel(biz.plan_type)}</span>
                    ${biz.verified
                        ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><i class="fas fa-check-circle text-[10px]"></i> Verificada</span>'
                        : '<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Sin verificar</span>'}
                </div>
                <p class="text-sm text-gray-500 mt-0.5">${escHtml(biz.city || '')}${biz.category_name ? ` · ${escHtml(biz.category_name)}` : ''}</p>
                <div class="flex gap-3 mt-3 flex-wrap">
                    <a href="/empresa/${biz.slug}" target="_blank"
                        class="text-xs text-brand-600 hover:underline flex items-center gap-1">
                        <i class="fas fa-external-link-alt"></i> Ver ficha pública
                    </a>
                    <button onclick="showSection('businesses')"
                        class="text-xs text-gray-500 hover:text-brand-600 flex items-center gap-1">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    ${biz.plan_type !== 'premium' ? `
                    <button onclick="openUpgradePlanModal('${biz.slug}', '${biz.plan_type}')"
                        class="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 font-bold">
                        <i class="fas fa-crown"></i> Mejorar plan
                    </button>` : ''}
                </div>
            </div>
        </div>
        ${renderQualityWidget(biz)}
        ${renderAchievements(biz)}`;
}

function renderViewsChart(chartData, days = 30) {
    const container = document.getElementById('viewsChart');
    if (!container) return;
    if (!chartData?.length) {
        container.innerHTML = '<p class="text-sm text-gray-400 w-full text-center self-center py-4">Sin datos aún</p>';
        return;
    }

    // Construir array de N días
    const allDays = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const found = chartData.find(c => {
            const s = typeof c.day === 'string' ? c.day : (c.day?.toISOString?.() || '');
            return s.startsWith(key);
        });
        allDays.push({ day: key, count: found ? parseInt(found.count) : 0 });
    }

    const max   = Math.max(...allDays.map(d => d.count), 1);
    const avg   = allDays.reduce((s, d) => s + d.count, 0) / allDays.length;
    const yPad  = 6; // margen superior en px del área de valores
    // Dimensiones SVG con espacio para eje Y
    const yAxisW = 24, W = 600, H = 100, padT = 8, padB = 22, padR = 6;
    const innerW = W - yAxisW - padR;
    const innerH = H - padT - padB;
    const xStep  = allDays.length > 1 ? innerW / (allDays.length - 1) : 0;
    const ox = yAxisW; // x origin

    // Función Y: mapea count → coordenada SVG
    const Y = count => padT + innerH - ((count / max) * (innerH - yPad));
    const X = i => ox + i * xStep;

    const pts = allDays.map((d, i) => ({ x: X(i), y: Y(d.count), count: d.count, day: d.day }));

    // Bezier suavizado
    function smoothD(pts) {
        if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const dx = (pts[i].x - pts[i-1].x) / 2.8;
            d += ` C${pts[i-1].x+dx},${pts[i-1].y} ${pts[i].x-dx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
        }
        return d;
    }

    const line = smoothD(pts);
    const area = line + ` L${pts.at(-1).x},${padT+innerH} L${ox},${padT+innerH} Z`;

    // Línea de promedio
    const avgY  = Y(avg);
    const avgLine = `M${ox},${avgY} L${W - padR},${avgY}`;

    // Ticks del eje Y (0, max/2, max)
    const yTicks = [0, Math.round(max/2), max].map(v => ({
        v, y: Y(v), label: v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)
    }));

    // Labels eje X
    const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : 7;
    const xLabels = pts.map((p, i) => {
        if (i % labelEvery !== 0 && i !== pts.length - 1) return '';
        const l = new Date(p.day + 'T00:00:00').toLocaleDateString('es-PY', { day:'numeric', month:'short' });
        const anchor = i === 0 ? 'start' : i === pts.length-1 ? 'end' : 'middle';
        return `<text x="${p.x}" y="${H-3}" text-anchor="${anchor}" font-size="8" fill="#94a3b8">${l}</text>`;
    }).join('');

    const dots = pts.filter(p => p.count > 0).map(p =>
        `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#0ea5e9" stroke="white" stroke-width="1.5">
            <title>${p.day}: ${p.count} visita${p.count !== 1 ? 's' : ''}</title>
        </circle>`).join('');

    container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100px;display:block;overflow:visible">
        <defs>
            <linearGradient id="areaG${days}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.20"/>
                <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.01"/>
            </linearGradient>
        </defs>
        <!-- Eje Y: ticks y labels -->
        ${yTicks.map(t => `
            <line x1="${ox}" y1="${t.y}" x2="${W-padR}" y2="${t.y}" stroke="#f1f5f9" stroke-width="1"/>
            <text x="${ox - 3}" y="${t.y + 3}" text-anchor="end" font-size="8" fill="#cbd5e1">${t.label}</text>
        `).join('')}
        <!-- Línea de promedio -->
        <path d="${avgLine}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"/>
        <text x="${W - padR + 2}" y="${avgY + 3}" font-size="7" fill="#f59e0b" opacity="0.9">avg</text>
        <!-- Área -->
        <path d="${area}" fill="url(#areaG${days})"/>
        <!-- Línea principal -->
        <path d="${line}" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Puntos -->
        ${dots}
        <!-- Labels X -->
        ${xLabels}
    </svg>`;
}

/**
 * PROFILE_ITEMS — copy (label/ícono/tip) por 'key'. ÚNICA responsabilidad del
 * frontend: presentación. El 'done', el peso y el % los decide el backend
 * (fn_profile_completion). Sin re-implementar la lógica del score.
 */
const PROFILE_ITEMS = {
    phone:       { label: 'Teléfono / WhatsApp',  icon: 'fa-phone',          tip: 'Sin un contacto visible los clientes no pueden escribirte.' },
    description: { label: 'Descripción',          icon: 'fa-align-left',     tip: 'Una buena descripción mejora tu posición en las búsquedas.' },
    image:       { label: 'Logo / foto',          icon: 'fa-image',          tip: 'Las fichas con logo reciben hasta 3x más visitas.' },
    location:    { label: 'Ubicación en el mapa', icon: 'fa-map-marker-alt', tip: 'Con ubicación aparecés en las búsquedas por cercanía.' },
    email:       { label: 'Email',                icon: 'fa-envelope',       tip: 'Sumá un email de contacto para dar más confianza.' },
    website:     { label: 'Sitio o red social',   icon: 'fa-globe',          tip: 'Un sitio o red social refuerza la credibilidad de tu ficha.' },
    hours:       { label: 'Horario',              icon: 'fa-clock',          tip: 'Mostrar tu horario genera confianza y menos consultas.' },
};

/* ============================================================
 * Onboarding 2/3 — Checklist accionable: deep-link al campo exacto
 * del editor de la ficha. NO reimplementa el editor: reusa
 * openEditBiz() + switchEditTab() que ya existen.
 * ============================================================ */

// key de fn_profile_completion → { pestaña del editor, id del elemento a resaltar/enfocar }
const PROFILE_FIELD_MAP = {
    phone:       { tab: 'contact',  focus: 'editPhone'    },
    description: { tab: 'general',  focus: 'editDesc'     },
    image:       { tab: 'media',    focus: 'editLogoBox'  },
    location:    { tab: 'location', focus: 'editGeocodeBtn' },
    email:       { tab: 'contact',  focus: 'editEmail'    },
    website:     { tab: 'contact',  focus: 'editWebsite'  },
    hours:       { tab: 'general',  focus: 'hoursWidget'  },
};

/**
 * goToProfileField(slug, key) — abre el editor de la ficha, salta a la
 * pestaña correcta y resalta/enfoca el campo pendiente. Robusto: si algo
 * no está disponible, cae a la sección "Mis empresas".
 */
async function goToProfileField(slug, key) {
    // cerrar overlays de onboarding que puedan tapar el modal
    if (typeof closeWelcomeWizard === 'function') closeWelcomeWizard();
    if (typeof closeOnboardNudge === 'function') closeOnboardNudge();

    if (typeof openEditBiz !== 'function') {
        if (typeof showSection === 'function') showSection('businesses');
        return;
    }
    try { await openEditBiz(slug); }
    catch (e) { if (typeof showSection === 'function') showSection('businesses'); return; }

    const map = PROFILE_FIELD_MAP[key];
    if (!map) return;

    // saltar a la pestaña (buscar su botón para marcarlo activo)
    const tabBtn = document.querySelector(`#editBizModal .mobile-tab[onclick*="'${map.tab}'"]`);
    if (typeof switchEditTab === 'function') switchEditTab(map.tab, tabBtn);

    // esperar a que el panel/animación del bottom-sheet asiente, luego scroll + resaltar
    setTimeout(() => {
        const el = document.getElementById(map.focus);
        if (!el) return;
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
        highlightField(el);
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.type !== 'hidden') {
            try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (_) {} }
        }
    }, 300);
}

let _rpOnboardStyle = false;
function ensureOnboardStyle() {
    if (_rpOnboardStyle) return; _rpOnboardStyle = true;
    const s = document.createElement('style');
    s.textContent = `
      @keyframes rpFieldGlow {
        0%   { box-shadow: 0 0 0 0 rgba(79,70,229,.45); }
        70%  { box-shadow: 0 0 0 9px rgba(79,70,229,0); }
        100% { box-shadow: 0 0 0 0 rgba(79,70,229,0); }
      }
      .rp-field-glow {
        animation: rpFieldGlow 1.3s ease-out 2;
        outline: 2px solid #4F46E5 !important;
        outline-offset: 3px;
        border-radius: 12px;
      }`;
    document.head.appendChild(s);
}

function highlightField(el) {
    ensureOnboardStyle();
    el.classList.add('rp-field-glow');
    setTimeout(() => el.classList.remove('rp-field-glow'), 2700);
}

/**
 * renderQualityWidget(biz) — v3 completitud (S29/S30)
 * Consume biz.completion (fn_profile_completion del backend):
 *   { completion:0-100, verified:bool, items:[{key,done,weight}] }
 * Círculo con % autocompletable + sello "Verificado" APARTE + desglose + tip contextual.
 */
function renderQualityWidget(biz) {
    const comp  = biz.completion || {};
    const items = Array.isArray(comp.items) ? comp.items : [];
    const pct   = Number(comp.completion) || 0;
    const verified = !!comp.verified;

    const qColor = pct >= 100 ? '#22c55e' : pct >= 55 ? '#E8B84B' : pct >= 30 ? '#fb923c' : '#d1d5db';
    const qEmoji = pct >= 100 ? '✨' : pct >= 55 ? '🔥' : pct >= 30 ? '⚡' : '🌱';
    const qTitle = pct >= 100 ? '¡Ficha completa!' : pct >= 55 ? 'Perfil en buen camino' : pct >= 30 ? 'Perfil básico' : 'Perfil incompleto';
    const qSub   = pct >= 100 ? 'Tu ficha tiene todo lo importante cargado.' : 'Completá tu perfil para aparecer primero en los resultados.';

    const circumference = 2 * Math.PI * 22;
    const dash = (pct / 100) * circumference;

    // Ítem pendiente de mayor peso → sugerencia contextual (S30)
    const pending  = items.filter(i => !i.done).sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const next     = pending[0] || null;
    const nextMeta = next ? (PROFILE_ITEMS[next.key] || { label: next.key, tip: '' }) : null;

    // Sello "Verificado" — separado del % de completitud (decisión 1A)
    const seal = verified
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#0ea5e9;background:#e0f2fe;padding:2px 8px;border-radius:999px"><i class="fas fa-circle-check"></i> Verificado</span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#94a3b8;background:#f1f5f9;padding:2px 8px;border-radius:999px"><i class="fas fa-hourglass-half"></i> Verificación pendiente</span>`;

    return `
    <div class="mt-4 pt-4 border-t border-gray-100">
        <div class="flex items-center gap-5">
            <!-- Círculo grande -->
            <div class="relative flex-shrink-0" style="width:64px;height:64px">
                <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)">
                    <circle cx="32" cy="32" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
                    <circle cx="32" cy="32" r="22" fill="none" stroke="${qColor}" stroke-width="6"
                        stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
                        stroke-linecap="round"
                        style="transition:stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0">
                    <span style="font-size:16px;line-height:1">${qEmoji}</span>
                    <span style="font-size:11px;font-weight:800;color:${qColor};line-height:1.2">${pct}%</span>
                </div>
            </div>
            <!-- Título + sello + subtítulo -->
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-bold text-gray-900 text-sm">${qTitle}</p>
                    ${seal}
                </div>
                <p class="text-xs text-gray-400 mt-0.5 leading-snug">${qSub}</p>
                ${next ? `
                <button onclick="goToProfileField('${biz.slug}','${next.key}')"
                    class="mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                    style="background:${qColor}18;color:${qColor}">
                    <i class="fas fa-arrow-right text-[10px]"></i> Completar perfil
                </button>` : ''}
            </div>
        </div>

        ${nextMeta ? `
        <!-- Sugerencia contextual (S30): próximo ítem de mayor impacto — clickable (deep-link) -->
        <button type="button" onclick="goToProfileField('${biz.slug}','${next.key}')"
            class="mt-3 w-full flex items-start gap-2 rounded-xl p-3 text-left transition hover:brightness-95"
            style="background:#f8fafc;border:1px solid #eef2f7;cursor:pointer">
            <i class="fas fa-lightbulb text-amber-400 mt-0.5"></i>
            <div class="text-xs text-gray-600 leading-snug flex-1">
                <span class="font-bold text-gray-800">Siguiente paso:</span>
                agregá ${nextMeta.label.toLowerCase()} <span class="font-semibold" style="color:${qColor}">(+${next.weight}%)</span>. ${nextMeta.tip}
            </div>
            <i class="fas fa-chevron-right text-gray-300 text-[10px] mt-0.5"></i>
        </button>` : ''}

        <!-- Checklist: ítems pendientes son clickables (llevan al campo exacto) -->
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
            ${items.map(item => {
                const meta = PROFILE_ITEMS[item.key] || { label: item.key, icon: 'fa-circle' };
                const inner = `
                    <div style="width:18px;height:18px;border-radius:50%;background:${item.done ? '#dcfce7' : '#eef2ff'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <i class="fas ${item.done ? 'fa-check' : meta.icon} text-[9px]" style="color:${item.done ? '#22c55e' : '#4F46E5'}"></i>
                    </div>
                    <span class="text-xs ${item.done ? 'text-gray-700' : 'text-gray-600'}">${meta.label}</span>
                    <span class="text-[10px] font-bold ml-auto" style="color:${item.done ? '#22c55e' : '#4F46E5'}">${item.done ? '' : '+'}${item.done ? '<i class=\'fas fa-check\'></i>' : item.weight + '%'}</span>`;
                return item.done
                    ? `<div class="flex items-center gap-2">${inner}</div>`
                    : `<button type="button" onclick="goToProfileField('${biz.slug}','${item.key}')"
                            class="flex items-center gap-2 text-left rounded-lg -mx-1 px-1 py-0.5 transition hover:bg-indigo-50"
                            title="Completar: ${meta.label}" style="cursor:pointer">${inner}</button>`;
            }).join('')}
        </div>
    </div>`;
}

/* ============================================================
 * S29 — Onboarding: wizard de bienvenida (3 pasos) + nudge in-app
 * Reusa PROFILE_ITEMS y biz.completion (fn_profile_completion).
 * ============================================================ */

function openWelcomeWizard(biz) {
    if (!biz || document.getElementById('welcomeWizard')) return;
    const comp    = biz.completion || {};
    const pct     = Number(comp.completion) || 0;
    const items   = Array.isArray(comp.items) ? comp.items : [];
    const pending = items.filter(i => !i.done).sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const allDone = pending.length === 0;
    const uName   = (typeof currentUser !== 'undefined' && currentUser && currentUser.name)
        || (localStorage.getItem('user') && JSON.parse(localStorage.getItem('user')).name) || '';
    const first   = (uName || '').split(' ')[0] || '';

    const topPending = pending.slice(0, 3).map(p => {
        const m = PROFILE_ITEMS[p.key] || { label: p.key, icon: 'fa-circle', tip: '' };
        return `
        <button type="button" onclick="goToProfileField('${biz.slug}','${p.key}')"
            style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #eef2f7;border-radius:12px;margin-bottom:8px;width:100%;text-align:left;background:#fff;cursor:pointer;transition:background .15s"
            onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
            <div style="width:30px;height:30px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${m.icon}" style="color:#4F46E5"></i></div>
            <div style="flex:1">
                <div style="font-size:13px;font-weight:700;color:#0f172a">${m.label} <span style="color:#16a34a;font-weight:800">+${p.weight}%</span></div>
                <div style="font-size:12px;color:#64748b;line-height:1.35">${m.tip}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:#cbd5e1;font-size:11px;margin-top:4px"></i>
        </button>`;
    }).join('');

    const div = document.createElement('div');
    div.id = 'welcomeWizard';
    div.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.55);padding:16px';
    div.innerHTML = `
      <div style="background:#fff;border-radius:22px;max-width:440px;width:100%;max-height:90vh;max-height:90dvh;overflow-y:auto;box-shadow:0 25px 60px rgba(0,0,0,.3)">
        <div style="height:4px;background:#eef2f7"><div id="wizBar" style="height:100%;width:33%;background:#4F46E5;transition:width .3s"></div></div>
        <div style="padding:24px">
          <div class="wiz-step" data-step="1">
            <div style="font-size:34px">👋</div>
            <h3 style="font-size:20px;font-weight:900;color:#0f172a;margin:6px 0 4px">¡Bienvenido${first ? `, ${first}` : ''}!</h3>
            <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 14px">Tu empresa ya está en RetoPA. Completá tu ficha para aparecer primero en las búsquedas y generar más confianza.</p>
            <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:14px">
              <div style="font-size:26px;font-weight:900;color:${pct >= 100 ? '#22c55e' : '#4F46E5'}">${pct}%</div>
              <div style="font-size:12px;color:#64748b">de tu ficha está completa.<br>${allDone ? '¡Está impecable! 🎉' : 'Te faltan solo unos datos.'}</div>
            </div>
          </div>
          <div class="wiz-step" data-step="2" style="display:none">
            <h3 style="font-size:18px;font-weight:900;color:#0f172a;margin:0 0 4px">${allDone ? 'Tu ficha está completa 🎉' : 'Lo que te falta'}</h3>
            <p style="font-size:12px;color:#64748b;margin:0 0 12px">${allDone ? 'No necesitás cargar nada más por ahora.' : 'Empezá por lo de mayor impacto:'}</p>
            ${allDone ? '' : topPending}
          </div>
          <div class="wiz-step" data-step="3" style="display:none">
            <div style="font-size:34px">🚀</div>
            <h3 style="font-size:18px;font-weight:900;color:#0f172a;margin:6px 0 4px">¡Listo para empezar!</h3>
            <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 8px">Completá tu ficha desde “Mis empresas”. Cada dato que sumás mejora tu posición en el directorio.</p>
          </div>
          <div style="display:flex;gap:10px;margin-top:18px">
            <button id="wizBack" onclick="wizardStep(-1)" style="display:none;flex:0 0 auto;background:#f1f5f9;color:#475569;border:none;border-radius:12px;padding:12px 16px;font-weight:700;font-size:14px;cursor:pointer">Atrás</button>
            <button id="wizNext" onclick="wizardStep(1)" style="flex:1;background:#4F46E5;color:#fff;border:none;border-radius:12px;padding:12px;font-weight:800;font-size:14px;cursor:pointer">Siguiente</button>
          </div>
          <button onclick="closeWelcomeWizard()" style="display:block;margin:10px auto 0;background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer">Omitir por ahora</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    div._step = 1; div._max = 3;
    // Guardar destino para el botón final "Completar mi ficha" (deep-link al ítem de mayor impacto)
    div.dataset.slug   = biz.slug || '';
    div.dataset.topKey = (pending[0] && pending[0].key) || '';
}

function wizardStep(dir) {
    const w = document.getElementById('welcomeWizard'); if (!w) return;
    let step = (w._step || 1) + dir;
    if (step < 1) step = 1;
    if (step > w._max) {
        const slug = w.dataset.slug, topKey = w.dataset.topKey;
        closeWelcomeWizard();
        if (slug && topKey && typeof goToProfileField === 'function') goToProfileField(slug, topKey);
        else if (typeof showSection === 'function') showSection('businesses');
        return;
    }
    w._step = step;
    w.querySelectorAll('.wiz-step').forEach(el => { el.style.display = (Number(el.dataset.step) === step) ? '' : 'none'; });
    const bar = w.querySelector('#wizBar');  if (bar)  bar.style.width = (step / w._max * 100) + '%';
    const back = w.querySelector('#wizBack'); if (back) back.style.display = step > 1 ? '' : 'none';
    const next = w.querySelector('#wizNext'); if (next) next.textContent = step === w._max ? 'Completar mi ficha' : 'Siguiente';
}

function closeWelcomeWizard() { document.getElementById('welcomeWizard')?.remove(); }

// Nudge in-app: banner de completitud (descartable por día)
function showOnboardingNudge(biz) {
    if (!biz) return;
    const comp = biz.completion || {};
    const pct  = Number(comp.completion) || 0;
    if (pct >= 100) return;
    const items   = Array.isArray(comp.items) ? comp.items : [];
    const pending = items.filter(i => !i.done).sort((a, b) => (b.weight || 0) - (a.weight || 0));
    if (!pending.length) return;

    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem('retopa_nudge_off') === today) return; } catch (e) {}

    const mount = document.getElementById('mainContent');
    if (!mount || document.getElementById('onboardNudge')) return;

    const top  = pending[0];
    const meta = PROFILE_ITEMS[top.key] || { label: top.key };
    const bar  = document.createElement('div');
    bar.id = 'onboardNudge';
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,#eef2ff,#faf5ff);border:1px solid #e0e7ff;border-radius:14px;padding:10px 14px;margin:0 0 14px';
    bar.innerHTML = `
        <div style="width:30px;height:30px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-lightbulb" style="color:#f59e0b"></i></div>
        <div style="flex:1;font-size:13px;color:#334155;line-height:1.3">Te falta <b>${(meta.label || '').toLowerCase()}</b> en tu ficha — sumá <b style="color:#16a34a">+${top.weight}%</b>.</div>
        <button onclick="goToProfileField('${biz.slug}','${top.key}')" style="background:#4F46E5;color:#fff;border:none;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Completar</button>
        <button onclick="closeOnboardNudge(true)" title="No mostrar hoy" style="background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;line-height:1">✕</button>`;
    mount.insertBefore(bar, mount.firstChild);
}

function closeOnboardNudge(persist) {
    document.getElementById('onboardNudge')?.remove();
    if (persist) { try { localStorage.setItem('retopa_nudge_off', new Date().toISOString().slice(0, 10)); } catch (e) {} }
}

/* ============================================================
 * S30 — Gamificación soft: panel de Logros (insignias por hitos)
 * Usa datos que ya trae /client/businesses. Puramente motivacional.
 *
 * S31 — Logros CONFIGURABLES desde el Admin (site_config.achievements_config).
 * La MÉTRICA de cada logro es fija (por id); el Admin sólo edita presentación,
 * umbral y on/off. Si no hay config (o es inválida) → se usan estos DEFAULTS,
 * que son EXACTAMENTE el comportamiento anterior (cero regresión).
 * ⚠ Mantener ACH_DEFAULTS y achMergeConfig() idénticos en admin/js/achievements.js
 * ============================================================ */
// metric → cómo se calcula "logrado":
//   completion_pct : pct >= threshold        verified : !!verified (sin umbral)
//   rating_reviews : rating >= threshold && reviews >= minReviews
//   reviews/likes/views_30d : valor >= threshold     boosted : boosted (sin umbral)
// hint admite placeholders {umbral} y {min_reviews} → se reemplazan por el valor
// vigente al renderizar (así el texto sigue al umbral cuando el Admin lo cambia).
const ACH_DEFAULTS = [
    { id:'ficha_completa', metric:'completion_pct', enabled:true, label:'Ficha completa', icon:'fa-clipboard-check', color:'#22c55e', hint:'Completá tu ficha al {umbral}%',        threshold:100 },
    { id:'verificado',     metric:'verified',       enabled:true, label:'Verificado',     icon:'fa-circle-check',    color:'#0ea5e9', hint:'Verificación del equipo RetoPA' },
    { id:'bien_valorado',  metric:'rating_reviews', enabled:true, label:'Bien valorado',  icon:'fa-star',            color:'#f59e0b', hint:'Promedio {umbral}+ con {min_reviews} o más reseñas', threshold:4.5, minReviews:3 },
    { id:'con_resenas',    metric:'reviews',        enabled:true, label:'Con reseñas',    icon:'fa-comment-dots',    color:'#8b5cf6', hint:'Recibí al menos {umbral} reseña(s)',   threshold:1 },
    { id:'querido',        metric:'likes',          enabled:true, label:'Querido',        icon:'fa-heart',           color:'#ef4444', hint:'Sumá {umbral} “me gusta”',            threshold:10 },
    { id:'en_movimiento',  metric:'views_30d',      enabled:true, label:'En movimiento',  icon:'fa-eye',             color:'#14b8a6', hint:'{umbral}+ visitas en 30 días',         threshold:100 },
    { id:'impulso_activo', metric:'boosted',        enabled:true, label:'Impulso activo', icon:'fa-rocket',          color:'#4F46E5', hint:'Se activa al completar tu ficha: más visibilidad por 7 días' },
];

// Reemplaza {umbral}/{min_reviews} en el texto de la pista por los valores actuales.
function achFillHint(a) {
    return String(a.hint || '')
        .replace(/\{umbral\}/g,      a.threshold  != null ? a.threshold  : '')
        .replace(/\{min_reviews\}/g, a.minReviews != null ? a.minReviews : '');
}

// Overlay de la config guardada (parcial/inválida-tolerante) sobre los DEFAULTS,
// respetando id y metric fijos. Devuelve la lista ordenada por 'order'.
function achMergeConfig(saved) {
    const byId = {};
    if (Array.isArray(saved)) saved.forEach(s => { if (s && s.id) byId[s.id] = s; });
    return ACH_DEFAULTS.map((d, i) => {
        const s = byId[d.id] || {};
        const okColor = typeof s.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s.color);
        return {
            id: d.id, metric: d.metric,
            enabled:    (s.enabled != null ? !!s.enabled : d.enabled),
            label:      (typeof s.label === 'string' && s.label.trim()) ? s.label : d.label,
            hint:       (typeof s.hint  === 'string') ? s.hint : d.hint,
            icon:       (typeof s.icon  === 'string' && s.icon.trim()) ? s.icon.trim() : d.icon,
            color:      okColor ? s.color : d.color,
            threshold:  (s.threshold  != null && isFinite(s.threshold))  ? Number(s.threshold)  : d.threshold,
            minReviews: (s.minReviews != null && isFinite(s.minReviews)) ? Number(s.minReviews) : d.minReviews,
            order:      (s.order != null && isFinite(s.order)) ? Number(s.order) : i,
        };
    }).sort((a, b) => a.order - b.order);
}

// ¿El negocio cumple el logro? (métrica fija por id)
function achIsDone(a, m) {
    switch (a.metric) {
        case 'completion_pct': return m.pct >= a.threshold;
        case 'verified':       return m.verified;
        case 'rating_reviews': return m.rating >= a.threshold && m.reviews >= (a.minReviews || 0);
        case 'reviews':        return m.reviews >= a.threshold;
        case 'likes':          return m.likes >= a.threshold;
        case 'views_30d':      return m.views >= a.threshold;
        case 'boosted':        return m.boosted;
        default:               return false;
    }
}

// Lee y parsea site_config.achievements_config (guardado por app.js en global).
function achGetConfig() {
    try {
        const raw = (window._retopaSiteConfig || {}).achievements_config;
        if (!raw) return null;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : null;
    } catch (e) { return null; }
}

function renderAchievements(biz) {
    const comp    = biz.completion || {};
    const m = {
        pct:     Number(comp.completion) || 0,
        rating:  Number(biz.rating) || 0,
        reviews: Number(biz.review_count) || 0,
        likes:   Number(biz.like_count) || 0,
        views:   Number(biz.views_30d) || 0,
        verified: !!biz.verified,
        boosted: !!biz.boosted || (biz.boost_until && new Date(biz.boost_until) > new Date()),
    };

    // Config del Admin (o defaults). Sólo los logros habilitados.
    const A = achMergeConfig(achGetConfig())
        .filter(a => a.enabled)
        .map(a => ({ label: a.label, icon: a.icon, color: a.color, hint: achFillHint(a), done: achIsDone(a, m) }));

    if (!A.length) return ''; // si el Admin apagó todos, no se muestra el panel
    const earned = A.filter(a => a.done).length;

    return `
    <div class="mt-4 pt-4 border-t border-gray-100">
        <div class="flex items-center justify-between mb-3">
            <p class="font-bold text-gray-900 text-sm"><i class="fas fa-medal text-amber-400 mr-1"></i> Logros</p>
            <span class="text-xs text-gray-400">${earned}/${A.length}</span>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
            ${A.map(a => `
            <div title="${a.hint}" style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border-radius:12px;border:1px solid ${a.done ? a.color + '33' : '#eef2f7'};background:${a.done ? a.color + '10' : '#fff'}">
                <div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${a.done ? a.color : '#f1f5f9'}">
                    <i class="fas ${a.icon}" style="color:${a.done ? '#fff' : '#cbd5e1'};font-size:14px"></i>
                </div>
                <span style="font-size:10px;font-weight:700;text-align:center;line-height:1.15;color:${a.done ? '#0f172a' : '#94a3b8'}">${a.label}</span>
            </div>`).join('')}
        </div>
        <details style="margin-top:10px">
            <summary style="cursor:pointer;font-size:12px;color:#64748b;font-weight:600;outline:none">¿Qué significa cada logro?</summary>
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;padding-left:2px">
                ${A.map(a => `
                <div style="display:flex;gap:8px;align-items:flex-start;font-size:11px;color:#64748b;line-height:1.35">
                    <i class="fas ${a.icon}" style="color:${a.color};width:14px;text-align:center;margin-top:1px;flex-shrink:0"></i>
                    <span><b style="color:#0f172a">${a.label}:</b> ${a.hint}.</span>
                </div>`).join('')}
            </div>
        </details>
    </div>`;
}
