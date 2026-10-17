/**
 * RetoPA — js/filters.js
 * performSearch(), filtros, paginación, renderListRow(), sugerencias
 */

function performSearch() {
    currentSearch = document.getElementById('mainSearch').value.trim();
    const citySelect = document.getElementById('citySelect');
    const categorySelect = document.getElementById('categorySelect');
    if (citySelect?.value) currentCity = citySelect.value;
    if (categorySelect?.value) currentCategory = categorySelect.value;
    document.getElementById('searchSuggestions').classList.add('hidden');
    currentOffset = 0;
    updateSectionTitle();
    loadBusinesses(true, 'resultsList');
    document.getElementById('directorio').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function quickSearch(term) {
    document.getElementById('mainSearch').value = term;
    document.getElementById('searchSuggestions').classList.add('hidden');
    performSearch();
}

// ── E3.3a — Selector de TODAS las categorías ──────────────────────────
let _rpCats = null; // cache de /categories
function _rpNormCat(s) { return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); }

async function rpLoadCats() {
    if (!_rpCats) {
        try {
            const d = await apiGet('/categories');
            _rpCats = (d && d.success && Array.isArray(d.data)) ? d.data.slice() : [];
            // Ordenar por cantidad de negocios (desc) y luego por nombre.
            _rpCats.sort((a, b) => (b.businessCount || 0) - (a.businessCount || 0) || String(a.name).localeCompare(String(b.name)));
        } catch (e) { _rpCats = []; }
    }
    return _rpCats;
}

// Nombre visible de un rubro por su slug (para el título y el chip de filtro).
function rpCatName(slug) {
    const c = (_rpCats || []).find(x => x.slug === slug);
    if (c) return c.name;
    const combo = (window._comboData && window._comboData.cat || []).find(x => x.value === slug);
    if (combo) return String(combo.label).replace(/^\s*›\s*/, '').trim();
    return document.querySelector(`[data-slug="${slug}"] h4`)?.textContent || slug;
}

let _rpPickerOnly = null; // lista acotada de rubros a mostrar (pastilla con varios candidatos)
async function rpOpenCatPicker(prefill, onlyCats) {
    _rpPickerOnly = Array.isArray(onlyCats) && onlyCats.length ? onlyCats : null;
    const modal = document.getElementById('catPickerModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const input = document.getElementById('catPickerSearch');
    if (input) input.value = _rpPickerOnly ? '' : (prefill || '');
    const list = document.getElementById('catPickerList');
    if (!_rpCats && list) list.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8">Cargando rubros…</div>';
    await rpLoadCats();
    rpRenderCatList(_rpPickerOnly ? '' : (prefill || ''));
    if (input) setTimeout(() => input.focus(), 60);
}

// Pastillas "Buscá por rubro": filtran por RUBRO, no por texto libre.
// El término se busca en la lista de rubros (sin tildes, singular/plural):
//   · coincide con UNO solo → se filtra por ese rubro;
//   · con varios → se abre "Elegí un rubro" ya filtrado, y elige la persona;
//   · con ninguno → búsqueda de texto, como antes.
const _rpStem = s => _rpNormCat(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .map(w => w.length > 4 ? w.replace(/(es|s)$/, '') : w).join(' ');
// Parecido por trigramas (como pg_trgm.similarity): "Electricista" ↔ "Electricidad" ≈ 0.5.
function _rpTriSim(a, b) {
    const tri = s => { const t = '  ' + _rpStem(s) + ' '; const set = new Set(); for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3)); return set; };
    const A = tri(a), B = tri(b); let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter || 1);
}
async function rpRubroPick(term) {
    const cats = (await rpLoadCats()).filter(c => c && c.slug);
    const t = _rpStem(term);
    let hits = cats.filter(c => _rpStem(c.name) === t);
    if (!hits.length) hits = cats.filter(c => (' ' + _rpStem(c.name) + ' ').includes(' ' + t + ' '));
    // Sin coincidencia de palabra: rubros de nombre parecido (≥ 0.45). Uno → ese
    // (se ve en el chip "Rubro: …"); varios → que elija la persona.
    if (!hits.length) hits = cats.filter(c => _rpTriSim(c.name, term) >= 0.45);
    if (hits.length === 1) return rpApplyRubro(hits[0].slug);
    if (hits.length > 1) return rpOpenCatPicker(term, hits);
    // Una pastilla es una búsqueda nueva: se suelta el rubro que hubiera.
    currentCategory = null;
    const sel = document.getElementById('categorySelect'); if (sel) sel.value = '';
    const combo = document.getElementById('catComboInput'); if (combo) combo.value = '';
    const i = document.getElementById('mainSearch'); if (i) i.value = term;
    performSearch();
}

// Aplica un rubro como filtro: limpia el texto libre y lo refleja en el combo.
function rpApplyRubro(slug) {
    const i = document.getElementById('mainSearch'); if (i) i.value = '';
    currentSearch = '';
    currentCategory = slug;
    const sel = document.getElementById('categorySelect'); if (sel) sel.value = slug;
    const combo = document.getElementById('catComboInput'); if (combo) combo.value = rpCatName(slug);
    document.querySelectorAll('.category-card').forEach(p => p.classList.toggle('active', p.dataset.slug === slug));
    currentOffset = 0;
    updateSectionTitle();
    loadBusinesses(true, 'resultsList');
    document.getElementById('directorio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function rpCloseCatPicker() {
    const modal = document.getElementById('catPickerModal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function rpRenderCatList(q) {
    const list = document.getElementById('catPickerList');
    if (!list) return;
    const nq = _rpNormCat(q);
    const cats = (!nq && _rpPickerOnly) ? _rpPickerOnly : (_rpCats || []);
    const matches = cats.filter(c => c.slug && (!nq || _rpNormCat(c.name).includes(nq)));
    if (!matches.length) {
        list.innerHTML = '<div style="padding:28px;text-align:center;color:#94a3b8">Sin rubros que coincidan</div>';
        return;
    }
    list.innerHTML = matches.map(c => {
        const col = c.color || '#1B3A6B';
        const count = c.businessCount || 0;
        const nm = (typeof escHtml === 'function') ? escHtml(c.name) : c.name;
        return `<button type="button" onclick="rpPickCategory('${c.slug}')"
            style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 16px;border:0;border-bottom:1px solid #f1f5f9;background:#fff;cursor:pointer;min-height:52px">
            <span style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${col}18;color:${col}"><i class="fas ${c.icon || 'fa-tag'}"></i></span>
            <span style="flex:1;min-width:0;font-weight:600;color:#0F1E36;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nm}</span>
            <span style="font-size:12px;color:#94a3b8;flex-shrink:0">${count}</span>
        </button>`;
    }).join('');
}

function rpPickCategory(slug) {
    rpCloseCatPicker();
    rpApplyRubro(slug);
}

// ── E3.3b — Chips de filtro sticky (mobile) ───────────────────────────
// Recargan leyendo directamente los controles reales (checkbox/radio/sort),
// sin pasar por applyFilters (que resetearía la ciudad).
function rpReloadResults() {
    currentOffset = 0;
    updateSectionTitle();
    loadBusinesses(true, 'resultsList');
}

function rpToggleFilter(key) {
    if (key === 'verified') {
        const c = document.getElementById('filterVerified');
        if (c) c.checked = !c.checked;
        rpReloadResults();
    } else if (key === 'rating') {
        const r = document.querySelector('input[name="rating"][value="4"]');
        if (r) r.checked = !r.checked;
        rpReloadResults();
    } else if (key === 'near') {
        if (typeof getUserLocation === 'function' && getUserLocation()) {
            // ya activo: si hay forma de limpiar, limpiamos; si no, recargamos igual
            if (typeof clearUserLocation === 'function') clearUserLocation();
            rpReloadResults();
            if (typeof loadAbiertosAhora === 'function') loadAbiertosAhora();
        } else if (typeof requestLocation === 'function') {
            requestLocation(() => { rpReloadResults(); if (typeof loadAbiertosAhora === 'function') loadAbiertosAhora(); }, false);
        }
    }
    rpSetFilterChipsState();
}

function rpMobileSort(v) {
    const sel = document.getElementById('sortOrder');
    if (sel) sel.value = v;
    rpReloadResults();
}

// Sincroniza el estado visual (active) de los chips con los controles reales.
function rpSetFilterChipsState() {
    const set = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('active', !!on); };
    set('rpChipVerified', document.getElementById('filterVerified')?.checked);
    set('rpChipRating', document.querySelector('input[name="rating"][value="4"]')?.checked);
    set('rpChipNear', (typeof getUserLocation === 'function' && !!getUserLocation()));
    // Reflejar el orden en el select mobile
    const mob = document.getElementById('rpSortMobile');
    const desk = document.getElementById('sortOrder');
    if (mob && desk && mob.value !== desk.value) mob.value = desk.value;
}

function filterByCategory(slug, el) {
    document.querySelectorAll('.category-card').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    currentCategory = currentCategory === slug ? null : slug;
    if (!el && currentCategory)
        document.querySelector(`[data-slug="${slug}"]`)?.classList.add('active');
    const select = document.getElementById('categorySelect');
    if (select) select.value = currentCategory || '';
    currentOffset = 0;
    updateSectionTitle();
    loadBusinesses(true, 'resultsList');
    document.getElementById('directorio').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyFilters() {
    const filterCity = document.getElementById('filterCity');
    currentCity = filterCity?.value || '';
    currentOffset = 0;
    updateSectionTitle();
    loadBusinesses(true, 'resultsList');
}

function updateSectionTitle() {
    const titleEl = document.getElementById('resultsTitle');
    if (!titleEl) return;
    if (currentSearch) {
        titleEl.innerHTML = `Resultados para <span class="text-brand-600">"${escHtml(currentSearch)}"</span>`;
    } else if (currentCategory) {
        titleEl.textContent = `Empresas — ${rpCatName(currentCategory)}`;
    } else if (currentCity) {
        titleEl.textContent = `Empresas en ${currentCity}`;
    } else {
        titleEl.textContent = 'Empresas verificadas y destacadas';
    }

    // v2.6: galería es el modo por defecto siempre — el usuario puede cambiar manualmente
    if (!currentSearch && !currentCategory && !currentCity) {
        currentViewMode = 'cards';
    }
}


// ── Vista ─────────────────────────────────────────────────────────
function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('retopaViewMode', mode);
    document.getElementById('viewBtnList')?.classList.toggle('active', mode === 'list');
    document.getElementById('viewBtnCards')?.classList.toggle('active', mode === 'cards');
    loadBusinesses(true, 'resultsList');
}

// ── Paginación ─────────────────────────────────────────────────────
function goToPage(page) {
    currentOffset = (page - 1) * 10;
    window._paginationOffset = true; // señal para que loadBusinesses no resetee el offset
    loadBusinesses(true, 'resultsList');
    const topPag = document.getElementById('paginationContainerTop');
    if (topPag) topPag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderPagination(curPage, pages, total) {
    ['paginationContainer', 'paginationContainerTop'].forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        if (pages <= 1) { container.innerHTML = ''; return; }

        const MAX = 5;
        let s = Math.max(1, curPage - Math.floor(MAX / 2));
        let e = Math.min(pages, s + MAX - 1);
        if (e - s < MAX - 1) s = Math.max(1, e - MAX + 1);

        const from = (curPage - 1) * 10 + 1;
        const to   = Math.min(curPage * 10, total);

        // Construir HTML sin template literals anidados
        let parts = [];
        parts.push(`<div class="flex items-center justify-center gap-1.5 flex-wrap py-4">`);
        parts.push(`<span class="text-sm text-gray-400 mr-3 hidden sm:block">${from.toLocaleString()}–${to.toLocaleString()} de ${total.toLocaleString()}</span>`);

        const mkBtn = (page, label, isActive, isDisabled) => {
            if (isActive)    return `<span class="w-10 h-10 rounded-xl text-sm font-bold flex items-center justify-center btn-brand text-white shadow-md cursor-default">${label}</span>`;
            if (isDisabled)  return `<span class="w-10 h-10 rounded-xl text-sm flex items-center justify-center text-gray-200 cursor-not-allowed">${label}</span>`;
            return `<button type="button" class="pagination-btn w-10 h-10 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 flex items-center justify-center transition" data-page="${page}">${label}</button>`;
        };

        parts.push(mkBtn(curPage - 1, '<i class="fas fa-chevron-left text-xs"></i>', false, curPage === 1));
        if (s > 1) { parts.push(mkBtn(1, '1', false, false)); if (s > 2) parts.push('<span class="text-gray-300 self-center px-1">…</span>'); }
        for (let p = s; p <= e; p++) parts.push(mkBtn(p, p, p === curPage, false));
        if (e < pages) { if (e < pages - 1) parts.push('<span class="text-gray-300 self-center px-1">…</span>'); parts.push(mkBtn(pages, pages, false, false)); }
        parts.push(mkBtn(curPage + 1, '<i class="fas fa-chevron-right text-xs"></i>', false, curPage === pages));
        parts.push('</div>');

        container.innerHTML = parts.join('');
        // Los clicks los maneja el listener global en document (ver abajo)
    });
}

// ── Render: fila compacta de búsqueda ──────────────────────────────
function highlight(text, query) {
    if (!query || !text) return escHtml(text || '');
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function renderListRow(biz) {
    const plan = biz.planType === 'premium'
        ? '<span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">PRO</span>'
        : biz.planType === 'featured'
        ? '<span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">DEST.</span>'
        : '';
    const logo = biz.imageUrl
        ? `<img src="${biz.imageUrl}" class="biz-list-logo" onerror="imgFallback(this)" alt="">`
        : `<div class="biz-list-logo flex items-center justify-center"><i class="fas fa-building text-gray-300 text-lg"></i></div>`;
    const city    = biz.city    ? `<span><i class="fas fa-map-marker-alt"></i> ${escHtml(biz.city)}${typeof renderDistanceBadge === 'function' ? renderDistanceBadge(biz) : ''}${typeof renderHowToGetLink === 'function' ? renderHowToGetLink(biz) : ''}</span>` : '';
    const phone   = biz.phone   ? `<span><i class="fas fa-phone"></i> ${escHtml(biz.phone)}</span>` : '';
    const website = biz.website ? `<span><i class="fas fa-globe"></i> ${escHtml(biz.website.replace(/^https?:\/\//,''))}</span>` : '';
    const cat     = biz.categoryName ? `<span class="text-brand-400 font-medium">${escHtml(biz.categoryName)}</span>` : '';
    const verified = biz.verified ? '<i class="fas fa-check-circle text-green-500" title="Verificado"></i>' : '';

    return `<div class="biz-list-row" onclick="openProfile('${biz.slug}')">
        ${logo}
        <div class="flex-1 min-w-0">
            <div class="biz-list-name truncate">${highlight(biz.name, currentSearch)} ${plan} ${verified}</div>
            <div class="biz-list-meta">${cat}${city}${phone}${website}</div>
        </div>
        <i class="fas fa-chevron-right text-gray-300 text-xs flex-shrink-0"></i>
    </div>`;
}

function loadMore() {
    loadBusinesses(false, 'resultsList');
}

function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    const filters = [];

    if (currentSearch) filters.push({ text: `Búsqueda: "${currentSearch}"`, type: 'search' });
    if (currentCategory) {
        filters.push({ text: `Rubro: ${rpCatName(currentCategory)}`, type: 'category' });
    }
    if (currentCity) filters.push({ text: `Ciudad: ${currentCity}`, type: 'city' });
    if (document.getElementById('filterVerified')?.checked) filters.push({ text: '✓ Verificados', type: 'verified' });
    if (document.querySelector('input[name="rating"]:checked')) filters.push({ text: `★ ${document.querySelector('input[name="rating"]:checked').value}+`, type: 'rating' });

    if (filters.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <span class="text-xs text-gray-500 font-medium uppercase tracking-wider">Filtros:</span>
        ${filters.map(f => `<span class="filter-chip text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded-md font-medium border border-brand-100">${f.text}</span>`).join('')}
        <button onclick="clearAllFilters()" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1 rounded-md font-bold transition flex items-center gap-1 border border-red-200 ml-auto"><i class="fas fa-times"></i> Limpiar todo</button>
    `;
}

function clearAllFilters() {
    document.getElementById('mainSearch').value = '';
    document.getElementById('citySelect').value = '';
    document.getElementById('categorySelect').value = '';
    document.getElementById('filterVerified').checked = false;
    document.querySelectorAll('input[name="rating"]').forEach(r => r.checked = false);
    document.getElementById('filterCity').value = '';

    // Limpiar combobox visibles del buscador hero (Sprint 5)
    const cityComboInput = document.getElementById('cityComboInput');
    const catComboInput  = document.getElementById('catComboInput');
    if (cityComboInput) cityComboInput.value = '';
    if (catComboInput)  catComboInput.value  = '';

    currentSearch   = '';
    currentCategory = null;
    currentCity     = '';
    currentOffset   = 0;
    currentViewMode = 'cards';

    document.querySelectorAll('.category-card').forEach(p => p.classList.remove('active'));
    document.getElementById('activeFilters').classList.add('hidden');

    // Ocultar toggle de vista
    const toggleEl = document.getElementById('viewToggle');
    if (toggleEl) { toggleEl.classList.add('hidden'); toggleEl.classList.remove('flex'); }

    updateSectionTitle();
    loadBusinesses(true, 'resultsList');
}

// ============================================
// SUGERENCIAS DE BÚSQUEDA
// ============================================
let suggestionTimeout;
document.getElementById('mainSearch').addEventListener('input', function(e) {
    clearTimeout(suggestionTimeout);
    const q = e.target.value.trim();
    const dropdown = document.getElementById('searchSuggestions');

    if (q.length < 2) { dropdown.classList.add('hidden'); return; }

    suggestionTimeout = setTimeout(async () => {
        const data = await apiGet(`/search/suggestions?q=${encodeURIComponent(q)}`);
        if (data.success && data.data.length) {
            dropdown.innerHTML = data.data.map(s => {
                const safeName = s.name.replace(/'/g, "\'").replace(/"/g, '&quot;');
                const safeSlug = s.slug || '';
                return `<div class="suggestion-item px-4 py-3 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-3"
                     onmousedown="event.preventDefault()"
                     onclick="selectSuggestion('${safeSlug}', '${safeName}')">
                    <div class="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
                        <i class="fas fa-building text-brand-400 text-xs"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-medium text-sm text-gray-800 truncate">${s.name}</div>
                        <div class="text-xs text-gray-400">${s.category_name || ''}${s.city ? ' · ' + s.city : ''}</div>
                    </div>
                    <i class="fas fa-arrow-right text-gray-300 text-xs shrink-0"></i>
                </div>`;
            }).join('') + `<div class="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                    <button onmousedown="event.preventDefault()" onclick="document.getElementById('searchSuggestions').classList.add('hidden'); quickSearch(document.getElementById('mainSearch').value)"
                        class="text-xs text-brand-600 hover:text-brand-800 font-medium w-full text-left">
                        <i class="fas fa-search mr-1"></i> Buscar en todo el directorio
                    </button>
                </div>`;
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    }, 200);
});

// Seleccionar sugerencia → abrir perfil directamente (match exacto)
function selectSuggestion(slug, name) {
    document.getElementById('searchSuggestions').classList.add('hidden');
    document.getElementById('mainSearch').value = name;
    if (slug) {
        openProfile(slug);
    } else {
        quickSearch(name);
    }
}

// ── PAGINACIÓN: listener global — captura clicks sin importar cuándo se renderice ──
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.pagination-btn[data-page]');
    if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const page = parseInt(btn.dataset.page);
        if (!isNaN(page) && page > 0) goToPage(page);
        return;
    }
    // Cerrar sugerencias al click fuera
    if (!e.target.closest('#mainSearch') && !e.target.closest('#searchSuggestions')) {
        document.getElementById('searchSuggestions')?.classList.add('hidden');
    }
});

// ============================================
// REGISTRO EMPRESA - LOGIN OBLIGATORIO
