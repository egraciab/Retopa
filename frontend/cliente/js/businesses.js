/**
 * RetoPA — Panel del Cliente
 * businesses.js: listado y edición de empresas, reseñas
 */

let editingSlug = null;
let _editCities = []; // cache ciudades para el combobox de edición
let _allCategories = []; // cache de categorías
let _selectedCatIds = []; // IDs seleccionados en el modal

// ── Combobox de ciudad en el modal de edición ─────────────────────────────
function filterEditCity() {
    const q = (document.getElementById('editCityInput')?.value || '').toLowerCase();
    const filtered = _editCities.filter(c => c.toLowerCase().includes(q)).slice(0, 12);
    renderEditCityList(filtered);
    document.getElementById('editCityList')?.classList.remove('hidden');
}
function openEditCity() {
    const q = (document.getElementById('editCityInput')?.value || '').toLowerCase();
    const filtered = _editCities.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 12);
    renderEditCityList(filtered);
    document.getElementById('editCityList')?.classList.remove('hidden');
}
function closeEditCity() {
    document.getElementById('editCityList')?.classList.add('hidden');
}
function renderEditCityList(cities) {
    const list = document.getElementById('editCityList');
    if (!list) return;
    if (!cities.length) { list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>'; return; }
    list.innerHTML = cities.map(c =>
        `<div onclick="selectEditCity('${escHtml(c)}')"
            class="px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer flex items-center gap-2">
            <i class="fas fa-map-marker-alt text-gray-300 text-xs"></i>${escHtml(c)}
        </div>`
    ).join('');
}
function selectEditCity(name) {
    document.getElementById('editCityInput').value  = name;
    document.getElementById('editCity').value       = name;
    document.getElementById('editCityList')?.classList.add('hidden');
}

// ── Combobox de categorías en el modal de edición ─────────────────────────
async function loadCategoriesCache() {
    if (_allCategories.length) return;
    const data = await clientGet('/categories').catch(() => ({ data: [] }));
    _allCategories = data.data || data.categories || [];
}

function initCatCombo(biz) {
    // Leer límites del servidor (ya vienen en el objeto biz desde /client/businesses)
    const maxCats = biz.max_categories ?? (biz.plan_type === 'premium' ? 5 : biz.plan_type === 'featured' ? 2 : 1);
    const labelEl = document.getElementById('catLimitLabel');
    if (labelEl) labelEl.textContent = `(máx. ${maxCats} con tu plan ${biz.plan_type === 'premium' ? 'Pro' : biz.plan_type === 'featured' ? 'Destacado' : 'Básico'})`;

    // Pre-seleccionar categorías — preferir categories_data del backend (array completo)
    _selectedCatIds = [];
    if (Array.isArray(biz.categories_data) && biz.categories_data.length) {
        // Sincronizar cache local con los datos recibidos
        biz.categories_data.forEach(cat => {
            if (cat?.id) {
                _selectedCatIds.push(cat.id);
                // Agregar al cache si no existe
                if (!_allCategories.find(c => c.id === cat.id)) {
                    _allCategories.push({ id: cat.id, name: cat.name || '', icon: cat.icon || '', color: cat.color || '' });
                }
            }
        });
    } else if (biz.category_id) {
        _selectedCatIds.push(biz.category_id);
        // Asegurar que la categoría principal esté en el cache
        if (!_allCategories.find(c => c.id === biz.category_id) && biz.category_name) {
            _allCategories.push({ id: biz.category_id, name: biz.category_name, icon: biz.category_icon || '', color: '' });
        }
    }
    renderCatTags(maxCats);
    document.getElementById('editCatIds').value = JSON.stringify(_selectedCatIds);
}

function filterCatCombo() {
    const q = document.getElementById('editCatInput')?.value.toLowerCase() || '';
    const filtered = _allCategories
        .filter(c => (c.name || '').toLowerCase().includes(q) && !_selectedCatIds.includes(c.id))
        .slice(0, 12);
    renderCatList(filtered);
    document.getElementById('editCatList')?.classList.remove('hidden');
}

function openCatCombo() {
    const q = document.getElementById('editCatInput')?.value.toLowerCase() || '';
    const filtered = _allCategories
        .filter(c => (!q || (c.name||'').toLowerCase().includes(q)) && !_selectedCatIds.includes(c.id))
        .slice(0, 12);
    renderCatList(filtered);
    document.getElementById('editCatList')?.classList.remove('hidden');
}

function closeCatCombo() {
    document.getElementById('editCatList')?.classList.add('hidden');
    document.getElementById('editCatInput').value = '';
}

function renderCatList(cats) {
    const list = document.getElementById('editCatList');
    if (!list) return;
    if (!cats.length) { list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>'; return; }
    list.innerHTML = cats.map(c =>
        `<div onclick="addCatToSelection(${c.id})"
            class="px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer">
            ${escHtml(c.name)}${c.parent_name ? ` <span class="text-xs text-gray-400">· ${escHtml(c.parent_name)}</span>` : ''}
        </div>`
    ).join('');
}

function addCatToSelection(catId) {
    const biz = myBusinesses.find(b => b.slug === editingSlug);
    const maxCats = biz?.max_categories ?? (biz?.plan_type === 'premium' ? 5 : biz?.plan_type === 'featured' ? 2 : 1);

    if (_selectedCatIds.includes(catId)) return;
    if (_selectedCatIds.length >= maxCats) {
        showToastClient(`Tu plan permite hasta ${maxCats} categoría(s)`, 'error');
        return;
    }
    _selectedCatIds.push(catId);
    document.getElementById('editCatIds').value = JSON.stringify(_selectedCatIds);
    renderCatTags(maxCats);
    document.getElementById('editCatInput').value = '';
    document.getElementById('editCatList')?.classList.add('hidden');
}

function removeCatFromSelection(catId) {
    _selectedCatIds = _selectedCatIds.filter(id => id !== catId);
    document.getElementById('editCatIds').value = JSON.stringify(_selectedCatIds);
    const biz = myBusinesses.find(b => b.slug === editingSlug);
    const maxCatsTags = biz?.max_categories ?? (biz?.plan_type === 'premium' ? 5 : biz?.plan_type === 'featured' ? 2 : 1);
    renderCatTags(maxCatsTags);
}

function renderCatTags(maxCats) {
    const container = document.getElementById('editCatTags');
    if (!container) return;
    if (!_selectedCatIds.length) { container.innerHTML = '<span class="text-xs text-gray-400">Ninguna seleccionada</span>'; return; }
    container.innerHTML = _selectedCatIds.map(id => {
        const cat = _allCategories.find(c => c.id === id);
        if (!cat) return '';
        return `<span class="inline-flex items-center gap-1 text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${escHtml(cat.name)}<button onclick="removeCatFromSelection(${id})" class="ml-1 hover:text-red-500 font-bold" style="line-height:1;font-size:14px">×</button></span>`;
    }).join('');
    const input = document.getElementById('editCatInput');
    if (input) input.placeholder = _selectedCatIds.length >= maxCats ? `Límite de ${maxCats} alcanzado` : 'Escribí para buscar categoría...';
}



// ── Listado de empresas ───────────────────────────────────────────────────
function renderBusinessList() {
    const container = document.getElementById('bizList');
    if (!myBusinesses.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                <i class="fas fa-building text-4xl text-gray-200 mb-3 block"></i>
                <p class="font-bold text-gray-700 mb-2">No tenés empresas registradas</p>
                <p class="text-sm text-gray-400 mb-4">Registrá tu empresa para aparecer en el directorio de RetoPA</p>
                <a href="/" class="bg-brand-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-brand-600 transition inline-flex items-center gap-2">
                    <i class="fas fa-plus"></i> Registrar mi empresa
                </a>
            </div>`;
        return;
    }

    // Ordenar: empresa activa primero
    const sorted = [...myBusinesses].sort((a, b) => {
        if (a.slug === activeDashBiz) return -1;
        if (b.slug === activeDashBiz) return 1;
        return 0;
    });

    container.innerHTML = sorted.map(biz => {
        const isActive = biz.slug === activeDashBiz;
        const activeBorder = isActive ? 'border-2 border-brand-400' : 'border border-gray-100';
        const activeBadge  = isActive
            ? '<span class="text-[10px] bg-brand-500 text-white font-bold px-2 py-0.5 rounded-full ml-2">Activa</span>'
            : '';
        return `<div class="bg-white rounded-2xl ${activeBorder} shadow-sm overflow-hidden mb-4">
            <!-- Header con portada -->
            <div class="h-32 relative overflow-hidden bg-gradient-to-r from-brand-400 to-brand-600">
                ${biz.cover_url ? `<img src="${escHtml(biz.cover_url)}" class="w-full h-full object-cover">` : ''}
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div class="absolute bottom-3 left-4 flex items-end gap-3">
                    ${biz.image_url
                        ? `<img src="${escHtml(biz.image_url)}" class="w-12 h-12 rounded-xl object-cover border-2 border-white shadow">`
                        : `<div class="w-12 h-12 rounded-xl bg-white/20 border-2 border-white/50 flex items-center justify-center text-white font-black text-xl">${(biz.name||'E').charAt(0)}</div>`
                    }
                    <div>
                        <h3 class="font-bold text-white text-sm leading-tight">${escHtml(biz.trade_name || biz.name)}</h3>
                        <p class="text-white/70 text-xs">${escHtml(biz.city || 'Sin ciudad')}</p>
                    </div>
                </div>
                <!-- Badges -->
                <div class="absolute top-3 right-3 flex gap-1.5">
                    <span class="text-xs px-2 py-1 rounded-full font-bold ${getPlanColor(biz.plan_type)}">${getPlanLabel(biz.plan_type)}</span>
                    ${biz.verified
                        ? '<span class="text-xs bg-green-500 text-white px-2 py-1 rounded-full font-bold"><i class="fas fa-check mr-0.5"></i> Verificada</span>'
                        : '<span class="text-xs bg-amber-400 text-amber-900 px-2 py-1 rounded-full font-bold">Sin verificar</span>'}
                </div>
                <!-- Badge empresa activa + botón seleccionar -->
                <div class="absolute top-3 left-3">
                    ${isActive
                        ? '<span class="text-[10px] bg-brand-600 text-white font-bold px-2 py-1 rounded-full flex items-center gap-1"><i class="fas fa-check-circle"></i> Activa</span>'
                        : `<button onclick="switchActiveBiz('${biz.slug}')" class="text-[10px] bg-black/40 backdrop-blur-sm text-white font-bold px-2 py-1 rounded-full hover:bg-black/60 transition">Seleccionar</button>`
                    }
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-3 border-b border-gray-100">
                <div class="text-center py-3 border-r border-gray-100">
                    <p class="font-bold text-gray-900">${Number(biz.views_30d||0).toLocaleString()}</p>
                    <p class="text-xs text-gray-400">Visitas 30d</p>
                </div>
                <div class="text-center py-3 border-r border-gray-100">
                    <p class="font-bold text-gray-900">${Number(biz.like_count||0).toLocaleString()}</p>
                    <p class="text-xs text-gray-400">Me gusta</p>
                </div>
                <div class="text-center py-3">
                    <p class="font-bold text-gray-900">${biz.rating > 0 ? Number(biz.rating).toFixed(1) : '—'}</p>
                    <p class="text-xs text-gray-400">Rating (${biz.review_count||0})</p>
                </div>
            </div>

            <!-- Acciones -->
            <div class="p-4 flex flex-wrap gap-2">
                <button onclick="openEditBiz('${biz.slug}')" data-tour="edit"
                    class="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition">
                    <i class="fas fa-edit"></i> Editar información
                </button>
                ${['featured','premium'].includes(biz.plan_type) ? `
                <button onclick="openGalleryManager('${biz.slug}')" data-tour="products"
                    class="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition">
                    <i class="fas fa-box-open"></i> Productos &amp; Servicios${biz.max_gallery ? ` (${biz.max_gallery})` : ''}
                </button>` : ''}
                <a href="/empresa/${biz.slug}" target="_blank" data-tour="viewpublic"
                    class="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 px-4 py-2 rounded-xl text-xs font-bold transition">
                    <i class="fas fa-external-link-alt"></i> Ver ficha
                </a>
                <button onclick="downloadKit('${biz.slug}')" data-tour="kit"
                    class="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition">
                    <i class="fas fa-qrcode"></i> Descargar mi kit
                </button>
                ${!biz.verified ? `
                <a href="mailto:soporte@retopa.com.py?subject=Solicitud de verificación — ${encodeURIComponent(biz.name)}"
                    class="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 px-4 py-2 rounded-xl text-xs font-bold transition">
                    <i class="fas fa-shield-check"></i> Solicitar verificación
                </a>` : ''}
                ${biz.pending_plan_request ? `
                <button onclick="openPendingPlan('${biz.slug}')"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition"
                    style="background:#fffbeb;border:1.5px solid #fcd34d;color:#b45309">
                    <i class="fas fa-hourglass-half"></i> Plan en revisión
                </button>` : (biz.plan_type !== 'premium' ? `
                <button onclick="openUpgradePlanModal('${biz.slug}', '${biz.plan_type}')" data-tour="upgrade"
                    class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition"
                    style="background:#f0f9ff;border:1.5px solid #38bdf8;color:#0284c7">
                    <i class="fas fa-crown"></i> ${biz.plan_type === 'featured' ? 'Mejorar a Pro' : 'Mejorar plan'}
                </button>` : '')}
            </div>
        </div>
    `; }).join('');
}

// ── Cropper.js — crop interactivo antes de subir ─────────────────────────
let cropperInstance = null;
let cropperType     = null;
let cropperSlug     = null;

function openCropper(file, type, slug) {
    cropperType = type;
    cropperSlug = slug;
    let modal = document.getElementById('cropperModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cropperModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:none;align-items:center;justify-content:center;padding:12px';
        // Tarjeta = columna flex con tope de altura: header y botones SIEMPRE
        // visibles; el área de imagen es la que se acota (nunca empuja los botones
        // fuera de pantalla, aunque la foto sea vertical/enorme). Mobile-friendly.
        modal.innerHTML = `
        <div style="background:white;border-radius:20px;overflow:hidden;max-width:600px;width:100%;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column">
          <div style="flex:0 0 auto;padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
            <h3 id="cropperTitle" style="font-size:15px;font-weight:800;color:#0f172a;margin:0">Ajustar imagen</h3>
            <button onclick="closeCropper()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b">×</button>
          </div>
          <div style="flex:1 1 auto;min-height:0;padding:12px;background:#0f172a;display:flex;align-items:center;justify-content:center;overflow:hidden">
            <img id="cropperImg" style="max-width:100%;max-height:100%;display:block">
          </div>
          <div style="flex:0 0 auto;padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #f1f5f9;background:white">
            <button onclick="closeCropper()" style="flex:0 1 auto;padding:12px 20px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;background:white;color:#64748b">Cancelar</button>
            <button onclick="confirmCrop()" style="flex:0 1 auto;padding:12px 24px;background:#1B3A6B;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">
              <i class="fas fa-check" style="margin-right:6px"></i>Guardar imagen
            </button>
          </div>
        </div>`;
        document.body.appendChild(modal);
    }
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('cropperTitle').textContent =
            type === 'logo' ? 'Recortá tu logo (cuadrado)' : 'Recortá la portada (16:9)';
        const img = document.getElementById('cropperImg');
        img.src = e.target.result;
        modal.style.display = 'flex';
        if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
        if (window.Cropper) {
            cropperInstance = new Cropper(img, {
                aspectRatio:  type === 'logo' ? 1 : 16/9,
                viewMode:     2,
                dragMode:     'move',
                autoCropArea: 0.9,
                responsive:   true,
                guides:       true,
                highlight:    false,
            });
        }
    };
    reader.readAsDataURL(file);
}

function closeCropper() {
    const modal = document.getElementById('cropperModal');
    if (modal) modal.style.display = 'none';
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
}

async function confirmCrop() {
    if (!cropperInstance || !cropperSlug) return;
    const canvas = cropperInstance.getCroppedCanvas({
        width:  cropperType === 'logo' ? 400 : 1200,
        height: cropperType === 'logo' ? 400 : 500,
        imageSmoothingQuality: 'high',
    });
    closeCropper();
    canvas.toBlob(async blob => {
        await uploadImageBlob(blob, cropperType, cropperSlug);
    }, 'image/jpeg', 0.92);
}

async function uploadImageBlob(blob, type, slug) {
    const progressEl = document.getElementById('uploadProgress');
    if (progressEl) progressEl.classList.remove('hidden');
    const formData = new FormData();
    formData.append(type, blob, `${type}.jpg`);
    formData.append('business_slug', slug);
    if (type === 'cover') { formData.append('focal_x', '50'); formData.append('focal_y', '50'); }
    try {
        const res  = await fetch('/api/v2/client/upload', {
            method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData,
        });
        const data = await res.json();
        if (data.success) {
            const idx = myBusinesses.findIndex(b => b.slug === slug);
            if (idx >= 0) {
                if (type === 'logo'  && data.data.image_url) myBusinesses[idx].image_url  = data.data.image_url;
                if (type === 'cover' && data.data.cover_url) {
                    myBusinesses[idx].cover_url     = data.data.cover_url;
                    myBusinesses[idx].cover_focal_x = data.data.focal_x || 50;
                    myBusinesses[idx].cover_focal_y = data.data.focal_y || 50;
                }
            }
            const previewEl = document.getElementById(`edit${type === 'logo' ? 'Logo' : 'Cover'}Preview`);
            const newUrl = type === 'logo' ? data.data.image_url : data.data.cover_url;
            if (previewEl && newUrl) {
                previewEl.src = newUrl;
                previewEl.classList.remove('hidden');
                document.getElementById(`edit${type === 'logo' ? 'Logo' : 'Cover'}Placeholder`)?.classList.add('hidden');
            }
            if (type === 'cover') initFocalPointPicker(data.data.cover_url, slug);
            showToastClient(`${type === 'logo' ? 'Logo' : 'Portada'} actualizada ✅`);
        } else { showToastClient(data.error || 'Error al subir', 'error'); }
    } catch(e) { showToastClient('Error de conexión', 'error'); }
    finally { if (progressEl) progressEl.classList.add('hidden'); }
}

function initFocalPointPicker(coverUrl, slug) {
    const container = document.getElementById('focalPointContainer');
    if (!container) return;
    const biz = myBusinesses.find(b => b.slug === slug) || {};
    const fx  = biz.cover_focal_x ?? 50;
    const fy  = biz.cover_focal_y ?? 50;
    container.innerHTML = `
    <div style="margin-top:16px">
      <p style="font-size:12px;font-weight:600;color:#475569;margin:0 0 8px">
        <i class="fas fa-crosshairs" style="color:#1B3A6B;margin-right:4px"></i>
        Hacé clic donde querés centrar la imagen en las cards
      </p>
      <div id="focalPicker" style="position:relative;cursor:crosshair;border-radius:12px;overflow:hidden;max-height:160px">
        <img src="${coverUrl}" style="width:100%;display:block;object-fit:cover;max-height:160px">
        <div id="focalDot" style="position:absolute;width:22px;height:22px;background:#E8B84B;border:3px solid white;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.4);left:${fx}%;top:${fy}%"></div>
      </div>
      <p id="focalLabel" style="font-size:11px;color:#94a3b8;margin:6px 0 0">${fx}% · ${fy}%</p>
    </div>`;
    document.getElementById('focalPicker').addEventListener('click', async e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx   = Math.round(((e.clientX - rect.left) / rect.width)  * 100);
        const ny   = Math.round(((e.clientY - rect.top)  / rect.height) * 100);
        document.getElementById('focalDot').style.left = `${nx}%`;
        document.getElementById('focalDot').style.top  = `${ny}%`;
        document.getElementById('focalLabel').textContent = `${nx}% · ${ny}%`;
        try {
            const res = await fetch('/api/v2/client/focal', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ business_slug: slug, focal_x: nx, focal_y: ny }),
            });
            const data = await res.json();
            if (data.success) {
                const idx = myBusinesses.findIndex(b => b.slug === slug);
                if (idx >= 0) { myBusinesses[idx].cover_focal_x = nx; myBusinesses[idx].cover_focal_y = ny; }
                showToastClient('Punto focal guardado ✅');
            }
        } catch(e) { showToastClient('Error al guardar', 'error'); }
    });
}

async function previewAndUpload(input, type) {
    const file = input.files[0];
    if (!file || !editingSlug) return;
    openCropper(file, type, editingSlug);
}

// ── Kit QR imprimible ──────────────────────────────────────────────────────
async function downloadKit(slug) {
    try {
        showToastClient('Generando tu kit…');
        const res = await fetch(`${API_BASE}/client/businesses/${slug}/kit.pdf`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.status === 401) { clientLogout(); return; }
        if (!res.ok) { showToastClient('No se pudo generar el kit', 'error'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `kit-retopa-${slug}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { showToastClient('Error al generar el kit', 'error'); }
}

// ── Modal de edición ──────────────────────────────────────────────────────
async function openEditBiz(slug) {
    const biz = myBusinesses.find(b => b.slug === slug);
    if (!biz) return;
    editingSlug = slug;

    document.getElementById('editTradeName').value = biz.trade_name || biz.name || '';
    document.getElementById('editLegalName').value  = biz.name || '';
    document.getElementById('editDesc').value       = biz.description || '';
    if (document.getElementById('editKitCta')) document.getElementById('editKitCta').value = biz.kit_cta || '';
    document.getElementById('editPhone').value      = biz.phone       || '';
    document.getElementById('editWhatsapp').value   = biz.whatsapp    || biz.phone || '';
    document.getElementById('editEmail').value      = biz.email       || '';
    document.getElementById('editWebsite').value    = biz.website     || '';
    document.getElementById('editAddress').value    = biz.address     || '';
    document.getElementById('editCity').value       = biz.city        || '';
    document.getElementById('editHours').value      = biz.hours       || '';
    if (typeof initHoursWidget === 'function') initHoursWidget(biz.hoursJson || biz.hours_json || biz.hours || '');
    document.getElementById('editLat').value        = biz.lat         || '';
    document.getElementById('editLng').value        = biz.lng         || '';

    // Redes sociales: cargar valores y aplicar límites por plan
    const plan = biz.plan_type || biz.planType || 'basic';
    const socialIds = ['Instagram','Facebook','Tiktok','Linkedin','Twitter','Youtube'];
    socialIds.forEach(n => {
        const el = document.getElementById(`editSocial${n}`);
        if (el) el.value = biz[`social_${n.toLowerCase()}`] || '';
    });
    // Mostrar mensaje y bloquear inputs según plan
    document.getElementById('socialBasicMsg')?.classList.toggle('hidden', plan !== 'basic');
    document.getElementById('socialFeaturedMsg')?.classList.toggle('hidden', plan !== 'featured');
    const inputs = document.querySelectorAll('#socialInputs input');
    if (plan === 'basic') {
        inputs.forEach(i => { i.disabled = true; i.style.opacity = '0.6'; i.style.cursor = 'not-allowed'; });
    } else if (plan === 'featured') {
        inputs.forEach((i, idx) => {
            i.disabled = idx >= 2;
            i.style.opacity = idx >= 2 ? '0.6' : '1';
            i.style.cursor = idx >= 2 ? 'not-allowed' : '';
        });
    } else {
        inputs.forEach(i => { i.disabled = false; i.style.opacity = '1'; i.style.cursor = ''; });
    }
    document.getElementById('editError').classList.add('hidden');

    // Ciudad — combobox
    const cityInput = document.getElementById('editCityInput');
    const cityHidden = document.getElementById('editCity');
    if (cityInput)  cityInput.value  = biz.city || '';
    if (cityHidden) cityHidden.value = biz.city || '';
    // Precargar cache de ciudades si no está
    if (!_editCities.length) {
        fetch('/api/v2/cities').then(r => r.json()).then(data => {
            const raw = data.cities || data.data || [];
            _editCities = raw.map(c => typeof c === 'string' ? c : (c.name || '')).filter(Boolean);
        }).catch(() => {});
    }

    // Coordenadas — guardar en los inputs para que el tab de Ubicación las lea al abrirse
    document.getElementById('editLat').value = biz.lat || '';
    document.getElementById('editLng').value = biz.lng || '';

    // Si no tiene coords, precargar las de la ciudad en background
    if (!biz.lat && !biz.lng && biz.city) {
        fetchCityCoords(biz.city).then(coords => {
            if (coords && !document.getElementById('editLat').value) {
                document.getElementById('editLat').value  = coords.lat;
                document.getElementById('editLng').value  = coords.lng;
                // Si el tab de ubicación está abierto, inicializar el mapa
                const locationTab = document.getElementById('editTab-location');
                if (locationTab && !locationTab.classList.contains('hidden')) {
                    initClientMap(coords.lat, coords.lng);
                }
            }
        });
    }

    // Categorías — cargar cache e inicializar combobox
    await loadCategoriesCache();
    initCatCombo(biz);

    // Horarios — widget estructurado
    if (typeof initHoursWidget === 'function') initHoursWidget(biz.hoursJson || biz.hours_json || biz.hours || '');

    // Tags / Etiquetas
    if (typeof initTagsWidget === 'function') initTagsWidget(biz);

    // Pre-cargar imágenes actuales
    const logoPreview = document.getElementById('editLogoPreview');
    const logoPH = document.getElementById('editLogoPlaceholder');
    if (biz.image_url && logoPreview) {
        logoPreview.src = biz.image_url;
        logoPreview.classList.remove('hidden');
        if (logoPH) logoPH.classList.add('hidden');
    } else if (logoPreview) {
        logoPreview.classList.add('hidden');
        if (logoPH) logoPH.classList.remove('hidden');
    }

    const coverPreview = document.getElementById('editCoverPreview');
    const coverPH = document.getElementById('editCoverPlaceholder');
    if (biz.cover_url && coverPreview) {
        coverPreview.src = biz.cover_url;
        coverPreview.classList.remove('hidden');
        if (coverPH) coverPH.classList.add('hidden');
    } else if (coverPreview) {
        coverPreview.classList.add('hidden');
        if (coverPH) coverPH.classList.remove('hidden');
    }

    // Reset to first tab
    document.querySelectorAll('.edit-tab-panel').forEach(p => p.classList.add('hidden'));
    const firstPanel = document.getElementById('editTab-general');
    if (firstPanel) firstPanel.classList.remove('hidden');
    document.querySelectorAll('#editBizModal .mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));

    // Open as bottom-sheet on mobile, modal on desktop
    if (typeof openEditModalSheet === 'function') openEditModalSheet();
    else {
        const modal = document.getElementById('editBizModal');
        modal.classList.remove('hidden'); modal.classList.add('flex');
    }
}

function closeEditModal() {
    const modal = document.getElementById('editBizModal');
    modal.classList.remove('open');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    document.body.style.overflow = '';
    editingSlug = null;
}

async function saveBizEdit() {
    if (!editingSlug) return;
    const errEl = document.getElementById('editError');
    errEl.classList.add('hidden');

    const payload = {
        trade_name:  document.getElementById('editTradeName').value.trim(),
        name:        document.getElementById('editLegalName').value.trim() || document.getElementById('editTradeName').value.trim(),
        description: document.getElementById('editDesc').value.trim(),
        kit_cta:     document.getElementById('editKitCta')?.value.trim() || null,
        phone:       document.getElementById('editPhone').value.trim(),
        whatsapp:    document.getElementById('editWhatsapp').value.trim(),
        email:       document.getElementById('editEmail').value.trim(),
        website:     document.getElementById('editWebsite').value.trim(),
        address:     document.getElementById('editAddress').value.trim(),
        city:        document.getElementById('editCity').value.trim(),
        hours:       document.getElementById('editHours').value.trim(),
        hours_json:  typeof buildHoursJson === 'function' ? buildHoursJson() : null,
        tags:        JSON.parse(document.getElementById('editTags')?.value || '[]'),
        lat:         document.getElementById('editLat').value.trim(),
        lng:         document.getElementById('editLng').value.trim(),
        category_ids: _selectedCatIds.length ? _selectedCatIds : undefined,
        social_instagram: document.getElementById('editSocialInstagram')?.value.trim() || null,
        social_facebook:  document.getElementById('editSocialFacebook')?.value.trim()  || null,
        social_tiktok:    document.getElementById('editSocialTiktok')?.value.trim()    || null,
        social_linkedin:  document.getElementById('editSocialLinkedin')?.value.trim()  || null,
        social_twitter:   document.getElementById('editSocialTwitter')?.value.trim()   || null,
        social_youtube:   document.getElementById('editSocialYoutube')?.value.trim()   || null,
    };

    const res = await clientPut(`/client/businesses/${editingSlug}`, payload);
    if (!res.success) {
        errEl.textContent = res.error || 'Error al guardar';
        errEl.classList.remove('hidden');
        return;
    }

    // Actualizar datos locales
    const idx = myBusinesses.findIndex(b => b.slug === editingSlug);
    if (idx >= 0) Object.assign(myBusinesses[idx], payload);

    // Emitir evento de sincronía — si la ficha pública está abierta en esta misma pestaña, se recarga
    window.dispatchEvent(new CustomEvent('retopa:biz:updated', {
        detail: { slug: res.slug || editingSlug }
    }));

    closeEditModal();
    showToastClient('Empresa actualizada correctamente ✅');
    renderBusinessList();
}

// ── Gestión de galería ────────────────────────────────────────────────────
let galleryData = { items: [], maxPhotos: 0, slug: '' };

async function openGalleryManager(slug) {
    galleryData.slug = slug;
    const biz = myBusinesses.find(b => b.slug === slug);
    const data = await clientGet(`/client/businesses/${slug}/gallery`);
    if (!data.success) return;

    galleryData.items    = data.data;
    galleryData.maxPhotos = data.maxPhotos;

    const existing = document.getElementById('galleryModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'galleryModal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/60" onclick="closeGalleryModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10">
            <div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-gray-900 flex items-center gap-2">
                        <i class="fas fa-box-open text-brand-500"></i> Productos &amp; Servicios
                    </h3>
                    <p class="text-xs text-gray-400 mt-0.5">${data.data.length} de ${data.maxPhotos} productos · Plan ${data.planType === 'premium' ? 'Pro' : 'Negocio Digital'}</p>
                </div>
                <button onclick="closeGalleryModal()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
            <div class="p-6">
                <!-- Grid de productos actuales -->
                <div id="galleryGrid" class="grid grid-cols-2 gap-3 mb-6">
                    ${data.data.length === 0 ? '<p class="col-span-2 text-center text-gray-400 py-6 text-sm">Sin productos aún. Agregá el primero!</p>' :
                        data.data.map(img => `
                        <div class="relative rounded-xl overflow-hidden border border-gray-100 group" style="aspect-ratio:1">
                            <img src="${img.image_url}" class="w-full h-full object-cover">
                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                <button onclick="editGalleryItem(${img.id})" class="w-8 h-8 bg-white rounded-full flex items-center justify-center text-brand-600 hover:bg-brand-50" title="Editar">
                                    <i class="fas fa-edit text-xs"></i>
                                </button>
                                <button onclick="deleteGalleryItem(${img.id})" class="w-8 h-8 bg-white rounded-full flex items-center justify-center text-red-500 hover:bg-red-50" title="Eliminar">
                                    <i class="fas fa-trash text-xs"></i>
                                </button>
                            </div>
                            ${img.caption ? `<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5"><p class="text-white text-[10px] font-semibold truncate">${img.caption}</p>${img.price ? `<p class="text-yellow-300 text-[10px] font-bold">${Number(img.price).toLocaleString('es-PY')} ${img.price_label||'Gs.'}</p>` : ''}</div>` : ''}
                        </div>`).join('')
                    }
                </div>

                <!-- Formulario agregar producto/imagen — Upload directo + campos tiendita -->
                ${data.data.length < data.maxPhotos ? `
                <div class="bg-gray-50 rounded-xl p-5 border border-gray-200">
                    <h4 class="font-bold text-gray-800 text-sm mb-4"><i class="fas fa-plus-circle text-brand-500 mr-1"></i> Agregar producto o imagen</h4>
                    <div class="space-y-3">
                        <!-- Upload directo -->
                        <div>
                          <label class="block text-xs font-medium text-gray-600 mb-1">Imagen del producto *</label>
                          <div id="galleryUploadZone"
                               onclick="document.getElementById('galleryFileInput').click()"
                               style="border:2px dashed #cbd5e1;border-radius:12px;padding:20px;text-align:center;cursor:pointer;background:white;transition:border-color .2s"
                               onmouseover="this.style.borderColor='#1B3A6B'" onmouseout="this.style.borderColor='#cbd5e1'">
                            <img id="galleryImgPreview" style="display:none;max-height:120px;margin:0 auto 8px;border-radius:8px;object-fit:cover">
                            <div id="galleryUploadPrompt">
                              <i class="fas fa-cloud-upload-alt" style="font-size:24px;color:#94a3b8;display:block;margin-bottom:6px"></i>
                              <p style="font-size:13px;color:#64748b;margin:0">Tocá para elegir imagen</p>
                              <p style="font-size:11px;color:#94a3b8;margin:4px 0 0">JPG, PNG, WebP · máx 10MB</p>
                            </div>
                          </div>
                          <input type="file" id="galleryFileInput" accept="image/*" class="hidden"
                                 onchange="previewGalleryFile(this)">
                        </div>
                        <!-- Nombre del producto -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Nombre del producto / servicio *</label>
                            <input type="text" id="galleryCaption" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Zapatillas Nike Air Max">
                        </div>
                        <!-- Descripción -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
                            <textarea id="galleryDescription" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" placeholder="Detalles del producto, talla, color, etc."></textarea>
                        </div>
                        <!-- Precio -->
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Precio</label>
                                <input type="number" id="galleryPrice" min="0" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="150000">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Moneda / etiqueta</label>
                                <select id="galleryPriceLabel" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                                    <option value="Gs.">Gs. (Guaraníes)</option>
                                    <option value="USD">USD</option>
                                    <option value="Consultar">Consultar precio</option>
                                    <option value="">Sin precio</option>
                                </select>
                            </div>
                        </div>
                        <!-- Links CTA -->
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Texto del botón CTA</label>
                                <input type="text" id="galleryLinkLabel" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Consultar">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Link externo (opcional)</label>
                                <input type="url" id="galleryLinkUrl" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="https://tienda.com/producto">
                            </div>
                        </div>
                        <div id="galleryAddError" class="hidden text-xs text-red-600 bg-red-50 rounded px-2 py-1"></div>
                        <button onclick="addGalleryItem()" class="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2">
                            <i class="fas fa-plus"></i> Agregar producto
                        </button>
                    </div>
                </div>` : `
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p class="text-sm text-amber-700 font-medium">Alcanzaste el límite de ${data.maxPhotos} productos de tu plan</p>
                    ${data.planType === 'featured' ? '<a href="/#planes" class="text-xs text-brand-600 hover:underline mt-1 block">Actualizá a Pro para más productos →</a>' : ''}
                </div>`}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeGalleryModal() {
    document.getElementById('galleryModal')?.remove();
}

// ── Preview de imagen de galería antes de subir ───────────────────────────
let _galleryFileBlob = null;

function previewGalleryFile(input) {
    const file = input.files[0];
    if (!file) return;
    _galleryFileBlob = file;
    const reader = new FileReader();
    reader.onload = e => {
        const preview = document.getElementById('galleryImgPreview');
        const prompt  = document.getElementById('galleryUploadPrompt');
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (prompt)  prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function addGalleryItem() {
    const errEl = document.getElementById('galleryAddError');
    errEl.classList.add('hidden');

    const caption     = document.getElementById('galleryCaption').value.trim();
    const description = document.getElementById('galleryDescription')?.value.trim() || '';
    const price       = document.getElementById('galleryPrice')?.value || '';
    const price_label = document.getElementById('galleryPriceLabel')?.value || 'Gs.';
    const link_url    = document.getElementById('galleryLinkUrl').value.trim();
    const link_label  = document.getElementById('galleryLinkLabel').value.trim() || 'Consultar';

    if (!_galleryFileBlob) {
        errEl.textContent = 'Elegí una imagen para el producto';
        errEl.classList.remove('hidden'); return;
    }
    if (!caption) {
        errEl.textContent = 'El nombre del producto es requerido';
        errEl.classList.remove('hidden'); return;
    }

    // 1. Subir imagen al servidor
    const formData = new FormData();
    formData.append('gallery', _galleryFileBlob, 'gallery.jpg');
    formData.append('business_slug', galleryData.slug);

    let imageUrl = '';
    try {
        const upRes  = await fetch('/api/v2/client/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData,
        });
        const upData = await upRes.json();
        if (!upData.success) {
            errEl.textContent = upData.error || 'Error al subir la imagen';
            errEl.classList.remove('hidden'); return;
        }
        imageUrl = upData.data.gallery_url;
    } catch(e) {
        errEl.textContent = 'Error de conexión al subir imagen';
        errEl.classList.remove('hidden'); return;
    }

    // 2. Guardar en la BD
    const res = await clientPost(`/client/businesses/${galleryData.slug}/gallery`, {
        image_url: imageUrl,
        caption, description,
        price:      price ? parseInt(price) : null,
        price_label: price_label || null,
        link_url, link_label,
        position: galleryData.items.length,
    });

    if (!res.success) {
        errEl.textContent = res.error || 'Error al agregar';
        errEl.classList.remove('hidden'); return;
    }

    _galleryFileBlob = null;
    showToastClient('Producto agregado ✅');
    closeGalleryModal();
    openGalleryManager(galleryData.slug);
}

async function editGalleryItem(id) {
    // Buscar el item en los datos cargados
    const img = galleryData.items.find(i => i.id === id);
    if (!img) return;

    // Crear modal de edición
    const existing = document.getElementById('galleryEditModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'galleryEditModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:flex-end;justify-content:center';
    modal.innerHTML = `
    <div style="background:white;border-radius:20px 20px 0 0;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin:0">Editar producto</h3>
            <button onclick="document.getElementById('galleryEditModal').remove()"
                    style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:16px;color:#475569">×</button>
        </div>

        <!-- Preview imagen actual -->
        <div style="margin-bottom:16px;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:#f8fafc">
            <img src="${img.image_url}" style="width:100%;height:100%;object-fit:cover">
        </div>
        <p style="font-size:11px;color:#94a3b8;margin:-8px 0 16px;text-align:center">
            La imagen no se puede cambiar. Para cambiarla, eliminá y creá un nuevo producto.
        </p>

        <div style="display:flex;flex-direction:column;gap:14px">
            <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Nombre del producto *</label>
                <input id="editGalleryCaption" type="text" value="${(img.caption||'').replace(/"/g,'&quot;')}"
                    style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none">
            </div>
            <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Descripción</label>
                <textarea id="editGalleryDescription" rows="2"
                    style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none;resize:none">${img.description||''}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Precio</label>
                    <input id="editGalleryPrice" type="number" min="0" value="${img.price||''}"
                        style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none">
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Moneda</label>
                    <select id="editGalleryPriceLabel"
                            style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none;background:white">
                        <option value="Gs." ${(img.price_label||'Gs.')  === 'Gs.'      ? 'selected' : ''}>Gs.</option>
                        <option value="USD" ${img.price_label === 'USD'      ? 'selected' : ''}>USD</option>
                        <option value="Consultar" ${img.price_label === 'Consultar' ? 'selected' : ''}>Consultar</option>
                        <option value=""    ${!img.price_label                      ? 'selected' : ''}>Sin precio</option>
                    </select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Texto del botón CTA</label>
                    <input id="editGalleryLinkLabel" type="text" value="${(img.link_label||'').replace(/"/g,'&quot;')}"
                        placeholder="Consultar"
                        style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none">
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Link externo</label>
                    <input id="editGalleryLinkUrl" type="url" value="${(img.link_url||'').replace(/"/g,'&quot;')}"
                        placeholder="https://..."
                        style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none">
                </div>
            </div>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px;background:#f8fafc;border-radius:12px">
                <input id="editGalleryAvailable" type="checkbox" ${img.is_available !== false ? 'checked' : ''}
                       style="width:16px;height:16px;accent-color:#1B3A6B">
                <span style="font-size:13px;font-weight:600;color:#475569">Disponible / en stock</span>
            </label>
        </div>

        <div id="galleryEditError" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:13px;border-radius:10px;padding:10px 14px;margin-top:12px"></div>

        <button onclick="saveGalleryEdit(${id})"
                style="width:100%;margin-top:16px;background:#1B3A6B;color:white;border:none;padding:14px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">
            <i class="fas fa-save" style="margin-right:8px"></i>Guardar cambios
        </button>
    </div>`;

    document.body.appendChild(modal);
    // Cerrar al tocar el overlay
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function saveGalleryEdit(id) {
    const caption     = document.getElementById('editGalleryCaption').value.trim();
    const description = document.getElementById('editGalleryDescription').value.trim();
    const price       = document.getElementById('editGalleryPrice').value;
    const price_label = document.getElementById('editGalleryPriceLabel').value;
    const link_label  = document.getElementById('editGalleryLinkLabel').value.trim();
    const link_url    = document.getElementById('editGalleryLinkUrl').value.trim();
    const is_available = document.getElementById('editGalleryAvailable').checked;
    const errEl       = document.getElementById('galleryEditError');

    if (!caption) {
        errEl.textContent = 'El nombre del producto es requerido';
        errEl.style.display = 'block'; return;
    }

    const res = await clientPut(`/client/gallery/${id}`, {
        caption, description, price: price ? parseInt(price) : null,
        price_label: price_label || null, link_label, link_url, is_available,
        position: galleryData.items.find(i => i.id === id)?.position || 0,
    });

    if (!res.success) {
        errEl.textContent = res.error || 'Error al guardar';
        errEl.style.display = 'block'; return;
    }

    document.getElementById('galleryEditModal')?.remove();
    showToastClient('Producto actualizado ✅');
    closeGalleryModal();
    openGalleryManager(galleryData.slug);
}

async function deleteGalleryItem(id) {
    if (!confirm('¿Eliminar esta imagen?')) return;
    const res = await clientDelete(`/client/gallery/${id}`);
    if (res.success) { showToastClient('Imagen eliminada'); closeGalleryModal(); openGalleryManager(galleryData.slug); }
}

async function clientDelete(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        return await res.json();
    } catch(e) { return { success: false }; }
}
// ── Reviews con filtros y respuesta ──────────────────────────────────────
let _allReviews = [];
let _reviewRatingMode = 'all'; // 'all' | '5' | '4' | 'max3'

async function loadReviews() {
    const container = document.getElementById('reviewsList');
    const bizSlug   = activeDashBiz || (myBusinesses && myBusinesses[0]?.slug);
    const endpoint  = bizSlug ? `/client/reviews?business_slug=${bizSlug}` : '/client/reviews';
    const data = await clientGet(endpoint);

    if (!data.success || !data.data.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                <i class="fas fa-star text-4xl text-gray-200 mb-3 block"></i>
                <p class="font-bold text-gray-700">Aún no recibiste reseñas</p>
                <p class="text-sm text-gray-400 mt-1">Las reseñas de tus clientes aparecerán aquí</p>
            </div>`;
        return;
    }

    _allReviews = data.data;

    // Poblar filtro de empresas — desktop
    const bizFilter = document.getElementById('reviewsBizFilter');
    if (bizFilter) {
        const slugs = [...new Set(_allReviews.map(r => r.business_slug))];
        const names = {};
        _allReviews.forEach(r => { names[r.business_slug] = r.business_name; });
        bizFilter.innerHTML = '<option value="">Todas las empresas</option>' +
            slugs.map(s => `<option value="${s}">${escHtml(names[s])}</option>`).join('');
    }

    // Poblar filtro de empresas — mobile
    const mobileBizFilter = document.getElementById('reviewsMobileBizFilter');
    const mobileBizWrap   = document.getElementById('reviewsMobileBizWrap');
    if (mobileBizFilter && mobileBizWrap) {
        const slugs = [...new Set(_allReviews.map(r => r.business_slug))];
        if (slugs.length > 1) {
            const names = {};
            _allReviews.forEach(r => { names[r.business_slug] = r.business_name; });
            mobileBizFilter.innerHTML = '<option value="">Todas las empresas</option>' +
                slugs.map(s => `<option value="${s}">${escHtml(names[s])}</option>`).join('');
            mobileBizWrap.classList.remove('hidden');
        } else {
            mobileBizWrap.classList.add('hidden');
        }
    }

    renderReviews(_allReviews);
}

function setReviewTab(mode, el) {
    _reviewRatingMode = mode;
    document.querySelectorAll('#section-reviews .mobile-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    filterReviews();
}

function filterReviews() {
    // La empresa se filtra desde el selector maestro (activeDashBiz)
    // Solo filtramos por rating aquí
    const minRating = parseInt(document.getElementById('reviewsRatingFilter')?.value || '0');

    let filtered = _allReviews;

    // Rating: tab mobile tiene prioridad, luego select desktop
    if (_reviewRatingMode === '5')         filtered = filtered.filter(r => r.rating === 5);
    else if (_reviewRatingMode === '4')    filtered = filtered.filter(r => r.rating === 4);
    else if (_reviewRatingMode === 'max3') filtered = filtered.filter(r => r.rating <= 3);
    else if (minRating > 0)               filtered = filtered.filter(r => r.rating >= minRating);

    renderReviews(filtered);
}

function renderReviews(reviews) {
    const container = document.getElementById('reviewsList');
    if (!reviews.length) {
        container.innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p class="text-gray-400 text-sm">No hay reseñas que coincidan con los filtros</p></div>`;
        return;
    }

    container.innerHTML = reviews.map(r => {
        const isPremium = r.plan_type === 'premium';
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const replyHtml = r.owner_reply
            ? `<div class="mt-3 pl-4 border-l-2 border-brand-200 bg-brand-50 rounded-r-lg p-3">
                <p class="text-xs font-bold text-brand-700 mb-1"><i class="fas fa-reply mr-1"></i> Respuesta del negocio</p>
                <p class="text-sm text-brand-800">${escHtml(r.owner_reply)}</p>
                <p class="text-xs text-gray-400 mt-1">${new Date(r.owner_replied_at).toLocaleDateString('es-PY')}</p>
               </div>`
            : (isPremium
                ? `<div class="mt-3">
                    <button onclick="openReplyForm(${r.id})"
                        class="text-xs text-brand-600 hover:text-brand-800 font-bold flex items-center gap-1 transition">
                        <i class="fas fa-reply"></i> Responder esta reseña
                    </button>
                    <div id="replyForm-${r.id}" class="hidden mt-2">
                        <textarea id="replyText-${r.id}" rows="2" maxlength="600"
                            placeholder="Escribí tu respuesta (máx 600 caracteres)..."
                            class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-brand-400 resize-none"></textarea>
                        <div class="flex gap-2 mt-1.5">
                            <button onclick="submitReply(${r.id})"
                                class="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-brand-600 transition">
                                Publicar respuesta
                            </button>
                            <button onclick="closeReplyForm(${r.id})"
                                class="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition">
                                Cancelar
                            </button>
                        </div>
                    </div>
                  </div>`
                : `<p class="text-xs text-gray-400 mt-2 italic flex items-center gap-1">
                    <i class="fas fa-lock text-[10px]"></i> Responder reseñas es exclusivo del plan <strong>Premium</strong>
                   </p>`);

        return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="text-amber-400 text-sm font-bold tracking-tight">${stars}</span>
                        <span class="text-xs text-gray-400">${new Date(r.created_at).toLocaleDateString('es-PY')}</span>
                        ${!r.is_approved ? '<span class="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Pendiente</span>' : ''}
                        ${r.owner_reply ? '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold"><i class="fas fa-check-circle mr-0.5"></i>Respondida</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-700 leading-relaxed">${escHtml(r.comment || 'Sin comentario')}</p>
                    <p class="text-xs text-gray-400 mt-2">
                        <i class="fas fa-user mr-1"></i>${escHtml(r.author_name || 'Anónimo')}
                        · <i class="fas fa-building mr-1"></i>${escHtml(r.business_name)}
                    </p>
                    ${replyHtml}
                </div>
            </div>
        </div>`;
    }).join('');
}

function openReplyForm(reviewId) {
    document.getElementById(`replyForm-${reviewId}`)?.classList.remove('hidden');
    document.getElementById(`replyText-${reviewId}`)?.focus();
}

function closeReplyForm(reviewId) {
    document.getElementById(`replyForm-${reviewId}`)?.classList.add('hidden');
}

async function submitReply(reviewId) {
    const textarea = document.getElementById(`replyText-${reviewId}`);
    const reply = textarea?.value?.trim();
    if (!reply) return showToastClient('Escribí tu respuesta antes de publicar', 'error');

    const res = await clientPost(`/client/reviews/${reviewId}/reply`, { reply }, 'PUT');
    if (res.success) {
        showToastClient('✅ Respuesta publicada correctamente');
        loadReviews();
    } else {
        showToastClient(res.error || 'Error al publicar respuesta', 'error');
    }
}

// ── Mapa de ubicación en modal de edición ─────────────────────────────────
async function fetchCityCoords(cityName) {
    if (!cityName) return null;
    try {
        const res = await fetch(`/api/v2/cities?q=${encodeURIComponent(cityName)}`);
        const data = await res.json();
        const city = (data.data || []).find(c => c.lat && c.lng);
        if (city) return { lat: parseFloat(city.lat), lng: parseFloat(city.lng) };
    } catch(e) {}
    return null;
}
let _clientMap = null;
let _clientMarker = null;
let _pendingMapCoords = null; // coords para inicializar cuando el tab sea visible

function initClientMap(lat, lng) {
    const container = document.getElementById('clientMapContainer');
    if (!container) return;

    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);

    // Si Google Maps aún no cargó, guardar coords y reintentar
    if (typeof google === 'undefined' || !google.maps) {
        _pendingMapCoords = { lat: latN, lng: lngN };
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;flex-direction:column;gap:6px;"><i class="fas fa-spinner fa-spin text-xl"></i><span>Cargando mapa...</span></div>';
        setTimeout(() => initClientMap(latN, lngN), 1200);
        return;
    }

    if (isNaN(latN) || isNaN(lngN)) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;flex-direction:column;gap:6px;"><i class="fas fa-map-marker-alt text-xl"></i><span>Sin coordenadas — usá "Buscar coordenadas" arriba</span></div>';
        _pendingMapCoords = null;
        return;
    }

    _pendingMapCoords = null;
    document.getElementById('clientMapPlaceholder')?.remove();
    container.innerHTML = '<div id="clientMapDiv" style="width:100%;height:100%"></div>';

    _clientMap = new google.maps.Map(document.getElementById('clientMapDiv'), {
        center: { lat: latN, lng: lngN }, zoom: 15,
        mapTypeControl: false, streetViewControl: false
    });
    _clientMarker = new google.maps.Marker({
        position: { lat: latN, lng: lngN }, map: _clientMap, draggable: true
    });
    _clientMarker.addListener('dragend', e => {
        document.getElementById('editLat').value = e.latLng.lat().toFixed(7);
        document.getElementById('editLng').value = e.latLng.lng().toFixed(7);
    });
    _clientMap.addListener('click', e => {
        _clientMarker.setPosition(e.latLng);
        document.getElementById('editLat').value = e.latLng.lat().toFixed(7);
        document.getElementById('editLng').value = e.latLng.lng().toFixed(7);
    });

    // Forzar resize por si el contenedor estaba oculto
    setTimeout(() => google.maps.event.trigger(_clientMap, 'resize'), 100);
}

async function clientGeocode() {
    const address = (document.getElementById('editAddress')?.value?.trim()
        || document.getElementById('editCity')?.value?.trim() || '');
    if (!address) { showToastClient('Ingresá una dirección o ciudad primero', 'error'); return; }

    showToastClient('Buscando coordenadas...', 'info');

    try {
        // Nominatim (OpenStreetMap) — gratuito, sin key, sin activación
        const query = encodeURIComponent(address + ', Paraguay');
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
            headers: { 'Accept-Language': 'es', 'User-Agent': 'RetoPA-Directory/1.0' }
        });
        const results = await res.json();
        if (!results.length) {
            showToastClient('No se encontraron coordenadas para esa dirección', 'error');
            return;
        }
        const { lat, lon } = results[0];
        const latN = parseFloat(lat);
        const lngN = parseFloat(lon);
        document.getElementById('editLat').value = latN.toFixed(7);
        document.getElementById('editLng').value = lngN.toFixed(7);
        initClientMap(latN, lngN);
        showToastClient('✅ Coordenadas encontradas');
    } catch(e) {
        showToastClient('Error al buscar coordenadas. Verificá tu conexión.', 'error');
    }
}

// ── Obtener coordenadas de una ciudad por nombre ──────────────────────────
async function getClientCityCoords(cityName) {
    if (!cityName) return { lat: -25.2867, lng: -57.6478 }; // Asunción por defecto
    try {
        const r = await fetch(`/api/v2/cities?q=${encodeURIComponent(cityName)}`);
        const data = await r.json();
        const cities = data.cities || data.data || [];
        const city = cities.find(c => (c.name||c).toLowerCase() === cityName.toLowerCase());
        if (city && city.lat && city.lng) return { lat: parseFloat(city.lat), lng: parseFloat(city.lng) };
    } catch(e) {}
    return { lat: -25.2867, lng: -57.6478 }; // fallback Asunción
}

// ── Cargar Google Maps si no está ya ─────────────────────────────────────
async function ensureGoogleMapsLoaded() {
    if (typeof google !== 'undefined' && google.maps) return;
    // Esperar hasta 3 segundos a que cargue (se carga en app.js init)
    return new Promise(resolve => {
        let attempts = 0;
        const check = setInterval(() => {
            attempts++;
            if (typeof google !== 'undefined' && google.maps) {
                clearInterval(check); resolve();
            } else if (attempts > 30) {
                clearInterval(check); resolve(); // timeout
            }
        }, 100);
    });
}

// ── Modal de mejora de plan ────────────────────────────────────────────────
async function openUpgradePlanModal(slug, currentPlan) {
    const existing = document.getElementById('upgradePlanModal');
    if (existing) existing.remove();

    const biz = myBusinesses.find(b => b.slug === slug);

    // Cargar datos del usuario actual desde la API
    const meData = await clientGet('/client/me');
    const user = meData.success ? meData.data : {};
    const userName  = user.name  || currentUser?.name  || '';
    const userEmail = user.email || currentUser?.email || '';
    const userPhone = user.phone || '';

    // Cargar planes reales desde la API
    const plansData = await fetch('/api/v2/plans').then(r => r.json()).catch(() => ({ data: [] }));
    const allPlans = plansData.data || plansData.plans || [];

    // Filtrar solo los planes superiores al actual — mapeo robusto de plan_type
    const planOrder = { basic: 1, featured: 2, premium: 3 };
    const currentLevel = planOrder[currentPlan] || 1;

    const normalizePlanType = (p) => {
        if (p.plan_type && planOrder[p.plan_type]) return p.plan_type;
        if (p.id && planOrder[p.id]) return p.id;
        const name = (p.name || '').toLowerCase();
        if (name.includes('pro') || name.includes('premium')) return 'premium';
        if (name.includes('digital') || name.includes('featured') || name.includes('destac')) return 'featured';
        return null;
    };

    const upgradePlans = allPlans
        .map(p => ({ ...p, plan_type: normalizePlanType(p) }))
        .filter(p => p.plan_type && (planOrder[p.plan_type] || 0) > currentLevel);

    // Fallback hardcodeado si la API no devuelve planes o no se pueden mapear
    const plansInfo = upgradePlans.length ? upgradePlans : [
        { id: 'featured', plan_type: 'featured', name: 'Negocio Digital', subtitle: 'Todo lo que necesitás para vender', price: 259000,
          features: ['Perfil destacado en búsquedas','Galería de 3 fotos con links','Badge Destacado','Estadísticas básicas','Soporte prioritario'] },
        { id: 'premium',  plan_type: 'premium',  name: 'Empresa Pro',     subtitle: 'Suite completa sin límites',    price: 499000,
          features: ['Todo lo de Negocio Digital','Galería de 5 fotos','Dashboard completo con KPIs','Tasa de conversión y tendencias','Soporte VIP'] },
    ].filter(p => planOrder[p.plan_type] > currentLevel);

    // Desde Basic mostramos todos los planes superiores; desde Featured solo Pro
    const availablePlans = plansInfo;
    const preselected = availablePlans[availablePlans.length - 1]; // preseleccionar el más alto

    const modal = document.createElement('div');
    modal.id = 'upgradePlanModal';
    modal.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/60" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 z-10 max-h-[90vh] overflow-y-auto">
            <button onclick="document.getElementById('upgradePlanModal').remove()"
                class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <i class="fas fa-times text-xs"></i>
            </button>
            <div class="text-center mb-6">
                <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
                     style="background:linear-gradient(135deg,#fbbf24,#f59e0b)">
                    <i class="fas fa-rocket text-white"></i>
                </div>
                <h3 class="text-xl font-black text-gray-900">Mejorá tu plan</h3>
                <p class="text-sm text-gray-500 mt-1">Elegí el plan que más se adapta a tu negocio</p>
            </div>

            <!-- Selector de plan -->
            <div class="grid grid-cols-${Math.min(availablePlans.length, 2)} gap-3 mb-6" id="planCards">
                ${availablePlans.map((plan, idx) => {
                    const planType = plan.plan_type || (plan.name?.toLowerCase().includes('pro') ? 'premium' : 'featured');
                    const features = Array.isArray(plan.features)
                        ? (typeof plan.features[0] === 'string' ? plan.features : plan.features.map(f => f.text || f.name || f))
                        : [];
                    const price = plan.price ? `Gs. ${Number(plan.price).toLocaleString()}/mes` : '';
                    const isPreselected = plan === preselected;
                    const isHighest = idx === availablePlans.length - 1 && availablePlans.length > 1;
                    return `<div onclick="selectUpgradePlan('${planType}')" id="planCard_${planType}"
                        class="rounded-xl border-2 p-4 cursor-pointer transition ${isPreselected ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}"
                        data-plan="${planType}">
                        <div class="font-bold text-gray-900 text-sm">${plan.name}</div>
                        ${plan.subtitle ? `<div class="text-xs text-gray-400 mt-0.5">${plan.subtitle}</div>` : ''}
                        <div class="font-black text-lg mt-1 text-amber-500">${price}</div>
                        ${isHighest && availablePlans.length > 1 ? '<div class="text-xs bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full font-bold mt-1 inline-block">⭐ Recomendado</div>' : ''}
                        <ul class="mt-3 space-y-1.5">
                            ${features.slice(0,5).map(f => `<li class="text-xs text-gray-600 flex items-start gap-1.5"><i class="fas fa-check text-green-500 mt-0.5 flex-shrink-0"></i>${f}</li>`).join('')}
                        </ul>
                    </div>`;
                }).join('')}
            </div>
            <input type="hidden" id="selectedUpgradePlan" value="${preselected?.plan_type || 'premium'}">

            <!-- Datos de contacto -->
            <div class="space-y-3 mb-5">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tu nombre</label>
                    <input type="text" id="upgradeName" value="${userName}"
                        class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-400">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email de contacto</label>
                    <input type="email" id="upgradeEmail" value="${userEmail}"
                        class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-400">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono / WhatsApp</label>
                    <input type="tel" id="upgradePhone" value="${userPhone}"
                        class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-400"
                        placeholder="+595 981 000 000">
                </div>
            </div>
            <div id="upgradeError" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3"></div>
            <button onclick="submitUpgradeLead('${slug}')"
                class="w-full font-bold py-3 rounded-xl text-white flex items-center justify-center gap-2"
                style="background:linear-gradient(135deg,#fbbf24,#f59e0b)">
                <i class="fas fa-rocket"></i> Quiero este plan
            </button>
            <p class="text-xs text-gray-400 text-center mt-3">Un asesor te contactará en menos de 24hs.</p>
        </div>`;
    document.body.appendChild(modal);
}

function selectUpgradePlan(planKey) {
    document.querySelectorAll('#planCards > div').forEach(card => {
        if (card.dataset.plan === planKey) {
            card.classList.add('border-amber-400', 'bg-amber-50');
            card.classList.remove('border-gray-200');
        } else {
            card.classList.remove('border-amber-400', 'bg-amber-50');
            card.classList.add('border-gray-200');
        }
    });
    document.getElementById('selectedUpgradePlan').value = planKey;
}

async function submitUpgradeLead(bizSlug) {
    const errEl = document.getElementById('upgradeError');
    errEl.classList.add('hidden');
    const name     = document.getElementById('upgradeName').value.trim();
    const email    = document.getElementById('upgradeEmail').value.trim();
    const phone    = document.getElementById('upgradePhone').value.trim();
    const planKey  = document.getElementById('selectedUpgradePlan').value;
    const biz      = myBusinesses.find(b => b.slug === bizSlug);
    const planName = planKey === 'premium' ? 'Empresa Pro' : 'Negocio Digital';

    if (!name || !email) {
        errEl.textContent = 'Nombre y email son requeridos';
        errEl.classList.remove('hidden');
        return;
    }

    // D7.2 — Contratación de plan: crea la solicitud (Tpago) o cae al lead si no hay link
    const res = await clientPost('/client/plan-request', {
        business_id:   biz?.id,
        business_slug: bizSlug,
        plan:          planKey,
        contact_name:  name,
        contact_email: email,
        contact_phone: phone,
    });

    if (res.success && res.mode === 'tpago') {
        // D7.3d — todavía NO es una Solicitud: es intención (Lead). La Solicitud se
        // crea recién cuando el cliente confirma "Listo, ya pagué".
        renderPlanPaymentStep({ ...res.data, business_slug: res.data.business_slug || bizSlug });
    } else if (res.success && res.mode === 'lead') {
        document.getElementById('upgradePlanModal')?.remove();
        showToastClient('✅ Solicitud enviada — te contactamos en menos de 24hs!');
    } else if (res.success || res.created) {
        document.getElementById('upgradePlanModal')?.remove();
        showToastClient('✅ Solicitud enviada — te contactamos en menos de 24hs!');
    } else {
        errEl.textContent = res.error || 'Error al enviar solicitud';
        errEl.classList.remove('hidden');
    }
}

// D7.2 — Paso de pago con Tpago (stepper "Solicitud → Pagá → En revisión")
function renderPlanPaymentStep(data) {
    let modal = document.getElementById('upgradePlanModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'upgradePlanModal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
        modal.style.background = 'rgba(0,0,0,.5)';
        document.body.appendChild(modal);
    }
    const amount = Number(data.amount_gs || 0).toLocaleString('es-PY');
    const label  = data.plan_label || (data.plan === 'premium' ? 'Empresa Pro' : 'Negocio Digital');
    const link   = data.tpago_link || '#';
    const slug   = data.business_slug || '';
    const isPending = !!data.pending; // reabierto desde "Plan en revisión"
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
        <button onclick="document.getElementById('upgradePlanModal').remove()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200"><i class="fas fa-times"></i></button>
        <div class="text-center">
          <div class="text-3xl mb-1">💳</div>
          <h3 class="text-lg font-bold text-gray-900">${isPending ? 'Pago en revisión' : 'Activá tu plan'}</h3>
          <p class="text-sm text-gray-500 mt-0.5">Plan <b>${label}</b></p>
        </div>
        <div class="flex items-center justify-center gap-2 my-5 text-[11px] font-semibold">
          <span class="flex items-center gap-1 text-green-600"><i class="fas fa-check-circle"></i> Elegiste</span>
          <span class="text-gray-300">—</span>
          <span class="flex items-center gap-1 ${isPending ? 'text-green-600' : 'text-brand-700'}"><i class="fas fa-credit-card"></i> Pagá con Tpago</span>
          <span class="text-gray-300">—</span>
          <span class="flex items-center gap-1 ${isPending ? 'text-brand-700' : 'text-gray-400'}"><i class="fas fa-hourglass-half"></i> En revisión</span>
        </div>
        <div class="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center mb-4">
          <p class="text-[11px] text-gray-400 uppercase tracking-wide">Total a pagar</p>
          <p class="text-2xl font-black text-brand-700">Gs. ${amount}</p>
        </div>
        <a href="${link}" target="_blank" rel="noopener noreferrer"
           class="block w-full text-center text-white py-3 rounded-xl font-bold mb-2" style="background:#16a34a">
           Pagar con Tpago →
        </a>
        <p class="text-[11px] text-gray-400 text-center mb-3">Apenas confirmemos el pago, activamos tu plan. También te enviamos el link por email.</p>
        <button onclick="declarePlanPaid('${slug}', '${data.plan}')"
           class="w-full text-center text-white py-2.5 rounded-xl text-sm font-bold hover:opacity-90" style="background:linear-gradient(135deg,#fbbf24,#f59e0b)">Listo, ya pagué</button>
      </div>`;
}

// D7.3d — El cliente declara el pago: recién acá se crea la Solicitud pendiente.
async function declarePlanPaid(bizSlug, plan) {
    const biz = myBusinesses.find(b => b.slug === bizSlug);
    const res = await clientPost('/client/plan-request/paid', {
        business_id:   biz?.id,
        business_slug: bizSlug,
        plan:          plan,
    });
    if (res.success || res.mode === 'tpago') {
        if (biz && res.data) biz.pending_plan_request = { plan: res.data.plan, amount_gs: res.data.amount_gs, tpago_link: res.data.tpago_link };
        document.getElementById('upgradePlanModal')?.remove();
        showToastClient('✅ ¡Gracias! Recibimos tu aviso. Activamos apenas confirmemos el pago.');
        if (typeof reloadMyBusinesses === 'function') reloadMyBusinesses();
    } else if (res.error && /pendiente/i.test(res.error)) {
        // Ya había una Solicitud pendiente → solo refrescar el estado
        document.getElementById('upgradePlanModal')?.remove();
        showToastClient('Tu solicitud ya está en revisión.');
        if (typeof reloadMyBusinesses === 'function') reloadMyBusinesses();
    } else {
        showToastClient('Error: ' + (res.error || 'no se pudo registrar'), 'error');
    }
}

// Reabrir el paso de pago de una solicitud pendiente (botón "Plan en revisión")
function openPendingPlan(slug) {
    const biz = myBusinesses.find(b => b.slug === slug);
    const pr = biz && biz.pending_plan_request;
    if (!pr) { openUpgradePlanModal(slug, biz?.plan_type || 'basic'); return; }
    renderPlanPaymentStep({ plan: pr.plan, plan_label: pr.plan_name || (pr.plan === 'premium' ? 'Empresa Pro' : 'Negocio Digital'), amount_gs: pr.amount_gs, tpago_link: pr.tpago_link, business_slug: slug, pending: true });
}

// Recargar "mis empresas" y re-renderizar (para reflejar el estado pendiente)
async function reloadMyBusinesses() {
    try {
        const d = await clientGet('/client/businesses');
        myBusinesses = d.success ? d.data : myBusinesses;
        if (typeof renderBusinessList === 'function') renderBusinessList();
    } catch (e) {}
}

// ── Galería con trazabilidad (solo Premium) ───────────────────────────────
async function loadGalleryStats(slug) {
    const container = document.getElementById('galleryStatsContainer');
    if (!container) return;

    container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i> Cargando stats...</p>';

    const data = await clientGet(`/client/businesses/${slug}/gallery-stats`);
    if (!data.success) {
        container.innerHTML = data.error?.includes('Premium')
            ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <i class="fas fa-lock text-amber-400 text-2xl mb-2 block"></i>
                <p class="text-sm font-bold text-amber-700">Exclusivo Plan Premium</p>
                <p class="text-xs text-amber-600 mt-1">Las estadísticas de galería están disponibles para clientes Pro.</p>
               </div>`
            : '<p class="text-sm text-gray-400 text-center py-4">No se pudieron cargar las estadísticas</p>';
        return;
    }

    if (!data.data.length) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Sin imágenes en la galería aún</p>';
        return;
    }

    container.innerHTML = `
        <div class="space-y-3">
            ${data.data.map((img, i) => `
            <div class="flex items-center gap-4 bg-gray-50 rounded-xl p-3">
                <img src="${escHtml(img.image_url)}" alt="Imagen ${i+1}"
                    class="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-gray-200">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-gray-700 truncate">${escHtml(img.caption || img.link_label || `Imagen ${i+1}`)}</p>
                    ${img.link_url ? `<p class="text-xs text-brand-500 truncate">${escHtml(img.link_url)}</p>` : '<p class="text-xs text-gray-400">Sin link de destino</p>'}
                </div>
                <div class="text-right flex-shrink-0 space-y-0.5">
                    <p class="text-lg font-black text-gray-900">${img.clicks_total}</p>
                    <p class="text-xs text-gray-400">clicks totales</p>
                    <p class="text-[10px] text-brand-500 font-bold">${img.clicks_7d} esta semana</p>
                </div>
            </div>`).join('')}
            <p class="text-xs text-gray-400 text-center pt-2">
                <i class="fas fa-info-circle mr-1"></i>Los clicks se registran cuando un visitante hace clic en el link de la imagen desde tu ficha pública.
            </p>
        </div>`;
}

// ── Dark Mode toggle ──────────────────────────────────────────────────────
function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('retopa_dark', isDark ? '1' : '0');
}
