// ── D8.2 — Informe de monetización (mes/producto/embudo/por vencer) ──────────
// Paleta validada (dataviz): planes = sky #0ea5e9, boosts = amber #f59e0b.
let _monthlyRevChart = null;
let _lastReport = null;   // cache de la última respuesta (para exportar sin re-pedir)

function _mGs(n) { return 'Gs. ' + (parseInt(n) || 0).toLocaleString('es-PY'); }
function _mMonthLabel(ym) {
    try { return new Date(ym + '-01').toLocaleDateString('es-PY', { month: 'short', year: '2-digit' }); }
    catch (e) { return ym; }
}
function _mDateShort(iso) {
    try { return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }); }
    catch (e) { return ''; }
}

async function loadMonetizationReport() {
    let res;
    try { res = await apiAdminGet('/monetization/report'); } catch (e) { res = null; }
    if (!res || !res.success) {
        const b = document.getElementById('byProductBars');
        if (b) b.innerHTML = '<p class="text-red-500 text-sm">No se pudo cargar el informe.</p>';
        return;
    }
    const d = res.data;
    _lastReport = d;
    renderMonthlyRevenue(d.by_month || []);
    renderByProduct(d.by_product || []);
    renderConversionFunnel(d.funnel || {});
    renderExpiringTable(d.expiring || []);
}

function renderMonthlyRevenue(rows) {
    // Tabla (table view — relieve de contraste + accesibilidad)
    const tbody = document.getElementById('monthlyRevenueTable');
    if (tbody) {
        tbody.innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td class="py-2 text-gray-700">${_mMonthLabel(r.ym)}</td>
                <td class="py-2 text-right text-gray-600 tabular-nums">${_mGs(r.plans_gs)}</td>
                <td class="py-2 text-right text-gray-600 tabular-nums">${_mGs(r.boosts_gs)}</td>
                <td class="py-2 text-right font-bold text-gray-900 tabular-nums">${_mGs(r.total_gs)}</td>
            </tr>`).join('') : '<tr><td colspan="4" class="py-4 text-center text-gray-400">Sin ingresos aún</td></tr>';
    }

    const el = document.getElementById('monthlyRevenueChart');
    if (!el || typeof Chart === 'undefined') return;
    if (_monthlyRevChart) { _monthlyRevChart.destroy(); _monthlyRevChart = null; }

    const labels = rows.map(r => _mMonthLabel(r.ym));
    _monthlyRevChart = new Chart(el, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Planes', data: rows.map(r => r.plans_gs), backgroundColor: '#0ea5e9', borderColor: '#ffffff', borderWidth: 2, borderRadius: 4, stack: 'rev', maxBarThickness: 48 },
                { label: 'Boosts', data: rows.map(r => r.boosts_gs), backgroundColor: '#f59e0b', borderColor: '#ffffff', borderWidth: 2, borderRadius: 4, stack: 'rev', maxBarThickness: 48 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: '#64748b' } },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: Gs. ${ctx.parsed.y.toLocaleString('es-PY')}` } },
            },
            scales: {
                x: { stacked: true, ticks: { font: { size: 10 }, color: '#9ca3af' }, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { callback: v => v >= 1000 ? 'Gs.' + (v / 1000) + 'k' : 'Gs.' + v, font: { size: 10 }, color: '#9ca3af' }, grid: { color: '#f1f5f9' } },
            },
        },
    });
}

function renderByProduct(rows) {
    const el = document.getElementById('byProductBars');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<p class="text-gray-400 text-sm">Sin ingresos por producto aún.</p>'; return; }
    const max = Math.max(...rows.map(r => r.gs), 1);
    el.innerHTML = rows.map(r => {
        const pct = Math.max((r.gs / max) * 100, 2);
        const color = r.kind === 'plan' ? '#0ea5e9' : '#f59e0b';
        return `<div>
            <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-gray-600">${escapeHtml(r.product)} <span class="text-gray-400">· ${r.count}</span></span>
                <span class="font-bold text-gray-800 tabular-nums">${_mGs(r.gs)}</span>
            </div>
            <div class="bg-gray-100 rounded-full h-2.5 overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div></div>
        </div>`;
    }).join('');
}

function renderConversionFunnel(f) {
    const el = document.getElementById('conversionFunnel');
    if (!el) return;
    const leads = f.leads || 0, sol = f.solicitudes || 0, conf = f.confirmadas || 0;
    const max = Math.max(leads, sol, conf, 1);
    // Magnitud → una sola familia de color (sky), de claro a oscuro por etapa.
    const stages = [
        { label: 'Leads (interés)', n: leads, color: '#7dd3fc' },
        { label: 'Solicitudes',     n: sol,   color: '#0ea5e9' },
        { label: 'Confirmadas',     n: conf,  color: '#0369a1' },
    ];
    const bars = stages.map(s => {
        const pct = Math.max((s.n / max) * 100, 2);
        return `<div class="flex items-center gap-3">
            <span class="text-xs text-gray-600 w-28 flex-shrink-0">${s.label}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${s.color}"></div></div>
            <span class="text-xs font-bold text-gray-700 w-10 text-right tabular-nums">${s.n.toLocaleString('es-PY')}</span>
        </div>`;
    }).join('');
    const rates = `
        <div class="flex items-center justify-around mt-4 pt-4 border-t border-gray-100 text-center">
            <div><p class="text-lg font-black text-gray-900">${f.rate_sol != null ? f.rate_sol + '%' : '—'}</p><p class="text-[11px] text-gray-400">Leads → Solicitud</p></div>
            <div><p class="text-lg font-black text-gray-900">${f.rate_conf != null ? f.rate_conf + '%' : '—'}</p><p class="text-[11px] text-gray-400">Solicitud → Pago</p></div>
        </div>`;
    el.innerHTML = bars + rates;
}

function renderExpiringTable(rows) {
    const body = document.getElementById('expiringBody');
    const count = document.getElementById('expiringCount');
    if (count) count.textContent = rows.length;
    if (!body) return;
    if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">Ningún plan vence en los próximos 30 días.</td></tr>'; return; }
    body.innerHTML = rows.map(r => {
        const urgent = r.days_left <= 7;
        return `<tr class="hover:bg-gray-50">
            <td class="px-4 py-3 font-semibold text-gray-800">${escapeHtml(r.name || '—')}</td>
            <td class="px-4 py-3"><span class="text-xs font-bold ${r.plan_name === 'Business Pro' ? 'text-purple-700' : 'text-amber-700'}">${escapeHtml(r.plan_name || '')}</span></td>
            <td class="px-4 py-3 text-gray-500">${_mDateShort(r.expires_at)}</td>
            <td class="px-4 py-3 text-right"><span class="text-xs font-bold ${urgent ? 'text-red-600' : 'text-gray-600'}">${r.days_left}d</span></td>
            <td class="px-4 py-3 text-gray-500 text-xs">${escapeHtml(r.owner_email || '—')}</td>
        </tr>`;
    }).join('');
}

// ── D8.3 — Exportación a Excel (.xlsx multi-hoja) y CSV ──────────────────────
const _BOOST_KIND = { plan: 'Plan', boost: 'Boost' };
function _todayStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
async function _ensureReport() {
    if (_lastReport) return _lastReport;
    try { const r = await apiAdminGet('/monetization/report'); if (r && r.success) _lastReport = r.data; } catch (e) {}
    return _lastReport;
}
// Filas planas por dataset (reutilizadas por CSV y Excel)
function _reportTables(d) {
    return {
        mes: {
            title: 'Ingresos por mes',
            headers: ['Mes', 'Planes (Gs)', 'Boosts (Gs)', 'Total (Gs)'],
            rows: (d.by_month || []).map(r => [r.ym, r.plans_gs || 0, r.boosts_gs || 0, r.total_gs || 0]),
            money: [1, 2, 3],
        },
        producto: {
            title: 'Ingresos por producto (últimos 6 meses)',
            headers: ['Producto', 'Tipo', 'Ingresos (Gs)', 'Cantidad'],
            rows: (d.by_product || []).map(r => [r.product, _BOOST_KIND[r.kind] || r.kind, r.gs || 0, r.count || 0]),
            money: [2],
        },
        embudo: {
            title: 'Embudo de conversión',
            headers: ['Etapa / Métrica', 'Valor'],
            rows: [
                ['Leads (interés)', d.funnel?.leads || 0],
                ['Solicitudes', d.funnel?.solicitudes || 0],
                ['Confirmadas', d.funnel?.confirmadas || 0],
                ['Tasa Leads → Solicitud', d.funnel?.rate_sol != null ? d.funnel.rate_sol + '%' : '—'],
                ['Tasa Solicitud → Pago', d.funnel?.rate_conf != null ? d.funnel.rate_conf + '%' : '—'],
            ],
            money: [],
        },
        porVencer: {
            title: 'Planes por vencer (próximos 30 días)',
            headers: ['Negocio', 'Plan', 'Vence', 'Días restantes', 'Email'],
            rows: (d.expiring || []).map(r => [
                r.name || '', r.plan_name || '',
                r.expires_at ? String(r.expires_at).slice(0, 10) : '',
                r.days_left, r.owner_email || '',
            ]),
            money: [],
        },
    };
}

function _csvCell(v) {
    const s = (v == null ? '' : String(v));
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

async function exportMonetizationCSV() {
    const d = await _ensureReport();
    if (!d) { showToast('No hay datos para exportar', 'error'); return; }
    const T = _reportTables(d);
    const lines = [];
    for (const key of ['mes', 'producto', 'embudo', 'porVencer']) {
        const t = T[key];
        lines.push(_csvCell(t.title.toUpperCase()));
        lines.push(t.headers.map(_csvCell).join(','));
        if (t.rows.length) t.rows.forEach(r => lines.push(r.map(_csvCell).join(',')));
        else lines.push(_csvCell('(sin datos)'));
        lines.push('');
    }
    // BOM UTF-8 para que Excel respete los acentos
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    _download(blob, `RetoPA_Monetizacion_${_todayStamp()}.csv`);
    showToast('CSV descargado ✅');
}

async function exportMonetizationXLSX() {
    if (typeof XLSX === 'undefined') { showToast('No se pudo cargar el módulo de Excel', 'error'); return; }
    const d = await _ensureReport();
    if (!d) { showToast('No hay datos para exportar', 'error'); return; }
    const T = _reportTables(d);
    const wb = XLSX.utils.book_new();
    const sheetDefs = [
        ['Ingresos por mes', T.mes,       [12, 16, 16, 16]],
        ['Por producto',     T.producto,  [26, 10, 16, 12]],
        ['Embudo',           T.embudo,    [26, 12]],
        ['Por vencer',       T.porVencer, [26, 20, 12, 14, 28]],
    ];
    for (const [name, t, widths] of sheetDefs) {
        const aoa = [t.headers, ...t.rows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = widths.map(w => ({ wch: w }));
        // Formato de miles para columnas de Gs (números reales, trabajables)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = 1; R <= range.e.r; R++) {
            for (const C of t.money) {
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = '#,##0'; }
            }
        }
        XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `RetoPA_Monetizacion_${_todayStamp()}.xlsx`);
    showToast('Excel descargado ✅');
}
