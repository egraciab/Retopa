/**
 * RetoPA — Panel Embajador
 * explorar.js v2: comboboxes, orden, selección múltiple (máx 10), liberar
 */

let _availPage    = 1;
let _availStats   = null;
let _availOrder   = 'asc';           // 'asc' = más incompletas primero, 'desc' = más completas primero
let _selectedAvail = new Set();      // IDs seleccionados para tomar en lote
const MAX_TAKE = 10;

// ════════════════════════════════════════════════════════════════════
// CARGA PRINCIPAL
// ════════════════════════════════════════════════════════════════════
async function loadAvailable(page = 1) {
    _availPage = page;
    _selectedAvail.clear();
    updateAvailBatchBar();

    // Stats una sola vez (para poblar comboboxes)
    if (!_availStats) {
        const s = await ambGet('/ambassador/available/stats');
        if (s.success) { _availStats = s.data; renderAvailableStats(s.data); }
    }

    const city     = document.getElementById('availCityHidden')?.value     || '';
    const category = document.getElementById('availCatHidden')?.value      || '';
    let url = `/ambassador/available?page=${page}&limit=12&order=${_availOrder}`;
    if (city)     url += `&city=${encodeURIComponent(city)}`;
    if (category) url += `&category=${category}`;

    const container = document.getElementById('availableList');
    if (container) container.innerHTML = `
        <div class="col-span-2 text-center py-8 text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Buscando fichas...
        </div>`;

    const data = await ambGet(url);
    if (!data.success) {
        if (container) container.innerHTML = '<p class="col-span-2 text-red-400 text-sm text-center py-8">Error cargando fichas</p>';
        return;
    }

    const countEl = document.getElementById('availCount');
    if (countEl) countEl.textContent = `${Number(data.pagination.total).toLocaleString('es-PY')} fichas disponibles`;

    if (!data.data.length) {
        if (container) container.innerHTML = `
            <div class="col-span-2 text-center py-12 text-gray-400">
                <i class="fas fa-check-circle text-4xl mb-3 block text-green-300"></i>
                <p class="font-medium text-gray-600">¡Sin fichas con estos filtros!</p>
                <p class="text-sm mt-1">Probá con otra ciudad o rubro</p>
            </div>`;
        return;
    }

    if (container) container.innerHTML = data.data.map(b => renderAvailableCard(b)).join('');

    renderAvailPagination(data.pagination);
}

// ════════════════════════════════════════════════════════════════════
// STATS → poblar comboboxes
// ════════════════════════════════════════════════════════════════════
function renderAvailableStats(stats) {
    _availCitiesData   = stats.byCity     || [];
    _availCatsData     = stats.byCategory || [];
    const totalEl = document.getElementById('availTotalGlobal');
    if (totalEl) totalEl.textContent = Number(stats.total).toLocaleString('es-PY');
    const badgeEl = document.getElementById('availTotalBadge');
    if (badgeEl && stats.total > 0) { badgeEl.textContent = stats.total; badgeEl.classList.remove('hidden'); }
}

// ════════════════════════════════════════════════════════════════════
// COMBOBOX — Ciudad
// ════════════════════════════════════════════════════════════════════
let _availCitiesData = [];
let _availCatsData   = [];

function availFilterCity() {
    const q = (document.getElementById('availCityInput')?.value || '').toLowerCase().trim();
    const filtered = _availCitiesData.filter(c => c.city.toLowerCase().includes(q)).slice(0, 12);
    renderAvailCityList(filtered);
    document.getElementById('availCityList')?.classList.remove('hidden');
}
function availOpenCity() {
    const q = (document.getElementById('availCityInput')?.value || '').toLowerCase().trim();
    const filtered = _availCitiesData.filter(c => !q || c.city.toLowerCase().includes(q)).slice(0, 12);
    renderAvailCityList(filtered);
    document.getElementById('availCityList')?.classList.remove('hidden');
}
function availCloseCity() { setTimeout(() => document.getElementById('availCityList')?.classList.add('hidden'), 180); }
function renderAvailCityList(cities) {
    const list = document.getElementById('availCityList');
    if (!list) return;
    if (!cities.length) { list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>'; return; }
    list.innerHTML = cities.map(c =>
        `<div onclick="availSelectCity('${escHtml(c.city)}')"
            class="px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 cursor-pointer flex items-center justify-between">
            <span><i class="fas fa-map-marker-alt text-gray-300 text-xs mr-2"></i>${escHtml(c.city)}</span>
            <span class="text-xs text-gray-400">${c.total} fichas</span>
        </div>`
    ).join('');
}
function availSelectCity(name) {
    document.getElementById('availCityInput').value = name;
    document.getElementById('availCityHidden').value = name;
    document.getElementById('availCityList')?.classList.add('hidden');
    _availStats = null; // resetear para no repoblar con los mismos datos
    loadAvailable(1);
}
function availClearCity() {
    document.getElementById('availCityInput').value  = '';
    document.getElementById('availCityHidden').value = '';
    loadAvailable(1);
}

// ════════════════════════════════════════════════════════════════════
// COMBOBOX — Rubro
// ════════════════════════════════════════════════════════════════════
function availFilterCat() {
    const q = (document.getElementById('availCatInput')?.value || '').toLowerCase().trim();
    const filtered = _availCatsData.filter(c => c.category.toLowerCase().includes(q)).slice(0, 12);
    renderAvailCatList(filtered);
    document.getElementById('availCatList')?.classList.remove('hidden');
}
function availOpenCat() {
    const q = (document.getElementById('availCatInput')?.value || '').toLowerCase().trim();
    const filtered = _availCatsData.filter(c => !q || c.category.toLowerCase().includes(q)).slice(0, 12);
    renderAvailCatList(filtered);
    document.getElementById('availCatList')?.classList.remove('hidden');
}
function availCloseCat() { setTimeout(() => document.getElementById('availCatList')?.classList.add('hidden'), 180); }
function renderAvailCatList(cats) {
    const list = document.getElementById('availCatList');
    if (!list) return;
    if (!cats.length) { list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>'; return; }
    list.innerHTML = cats.map(c =>
        `<div onclick="availSelectCat(${c.category_id},'${escHtml(c.category)}')"
            class="px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 cursor-pointer flex items-center justify-between">
            <span><i class="fas fa-tag text-gray-300 text-xs mr-2"></i>${escHtml(c.category)}</span>
            <span class="text-xs text-gray-400">${c.total} fichas</span>
        </div>`
    ).join('');
}
function availSelectCat(id, name) {
    document.getElementById('availCatInput').value  = name;
    document.getElementById('availCatHidden').value = id;
    document.getElementById('availCatList')?.classList.add('hidden');
    loadAvailable(1);
}
function availClearCat() {
    document.getElementById('availCatInput').value  = '';
    document.getElementById('availCatHidden').value = '';
    loadAvailable(1);
}

// ════════════════════════════════════════════════════════════════════
// ORDEN
// ════════════════════════════════════════════════════════════════════
function setAvailOrder(order) {
    _availOrder = order;
    // Actualizar los botones de orden (data-driven: btnOrder-<key>)
    ['asc','desc','views_desc','views_asc'].forEach(k => {
        const el = document.getElementById('btnOrder-' + k);
        if (!el) return;
        const active = (k === order);
        el.classList.toggle('bg-brand-500', active);
        el.classList.toggle('text-white',   active);
        el.classList.toggle('bg-white',    !active);
        el.classList.toggle('text-gray-600', !active);
    });
    loadAvailable(1);
}

// ════════════════════════════════════════════════════════════════════
// SELECCIÓN MÚLTIPLE
// ════════════════════════════════════════════════════════════════════
function toggleAvailSelect(id, checked) {
    if (checked) {
        if (_selectedAvail.size >= MAX_TAKE) {
            showToastAmb(`Máximo ${MAX_TAKE} fichas a la vez`, 'warning');
            // Desmarcar el checkbox
            const chk = document.querySelector(`[data-avail-id="${id}"]`);
            if (chk) chk.checked = false;
            return;
        }
        _selectedAvail.add(id);
    } else {
        _selectedAvail.delete(id);
    }
    updateAvailBatchBar();
}

function updateAvailBatchBar() {
    const bar   = document.getElementById('availBatchBar');
    const label = document.getElementById('availBatchLabel');
    if (!bar) return;
    const count = _selectedAvail.size;
    bar.classList.toggle('hidden', count === 0);
    if (label) label.textContent = `${count}/${MAX_TAKE} fichas seleccionadas`;
}

async function takeBatch() {
    const ids = [..._selectedAvail];
    if (!ids.length) return;
    const btn = document.getElementById('btnTakeBatch');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Tomando...'; }

    const res = await ambPost('/ambassador/available/take-batch', { ids });

    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-hand-pointer mr-2"></i>Tomar ${ids.length} fichas`; }

    if (res.success) {
        const msg = res.skipped > 0
            ? `✅ ${res.taken} ficha${res.taken!==1?'s':''} tomada${res.taken!==1?'s':''} (${res.skipped} ya no estaban disponibles)`
            : `✅ ${res.taken} ficha${res.taken!==1?'s':''} asignada${res.taken!==1?'s':''} — aparecen en "Mis fichas"`;
        showToastAmb(msg);
        _selectedAvail.clear();
        _availStats = null;
        loadAvailable(_availPage);
        loadAmbDashboard();
    } else {
        showToastAmb(res.error || 'Error al tomar fichas', 'warning');
    }
}

// ════════════════════════════════════════════════════════════════════
// CARD DE FICHA DISPONIBLE
// ════════════════════════════════════════════════════════════════════
function renderAvailableCard(b) {
    const score = parseInt(b.quality_score || 0);
    const scoreColor = score >= 50 ? '#f59e0b' : score >= 30 ? '#fb923c' : '#ef4444';

    const chips = [
        b.falta_whatsapp    && `<span class="chip-falta"><i class="fab fa-whatsapp mr-1"></i>WhatsApp</span>`,
        b.falta_logo        && `<span class="chip-falta"><i class="fas fa-image mr-1"></i>Logo</span>`,
        b.falta_descripcion && `<span class="chip-falta"><i class="fas fa-align-left mr-1"></i>Descripción</span>`,
        b.falta_ubicacion   && `<span class="chip-falta"><i class="fas fa-map-marker-alt mr-1"></i>Ubicación</span>`,
        b.falta_phone       && `<span class="chip-falta"><i class="fas fa-phone mr-1"></i>Teléfono</span>`,
        b.falta_horario     && `<span class="chip-falta"><i class="fas fa-clock mr-1"></i>Horario</span>`,
    ].filter(Boolean).slice(0, 4).join('');

    return `
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col transition-all" id="avail-card-${b.id}">
        <div class="flex items-start gap-3 p-4 pb-3">
            <!-- Checkbox selección múltiple -->
            <label class="flex items-start gap-3 flex-1 cursor-pointer min-w-0">
                <input type="checkbox" data-avail-id="${b.id}"
                    onchange="toggleAvailSelect(${b.id}, this.checked)"
                    class="avail-check w-4 h-4 mt-1 rounded border-gray-300 accent-brand-500 shrink-0">
                <div class="flex items-start gap-2 min-w-0 flex-1">
                    <div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0 overflow-hidden border border-gray-200">
                        ${b.image_url ? `<img src="${escHtml(b.image_url)}" class="w-full h-full object-cover">` : (b.logo_emoji || '🏢')}
                    </div>
                    <div class="min-w-0">
                        <p class="font-bold text-gray-900 text-sm leading-tight truncate">${escHtml(b.trade_name || b.name)}</p>
                        <p class="text-xs text-gray-400 mt-0.5">
                            ${b.category_name ? escHtml(b.category_name) + ' · ' : ''}${escHtml(b.city || '—')}
                        </p>
                    </div>
                </div>
            </label>
        </div>

        <!-- Score -->
        <div class="px-4 pb-3">
            <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-500">Completitud</span>
                <span class="text-xs font-bold" style="color:${scoreColor}">${score}%</span>
            </div>
            <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full" style="width:${score}%;background:${scoreColor}"></div>
            </div>
        </div>

        <!-- Chips falta -->
        <div class="px-4 pb-3 flex flex-wrap gap-1">
            ${chips || '<span class="text-xs text-gray-300">Sin datos básicos</span>'}
        </div>

        <!-- Métricas 30d -->
        <div class="px-4 pb-3">
            <div class="inline-flex items-center gap-3 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
                <span class="text-gray-600" title="Visitas en los últimos 30 días"><i class="fas fa-eye text-gray-400 mr-1"></i>${(b.views_30d||0).toLocaleString('es-PY')}</span>
                <span class="text-gray-600" title="Clics de WhatsApp en los últimos 30 días"><i class="fab fa-whatsapp text-green-500 mr-1"></i>${(b.wa_30d||0).toLocaleString('es-PY')}</span>
                <span class="text-gray-300">30d</span>
            </div>
        </div>

        <!-- Botón individual -->
        <div class="px-4 pb-4 mt-auto">
            <button onclick="takeSingle(${b.id}, this)"
                class="touch-btn w-full border-2 border-brand-400 text-brand-600 hover:bg-brand-50 text-sm font-bold py-2 rounded-xl transition flex items-center justify-center gap-2">
                <i class="fas fa-hand-pointer"></i> Tomar esta
            </button>
        </div>
    </div>`;
}

async function takeSingle(id, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Tomando...'; }
    const res = await ambPost(`/ambassador/available/${id}/take`, {});
    if (res.success) {
        showToastAmb(`✅ "${res.data?.trade_name || res.data?.name}" asignada — está en "Mis fichas"`);
        const card = document.getElementById(`avail-card-${id}`);
        if (card) { card.style.opacity='0'; card.style.transform='scale(.95)'; card.style.transition='all .3s'; setTimeout(()=>card.remove(),300); }
        _availStats = null;
        loadAmbDashboard();
    } else {
        showToastAmb(res.error || 'Error al tomar la ficha', 'warning');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-hand-pointer mr-2"></i>Tomar esta'; }
    }
}

// ════════════════════════════════════════════════════════════════════
// PAGINACIÓN
// ════════════════════════════════════════════════════════════════════
function renderAvailPagination(p) {
    const infoEl = document.getElementById('availPaginationInfo');
    const ctrlEl = document.getElementById('availPaginationControls');
    if (infoEl) infoEl.textContent = p.total > 0
        ? `${Math.min((p.page-1)*p.limit+1,p.total)}–${Math.min(p.page*p.limit,p.total)} de ${p.total}`
        : '';
    if (!ctrlEl) return;
    let html = '';
    if (p.page>1) html+=`<button onclick="loadAvailable(${p.page-1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-left"></i></button>`;
    for (let i=Math.max(1,p.page-2);i<=Math.min(p.pages,p.page+2);i++)
        html+=`<button onclick="loadAvailable(${i})" class="px-3 py-1 border ${i===p.page?'bg-brand-500 text-white border-brand-500':'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
    if (p.page<p.pages) html+=`<button onclick="loadAvailable(${p.page+1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-right"></i></button>`;
    ctrlEl.innerHTML = html;
}
