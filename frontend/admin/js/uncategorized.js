/**
 * RetoPA — admin/js/uncategorized.js
 * S4.6 — Bulk categorización
 */

let _uncatPage     = 0;
let _uncatTotal    = 0;
let _uncatSelected = new Set();
let _uncatFilter   = { q: '', city: '' };
let _allCats       = [];
const UNCAT_LIMIT  = 20;

async function initUncategorizedSection() {
    const container = document.getElementById('uncategorizedSection');
    if (!container) return;

    if (!_allCats.length) {
        const catData = await apiAdminGet('/categories');
        if (catData.success) _allCats = catData.data || [];
    }

    container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
        <div>
            <h2 class="text-2xl font-bold text-gray-900">Sin categoría</h2>
            <p class="text-sm text-gray-500 mt-1" id="uncatSubtitle">Cargando...</p>
        </div>
        <button onclick="loadUncategorized(true)" class="btn-brand text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
            <i class="fas fa-sync-alt"></i> Actualizar
        </button>
    </div>

    <!-- Filtros -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex gap-3 flex-wrap items-end">
        <div class="flex-1 min-w-48">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Buscar</label>
            <input id="uncatQ" type="text" placeholder="Nombre, tags..."
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                oninput="debounceUncatFilter()">
        </div>
        <div class="min-w-40">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Ciudad</label>
            <input id="uncatCity" type="text" placeholder="Asunción..."
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                oninput="debounceUncatFilter()">
        </div>
    </div>

    <!-- Barra bulk -->
    <div id="uncatBulkBar" class="hidden bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 flex items-center gap-4 flex-wrap">
        <span id="uncatSelCount" class="text-sm font-bold text-blue-700">0 seleccionadas</span>
        <div class="flex-1 min-w-48">
            <select id="uncatBulkCat" class="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">— Elegir categoría —</option>
                ${buildUncatCatOptions()}
            </select>
        </div>
        <button onclick="applyBulkCategory()"
            class="btn-brand text-white px-5 py-2 rounded-lg text-sm font-bold">
            <i class="fas fa-tags mr-1"></i> Asignar a seleccionadas
        </button>
        <button onclick="clearUncatSelection()" class="text-gray-500 text-sm font-medium">
            Deseleccionar todo
        </button>
    </div>

    <!-- Lista -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <!-- Header con "marcar todos" -->
        <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <input type="checkbox" id="uncatSelectAll" class="w-4 h-4 accent-brand-500"
                   onchange="toggleSelectAllUncat(this.checked)" title="Seleccionar todos en esta página">
            <label for="uncatSelectAll" class="text-xs font-semibold text-gray-500 cursor-pointer">
                Seleccionar todos en esta página
            </label>
        </div>
        <div id="uncatList">
            <div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
        </div>
    </div>

    <!-- Paginación -->
    <div id="uncatPagination" class="flex justify-center gap-1 mt-6 flex-wrap hidden"></div>`;

    loadUncategorized(true);
}

function buildUncatCatOptions(selectedId = '') {
    // Agrupar hijos por padre, pero también incluir padres
    const parents = _allCats.filter(c => !c.parent_id);
    const children = _allCats.filter(c => c.parent_id);

    return parents.map(p => {
        const kids = children.filter(c => c.parent_id === p.id);
        if (kids.length) {
            return `<optgroup label="${p.name}">
                <option value="${p.id}" ${p.id == selectedId ? 'selected' : ''}>📁 ${p.name} (general)</option>
                ${kids.map(c => `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name}</option>`).join('')}
            </optgroup>`;
        }
        return `<option value="${p.id}" ${p.id == selectedId ? 'selected' : ''}>${p.name}</option>`;
    }).join('');
}

let _uncatDebounce = null;
function debounceUncatFilter() {
    clearTimeout(_uncatDebounce);
    _uncatDebounce = setTimeout(() => loadUncategorized(true), 400);
}

async function loadUncategorized(resetPage = false) {
    if (resetPage) { _uncatPage = 0; _uncatSelected.clear(); updateBulkBar(); }
    _uncatFilter.q    = document.getElementById('uncatQ')?.value.trim() || '';
    _uncatFilter.city = document.getElementById('uncatCity')?.value.trim() || '';

    const list = document.getElementById('uncatList');
    if (list) list.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>';

    const params = new URLSearchParams({
        limit: UNCAT_LIMIT,
        offset: _uncatPage * UNCAT_LIMIT,
        ...(_uncatFilter.q    ? { q: _uncatFilter.q }       : {}),
        ...(_uncatFilter.city ? { city: _uncatFilter.city } : {}),
    });

    const data = await apiAdminGet(`/businesses/uncategorized?${params}`);
    if (!data.success) {
        if (list) list.innerHTML = '<p class="text-red-400 text-center py-8">Error al cargar</p>';
        return;
    }

    _uncatTotal = data.total || 0;
    const subtitle = document.getElementById('uncatSubtitle');
    if (subtitle) subtitle.textContent = `${_uncatTotal.toLocaleString()} empresa${_uncatTotal !== 1 ? 's' : ''} sin categoría`;

    const badge = document.getElementById('uncategorizedBadge');
    if (badge) { badge.textContent = _uncatTotal > 999 ? '999+' : _uncatTotal; badge.classList.toggle('hidden', _uncatTotal === 0); }

    if (!data.data.length) {
        if (list) list.innerHTML = `<div class="text-center py-16 text-gray-400">
            <i class="fas fa-check-circle text-4xl text-green-400 mb-3 block"></i>
            <p class="font-semibold">¡Todas las empresas tienen categoría!</p>
        </div>`;
        const allChk = document.getElementById('uncatSelectAll');
        if (allChk) allChk.disabled = true;
        return;
    }

    const allChk = document.getElementById('uncatSelectAll');
    if (allChk) {
        allChk.disabled = false;
        allChk.checked = data.data.every(b => _uncatSelected.has(b.id));
    }

    if (list) list.innerHTML = data.data.map(biz => `
    <div class="flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition">
        <input type="checkbox" class="uncat-check mt-1 w-4 h-4 accent-brand-500 flex-shrink-0"
               value="${biz.id}" onchange="toggleUncatSelect(${biz.id}, this.checked)"
               ${_uncatSelected.has(biz.id) ? 'checked' : ''}>
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-gray-900 text-sm">${biz.trade_name || biz.name}</span>
                <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">${biz.plan_type || 'basic'}</span>
                ${biz.city ? `<span class="text-[10px] text-gray-400"><i class="fas fa-map-marker-alt mr-1"></i>${biz.city}</span>` : ''}
            </div>
            ${biz.description ? `<p class="text-xs text-gray-400 mt-0.5 truncate">${biz.description}</p>` : ''}
            ${Array.isArray(biz.tags) && biz.tags.length ? `
            <div class="flex flex-wrap gap-1 mt-1">
                ${biz.tags.slice(0,5).map(t => `<span class="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">${t}</span>`).join('')}
            </div>` : ''}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
            <select class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white max-w-[180px]"
                    id="catSel_${biz.id}">
                <option value="">— Categoría —</option>
                ${buildUncatCatOptions()}
            </select>
            <button onclick="assignSingleCategory(${biz.id})"
                class="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition whitespace-nowrap">
                Asignar
            </button>
        </div>
    </div>`).join('');

    renderUncatPagination();
}

function toggleSelectAllUncat(checked) {
    document.querySelectorAll('.uncat-check').forEach(chk => {
        chk.checked = checked;
        const id = parseInt(chk.value);
        if (checked) _uncatSelected.add(id);
        else _uncatSelected.delete(id);
    });
    updateBulkBar();
}

function toggleUncatSelect(id, checked) {
    if (checked) _uncatSelected.add(id);
    else _uncatSelected.delete(id);
    // Actualizar el "todos" si corresponde
    const all = document.querySelectorAll('.uncat-check');
    const allChk = document.getElementById('uncatSelectAll');
    if (allChk) allChk.checked = all.length > 0 && [...all].every(c => c.checked);
    updateBulkBar();
}

function clearUncatSelection() {
    _uncatSelected.clear();
    document.querySelectorAll('.uncat-check').forEach(c => c.checked = false);
    const allChk = document.getElementById('uncatSelectAll');
    if (allChk) allChk.checked = false;
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('uncatBulkBar');
    const cnt = document.getElementById('uncatSelCount');
    if (bar) bar.classList.toggle('hidden', _uncatSelected.size === 0);
    if (cnt) cnt.textContent = `${_uncatSelected.size} seleccionada${_uncatSelected.size !== 1 ? 's' : ''}`;
}

async function assignSingleCategory(bizId) {
    const sel = document.getElementById(`catSel_${bizId}`);
    const catId = sel?.value;
    if (!catId) { showToast('Elegí una categoría', 'error'); return; }
    const res = await apiAdminPost('/businesses/bulk-category', {
        business_ids: [bizId], category_id: parseInt(catId)
    });
    if (res.success) {
        showToast(`✅ Asignado: ${res.category}`);
        loadUncategorized();
    } else { showToast('Error: ' + (res.error || 'No se pudo asignar'), 'error'); }
}

async function applyBulkCategory() {
    const catId = document.getElementById('uncatBulkCat')?.value;
    if (!catId) { showToast('Elegí una categoría', 'error'); return; }
    if (!_uncatSelected.size) { showToast('Seleccioná al menos una empresa', 'error'); return; }
    if (!confirm(`¿Asignar a ${_uncatSelected.size} empresa${_uncatSelected.size !== 1 ? 's' : ''}?`)) return;

    const res = await apiAdminPost('/businesses/bulk-category', {
        business_ids: [..._uncatSelected],
        category_id:  parseInt(catId),
    });
    if (res.success) {
        showToast(`✅ ${res.updated} empresa${res.updated !== 1 ? 's' : ''} → ${res.category}`);
        loadUncategorized(true);
    } else { showToast('Error: ' + (res.error || 'No se pudo asignar'), 'error'); }
}

function renderUncatPagination() {
    const pages = Math.ceil(_uncatTotal / UNCAT_LIMIT);
    const pag   = document.getElementById('uncatPagination');
    if (!pag) return;
    if (pages <= 1) { pag.classList.add('hidden'); return; }
    pag.classList.remove('hidden');

    const maxVisible = 10;
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(0, _uncatPage - half);
    let end   = Math.min(pages - 1, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(0, end - maxVisible + 1);

    let html = '';
    // Botón anterior
    html += `<button onclick="_uncatPage=${_uncatPage-1};loadUncategorized()"
        class="w-9 h-9 rounded-lg text-sm font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 ${_uncatPage===0?'opacity-40 pointer-events-none':''}">&laquo;</button>`;
    // Primera página si no está visible
    if (start > 0) {
        html += `<button onclick="_uncatPage=0;loadUncategorized()" class="w-9 h-9 rounded-lg text-sm font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">1</button>`;
        if (start > 1) html += `<span class="w-9 h-9 flex items-center justify-center text-gray-400">…</span>`;
    }
    // Páginas del rango
    for (let i = start; i <= end; i++) {
        html += `<button onclick="_uncatPage=${i};loadUncategorized()"
            class="w-9 h-9 rounded-lg text-sm font-bold transition ${i===_uncatPage?'bg-brand-500 text-white border border-brand-500':'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}">${i+1}</button>`;
    }
    // Última página si no está visible
    if (end < pages - 1) {
        if (end < pages - 2) html += `<span class="w-9 h-9 flex items-center justify-center text-gray-400">…</span>`;
        html += `<button onclick="_uncatPage=${pages-1};loadUncategorized()" class="w-9 h-9 rounded-lg text-sm font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">${pages}</button>`;
    }
    // Botón siguiente
    html += `<button onclick="_uncatPage=${_uncatPage+1};loadUncategorized()"
        class="w-9 h-9 rounded-lg text-sm font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 ${_uncatPage===pages-1?'opacity-40 pointer-events-none':''}">&raquo;</button>`;

    pag.innerHTML = html;
}
