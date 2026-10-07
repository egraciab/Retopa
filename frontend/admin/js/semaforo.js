// ── D5.3 — Semáforo de ventas (vista admin) ──────────────────────────────────
// Consume GET /api/v2/admin/semaforo y guarda umbrales vía PUT /api/v2/admin/site-config.
let _semaforoData = null;

function semEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function semNum(n){ return Number(n || 0).toLocaleString('es-PY'); }
function semCurrentMonth(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

async function loadSemaforo(month){
    const monthEl = document.getElementById('semMonth');
    const m = (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) ? month : ((monthEl && monthEl.value) || semCurrentMonth());
    if (monthEl && monthEl.value !== m) monthEl.value = m;
    const body = document.getElementById('semTableBody');
    if (body) body.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">Cargando…</td></tr>`;

    const res = await apiAdminGet(`/semaforo?month=${encodeURIComponent(m)}`);
    if (!res || !res.success) {
        if (body) body.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-500">No se pudo cargar el semáforo.</td></tr>`;
        return;
    }
    _semaforoData = res.data;
    renderSemaforoKpis(res.data);
    renderSemaforoThresholds(res.data.thresholds);
    renderSemaforoTop(res.data.top_terminos);
    renderSemaforoTable();
}

function renderSemaforoKpis(d){
    const t = d.totals || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('semKpiCeldas', semNum(t.celdas));
    set('semKpiVerde', semNum(t.verde));
    set('semKpiAmarillo', semNum(t.amarillo));
    set('semKpiRojo', semNum(t.rojo));
    set('semKpiVisitas', semNum(t.views));
    set('semKpiBusquedas', semNum(t.searches));
}

function renderSemaforoThresholds(th){
    if (!th) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    set('semThVerdeVis', th.verdeVisitas);
    set('semThVerdeBus', th.verdeBusquedas);
    set('semThRojoVis', th.rojoVisitas);
    set('semThRojoBus', th.rojoBusquedas);
}

function renderSemaforoTop(top){
    const ol = document.getElementById('semTopTerms');
    if (!ol) return;
    if (!top || !top.length) { ol.innerHTML = `<li class="text-gray-400 text-sm">Sin búsquedas registradas este mes.</li>`; return; }
    ol.innerHTML = top.map((t, i) =>
        `<li class="flex items-center justify-between gap-2">
            <span class="truncate"><span class="text-gray-400 text-xs mr-1">${i+1}.</span>${semEsc(t.term)}</span>
            <span class="text-xs font-bold text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">${semNum(t.n)}</span>
        </li>`).join('');
}

const SEM_DOT = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };
const SEM_LABEL = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };

function renderSemaforoTable(){
    const body = document.getElementById('semTableBody');
    if (!body || !_semaforoData) return;
    const fCat = (document.getElementById('semFilterCat')?.value || '').trim().toLowerCase();
    const fCity = (document.getElementById('semFilterCity')?.value || '').trim().toLowerCase();
    const fEst = document.getElementById('semFilterEstado')?.value || '';
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    let rows = _semaforoData.rows || [];
    if (fCat)  rows = rows.filter(r => norm(r.category).includes(norm(fCat)));
    if (fCity) rows = rows.filter(r => norm(r.city).includes(norm(fCity)));
    if (fEst)  rows = rows.filter(r => r.estado === fEst);

    if (!rows.length) { body.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">Sin datos para este filtro.</td></tr>`; }
    else body.innerHTML = rows.map(r => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-2.5 font-medium text-gray-800">${semEsc(r.category)}</td>
            <td class="px-4 py-2.5 text-gray-600">${semEsc(r.city)}</td>
            <td class="px-3 py-2.5 text-center" title="${SEM_LABEL[r.estado] || ''}">${SEM_DOT[r.estado] || ''}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">${semNum(r.views)}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">${semNum(r.whatsapp)}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">${semNum(r.searches)}</td>
            <td class="px-3 py-2.5 text-right tabular-nums text-gray-500">${semNum(r.reclamadas)}/${semNum(r.fichas)}</td>
        </tr>`).join('');

    const foot = document.getElementById('semTableFoot');
    if (foot) foot.textContent = `${rows.length} celda${rows.length===1?'':'s'}${_semaforoData.truncated ? ' (mostrando las primeras 2000)' : ''}`;
}

async function saveSemaforoThresholds(){
    const val = (id, def) => { const v = parseInt(document.getElementById(id)?.value); return Number.isFinite(v) && v >= 0 ? String(v) : def; };
    const payload = {
        semaforo_verde_visitas:   val('semThVerdeVis', '1000'),
        semaforo_verde_busquedas: val('semThVerdeBus', '300'),
        semaforo_rojo_visitas:    val('semThRojoVis', '300'),
        semaforo_rojo_busquedas:  val('semThRojoBus', '100'),
    };
    const res = await apiAdminPut('/site-config', payload);
    if (res && res.success) {
        if (typeof showToast === 'function') showToast('Umbrales guardados ✅');
        loadSemaforo(); // recalcular estados con los nuevos umbrales
    } else {
        if (typeof showToast === 'function') showToast('Error al guardar umbrales', 'error');
    }
}

function semaforoShiftMonth(delta){
    const el = document.getElementById('semMonth');
    let [y, m] = ((el && el.value) || semCurrentMonth()).split('-').map(Number);
    m += delta; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    const nm = `${y}-${String(m).padStart(2,'0')}`;
    if (el) el.value = nm;
    loadSemaforo(nm);
}

function exportSemaforoCsv(){
    if (!_semaforoData || !_semaforoData.rows) return;
    const head = ['Categoria','Ciudad','Estado','Visitas','WhatsApp','Busquedas','Busquedas_mes_previo','Reclamadas','Fichas'];
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
    const lines = [head.join(',')];
    for (const r of _semaforoData.rows) {
        lines.push([r.category, r.city, r.estado, r.views, r.whatsapp, r.searches, r.searches_prev, r.reclamadas, r.fichas].map(esc).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `semaforo_${(_semaforoData.month || semCurrentMonth())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}
