/**
 * RetoPA — Panel Embajador
 * businesses.js: mis fichas + modal nueva ficha
 * Combobox de rubros y ciudades igual que panel cliente,
 * con ciudades agrupadas por departamento y mapa Nominatim.
 */

// ── Kits QR por lote (todos los negocios del embajador) ───────────────────
async function downloadMyKits() {
    showToastAmb('Generando tus kits…');
    try {
        const res = await fetch(`${API_BASE}/ambassador/kits.pdf`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) { showToastAmb(res.status === 404 ? 'No tenés negocios para el kit' : 'No se pudo generar', 'error'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'kits-retopa.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { showToastAmb('Error al generar kits', 'error'); }
}

let _ambPage   = 1;
let _ambCities = []; // [{ name, department }]
let _ambCats   = []; // [{ id, name, parent_id, parent_name }]

// ════════════════════════════════════════════════════════════════════
// SOPORTE: ciudades y rubros
// ════════════════════════════════════════════════════════════════════
async function loadSupportData() {
    const [cities, cats] = await Promise.all([
        ambGet('/cities?limit=500'),
        ambGet('/categories')
    ]);

    if (cities.success) {
        _ambCities = (cities.data || [])
            .map(c => ({ name: c.name || c, department: c.department || '' }))
            .sort((a, b) => {
                const dc = (a.department || '').localeCompare(b.department || '', 'es');
                return dc !== 0 ? dc : a.name.localeCompare(b.name, 'es');
            });
    }

    if (cats.success) {
        const raw = cats.data || [];
        // Enriquecer subcategorías con nombre del padre
        const parents = raw.filter(c => !c.parent_id);
        const kids    = raw.filter(c =>  c.parent_id);
        _ambCats = [
            ...parents.map(p => ({ ...p, parent_name: null })),
            ...kids.map(k => ({
                ...k,
                parent_name: parents.find(p => p.id === k.parent_id)?.name || ''
            }))
        ];
    }
}

// ── Combobox ciudades ─────────────────────────────────────────────────────
function nfFilterCity() {
    const q = (document.getElementById('nfCityInput')?.value || '').toLowerCase().trim();
    const filtered = _ambCities.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.department || '').toLowerCase().includes(q)
    ).slice(0, 15);
    renderNfCityList(filtered, q);
    document.getElementById('nfCityList')?.classList.remove('hidden');
}

function nfOpenCity() {
    const q = (document.getElementById('nfCityInput')?.value || '').toLowerCase().trim();
    const filtered = _ambCities.filter(c => !q ||
        c.name.toLowerCase().includes(q) ||
        (c.department || '').toLowerCase().includes(q)
    ).slice(0, 15);
    renderNfCityList(filtered, q);
    document.getElementById('nfCityList')?.classList.remove('hidden');
}

function nfCloseCity() {
    setTimeout(() => document.getElementById('nfCityList')?.classList.add('hidden'), 180);
}

function renderNfCityList(cities, q) {
    const list = document.getElementById('nfCityList');
    if (!list) return;
    if (!cities.length) {
        list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>';
        return;
    }
    // Agrupar por departamento
    const byDept = {};
    cities.forEach(c => {
        const d = c.department || 'Sin departamento';
        if (!byDept[d]) byDept[d] = [];
        byDept[d].push(c);
    });
    list.innerHTML = Object.entries(byDept).map(([dept, cs]) => `
        <div class="px-3 pt-2 pb-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">${escHtml(dept)}</div>
        ${cs.map(c => `
        <div onclick="nfSelectCity('${escHtml(c.name)}')"
            class="px-4 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer flex items-center gap-2">
            <i class="fas fa-map-marker-alt text-gray-300 text-xs"></i>${escHtml(c.name)}
        </div>`).join('')}
    `).join('');
}

function nfSelectCity(name) {
    document.getElementById('nfCityInput').value = name;
    document.getElementById('nfCity').value      = name;
    document.getElementById('nfCityList')?.classList.add('hidden');
}

// ── Combobox rubros (con sub-rubros) ─────────────────────────────────────
let _nfSelectedCatId = null;

function nfFilterCat() {
    const q = (document.getElementById('nfCatInput')?.value || '').toLowerCase().trim();
    const filtered = _ambCats
        .filter(c => (c.name || '').toLowerCase().includes(q) ||
                     (c.parent_name || '').toLowerCase().includes(q))
        .slice(0, 15);
    renderNfCatList(filtered);
    document.getElementById('nfCatList')?.classList.remove('hidden');
}

function nfOpenCat() {
    const q = (document.getElementById('nfCatInput')?.value || '').toLowerCase().trim();
    const filtered = _ambCats
        .filter(c => !q || (c.name || '').toLowerCase().includes(q) ||
                           (c.parent_name || '').toLowerCase().includes(q))
        .slice(0, 15);
    renderNfCatList(filtered);
    document.getElementById('nfCatList')?.classList.remove('hidden');
}

function nfCloseCat() {
    setTimeout(() => document.getElementById('nfCatList')?.classList.add('hidden'), 180);
}

function renderNfCatList(cats) {
    const list = document.getElementById('nfCatList');
    if (!list) return;
    if (!cats.length) {
        list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>';
        return;
    }
    list.innerHTML = cats.map(c => `
        <div onclick="nfSelectCat(${c.id}, '${escHtml(c.name)}')"
            class="px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer">
            ${escHtml(c.name)}
            ${c.parent_name ? `<span class="text-xs text-gray-400 ml-1">· ${escHtml(c.parent_name)}</span>` : ''}
        </div>`).join('');
}

function nfSelectCat(id, name) {
    _nfSelectedCatId = id;
    document.getElementById('nfCatInput').value = name;
    document.getElementById('nfCatHidden').value = id;
    document.getElementById('nfCatList')?.classList.add('hidden');
}

// ── Mapa Nominatim (igual que panel cliente) ──────────────────────────────
let _nfMap = null, _nfMarker = null;

function nfInitMap(lat, lng) {
    const container = document.getElementById('nfMapContainer');
    if (!container) return;
    const latN = parseFloat(lat), lngN = parseFloat(lng);

    if (typeof google === 'undefined' || !google.maps) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;flex-direction:column;gap:6px;"><i class="fas fa-spinner fa-spin text-xl"></i><span>Cargando mapa...</span></div>';
        setTimeout(() => nfInitMap(latN, lngN), 1200);
        return;
    }
    if (isNaN(latN) || isNaN(lngN)) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;flex-direction:column;gap:6px;"><i class="fas fa-map-marker-alt text-xl"></i><span>Usá "Buscar coordenadas" arriba</span></div>';
        return;
    }

    container.innerHTML = '<div id="nfMapDiv" style="width:100%;height:100%"></div>';
    _nfMap = new google.maps.Map(document.getElementById('nfMapDiv'), {
        center: { lat: latN, lng: lngN }, zoom: 15,
        mapTypeControl: false, streetViewControl: false
    });
    _nfMarker = new google.maps.Marker({ position: { lat: latN, lng: lngN }, map: _nfMap, draggable: true });
    _nfMarker.addListener('dragend', e => {
        document.getElementById('nfLat').value = e.latLng.lat().toFixed(7);
        document.getElementById('nfLng').value = e.latLng.lng().toFixed(7);
    });
    _nfMap.addListener('click', e => {
        _nfMarker.setPosition(e.latLng);
        document.getElementById('nfLat').value = e.latLng.lat().toFixed(7);
        document.getElementById('nfLng').value = e.latLng.lng().toFixed(7);
    });
    setTimeout(() => google.maps.event.trigger(_nfMap, 'resize'), 100);
}

async function nfGeocode() {
    const address = (document.getElementById('nfAddress')?.value?.trim() ||
                     document.getElementById('nfCityInput')?.value?.trim() || '');
    if (!address) { showToastAmb('Ingresá una dirección o ciudad primero', 'warning'); return; }
    showToastAmb('Buscando coordenadas...');
    try {
        const query   = encodeURIComponent(address + ', Paraguay');
        const res     = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
            { headers: { 'Accept-Language': 'es', 'User-Agent': 'RetoPA-Directory/1.0' } });
        const results = await res.json();
        if (!results.length) { showToastAmb('No se encontraron coordenadas', 'warning'); return; }
        const latN = parseFloat(results[0].lat), lngN = parseFloat(results[0].lon);
        document.getElementById('nfLat').value = latN.toFixed(7);
        document.getElementById('nfLng').value = lngN.toFixed(7);
        nfInitMap(latN, lngN);
        showToastAmb('✅ Coordenadas encontradas');
    } catch(e) {
        showToastAmb('Error al buscar coordenadas', 'warning');
    }
}

// ════════════════════════════════════════════════════════════════════
// MIS FICHAS — con selección múltiple para envío por lote
// ════════════════════════════════════════════════════════════════════
let _selectedFichas = new Set(); // IDs seleccionados para envío por lote

async function loadMyFichas(page = 1) {
    _ambPage = page;
    _selectedFichas.clear();
    updateBatchBar();

    const status = document.getElementById('fichasStatusFilter')?.value || '';
    let url = `/ambassador/businesses?page=${page}&limit=15`;
    if (status) url += `&status=${status}`;

    const data = await ambGet(url);
    const container = document.getElementById('fichasList');
    if (!container) return;

    if (!data.success) {
        container.innerHTML = '<p class="text-red-400 text-sm text-center py-8">Error cargando fichas</p>';
        return;
    }

    if (!data.data.length) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <i class="fas fa-building text-4xl mb-3 block"></i>
                <p class="font-medium text-gray-600">No hay fichas${status ? ' en este estado' : ''}</p>
                <button onclick="openNuevaFichaModal()"
                    class="mt-4 bg-brand-500 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-brand-600 transition">
                    <i class="fas fa-plus mr-1"></i> Cargar ficha
                </button>
            </div>`;
        return;
    }

    // Fichas enviables (draft o rejected)
    const enviables = data.data.filter(b => b.data_status === 'draft' || b.data_status === 'rejected');
    const hayEnviables = enviables.length > 0;

    container.innerHTML = `
        <div class="flex justify-end mb-3">
            <button onclick="downloadMyKits()" class="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition">
                <i class="fas fa-qrcode"></i> Descargar mis kits
            </button>
        </div>` + (hayEnviables ? `
        <div class="flex items-center gap-3 mb-2 px-1">
            <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" id="chkSelectAll" onchange="toggleSelectAll(this.checked)"
                    class="w-4 h-4 rounded border-gray-300 accent-brand-500">
                Seleccionar todas las enviables
            </label>
        </div>` : '') +
    data.data.map(b => {
        const isDraft    = b.data_status === 'draft';
        const isPending  = b.data_status === 'pending_review';
        const isRejected = b.data_status === 'rejected';
        const isPublished = !b.data_status;
        const canSend = isDraft || isRejected;

        const statusBadge = isPending
            ? `<span class="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-clock mr-1"></i>En revisión</span>`
            : isRejected
            ? `<span class="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-times mr-1"></i>Rechazada</span>`
            : isDraft
            ? `<span class="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-pencil-alt mr-1"></i>Borrador</span>`
            : `<span class="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-check mr-1"></i>Publicada</span>`;

        const rejNote = isRejected && b.review_note
            ? `<div class="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700"><i class="fas fa-info-circle mr-1"></i>${escHtml(b.review_note)}</div>`
            : '';

        const actions = isPublished
            ? `<a href="/empresa/${escHtml(b.slug)}" target="_blank" class="text-xs bg-brand-50 text-brand-600 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition font-medium"><i class="fas fa-external-link-alt mr-1"></i>Ver</a>`
            : canSend
            ? `<div class="flex gap-1.5 flex-wrap">
                 <button onclick="openEditFichaModal(${b.id})" class="text-xs bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 transition"><i class="fas fa-edit mr-1"></i>Editar</button>
                 <button onclick="submitSingle(${b.id})" class="text-xs bg-brand-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-brand-600 transition font-medium"><i class="fas fa-paper-plane mr-1"></i>Enviar</button>
                 ${isRejected ? `<button onclick="archiveFicha(${b.id})" class="text-xs bg-red-50 text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-100 transition" title="Archivar"><i class="fas fa-archive"></i></button>` : ''}
                 ${isDraft && b.assignment_type === 'assigned' ? `<button onclick="releaseFicha(${b.id})" class="text-xs bg-orange-50 text-orange-500 px-2 py-1.5 rounded-lg hover:bg-orange-100 transition" title="Liberar — devolver al pool"><i class="fas fa-undo"></i></button>` : ''}
               </div>`
            : `<span class="text-xs text-gray-300">En revisión</span>`;

        const checkbox = canSend ? `
            <input type="checkbox" data-id="${b.id}" onchange="toggleFichaSelect(${b.id},this.checked)"
                class="ficha-check w-4 h-4 rounded border-gray-300 accent-brand-500 shrink-0 mt-1">` : '<div class="w-4 shrink-0"></div>';

        return `
        <div class="biz-mobile-card p-4 flex gap-3">
            ${checkbox}
            <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2 flex-wrap">
                    <div class="flex items-start gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0 overflow-hidden border border-gray-200">
                            ${b.image_url ? `<img src="${escHtml(b.image_url)}" class="w-full h-full object-cover">` : (b.logo_emoji || '🏢')}
                        </div>
                        <div class="min-w-0">
                            <p class="font-bold text-gray-900 truncate text-sm">${escHtml(b.trade_name || b.name)}</p>
                            <p class="text-xs text-gray-400">${escHtml(b.category_name||'-')} · ${escHtml(b.city||'-')}${b.ruc?' · RUC: '+escHtml(b.ruc):''}</p>
                        </div>
                    </div>
                    ${statusBadge}
                </div>
                ${rejNote}
                <div class="mt-2 inline-flex items-center gap-3 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
                    <span class="text-gray-600" title="Visitas en los últimos 30 días"><i class="fas fa-eye text-gray-400 mr-1"></i>${(b.views_30d||0).toLocaleString('es-PY')} visitas</span>
                    <span class="text-gray-600" title="Clics de WhatsApp en los últimos 30 días"><i class="fab fa-whatsapp text-green-500 mr-1"></i>${(b.wa_30d||0).toLocaleString('es-PY')} WA</span>
                    <span class="text-gray-300">30d</span>
                </div>
                <div class="flex items-center gap-2 mt-2 flex-wrap justify-between">
                    <div class="flex gap-3">
                        ${b.whatsapp ? `<span class="text-xs text-gray-500"><i class="fab fa-whatsapp text-green-500 mr-1"></i>${escHtml(b.whatsapp)}</span>` : '<span class="text-xs text-red-300"><i class="fas fa-exclamation-circle mr-1"></i>Sin WA</span>'}
                        <span class="text-xs text-gray-300">${fmtDate(b.created_at)}</span>
                    </div>
                    ${actions}
                </div>
            </div>
        </div>`;
    }).join('');

    // Paginación
    const p = data.pagination;
    const infoEl = document.getElementById('fichasPaginationInfo');
    const ctrlEl = document.getElementById('fichasPaginationControls');
    if (infoEl) infoEl.textContent = `${Math.min((p.page-1)*p.limit+1,p.total)}–${Math.min(p.page*p.limit,p.total)} de ${p.total} fichas`;
    if (ctrlEl) {
        let html = '';
        if (p.page>1) html+=`<button onclick="loadMyFichas(${p.page-1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-left"></i></button>`;
        for (let i=Math.max(1,p.page-2);i<=Math.min(p.pages,p.page+2);i++)
            html+=`<button onclick="loadMyFichas(${i})" class="px-3 py-1 border ${i===p.page?'bg-brand-500 text-white border-brand-500':'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
        if (p.page<p.pages) html+=`<button onclick="loadMyFichas(${p.page+1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-right"></i></button>`;
        ctrlEl.innerHTML = html;
    }
}

function toggleFichaSelect(id, checked) {
    checked ? _selectedFichas.add(id) : _selectedFichas.delete(id);
    updateBatchBar();
}

function toggleSelectAll(checked) {
    document.querySelectorAll('.ficha-check').forEach(ch => {
        ch.checked = checked;
        const id = parseInt(ch.dataset.id);
        checked ? _selectedFichas.add(id) : _selectedFichas.delete(id);
    });
    updateBatchBar();
}

function updateBatchBar() {
    const bar = document.getElementById('batchBar');
    if (!bar) return;
    const count = _selectedFichas.size;
    bar.classList.toggle('hidden', count === 0);
    const label = document.getElementById('batchBarLabel');
    if (label) label.textContent = `${count} ficha${count!==1?'s':''} seleccionada${count!==1?'s':''}`;
}

async function submitSingle(id) {
    if (!confirm('¿Enviar esta ficha para revisión?')) return;
    const res = await ambPost('/ambassador/businesses/submit-batch', { ids: [id] });
    if (res.success) { showToastAmb('Ficha enviada para revisión ✅'); loadMyFichas(_ambPage); loadAmbDashboard(); }
    else showToastAmb(res.error || 'Error al enviar', 'warning');
}

async function submitBatch() {
    const ids = [..._selectedFichas];
    if (!ids.length) return;
    if (!confirm(`¿Enviar ${ids.length} ficha${ids.length!==1?'s':''} para revisión?`)) return;
    const res = await ambPost('/ambassador/businesses/submit-batch', { ids });
    if (res.success) {
        showToastAmb(`${res.sent} ficha${res.sent!==1?'s':''} enviada${res.sent!==1?'s':''} para revisión ✅`);
        _selectedFichas.clear();
        loadMyFichas(_ambPage);
        loadAmbDashboard();
    } else {
        showToastAmb(res.error || 'Error al enviar', 'warning');
    }
}

// ════════════════════════════════════════════════════════════════════
// MODAL NUEVA FICHA — igual que panel cliente (tabs + comboboxes + mapa)
// ════════════════════════════════════════════════════════════════════
function openNuevaFichaModal() {
    // Resetear estado
    _nfSelectedCatId = null;
    _nfMap = null; _nfMarker = null;
    _nfCurrentBizId  = null;
    _pendingLogoFile  = null;

    const existing = document.getElementById('nuevaFichaModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'nuevaFichaModal';
    modal.className = 'modal-sheet fixed inset-0 z-50 flex';
    modal.innerHTML = `
        <div class="modal-backdrop absolute inset-0 bg-black/50" onclick="closeNuevaFichaModal()"></div>
        <div class="modal-inner absolute bg-white w-full max-h-[92dvh] overflow-y-auto z-10 rounded-2xl md:relative md:mx-auto md:my-8 md:rounded-2xl md:shadow-2xl">
            <div class="modal-drag-handle md:hidden"></div>
            <div class="sticky top-0 bg-white border-b border-gray-100 px-5 py-3.5 flex justify-between items-center z-10">
                <h3 class="font-bold text-gray-900 flex items-center gap-2 text-sm">
                    <i class="fas fa-plus-circle text-brand-500"></i> Nueva ficha
                </h3>
                <button onclick="closeNuevaFichaModal()" class="touch-btn w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>

            <!-- Tabs igual que panel cliente -->
            <div class="mobile-tabs">
                <div class="mobile-tab active" onclick="switchNuevaTab('general',this)"><i class="fas fa-info-circle mr-1"></i>General</div>
                <div class="mobile-tab" onclick="switchNuevaTab('contact',this)"><i class="fas fa-phone mr-1"></i>Contacto</div>
                <div class="mobile-tab" onclick="switchNuevaTab('social',this)"><i class="fas fa-share-alt mr-1"></i>Redes</div>
                <div class="mobile-tab" onclick="switchNuevaTab('location',this)"><i class="fas fa-map-marker-alt mr-1"></i>Ubicación</div>
                <div class="mobile-tab" onclick="switchNuevaTab('imagen',this)"><i class="fas fa-image mr-1"></i>Logo</div>
            </div>

            <div class="p-4 md:p-6 space-y-4">
                <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                    <i class="fas fa-info-circle mt-0.5 shrink-0"></i>
                    <span>La ficha quedará <strong>en revisión</strong> hasta que un administrador la apruebe.</span>
                </div>
                <div id="nuevaFichaError" class="hidden bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"></div>

                <!-- TAB: General -->
                <div id="nuevaTab-general" class="nueva-tab-panel space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Nombre comercial <span class="text-red-500">*</span></label>
                        <input type="text" id="nfTradeName" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="Ej: Ferretería El Martillo">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Razón social <span class="text-xs text-gray-400 font-normal">(opcional)</span></label>
                        <input type="text" id="nfName" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="Nombre legal">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">RUC / CI <span class="text-xs text-gray-400 font-normal">(opcional)</span></label>
                        <input type="text" id="nfRuc" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="Ej: 80012345-1">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <textarea id="nfDescription" rows="3" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="¿A qué se dedica este negocio?"></textarea>
                    </div>
                    <!-- Combobox Rubro -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Rubro <span class="text-red-500">*</span></label>
                        <div class="relative" id="nfCatWrapper">
                            <i class="fas fa-tag absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none z-10"></i>
                            <input type="text" id="nfCatInput" placeholder="Escribí para buscar rubro..."
                                autocomplete="off"
                                class="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-400"
                                oninput="nfFilterCat()" onfocus="nfOpenCat()" onblur="nfCloseCat()">
                            <input type="hidden" id="nfCatHidden">
                            <div id="nfCatList" class="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 hidden z-50 max-h-52 overflow-y-auto"></div>
                        </div>
                    </div>
                    <!-- Combobox Ciudad -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Ciudad <span class="text-red-500">*</span></label>
                        <div class="relative" id="nfCityWrapper">
                            <i class="fas fa-map-marker-alt absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none z-10"></i>
                            <input type="text" id="nfCityInput" placeholder="Escribí para buscar ciudad..."
                                autocomplete="off"
                                class="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-400"
                                oninput="nfFilterCity()" onfocus="nfOpenCity()" onblur="nfCloseCity()">
                            <input type="hidden" id="nfCity">
                            <div id="nfCityList" class="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 hidden z-50 max-h-52 overflow-y-auto"></div>
                        </div>
                    </div>
                </div>

                <!-- TAB: Contacto -->
                <div id="nuevaTab-contact" class="nueva-tab-panel hidden space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1"><i class="fab fa-whatsapp text-green-500 mr-1"></i>WhatsApp <span class="text-xs text-gray-400 font-normal">— botón de la ficha</span></label>
                        <input type="text" id="nfWhatsapp" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="Ej: 595981000000">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input type="text" id="nfPhone" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="021000000">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" id="nfEmail" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="negocio@email.com">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Sitio web</label>
                        <input type="url" id="nfWebsite" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="https://...">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                        <input type="text" id="nfAddress" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="Calle, número, barrio">
                    </div>
                </div>

                <!-- TAB: Redes (las 6 mismas del panel cliente) -->
                <div id="nuevaTab-social" class="nueva-tab-panel hidden space-y-3">
                    <div class="flex items-center gap-2">
                        <span style="color:#E1306C;width:22px;text-align:center;flex-shrink:0"><i class="fab fa-instagram"></i></span>
                        <input type="text" id="nfInstagram" class="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="@usuario o URL">
                    </div>
                    <div class="flex items-center gap-2">
                        <span style="color:#1877F2;width:22px;text-align:center;flex-shrink:0"><i class="fab fa-facebook-f"></i></span>
                        <input type="text" id="nfFacebook" class="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="@pagina o URL">
                    </div>
                    <div class="flex items-center gap-2">
                        <span style="width:22px;text-align:center;flex-shrink:0"><i class="fab fa-tiktok"></i></span>
                        <input type="text" id="nfTiktok" class="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="@usuario o URL">
                    </div>
                    <div class="flex items-center gap-2">
                        <span style="color:#0A66C2;width:22px;text-align:center;flex-shrink:0"><i class="fab fa-linkedin-in"></i></span>
                        <input type="text" id="nfLinkedin" class="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="empresa o URL">
                    </div>
                    <div class="flex items-center gap-2">
                        <span style="width:22px;text-align:center;flex-shrink:0;font-weight:900;font-size:14px;">𝕏</span>
                        <input type="text" id="nfTwitter" class="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="@usuario o URL">
                    </div>
                    <div class="flex items-center gap-2">
                        <span style="color:#FF0000;width:22px;text-align:center;flex-shrink:0"><i class="fab fa-youtube"></i></span>
                        <input type="text" id="nfYoutube" class="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-brand-400" placeholder="@canal o URL">
                    </div>
                </div>

                <!-- TAB: Ubicación (igual que panel cliente) -->
                <div id="nuevaTab-location" class="nueva-tab-panel hidden space-y-4">
                    <button type="button" onclick="nfGeocode()"
                        class="touch-btn w-full text-sm font-bold py-3 rounded-xl border-2 border-brand-400 text-brand-600 hover:bg-brand-50 transition flex items-center justify-center gap-2">
                        <i class="fas fa-search-location"></i> Buscar coordenadas desde dirección
                    </button>
                    <div id="nfMapContainer" class="rounded-xl overflow-hidden border border-gray-200" style="height:220px;background:#f1f5f9;display:flex;align-items:center;justify-content:center">
                        <p class="text-sm text-gray-400 text-center">
                            <i class="fas fa-map text-2xl block mb-1 text-gray-300"></i>El mapa aparece al buscar coordenadas
                        </p>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">Latitud</label>
                            <input type="number" step="any" id="nfLat" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="-25.2867">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">Longitud</label>
                            <input type="number" step="any" id="nfLng" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="-57.6478">
                        </div>
                    </div>
                    <p class="text-xs text-gray-400">También podés tocar el mapa para mover el marcador.</p>
                </div>

                <!-- TAB: Logo -->
                <div id="nuevaTab-imagen" class="nueva-tab-panel hidden space-y-4">
                    <p class="text-sm text-gray-500">Subí el logo del negocio. Se comprime automáticamente a WebP 400×400.</p>
                    <div id="nfLogoUploadArea"
                        class="relative w-40 h-40 mx-auto rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer hover:border-brand-400 transition"
                        onclick="document.getElementById('nfLogoFile').click()">
                        <img id="nfLogoPreview" class="hidden absolute inset-0 w-full h-full object-cover rounded-2xl">
                        <div id="nfLogoPlaceholder" class="text-center text-gray-400 p-4">
                            <i class="fas fa-cloud-upload-alt text-3xl block mb-2"></i>
                            <span class="text-xs">Tocá para subir logo</span>
                        </div>
                    </div>
                    <input type="file" id="nfLogoFile" accept="image/*" class="hidden" onchange="previewNfLogo(this)">
                    <div id="nfLogoUploadStatus" class="hidden text-center text-sm"></div>
                    <p class="text-xs text-gray-400 text-center">JPG, PNG o WebP · máx 10MB · Se guarda automáticamente</p>
                </div>

                <!-- Footer sticky igual que panel cliente -->
                <div class="flex gap-3 pt-2 sticky bottom-0 bg-white pb-4 md:pb-2 md:static border-t border-gray-100 mt-4">
                    <button onclick="submitNuevaFicha(false)" id="saveDraftBtn"
                        class="touch-btn flex-1 border-2 border-brand-400 text-brand-600 font-bold py-3.5 rounded-xl hover:bg-brand-50 transition flex items-center justify-center gap-2 text-sm">
                        <i class="fas fa-save"></i> Guardar borrador
                    </button>
                    <button onclick="submitNuevaFicha(true)" id="submitNuevaBtn"
                        class="touch-btn flex-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-sm">
                        <i class="fas fa-paper-plane"></i> Enviar ahora
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('open'));
}

function closeNuevaFichaModal() {
    const modal = document.getElementById('nuevaFichaModal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 300);
}

function switchNuevaTab(tab, el) {
    document.querySelectorAll('.nueva-tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('#nuevaFichaModal .mobile-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`nuevaTab-${tab}`)?.classList.remove('hidden');
    el?.classList.add('active');

    if (tab === 'location') {
        setTimeout(() => {
            const lat = parseFloat(document.getElementById('nfLat')?.value);
            const lng = parseFloat(document.getElementById('nfLng')?.value);
            // Si el mapa ya existe solo forzar resize; si no, inicializar
            if (_nfMap && typeof google !== 'undefined') {
                google.maps.event.trigger(_nfMap, 'resize');
                if (_nfMarker) _nfMap.setCenter(_nfMarker.getPosition());
            } else {
                nfInitMap(lat, lng);
            }
        }, 120);
    }
}

async function submitNuevaFicha(submit = false) {
    const errEl = document.getElementById('nuevaFichaError');
    errEl.classList.add('hidden');

    const trade_name = document.getElementById('nfTradeName').value.trim();
    const category   = document.getElementById('nfCatHidden').value;
    const city       = document.getElementById('nfCity').value;

    if (!trade_name) { errEl.textContent = 'El nombre comercial es requerido'; errEl.classList.remove('hidden'); return; }
    if (submit && !category) { errEl.textContent = 'Seleccioná un rubro antes de enviar'; errEl.classList.remove('hidden'); return; }
    if (submit && !city)     { errEl.textContent = 'Seleccioná una ciudad antes de enviar'; errEl.classList.remove('hidden'); return; }

    const btnDraft  = document.getElementById('saveDraftBtn');
    const btnSubmit = document.getElementById('submitNuevaBtn');
    if (btnDraft)  btnDraft.disabled  = true;
    if (btnSubmit) btnSubmit.disabled = true;
    if (submit && btnSubmit) btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Enviando...';
    else if (btnDraft) btnDraft.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';

    const lat = parseFloat(document.getElementById('nfLat')?.value);
    const lng = parseFloat(document.getElementById('nfLng')?.value);

    const payload = {
        trade_name,
        name:        document.getElementById('nfName').value.trim() || trade_name,
        ruc:         document.getElementById('nfRuc').value.trim() || null,
        description: document.getElementById('nfDescription').value.trim() || null,
        address:     document.getElementById('nfAddress').value.trim() || null,
        phone:       document.getElementById('nfPhone').value.trim() || null,
        whatsapp:    document.getElementById('nfWhatsapp').value.trim() || null,
        email:       document.getElementById('nfEmail').value.trim() || null,
        website:     document.getElementById('nfWebsite').value.trim() || null,
        city:        city || null,
        category_id: category || null,
        lat: isNaN(lat) ? null : lat,
        lng: isNaN(lng) ? null : lng,
        social_instagram: document.getElementById('nfInstagram').value.trim() || null,
        social_facebook:  document.getElementById('nfFacebook').value.trim() || null,
        social_tiktok:    document.getElementById('nfTiktok').value.trim() || null,
        social_linkedin:  document.getElementById('nfLinkedin').value.trim() || null,
        social_twitter:   document.getElementById('nfTwitter').value.trim() || null,
        social_youtube:   document.getElementById('nfYoutube').value.trim() || null,
        submit
    };

    const res = await ambPost('/ambassador/businesses', payload);

    if (btnDraft)  { btnDraft.disabled  = false; btnDraft.innerHTML  = '<i class="fas fa-save mr-2"></i>Guardar borrador'; }
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Enviar ahora'; }

    if (res.success) {
        // Si hay logo pendiente, subirlo ahora que tenemos el ID
        if (_pendingLogoFile && res.data?.id) {
            await uploadNfLogo(_pendingLogoFile, res.data.id);
        }
        const msg = submit
            ? '¡Ficha enviada para revisión! ✅'
            : '✅ Borrador guardado — podés seguir editando en "Mis fichas"';
        showToastAmb(msg);
        closeNuevaFichaModal();
        loadAmbDashboard();
        if (_currentSection === 'businesses') loadMyFichas(1);
        else showSection('businesses'); // ir a mis fichas para ver el borrador
    } else {
        errEl.textContent = res.error || 'Error al guardar';
        errEl.classList.remove('hidden');
    }
}

// ════════════════════════════════════════════════════════════════════
// EDITAR FICHA — reutiliza el mismo modal de nueva ficha precargado
// ════════════════════════════════════════════════════════════════════
let _editingFichaId = null;

async function openEditFichaModal(id) {
    showToastAmb('Cargando ficha...');
    _editingFichaId = id;

    // Traer datos de la ficha
    const data = await ambGet(`/ambassador/businesses?page=1&limit=100`);
    if (!data.success) { showToastAmb('Error cargando ficha', 'warning'); return; }
    const biz = data.data.find(b => b.id === id);
    if (!biz) { showToastAmb('Ficha no encontrada', 'warning'); return; }

    // Abrir el modal de nueva ficha (reutiliza todo el HTML)
    openNuevaFichaModal();

    // Esperar a que el DOM del modal esté listo
    await new Promise(r => setTimeout(r, 80));

    // Cambiar título del modal
    const titulo = document.querySelector('#nuevaFichaModal h3');
    if (titulo) {
        titulo.innerHTML = '<i class="fas fa-edit text-brand-500 mr-2"></i>Editar ficha';
        // Métricas 30d de la ficha (ya vienen en el objeto del listado)
        document.getElementById('editFichaMetrics')?.remove();
        titulo.insertAdjacentHTML('afterend',
            `<div id="editFichaMetrics" class="mt-1 inline-flex items-center gap-3 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
                <span class="text-gray-700" title="Visitas en los últimos 30 días"><i class="fas fa-eye text-gray-400 mr-1"></i><b>${(biz.views_30d||0).toLocaleString('es-PY')}</b> visitas</span>
                <span class="text-gray-700" title="Clics de WhatsApp en los últimos 30 días"><i class="fab fa-whatsapp text-green-500 mr-1"></i><b>${(biz.wa_30d||0).toLocaleString('es-PY')}</b> WA</span>
                <span class="text-gray-300">30d</span>
            </div>`);
    }

    // Cambiar botones de footer
    const btnDraft  = document.getElementById('saveDraftBtn');
    const btnSubmit = document.getElementById('submitNuevaBtn');
    if (btnDraft)  { btnDraft.innerHTML  = '<i class="fas fa-save mr-2"></i>Guardar cambios'; btnDraft.onclick  = () => saveEditFicha(false); }
    if (btnSubmit) { btnSubmit.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Guardar y enviar'; btnSubmit.onclick = () => saveEditFicha(true); }

    // Precargar campos — General
    const f = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    f('nfTradeName',  biz.trade_name || biz.name);
    f('nfName',       biz.name);
    f('nfRuc',        biz.ruc);
    f('nfDescription',biz.description);

    // Logo
    loadNfLogoPreview(biz.image_url, biz.id);

    // Rubro
    if (biz.category_id && biz.category_name) {
        document.getElementById('nfCatInput').value   = biz.category_name;
        document.getElementById('nfCatHidden').value  = biz.category_id;
        _nfSelectedCatId = biz.category_id;
    }

    // Ciudad
    if (biz.city) {
        document.getElementById('nfCityInput').value = biz.city;
        document.getElementById('nfCity').value      = biz.city;
    }

    // Contacto
    f('nfPhone',   biz.phone);
    f('nfWhatsapp',biz.whatsapp);
    f('nfEmail',   biz.email);
    f('nfWebsite', biz.website);
    f('nfAddress', biz.address);

    // Redes
    f('nfInstagram', biz.social_instagram);
    f('nfFacebook',  biz.social_facebook);
    f('nfTiktok',    biz.social_tiktok);
    f('nfLinkedin',  biz.social_linkedin);
    f('nfTwitter',   biz.social_twitter);
    f('nfYoutube',   biz.social_youtube);

    // Ubicación
    f('nfLat', biz.lat);
    f('nfLng', biz.lng);
}

async function saveEditFicha(submit = false) {
    if (!_editingFichaId) return;
    const errEl = document.getElementById('nuevaFichaError');
    errEl.classList.add('hidden');

    const trade_name = document.getElementById('nfTradeName').value.trim();
    const city       = document.getElementById('nfCity').value;
    const category   = document.getElementById('nfCatHidden').value;

    if (!trade_name) { errEl.textContent = 'El nombre comercial es requerido'; errEl.classList.remove('hidden'); return; }
    if (submit && !city)     { errEl.textContent = 'Seleccioná una ciudad antes de enviar'; errEl.classList.remove('hidden'); return; }
    if (submit && !category) { errEl.textContent = 'Seleccioná un rubro antes de enviar'; errEl.classList.remove('hidden'); return; }

    const btnDraft  = document.getElementById('saveDraftBtn');
    const btnSubmit = document.getElementById('submitNuevaBtn');
    if (btnDraft)  btnDraft.disabled  = true;
    if (btnSubmit) btnSubmit.disabled = true;

    const lat = parseFloat(document.getElementById('nfLat')?.value);
    const lng = parseFloat(document.getElementById('nfLng')?.value);

    const payload = {
        trade_name,
        name:        document.getElementById('nfName').value.trim() || trade_name,
        ruc:         document.getElementById('nfRuc').value.trim() || null,
        description: document.getElementById('nfDescription').value.trim() || null,
        address:     document.getElementById('nfAddress').value.trim() || null,
        phone:       document.getElementById('nfPhone').value.trim() || null,
        whatsapp:    document.getElementById('nfWhatsapp').value.trim() || null,
        email:       document.getElementById('nfEmail').value.trim() || null,
        website:     document.getElementById('nfWebsite').value.trim() || null,
        city:        city || null,
        category_id: category || null,
        lat: isNaN(lat) ? null : lat,
        lng: isNaN(lng) ? null : lng,
        social_instagram: document.getElementById('nfInstagram').value.trim() || null,
        social_facebook:  document.getElementById('nfFacebook').value.trim() || null,
        social_tiktok:    document.getElementById('nfTiktok').value.trim() || null,
        social_linkedin:  document.getElementById('nfLinkedin').value.trim() || null,
        social_twitter:   document.getElementById('nfTwitter').value.trim() || null,
        social_youtube:   document.getElementById('nfYoutube').value.trim() || null,
        submit
    };

    const res = await ambPost(`/ambassador/businesses/${_editingFichaId}`, payload, 'PUT');

    if (btnDraft)  { btnDraft.disabled  = false; btnDraft.innerHTML  = '<i class="fas fa-save mr-2"></i>Guardar cambios'; }
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Guardar y enviar'; }

    if (res.success) {
        // Si hay logo pendiente de subir, hacerlo ahora que tenemos el ID
        if (_pendingLogoFile && _editingFichaId) {
            await uploadNfLogo(_pendingLogoFile, _editingFichaId);
        }
        showToastAmb(submit ? '¡Ficha enviada para revisión! ✅' : 'Cambios guardados ✅');
        _editingFichaId = null;
        closeNuevaFichaModal();
        loadMyFichas(_ambPage);
        loadAmbDashboard();
    } else {
        errEl.textContent = res.error || 'Error al guardar';
        errEl.classList.remove('hidden');
    }
}

// ── Archivar ficha rechazada ───────────────────────────────────────────────
async function archiveFicha(id) {
    if (!confirm('¿Archivar esta ficha rechazada? Quedará oculta en tu listado.')) return;
    const res = await ambPost(`/ambassador/businesses/${id}/archive`, {});
    if (res.success) {
        showToastAmb('Ficha archivada');
        loadMyFichas(_ambPage);
        loadAmbDashboard();
    } else {
        showToastAmb(res.error || 'Error al archivar', 'warning');
    }
}

// ── Liberar ficha asignada ─────────────────────────────────────────────────
async function releaseFicha(id) {
    if (!confirm('¿Liberar esta ficha? Volverá al pool y otros embajadores podrán tomarla.')) return;
    const res = await ambPost(`/ambassador/businesses/${id}/release`, {});
    if (res.success) {
        showToastAmb('Ficha liberada — volvió al pool ✅');
        loadMyFichas(_ambPage);
        loadAmbDashboard();
    } else {
        showToastAmb(res.error || 'Error al liberar', 'warning');
    }
}

// ════════════════════════════════════════════════════════════════════
// UPLOAD DE LOGO — Tab "Logo" en modal nueva/editar ficha
// ════════════════════════════════════════════════════════════════════
let _nfCurrentBizId = null; // ID de la ficha activa en el modal (null si es nueva aún)

function previewNfLogo(input) {
    const file = input.files[0];
    if (!file) return;

    // Preview inmediato
    const reader = new FileReader();
    reader.onload = e => {
        const preview = document.getElementById('nfLogoPreview');
        const placeholder = document.getElementById('nfLogoPlaceholder');
        if (preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
        if (placeholder) placeholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Si hay ID de ficha ya guardada, subir inmediatamente
    if (_nfCurrentBizId) {
        uploadNfLogo(file, _nfCurrentBizId);
    } else {
        // Guardar referencia para subir cuando se guarde la ficha
        _pendingLogoFile = file;
        const status = document.getElementById('nfLogoUploadStatus');
        if (status) { status.textContent = '📸 Logo listo para guardar'; status.classList.remove('hidden'); status.className = 'text-center text-sm text-amber-600'; }
    }
}

let _pendingLogoFile = null;

async function uploadNfLogo(file, bizId) {
    const status = document.getElementById('nfLogoUploadStatus');
    if (status) { status.textContent = 'Subiendo logo...'; status.classList.remove('hidden'); status.className = 'text-center text-sm text-brand-600'; }

    const formData = new FormData();
    formData.append('logo', file);
    formData.append('business_id', bizId);

    try {
        const res = await fetch('/api/v2/ambassador/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            if (status) { status.textContent = '✅ Logo guardado'; status.className = 'text-center text-sm text-green-600'; }
            _pendingLogoFile = null;
        } else {
            if (status) { status.textContent = '❌ Error: ' + (data.error || 'No se pudo subir'); status.className = 'text-center text-sm text-red-600'; }
        }
    } catch {
        if (status) { status.textContent = '❌ Error de conexión'; status.className = 'text-center text-sm text-red-600'; }
    }
}

// Precargar logo existente en el tab cuando se abre el modal de edición
function loadNfLogoPreview(imageUrl, bizId) {
    _nfCurrentBizId = bizId || null;
    _pendingLogoFile = null;
    const preview = document.getElementById('nfLogoPreview');
    const placeholder = document.getElementById('nfLogoPlaceholder');
    const status = document.getElementById('nfLogoUploadStatus');
    if (status) { status.textContent = ''; status.classList.add('hidden'); }
    if (imageUrl && preview) {
        preview.src = imageUrl;
        preview.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
    } else {
        if (preview) preview.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
    }
}
