/**
 * RetoPA Admin — js/dashboard.js
 * Dashboard stats y métricas
 */

// Estado del panel de servidor / gráfico de CPU (declarado arriba para hoisting)
let _cpuHistory = [];
let _cpuChartInstance = null;
let _serverPanelBuilt = false;

async function loadDashboard() {
    _serverPanelBuilt = false;  // forzar reconstrucción del panel servidor (DOM nuevo)
    loadMonetization();         // D8.1 — bloque de monetización + usuarios conectados (en paralelo)
    loadRegBannerStats();       // Medición del banner de captación (en paralelo)
    const data = await apiAdminGet('/dashboard');
    if (!data.success) { showToast('Error cargando dashboard', 'error'); return; }

    const s = data.stats;
    document.getElementById('statTotalBusinesses').textContent = parseInt(s.total_businesses || 0).toLocaleString();
    document.getElementById('statFeatured').textContent = (parseInt(s.featured_plan || 0) + parseInt(s.premium_plan || 0)).toLocaleString();
    document.getElementById('statTotalUsers').textContent = parseInt(s.total_users || 0).toLocaleString();
    document.getElementById('statPendingLeads').textContent = parseInt(s.pending_leads || 0).toLocaleString();
    document.getElementById('statVerified').textContent = parseInt(s.verified || 0).toLocaleString();
    document.getElementById('statPendingVerif').textContent = parseInt(s.pending_verification || 0).toLocaleString();
    document.getElementById('statReviews').textContent = parseInt(s.total_reviews || 0).toLocaleString();

    // Revenue estimado en la card de planes pagos
    const revenueEl = document.getElementById('statRevenueEstimated');
    if (revenueEl && s.estimated_monthly_revenue !== undefined) {
        revenueEl.textContent = 'Gs. ' + parseInt(s.estimated_monthly_revenue).toLocaleString('es-PY');
    }

    const badge = document.getElementById('leadsBadge');
    if (parseInt(s.pending_leads || 0) > 0) {
        badge.textContent = s.pending_leads; badge.classList.remove('hidden');
        document.getElementById('notifBadge').classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    const total = parseInt(s.total_businesses) || 1;
    const basicPct = Math.round((parseInt(s.basic_plan || 0) / total) * 100);
    const featPct  = Math.round((parseInt(s.featured_plan || 0) / total) * 100);
    const premPct  = Math.round((parseInt(s.premium_plan || 0) / total) * 100);

    const fp = parseInt(s.featured_price || 299000);
    const pp = parseInt(s.premium_price  || 599000);

    document.getElementById('planDistribution').innerHTML = `
        <div class="flex items-center gap-3"><span class="text-xs text-gray-500 w-16">Básico</span><div class="flex-1 bg-gray-100 rounded-full h-2"><div class="bg-gray-400 h-2 rounded-full" style="width:${basicPct}%"></div></div><span class="text-xs text-gray-700 w-8 text-right">${s.basic_plan||0}</span></div>
        <div class="flex items-center gap-3"><span class="text-xs text-gray-500 w-16">Destacado</span><div class="flex-1 bg-gray-100 rounded-full h-2"><div class="bg-amber-400 h-2 rounded-full" style="width:${featPct}%"></div></div><span class="text-xs text-gray-700 w-8 text-right">${s.featured_plan||0}</span></div>
        <div class="flex items-center gap-3"><span class="text-xs text-gray-500 w-16">Pro</span><div class="flex-1 bg-gray-100 rounded-full h-2"><div class="bg-[#0ea5e9] h-2 rounded-full" style="width:${premPct}%"></div></div><span class="text-xs text-gray-700 w-8 text-right">${s.premium_plan||0}</span></div>
        <div class="border-t border-gray-100 pt-3 mt-1">
            <div class="flex justify-between text-xs text-gray-500 mb-1">
                <span>Destacado × ${s.featured_plan||0}</span>
                <span class="font-bold text-amber-600">Gs. ${(parseInt(s.featured_plan||0) * fp).toLocaleString('es-PY')}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-500">
                <span>Pro × ${s.premium_plan||0}</span>
                <span class="font-bold text-[#0ea5e9]">Gs. ${(parseInt(s.premium_plan||0) * pp).toLocaleString('es-PY')}</span>
            </div>
        </div>`;

    // Gráfico de ingresos por mes
    renderRevenueChart(data.revenueByMonth || []);

    // Panel servidor
    if (data.serverStats && data.serverStats.node_version) window._nodeVer = data.serverStats.node_version;
    renderServerStats(data.serverStats);

    // Arrancar actualización en tiempo real (server + conexiones)
    startLivePolling();

    document.getElementById('topCategories').innerHTML = (data.topCategories || []).map((c, i) => `
        <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-gray-400 w-4">${i + 1}</span>
            <span class="text-sm text-gray-700 flex-1">${escapeHtml(c.name)}</span>
            <span class="text-xs font-bold text-[#0ea5e9]">${c.business_count.toLocaleString('es-PY')} emp.</span>
        </div>
    `).join('') || '<p class="text-gray-400 text-sm">Sin datos</p>';

    // Embudo de leads + contadores de altas + line chart de crecimiento
    renderLeadsFunnel(data.leadsFunnel || []);
    loadGrowth(currentGrowthRange); // Pulso del directorio con el rango elegido (default 1 mes)
    if (data.bizRecent) {
        const d7 = document.getElementById('bizD7'), d30 = document.getElementById('bizD30');
        if (d7)  d7.textContent  = (data.bizRecent.d7  || 0).toLocaleString('es-PY');
        if (d30) d30.textContent = (data.bizRecent.d30 || 0).toLocaleString('es-PY');
    }

    const activities = [];
    if (data.recentBusinesses && data.recentBusinesses.length) {
        const b = data.recentBusinesses[0];
        activities.push(`<div class="flex items-center gap-2 text-sm"><i class="fas fa-building text-[#0ea5e9]"></i><span class="text-gray-600">Nueva empresa: <strong>${escapeHtml(b.name)}</strong></span><span class="text-xs text-gray-400 ml-auto">${formatDateShort(b.created_at)}</span></div>`);
    }
    if (parseInt(s.new_users_week || 0) > 0) activities.push(`<div class="flex items-center gap-2 text-sm"><i class="fas fa-user text-purple-500"></i><span class="text-gray-600">${s.new_users_week} nuevos usuarios esta semana</span></div>`);
    if (parseInt(s.pending_leads || 0) > 0) activities.push(`<div class="flex items-center gap-2 text-sm"><i class="fas fa-envelope text-red-500"></i><span class="text-gray-600">${s.pending_leads} leads pendientes</span></div>`);
    document.getElementById('recentActivity').innerHTML = activities.length ? activities.join('') : '<p class="text-gray-400 text-sm">Sin actividad reciente</p>';

    document.getElementById('recentBusinessesList').innerHTML = (data.recentBusinesses || []).map(b => `
        <div class="px-6 py-3 flex items-center gap-3 hover:bg-gray-50 transition cursor-pointer" onclick="openBusinessModal(${b.id})">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg ${b.plan_type === 'premium' ? 'bg-blue-100' : b.plan_type === 'featured' ? 'bg-amber-100' : 'bg-gray-100'}">${b.logo_emoji || '&#128188;'}</div>
            <div class="flex-1 min-w-0"><p class="font-medium text-gray-900 text-sm truncate">${escapeHtml(b.name)}</p><p class="text-xs text-gray-500">${b.category || '-'} · ${b.plan_type}</p></div>
            ${b.verified ? '<i class="fas fa-check-circle text-green-500 text-sm"></i>' : '<i class="fas fa-clock text-amber-500 text-sm"></i>'}
            <span class="text-xs text-gray-400">${formatDateShort(b.created_at)}</span>
        </div>
    `).join('') || '<div class="px-6 py-4 text-center text-gray-400">Sin empresas recientes</div>';

    document.getElementById('recentLeadsList').innerHTML = (data.recentLeads || []).length ? data.recentLeads.map(l => `
        <div class="px-6 py-3 flex items-center gap-3 hover:bg-gray-50 transition cursor-pointer" onclick="showSection('leads')">
            <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-[#0ea5e9]"><i class="fas fa-envelope"></i></div>
            <div class="flex-1 min-w-0"><p class="font-medium text-gray-900 text-sm">${escapeHtml(l.contact_name)}</p><p class="text-xs text-gray-500">${l.service_type} · <span>${getStatusBadge(l.status)}</span></p></div>
            <span class="text-xs text-gray-400">${formatDateShort(l.created_at)}</span>
        </div>
    `).join('') : '<div class="px-6 py-4 text-center text-gray-400">Sin leads recientes</div>';
}

let _revenueChartInstance = null;
function renderRevenueChart(rows) {
    const el = document.getElementById('revenueChart');
    if (!el || typeof Chart === 'undefined') return;

    // Destruir instancia previa para evitar duplicados al refrescar
    if (_revenueChartInstance) { _revenueChartInstance.destroy(); _revenueChartInstance = null; }

    if (!rows.length) {
        const ctx = el.getContext('2d');
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.font = '13px sans-serif'; ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center';
        ctx.fillText('Sin ingresos registrados aún', el.width / 2, 40);
        return;
    }

    const labels = rows.map(r => {
        const m = r.month ? r.month.slice(0, 7) : '';
        return m ? new Date(m + '-01').toLocaleDateString('es-PY', { month: 'short', year: '2-digit' }) : '';
    });
    const values = rows.map(r => parseInt(r.revenue) || 0);

    _revenueChartInstance = new Chart(el, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Ingresos (Gs.)',
                data: values,
                backgroundColor: 'rgba(14,165,233,0.85)',
                hoverBackgroundColor: '#0284c7',
                borderRadius: 6,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => 'Gs. ' + ctx.parsed.y.toLocaleString('es-PY')
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: v => v >= 1000 ? 'Gs.' + (v/1000) + 'k' : 'Gs.' + v,
                        font: { size: 10 }, color: '#9ca3af'
                    },
                    grid: { color: '#f1f5f9' }
                },
                x: { ticks: { font: { size: 10 }, color: '#9ca3af' }, grid: { display: false } }
            }
        }
    });
}

// Embudo de leads (pipeline) — barras horizontales con color por etapa
function renderLeadsFunnel(funnel) {
    const el = document.getElementById('leadsFunnel');
    if (!el) return;
    if (!funnel.length) { el.innerHTML = '<p class="text-gray-400 text-sm">Sin leads</p>'; return; }
    const max = Math.max(...funnel.map(f => f.count), 1);
    const colors = {
        pending: '#f59e0b', contacted: '#0ea5e9', negotiating: '#8b5cf6',
        follow_up: '#06b6d4', won: '#22c55e', lost: '#ef4444'
    };
    el.innerHTML = funnel.map(f => {
        const pct = Math.max((f.count / max) * 100, 2);
        const color = colors[f.key] || '#94a3b8';
        return `<div class="flex items-center gap-3">
            <span class="text-xs text-gray-600 w-20 flex-shrink-0">${f.label}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="text-xs font-bold text-gray-700 w-8 text-right">${f.count}</span>
        </div>`;
    }).join('');
}

// Rango seleccionado del Pulso del directorio (persistente en la sesión de UI).
let currentGrowthRange = '1m';
const _GROWTH_SUBTITLE = { day: '(altas por día)', week: '(altas por semana)', month: '(altas por mes)' };

// Carga el Pulso del directorio para un rango y lo dibuja con la granularidad
// que devuelve el backend (1 semana/1 mes → por día, 3 meses → semana, 6 → mes).
async function loadGrowth(range) {
    currentGrowthRange = range || currentGrowthRange || '1m';
    const sel = document.getElementById('growthRange');
    if (sel && sel.value !== currentGrowthRange) sel.value = currentGrowthRange;
    const res = await apiAdminGet(`/dashboard/growth?range=${encodeURIComponent(currentGrowthRange)}`);
    if (!res || !res.success) return;
    const sub = document.getElementById('growthSubtitle');
    if (sub) sub.textContent = _GROWTH_SUBTITLE[res.bucket] || '(altas)';
    renderGrowthChart(res.rows || [], res.bucket || 'day');
}

// Line chart de crecimiento del directorio. bucket ∈ day|week|month define el
// formato de las etiquetas del eje X.
let _growthChartInstance = null;
function renderGrowthChart(rows, bucket) {
    const el = document.getElementById('growthChart');
    if (!el || typeof Chart === 'undefined') return;
    if (_growthChartInstance) { _growthChartInstance.destroy(); _growthChartInstance = null; }

    const fmtLabel = (period) => {
        if (!period) return '';
        // Compatibilidad: filas viejas traían {month:'YYYY-MM'}; las nuevas {period:'YYYY-MM-DD'}
        const iso = /^\d{4}-\d{2}$/.test(period) ? period + '-01' : period;
        const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
        if (isNaN(d)) return period;
        if (bucket === 'month') return d.toLocaleDateString('es-PY', { month: 'short', year: '2-digit' });
        return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }); // day y week
    };
    const labels = rows.map(r => fmtLabel(r.period || r.month));
    const values = rows.map(r => parseInt(r.count) || 0);

    _growthChartInstance = new Chart(el, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Altas',
                data: values,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14,165,233,0.12)',
                fill: true, tension: 0.35,
                pointRadius: 3, pointBackgroundColor: '#0ea5e9',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' empresas' } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 10 }, color: '#9ca3af', precision: 0 }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { size: 10 }, color: '#9ca3af' }, grid: { display: false } }
            }
        }
    });
}

// Formatea una tasa de red en bytes/s a algo legible. null → '—' (aún sin medición).
function _fmtRate(bps) {
    if (bps == null || isNaN(bps)) return '—';
    if (bps < 1024) return `${bps} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(bps < 10240 ? 1 : 0)} KB/s`;
    return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

// Historial de CPU para el gráfico timeline (últimas 12 lecturas = 60s a 5s c/u)
function renderServerStats(stats) {
    const el = document.getElementById('serverStatsPanel');
    if (!el || !stats) return;
    const memUsedPct = Math.round((stats.mem_used_mb / stats.mem_total_mb) * 100);
    const uptimeH = Math.floor(stats.uptime_s / 3600);
    const uptimeM = Math.floor((stats.uptime_s % 3600) / 60);
    const loadColor = stats.load_avg > stats.cpus ? '#ef4444' : stats.load_avg > stats.cpus * 0.7 ? '#f59e0b' : '#22c55e';

    // Construir la estructura UNA sola vez (para no destruir el canvas en cada poll)
    if (!_serverPanelBuilt) {
        el.innerHTML = `
            <div class="grid grid-cols-2 gap-3 text-sm mb-3">
                <div class="bg-gray-50 rounded-xl p-3">
                    <p class="text-xs text-gray-400 mb-1">RAM proceso</p>
                    <p class="font-bold text-gray-900"><span id="srvMem">${stats.mem_used_mb}</span> MB</p>
                    <div class="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                        <div id="srvMemBar" class="h-1.5 rounded-full bg-green-400" style="width:${Math.min(memUsedPct,100)}%"></div>
                    </div>
                    <p class="text-[10px] text-gray-400 mt-0.5"><span id="srvMemPct">${memUsedPct}</span>% de ${stats.mem_total_mb} MB</p>
                </div>
                <div class="bg-gray-50 rounded-xl p-3">
                    <p class="text-xs text-gray-400 mb-1">Carga CPU (1m)</p>
                    <p class="font-bold" id="srvLoad" style="color:${loadColor}">${stats.load_avg}</p>
                    <p class="text-[10px] text-gray-400 mt-1">${stats.cpus} núcleos${stats.node_version ? ' · ' + stats.node_version : ''}</p>
                </div>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 mb-3">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-xs text-gray-400"><i class="fas fa-network-wired mr-1"></i> Red</p>
                    <p class="text-[10px] text-gray-400 truncate max-w-[55%] text-right" id="srvNetHost" title="hostname del servidor">${(stats.network && stats.network.hostname) || ''}</p>
                </div>
                <div class="flex items-center justify-between gap-2 text-sm">
                    <div class="min-w-0">
                        <p class="text-[10px] text-gray-400">IP interna</p>
                        <p class="font-bold text-gray-900 tabular-nums truncate" id="srvNetIp">${(stats.network && stats.network.ip) || '—'}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-gray-400"><i class="fas fa-arrow-down text-green-500"></i> Bajada</p>
                        <p class="font-bold text-gray-900 tabular-nums" id="srvNetRx">${_fmtRate(stats.network && stats.network.rx_rate)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-gray-400"><i class="fas fa-arrow-up text-[#0ea5e9]"></i> Subida</p>
                        <p class="font-bold text-gray-900 tabular-nums" id="srvNetTx">${_fmtRate(stats.network && stats.network.tx_rate)}</p>
                    </div>
                </div>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 relative">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-xs text-gray-400">CPU <span class="text-[9px]">(últimos 60s)</span></p>
                    <p class="text-[10px] text-gray-400">uptime <span id="srvUptime" class="font-semibold text-gray-500">${uptimeH}h ${uptimeM}m</span></p>
                </div>
                <div style="height:90px;position:relative">
                    <canvas id="cpuChart"></canvas>
                </div>
            </div>`;
        _serverPanelBuilt = true;
        _cpuHistory = [];

        // Inicializar el gráfico de CPU
        const ctx = document.getElementById('cpuChart');
        if (ctx && typeof Chart !== 'undefined') {
            if (_cpuChartInstance) { _cpuChartInstance.destroy(); }
            _cpuChartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels: [], datasets: [{
                    data: [], borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14,165,233,0.15)', fill: true,
                    tension: 0.4, pointRadius: 0, borderWidth: 2
                }]},
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        y: { beginAtZero: true, suggestedMax: stats.cpus || 4,
                             ticks: { font: { size: 9 }, color: '#cbd5e1', maxTicksLimit: 4 },
                             grid: { color: '#f1f5f9' } },
                        x: { display: false }
                    }
                }
            });
        }
    } else {
        // Solo actualizar valores (sin recrear el DOM)
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('srvMem', stats.mem_used_mb);
        set('srvMemPct', memUsedPct);
        set('srvLoad', stats.load_avg);
        set('srvUptime', `${uptimeH}h ${uptimeM}m`);
        // Red (se actualiza en cada poll; la tasa se calcula en el backend)
        if (stats.network) {
            set('srvNetRx', _fmtRate(stats.network.rx_rate));
            set('srvNetTx', _fmtRate(stats.network.tx_rate));
            if (stats.network.ip)       set('srvNetIp', stats.network.ip);
            if (stats.network.hostname) set('srvNetHost', stats.network.hostname);
        }
        const bar = document.getElementById('srvMemBar');
        if (bar) {
            bar.style.width = Math.min(memUsedPct, 100) + '%';
            bar.className = 'h-1.5 rounded-full ' + (memUsedPct > 80 ? 'bg-red-400' : memUsedPct > 60 ? 'bg-amber-400' : 'bg-green-400');
        }
        const loadEl = document.getElementById('srvLoad');
        if (loadEl) loadEl.style.color = loadColor;
    }

    // Agregar punto al historial de CPU y refrescar el gráfico
    if (_cpuChartInstance) {
        _cpuHistory.push(parseFloat(stats.load_avg) || 0);
        if (_cpuHistory.length > 12) _cpuHistory.shift(); // 12 puntos = 60s
        _cpuChartInstance.data.labels = _cpuHistory.map((_, i) => i);
        _cpuChartInstance.data.datasets[0].data = _cpuHistory;
        _cpuChartInstance.update('none');
    }
}

// ── Tiempo real: polling de servidor + conexiones cada 5s ─────────────────
let _liveTimer = null;
async function pollLiveStats() {
    const data = await apiAdminGet('/dashboard/live');
    if (!data || !data.success) return;

    // Actualizar server stats sin recrear toda la card
    if (data.server) renderServerStats({ ...data.server, node_version: window._nodeVer || '' });

    // Actualizar conexiones
    const c = data.connections || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = (v||0).toLocaleString('es-PY'); };
    set('connNow', c.now);
    set('connToday', c.today);
    set('connWeek', c.week);
    set('connMonth', c.month);
    set('connViewsToday', c.views_today);
}

function startLivePolling() {
    stopLivePolling();
    pollLiveStats();                       // inmediato
    _liveTimer = setInterval(pollLiveStats, 5000);  // cada 5s
}
function stopLivePolling() {
    if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
}

// Pausar polling si la pestaña se oculta; reanudar al volver (ahorra recursos)
document.addEventListener('visibilitychange', () => {
    const onDashboard = !document.getElementById('section-dashboard')?.classList.contains('hidden');
    if (document.hidden) stopLivePolling();
    else if (onDashboard) startLivePolling();
});


// ── D8.1 — Bloque de monetización + usuarios conectados ──────────────────
function _gs(n) { return 'Gs. ' + (parseInt(n) || 0).toLocaleString('es-PY'); }
function _agoMin(iso) {
    try {
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins <= 0) return 'ahora';
        if (mins === 1) return 'hace 1 min';
        if (mins < 60) return `hace ${mins} min`;
        const h = Math.floor(mins / 60); return `hace ${h}h`;
    } catch (e) { return ''; }
}
function _initials(name, email) {
    const base = (name || email || '?').trim();
    const parts = base.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || base[0].toUpperCase();
}

async function loadMonetization() {
    const cards = document.getElementById('monetizationCards');
    const online = document.getElementById('onlineUsersBlock');
    if (!cards) return;
    let res;
    try { res = await apiAdminGet('/monetization'); } catch (e) { res = null; }
    if (!res || !res.success) {
        cards.innerHTML = `<p class="text-gray-400 text-sm col-span-2 lg:col-span-4">No se pudo cargar la monetización.</p>`;
        if (online) online.innerHTML = '';
        return;
    }
    const d = res.data;

    const card = (opts) => `
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm ${opts.onclick ? 'stat-card cursor-pointer' : ''}" ${opts.onclick ? `onclick="${opts.onclick}"` : ''}>
            <div class="flex items-center justify-between mb-3">
                <div class="w-10 h-10 ${opts.bg} rounded-xl flex items-center justify-center ${opts.fg} text-lg"><i class="fas ${opts.icon}"></i></div>
                ${opts.badge || ''}
            </div>
            <h3 class="text-2xl font-black text-gray-900">${opts.value}</h3>
            <p class="text-sm text-gray-500 mt-1">${opts.label}</p>
            ${opts.sub ? `<p class="text-xs text-gray-400 mt-1.5">${opts.sub}</p>` : ''}
        </div>`;

    cards.innerHTML =
        card({
            icon: 'fa-hourglass-half', bg: 'bg-amber-50', fg: 'text-amber-600',
            value: (d.pending_requests || 0).toLocaleString('es-PY'),
            label: 'Solicitudes pendientes',
            badge: d.pending_requests > 0 ? '<span class="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">A confirmar &rarr;</span>' : '',
            onclick: "showSection('plan-requests')",
            sub: 'Pagos declarados por confirmar',
        }) +
        card({
            icon: 'fa-cash-register', bg: 'bg-green-50', fg: 'text-green-600',
            value: _gs(d.month_revenue.total_gs),
            label: 'Caja del mes',
            sub: `Planes ${_gs(d.month_revenue.plans_gs)} · Boosts ${_gs(d.month_revenue.boosts_gs)}`,
        }) +
        card({
            icon: 'fa-arrows-rotate', bg: 'bg-blue-50', fg: 'text-[#0ea5e9]',
            value: _gs(d.mrr.gs),
            label: 'MRR activo',
            sub: `${d.mrr.active_paid || 0} plan(es) pago(s) vigente(s)`,
        }) +
        card({
            icon: 'fa-clock', bg: 'bg-red-50', fg: 'text-red-600',
            value: (d.expiring.d30 || 0).toLocaleString('es-PY'),
            label: 'Por vencer (30 días)',
            sub: `${d.expiring.d7 || 0} en los próximos 7 días`,
            onclick: "showSection('plan-requests')",
        });

    if (online) online.innerHTML = renderOnlineUsers(d.online);
}

// Hora local PY (HH:MM) de la última conexión
function _hhmm(iso) {
    try { return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' }); }
    catch (e) { return ''; }
}

// Etiqueta de tipo de usuario para los chips de "conectados".
// Prioridad: admin/godmode → Admin; is_ambassador → Embajador; client → Cliente; resto → Usuario.
function _roleTag(u) {
    let label, cls;
    if (u.role === 'admin' || u.role === 'godmode') { label = 'Admin';     cls = 'bg-indigo-100 text-indigo-700'; }
    else if (u.is_ambassador)                        { label = 'Embajador'; cls = 'bg-violet-100 text-violet-700'; }
    else if (u.role === 'client')                    { label = 'Cliente';   cls = 'bg-sky-100 text-sky-700'; }
    else                                             { label = 'Usuario';   cls = 'bg-gray-100 text-gray-500'; }
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${cls}">${label}</span>`;
}

function renderOnlineUsers(o) {
    const count = o.count || 0;
    const users = o.users || [];
    const todayCount = o.today_count || 0;
    const todayUsers = o.today_users || [];

    const liveChips = users.map(u => {
        const nm = escapeHtml(u.name || u.email || 'Usuario');
        return `<div class="flex items-center gap-2 bg-green-50 border border-green-100 rounded-full pl-1 pr-3 py-1" title="${escapeHtml(u.email || '')} · ${_agoMin(u.last_seen_at)}">
                    <span class="w-7 h-7 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">${escapeHtml(_initials(u.name, u.email))}</span>
                    <span class="text-xs font-medium text-gray-700 max-w-[120px] truncate">${nm}</span>
                    ${_roleTag(u)}
                </div>`;
    }).join('');
    const liveMore = count > users.length ? `<span class="text-xs text-gray-400 self-center">y ${count - users.length} más…</span>` : '';

    const todayChips = todayUsers.map(u => {
        const nm = escapeHtml(u.name || u.email || 'Usuario');
        return `<div class="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full pl-1 pr-2.5 py-1" title="${escapeHtml(u.email || '')} · última conexión ${_hhmm(u.last_seen_at)}">
                    <span class="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">${escapeHtml(_initials(u.name, u.email))}</span>
                    <span class="text-xs font-medium text-gray-700 max-w-[110px] truncate">${nm}</span>
                    ${_roleTag(u)}
                    <span class="text-[10px] text-gray-400 tabular-nums">${_hhmm(u.last_seen_at)}</span>
                </div>`;
    }).join('');
    const todayMore = todayCount > todayUsers.length ? `<span class="text-xs text-gray-400 self-center">y ${todayCount - todayUsers.length} más…</span>` : '';

    return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-gray-900 flex items-center gap-2">
                    <span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span></span>
                    Usuarios conectados
                </h3>
                <div class="flex items-center gap-3 text-sm">
                    <span class="font-black text-green-600">${count.toLocaleString('es-PY')}<span class="text-[11px] font-medium text-gray-400 ml-1">ahora</span></span>
                    <span class="font-black text-gray-900">${todayCount.toLocaleString('es-PY')}<span class="text-[11px] font-medium text-gray-400 ml-1">hoy</span></span>
                </div>
            </div>

            <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">En línea ahora <span class="text-gray-300 normal-case font-normal">· últimos ${o.window_min || 7} min</span></p>
            ${count === 0
                ? '<p class="text-sm text-gray-400 mb-4">Nadie conectado en este momento.</p>'
                : `<div class="flex flex-wrap gap-2 mb-4">${liveChips}${liveMore}</div>`}

            <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 pt-3 border-t border-gray-100">Conectados hoy <span class="text-gray-300 normal-case font-normal">· desde las 00:00 (PY)</span></p>
            ${todayCount === 0
                ? '<p class="text-sm text-gray-400">Nadie se conectó hoy todavía.</p>'
                : `<div class="flex flex-wrap gap-2">${todayChips}${todayMore}</div>`}
        </div>`;
}

/* ============================================================
 * Medición del banner de captación "Registrá tu negocio"
 * Embudo: impresiones → clics al CTA (CTR) + desglose de descartes.
 * ============================================================ */
async function loadRegBannerStats() {
    const el = document.getElementById('regBannerBlock');
    if (!el) return;
    let res;
    try { res = await apiAdminGet('/reg-banner-stats?days=30'); } catch (e) { res = null; }
    if (!res || !res.success) { el.innerHTML = ''; return; }
    el.innerHTML = renderRegBannerStats(res.data);
}

function renderRegBannerStats(d) {
    const impS = d.impressions.sessions || 0;
    const impE = d.impressions.events || 0;
    const ctaS = d.cta.sessions || 0;
    const ctr  = d.ctr_sessions || 0;
    const dismiss = d.dismiss.events || 0, never = d.never.events || 0, login = d.login.events || 0;

    // Mini-gráfico de barras (impresiones por día) — SVG liviano, sin librerías
    const days = Array.isArray(d.by_day) ? d.by_day : [];
    const maxImp = Math.max(1, ...days.map(x => x.impressions || 0));
    const bars = days.slice(-30).map(x => {
        const h = Math.round((x.impressions || 0) / maxImp * 40);
        const c = (x.cta || 0) > 0 ? '#0ea5e9' : '#cbd5e1';
        return `<div title="${x.date}: ${x.impressions} impres. · ${x.cta} clics" style="flex:1;min-width:3px;height:${Math.max(2, h)}px;background:${c};border-radius:2px 2px 0 0"></div>`;
    }).join('');

    const stat = (val, label, sub, color) => `
        <div class="bg-gray-50 rounded-xl p-4">
            <p class="text-2xl font-black" style="color:${color || '#0f172a'}">${val}</p>
            <p class="text-xs text-gray-500 mt-0.5">${label}</p>
            ${sub ? `<p class="text-[11px] text-gray-400 mt-0.5">${sub}</p>` : ''}
        </div>`;

    return `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-gray-900 flex items-center gap-2"><i class="fas fa-bullhorn text-brand-500"></i> Banner de registro</h3>
            <span class="text-xs text-gray-400">últimos ${d.days} días</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            ${stat(impS.toLocaleString('es-PY'), 'Personas que lo vieron', `${impE.toLocaleString('es-PY')} impresiones`)}
            ${stat(ctaS.toLocaleString('es-PY'), 'Tocaron "Registrar"', 'clics al CTA', '#0ea5e9')}
            ${stat(ctr + '%', 'Conversión del banner', 'de vistos → clic', ctr >= 5 ? '#16a34a' : ctr > 0 ? '#d97706' : '#94a3b8')}
            ${stat((dismiss + never).toLocaleString('es-PY'), 'Lo cerraron', `${never} “no mostrar más”`)}
        </div>
        ${days.length ? `
        <div>
            <p class="text-[11px] text-gray-400 mb-1">Impresiones por día <span class="text-gray-300">(azul = hubo clics)</span></p>
            <div style="display:flex;align-items:flex-end;gap:2px;height:44px">${bars}</div>
        </div>` : '<p class="text-sm text-gray-400">Todavía sin datos del banner. Aparecerán acá cuando los visitantes lo vean.</p>'}
        <p class="text-[11px] text-gray-400 mt-3">La conversión mide impresión → clic en el CTA. El registro completo depende del flujo de alta.</p>
    </div>`;
}
