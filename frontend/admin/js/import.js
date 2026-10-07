/**
 * RetoPA Admin — js/import.js
 * Crear usuario, planes DB, icon picker, importar empresas
 */

// ================================================================
// USUARIOS — crear
// ================================================================
function openUserForm() {
    document.getElementById('userCreateForm').reset();
    document.getElementById('userFormError').classList.add('hidden');
    document.getElementById('userFormPanel').classList.remove('hidden');
    document.getElementById('newUserName').focus();
}
function closeUserForm() { document.getElementById('userFormPanel').classList.add('hidden'); }

function togglePwd(id) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
}

document.getElementById('userCreateForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const errDiv = document.getElementById('userFormError');
    errDiv.classList.add('hidden');
    const payload = {
        name:     document.getElementById('newUserName').value.trim(),
        email:    document.getElementById('newUserEmail').value.trim(),
        password: document.getElementById('newUserPassword').value,
        phone:    document.getElementById('newUserPhone').value.trim() || null,
        role:     document.getElementById('newUserRole').value,
    };
    if (payload.password.length < 8) {
        errDiv.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        errDiv.classList.remove('hidden'); return;
    }
    const res = await apiAdminPost('/users', payload);
    if (res.success) {
        showToast('Usuario creado correctamente');
        closeUserForm();
        loadAdminUsers();
    } else {
        errDiv.textContent = res.error || 'No se pudo crear el usuario.';
        errDiv.classList.remove('hidden');
    }
});

// ================================================================
// ================================================================
// PLANES — DB-backed via API
// ================================================================
async function loadAdminPlans() {
    const data = await apiAdminGet('/plans');
    if (!data.success) { showToast('Error cargando planes', 'error'); return; }

    const plans = data.data;
    window._adminPlans = plans; // para saber índices al mover

    document.getElementById('plansGrid').innerHTML = plans.map((p, i) => `
        <div class="bg-white rounded-2xl border-2 ${p.is_featured ? 'border-amber-400' : p.id === 'premium' ? 'border-[#0ea5e9]' : 'border-gray-200'} shadow-sm p-8 relative overflow-hidden">
            ${p.ribbon ? `<div class="plan-ribbon">${escapeHtml(p.ribbon)}</div>` : ''}
            ${p.is_featured ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-wider">Más popular</div>' : ''}
            <!-- Flechas de orden -->
            <div class="absolute top-3 left-3 flex gap-1">
                <button onclick="movePlan('${p.id}','left')" ${i === 0 ? 'disabled' : ''}
                    class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs disabled:opacity-30 disabled:cursor-not-allowed" title="Mover a la izquierda">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button onclick="movePlan('${p.id}','right')" ${i === plans.length-1 ? 'disabled' : ''}
                    class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs disabled:opacity-30 disabled:cursor-not-allowed" title="Mover a la derecha">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="text-center mb-6">
                <div class="w-16 h-16 ${p.id === 'premium' ? 'bg-blue-100 text-[#0ea5e9]' : p.is_featured ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'} rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
                    ${p.id === 'premium' ? '💎' : p.is_featured ? '⭐' : '📋'}
                </div>
                <h3 class="text-xl font-bold text-gray-900">${escapeHtml(p.name)}</h3>
                ${p.subtitle ? `<p class="text-sm text-gray-500 mt-1">${escapeHtml(p.subtitle)}</p>` : ''}
                <div class="mt-3">
                    <span class="text-3xl font-black text-gray-900">Gs. ${parseInt(p.price||0).toLocaleString()}</span>
                    <span class="text-gray-500 text-sm">/mes</span>
                </div>
                ${!p.price ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold mt-1 inline-block">GRATIS</span>' : ''}
            </div>
            <div class="space-y-2 mb-6">
                ${(Array.isArray(p.features) ? p.features : []).map(f => `<div class="flex items-start gap-2 text-sm text-gray-600"><i class="fas fa-check-circle text-green-500 mt-0.5 shrink-0"></i><span>${escapeHtml(f)}</span></div>`).join('')}
            </div>
            <div class="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 text-center mb-4">
                <div><p class="text-xs text-gray-500">Empresas activas</p><p class="text-2xl font-bold text-gray-900">${p.businesses||0}</p></div>
                <div><p class="text-xs text-gray-500">Ingreso/mes est.</p><p class="text-lg font-bold text-gray-700">Gs. ${((p.businesses||0)*parseInt(p.price||0)).toLocaleString()}</p></div>
            </div>
            <!-- Resumen de límites -->
            <div class="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-700 space-y-1">
                <div class="flex justify-between"><span>Categorías</span><strong>${p.max_categories??1}</strong></div>
                <div class="flex justify-between"><span>Imágenes galería</span><strong>${p.max_gallery??0}</strong></div>
                <div class="flex justify-between"><span>Redes sociales</span><strong>${p.max_social??0}</strong></div>
                <div class="flex gap-2 flex-wrap pt-1">
                    ${p.has_gallery ? '<span class="bg-blue-100 px-1.5 py-0.5 rounded">Galería</span>' : ''}
                    ${p.has_hours   ? '<span class="bg-blue-100 px-1.5 py-0.5 rounded">Horarios</span>' : ''}
                    ${p.has_social  ? '<span class="bg-blue-100 px-1.5 py-0.5 rounded">Redes</span>' : ''}
                    ${p.has_reviews_reply ? '<span class="bg-blue-100 px-1.5 py-0.5 rounded">Resp. reseñas</span>' : ''}
                </div>
            </div>
            <button onclick="openPlanModal('${p.id}')"
                class="w-full border-2 border-[#0ea5e9] text-[#0ea5e9] py-2 rounded-xl text-sm font-bold hover:bg-blue-50 transition flex items-center justify-center gap-2">
                <i class="fas fa-edit"></i> Editar plan
            </button>
        </div>
    `).join('');
}

// Mover un plan a izquierda/derecha (reordenar tarjetas)
async function movePlan(planId, direction) {
    const res = await apiAdminPost(`/plans/${planId}/move`, { direction }, 'PUT');
    if (res.success) {
        _plansCache = [];
        loadAdminPlans();
    } else {
        showToast('Error al reordenar: ' + (res.error||''), 'error');
    }
}

let _plansCache = [];
async function openPlanModal(planId) {
    if (!_plansCache.length) {
        const d = await apiAdminGet('/plans');
        if (d.success) _plansCache = d.data;
    }
    const p = _plansCache.find(x => x.id === planId);
    if (!p) return;
    document.getElementById('planEditId').value              = p.id;
    document.getElementById('planEditName').value            = p.name;
    document.getElementById('planEditSubtitle').value        = p.subtitle || '';
    document.getElementById('planEditPrice').value           = p.price;
    document.getElementById('planEditButton').value          = p.button_label || '';
    document.getElementById('planEditFeatured').checked      = p.is_featured || false;
    const ribbonEl = document.getElementById('planEditRibbon');
    if (ribbonEl) ribbonEl.value = p.ribbon || '';
    document.getElementById('planEditFeatures').value        = (Array.isArray(p.features) ? p.features : []).join('\n');
    // Límites operativos
    document.getElementById('planEditMaxCategories').value   = p.max_categories ?? 1;
    document.getElementById('planEditMaxGallery').value      = p.max_gallery ?? 0;
    document.getElementById('planEditMaxSocial').value       = p.max_social ?? 0;
    document.getElementById('planEditMaxTags').value         = p.max_tags ?? 5;
    document.getElementById('planEditPriorityBoost').value   = p.priority_boost ?? 0;
    document.getElementById('planEditHasGallery').checked    = p.has_gallery || false;
    document.getElementById('planEditHasSocial').checked     = p.has_social || false;
    document.getElementById('planEditHasHours').checked      = p.has_hours || false;
    document.getElementById('planEditHasMap').checked        = p.has_map || false;
    document.getElementById('planEditHasReviewsReply').checked = p.has_reviews_reply || false;
    document.getElementById('planEditHasWhatsapp').checked   = p.has_whatsapp !== false;

    // D7 — Link de pago (Tpago): solo para planes pagos (no básico). Vive en site_config.
    const tpWrap = document.getElementById('planEditTpagoWrap');
    const tpInput = document.getElementById('planEditTpagoLink');
    if (tpWrap && tpInput) {
        if (planId === 'basic') { tpWrap.classList.add('hidden'); tpInput.value = ''; }
        else {
            tpWrap.classList.remove('hidden');
            tpInput.value = '';
            try { const sc = await apiAdminGet('/site-config'); if (sc.success) tpInput.value = sc.data['tpago_link_' + planId] || ''; } catch(e) {}
        }
    }

    document.getElementById('planEditModal').classList.remove('hidden');
}

function closePlanModal() { document.getElementById('planEditModal').classList.add('hidden'); }

document.getElementById('planEditForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('planEditId').value;
    const payload = {
        name:              document.getElementById('planEditName').value,
        subtitle:          document.getElementById('planEditSubtitle').value,
        price:             parseInt(document.getElementById('planEditPrice').value) || 0,
        button_label:      document.getElementById('planEditButton').value,
        is_featured:       document.getElementById('planEditFeatured').checked,
        ribbon:            document.getElementById('planEditRibbon')?.value || '',
        features:          document.getElementById('planEditFeatures').value.split('\n').map(s=>s.trim()).filter(Boolean),
        // Límites operativos
        max_categories:    parseInt(document.getElementById('planEditMaxCategories').value) || 1,
        max_gallery:       parseInt(document.getElementById('planEditMaxGallery').value) || 0,
        max_social:        parseInt(document.getElementById('planEditMaxSocial').value) || 0,
        max_tags:          parseInt(document.getElementById('planEditMaxTags').value) || 5,
        priority_boost:    parseInt(document.getElementById('planEditPriorityBoost').value) || 0,
        has_gallery:       document.getElementById('planEditHasGallery').checked,
        has_social:        document.getElementById('planEditHasSocial').checked,
        has_hours:         document.getElementById('planEditHasHours').checked,
        has_map:           document.getElementById('planEditHasMap').checked,
        has_reviews_reply: document.getElementById('planEditHasReviewsReply').checked,
        has_whatsapp:      document.getElementById('planEditHasWhatsapp').checked,
    };
    const res = await apiAdminPost(`/plans/${id}`, payload, 'PUT');
    if (res.success) {
        // D7 — Guardar el link de Tpago del plan (site_config) — solo planes pagos.
        if (id !== 'basic') {
            const link = document.getElementById('planEditTpagoLink')?.value?.trim() || '';
            await apiAdminPost('/site-config', { [`tpago_link_${id}`]: link }, 'PUT').catch(() => {});
        }
        showToast('Plan actualizado — límites activos de inmediato ✅');
        _plansCache = [];
        closePlanModal();
        loadAdminPlans();
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
    }
});


// ================================================================
// ICON PICKER — Categorías
// ================================================================
const ICON_LIST = [
    'fa-tag','fa-store','fa-utensils','fa-car','fa-home','fa-heart','fa-stethoscope',
    'fa-graduation-cap','fa-briefcase','fa-laptop','fa-phone','fa-camera','fa-plane',
    'fa-hotel','fa-shopping-cart','fa-tshirt','fa-dumbbell','fa-music','fa-paint-brush',
    'fa-wrench','fa-tools','fa-truck','fa-box','fa-building','fa-industry','fa-leaf',
    'fa-paw','fa-baby','fa-gem','fa-coffee','fa-pizza-slice','fa-hamburger','fa-beer',
    'fa-book','fa-newspaper','fa-tv','fa-film','fa-gamepad','fa-bicycle','fa-bus',
    'fa-ship','fa-train','fa-motorcycle','fa-tractor','fa-dog','fa-cat','fa-fish',
    'fa-flower','fa-tree','fa-mountain','fa-sun','fa-moon','fa-star','fa-bolt',
    'fa-fire','fa-water','fa-recycle','fa-solar-panel','fa-wifi','fa-signal',
    'fa-shield-alt','fa-lock','fa-key','fa-credit-card','fa-coins','fa-chart-bar',
    'fa-chart-pie','fa-calculator','fa-file-alt','fa-envelope','fa-globe','fa-map-marker-alt',
    'fa-clock','fa-calendar','fa-users','fa-user-tie','fa-hands-helping','fa-handshake',
    'fa-award','fa-certificate','fa-trophy','fa-medal','fa-ribbon','fa-flag',
    'fa-hammer','fa-paint-roller','fa-ruler','fa-drafting-compass','fa-microscope',
    'fa-flask','fa-pills','fa-syringe','fa-tooth','fa-eye','fa-brain',
];

function initIconPicker() {
    const grid = document.getElementById('iconPickerGrid');
    if (!grid || grid.children.length > 0) return;
    ICON_LIST.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = icon;
        btn.className = 'w-9 h-9 flex items-center justify-center rounded-lg hover:bg-blue-100 hover:text-[#0ea5e9] text-gray-600 transition text-sm';
        btn.innerHTML = `<i class="fas ${icon}"></i>`;
        btn.onclick = () => {
            document.getElementById('catFormIcon').value = icon;
            updateIconPreview();
            document.getElementById('iconPickerPanel').classList.add('hidden');
        };
        grid.appendChild(btn);
    });
}

function toggleIconPicker() {
    initIconPicker();
    document.getElementById('iconPickerPanel').classList.toggle('hidden');
}

function updateIconPreview() {
    const val = document.getElementById('catFormIcon').value.trim() || 'fa-tag';
    document.getElementById('catIconPreviewIcon').className = `fas ${val}`;
}

// ================================================================
// IMPORTAR EMPRESAS
// ================================================================
let _importData = [];

const IMPORT_CAT_RULES = [
    ['automotriz', ['ESTACION DE SERVICIOS','COMBUSTIBLE','LUBRICANTE','NEUMATICO','TALLER','AUTOMOTOR','VEHICUL','AUTOMOTRIZ','CARROCERIA','GOMERIA','LAVADERO DE AUTO']],
    ['construccion', ['CONSTRUCC','INGENIER','ARQUITECT','FERRETERI','HORMIGON','CERAMICA','PLOMERIA','SANITARIA','METALURGI','HIERRO','ACERO','VIDRIER','MADERER','CARPINTER','ALUMINIO','CABLES','SIDERUR']],
    ['salud', ['FARMACIA','LABORATORIO','CLINICA','HOSPITAL','MEDIC','SALUD','DENTAL','OPTICA','DROGUERIA','VETERINARI','BIOQUIMIC','RADIOLOG']],
    ['tecnologia', ['TECNOLOG','SOFTWAR','SISTEMA','INFORMATICA','DIGITAL','CELULAR','TELECO','INTERNET','ELECTR','COMPUTACION','MAQUILA','ENSAMBL','TELEFONOS','PLACAS']],
    ['educacion', ['EDUCAC','COLEGIO','UNIVERSIDAD','ESCUELA','INSTITUTO','ACADEMI','FORMACION','CAPACITACION','EDITORIAL']],
    ['turismo', ['HOTEL','HOSTAL','TURISM','VIAJE','TRANSPORT','LOGISTIC','ADUANERA','CARGA','FLETES','PORTUARI','NAVIERA']],
    ['restaurantes', ['RESTAURANT','ALIMENT','GASTRONOM','FRIGORI','SUPERMERCADO','MINIMERCADO','PANADERIA','CONFITER','CARNICER','BEBIDAS','CERVEZA','VINOS','CARNE','AVICOLA','AGRICOL','GANADERA','CEREALES','AZUCAR','ACEITE','LACTEOS']],
    ['belleza', ['COSMET','BELLEZA','PELUQUER','ESTETICA','SALON','SPA','MODA','VESTIM','CONFECCION','CALZADO','TEXTIL','INDUMENT']],
    ['profesionales', ['SERVICIO','CONSULTOR','ASESOR','AUDITORIA','CONTABLE','JURIDICO','ABOGADO','SEGUROS','FINANCIER','BANCO','COOPERATIV','ASEGURADORA','LIMPIEZA','SEGURIDAD','VIGILANCIA','MANTENIMIENTO']],
];

const TIPO_REG_CAT = {
    'MIC - DGC - ESTACION DE SERVICIOS': 'automotriz',
    'MIC - DGC - ESTACION DE SERVICIOS - CONSUMO PROPIO': 'automotriz',
    'MIC - DGC - PLANTA DE ALMACENAJE Y DESPACHO': 'comercios',
    'MIC - DGC - REFINERIA': 'automotriz',
    'MIC - MAQUILA - PURA': 'tecnologia',
    'MIC - MAQUILA - MIXTA': 'tecnologia',
};

function autoCategorize(name, tipoReg) {
    const tipo = (tipoReg || '').trim();
    if (TIPO_REG_CAT[tipo]) return TIPO_REG_CAT[tipo];
    const upper = name.toUpperCase();
    for (const [cat, kws] of IMPORT_CAT_RULES) {
        for (const kw of kws) { if (upper.includes(kw)) return cat; }
    }
    if (tipo.includes('REPSE')) return 'profesionales';
    if (tipo.includes('EXPORTADOR') || tipo.includes('RIEL')) return 'comercios';
    return 'comercios';
}

function slugifyImport(s) {
    return s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function parseCSVImport(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const map = {
        ruc:        headers.findIndex(h => h === 'ruc'),
        name:       headers.findIndex(h => h.includes('razon') || h.includes('nombre') || h === 'name'),
        trade_name: headers.findIndex(h => h.includes('trade_name') || h.includes('nombre_comercial') || h.includes('fantasia')),
        city:       headers.findIndex(h => h.includes('ciudad')),
        dept:       headers.findIndex(h => h.includes('departamento')),
        tipo:       headers.findIndex(h => h.includes('tipo de registro') || h.includes('tipo_registro')),
        mipymes:    headers.findIndex(h => h.includes('mipymes') || h === 'categoria'),
        phone:      headers.findIndex(h => h === 'phone' || h === 'telefono' || h === 'tel'),
        email:      headers.findIndex(h => h === 'email' || h === 'correo'),
        website:    headers.findIndex(h => h === 'website' || h === 'web' || h === 'url'),
        whatsapp:   headers.findIndex(h => h === 'whatsapp'),
        address:    headers.findIndex(h => h === 'address' || h === 'direccion'),
        category_slug: headers.findIndex(h => h === 'category_slug'),
        source:     headers.findIndex(h => h === 'source'),
    };
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const ruc  = map.ruc  >= 0 ? cols[map.ruc]  || '' : '';
        const name = map.name >= 0 ? cols[map.name] || '' : '';
        if (!ruc || !name) continue;
        const city  = (map.city >= 0 ? cols[map.city] || '' : '').replace('N/D', '');
        const dept  = (map.dept >= 0 ? cols[map.dept] || '' : '').replace('N/D', '');
        const tipo  = map.tipo >= 0 ? cols[map.tipo] || '' : '';
        records.push({
            ruc, name,
            trade_name:    map.trade_name    >= 0 ? cols[map.trade_name]    || '' : '',
            city, dept, tipo,
            phone:         map.phone         >= 0 ? cols[map.phone]         || '' : '',
            email:         map.email         >= 0 ? cols[map.email]         || '' : '',
            website:       map.website       >= 0 ? cols[map.website]       || '' : '',
            whatsapp:      map.whatsapp      >= 0 ? cols[map.whatsapp]      || '' : '',
            address:       map.address       >= 0 ? cols[map.address]       || '' : '',
            category_slug: map.category_slug >= 0 ? cols[map.category_slug] || '' : '',
            source:        map.source        >= 0 ? cols[map.source]        || '' : '',
        });
    }
    return records;
}

function initImportSection() {
    // Poblar lista de categorías disponibles
    const catListEl = document.getElementById('importCatList');
    if (catListEl && categoriesCache.length > 0) {
        catListEl.innerHTML = categoriesCache.map(c =>
            `<span class="bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded">${c.name}</span>`
        ).join('');
    } else if (catListEl) {
        loadCategoriesCache().then(() => {
            catListEl.innerHTML = categoriesCache.map(c =>
                `<span class="bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded">${c.name}</span>`
            ).join('');
        });
    }
}

function handleImportDrop(event) {
    event.preventDefault();
    const zone = document.getElementById('importDropZone');
    zone.style.borderColor = '#d1d5db'; zone.style.background = 'white';
    const file = event.dataTransfer?.files?.[0];
    if (file) processImportFile(file);
}

function handleImportFile(input) {
    const file = input.files[0];
    if (file) processImportFile(file);
}

function processImportFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const text = e.target.result;
        let records = [];
        if (file.name.endsWith('.json')) {
            try { records = JSON.parse(text); } catch(err) { showToast('JSON inválido', 'error'); return; }
        } else {
            records = parseCSVImport(text);
        }
        if (records.length === 0) { showToast('No se encontraron registros válidos', 'error'); return; }
        _importData = records;
        showImportPreview(records);
        document.getElementById('importOptionsPanel').style.display = 'block';
        document.getElementById('importDropZone').style.borderColor = '#86efac';
        document.getElementById('importDropZone').style.background = '#f0fdf4';
    };
    reader.readAsText(file, 'utf-8');
}

function showImportPreview(records) {
    const autocat = document.getElementById('importAutoCategory')?.checked !== false;
    const preview = document.getElementById('importPreview');
    const sample = records.slice(0, 8);
    preview.innerHTML = `
        <p class="text-xs text-gray-500 mb-3 font-medium">${records.length.toLocaleString()} registros encontrados — mostrando los primeros 8:</p>
        <div class="space-y-2">
            ${sample.map(r => {
                const cat = autocat ? autoCategorize(r.name || r['Razon Social'] || '', r.tipo || r['Tipo de Registro'] || '') : '—';
                const catObj = categoriesCache.find(c => c.slug === cat);
                return `<div class="p-2 bg-gray-50 rounded-lg text-xs">
                    <p class="font-medium text-gray-800 truncate">${escapeHtml((r.name || r['Razon Social'] || '').slice(0,50))}</p>
                    <p class="text-gray-400">RUC: ${r.ruc || r['Ruc'] || '—'} · ${r.city || r['Ciudad'] || 'Sin ciudad'}
                    ${catObj ? `· <span class="text-[#0ea5e9]">${catObj.name}</span>` : ''}</p>
                </div>`;
            }).join('')}
        </div>
    `;
}

async function runImport() {
    if (!_importData.length) return;
    const dupMode   = document.getElementById('importDuplicateMode').value;
    const planType  = document.getElementById('importPlanType').value;
    const verified  = document.getElementById('importVerified').checked;
    const autocat   = document.getElementById('importAutoCategory').checked;

    document.getElementById('importOptionsPanel').style.display = 'none';
    document.getElementById('importProgressPanel').style.display = 'block';

    const logEl = document.getElementById('importLog');
    const barEl = document.getElementById('importProgressBar');
    const txtEl = document.getElementById('importProgressText');

    let ok = 0, skip = 0, err = 0;
    const BATCH = 50;
    const total = _importData.length;

    for (let i = 0; i < total; i += BATCH) {
        const batch = _importData.slice(i, i + BATCH);
        const payload = batch.map(r => {
            const name   = r.name || r['Razon Social'] || '';
            const ruc    = String(r.ruc || r['Ruc'] || '').trim();
            const city   = (r.city || r['Ciudad'] || '').replace('N/D','').trim();
            const dept   = (r.dept || r['Departamento'] || '').replace('N/D','').trim();
            const tipo   = r.tipo || r['Tipo de Registro'] || '';
            const catSlug = autocat ? (r.category_slug || autoCategorize(name, tipo)) : 'comercios';
            const catId   = categoriesCache.find(c => c.slug === catSlug)?.id || null;
            // Slug robusto: usa sufijo del RUC si existe, sino un sufijo aleatorio corto
            const sufijo = ruc ? ruc.replace(/[^0-9]/g,'').slice(-4) : Math.random().toString(36).slice(2,6);
            const baseSlug = slugifyImport(name) || 'empresa';
            return {
                ruc, name,
                trade_name:  r.trade_name  || null,
                slug: baseSlug + '-' + sufijo,
                category_id: catId,
                city:        city || null,
                department:  dept || null,
                phone:       r.phone    || null,
                email:       r.email    || null,
                website:     r.website  || null,
                whatsapp:    r.whatsapp || null,
                address:     r.address  || null,
                plan_type:   planType,
                verified,
                is_active:   true,
                duplicate_mode: dupMode,
                source:      r.source || 'import',
            };
        });

        const res = await apiAdminPost('/businesses/bulk-import', { records: payload });
        if (res.success) {
            ok    += (res.inserted || 0) + (res.updated || 0);
            skip  += (res.skipped  || 0) + (res.review || 0);
            err   += res.errors   || 0;
            const batchEnd = Math.min(i + BATCH, total);
            const det = `${res.inserted||0} nuevas, ${res.updated||0} actualizadas`
                + ((res.deduped||0) ? ` (${res.deduped} dedup RUC+ciudad)` : '')
                + ((res.review||0)  ? `, <span class="text-amber-600">${res.review} a revisar</span>` : '')
                + `, ${res.skipped||0} salteadas`;
            logEl.innerHTML += `<div class="text-green-600">✓ Lote ${Math.ceil(i/BATCH)+1}: ${det}</div>`;
        } else {
            err += batch.length;
            logEl.innerHTML += `<div class="text-red-500">✗ Lote ${Math.ceil(i/BATCH)+1}: ${res.error || 'Error'}</div>`;
        }
        logEl.scrollTop = logEl.scrollHeight;

        const progress = Math.round(((i + BATCH) / total) * 100);
        barEl.style.width = Math.min(progress, 100) + '%';
        txtEl.textContent = `${Math.min(i + BATCH, total).toLocaleString()} / ${total.toLocaleString()}`;
        await new Promise(r => setTimeout(r, 50)); // pequeña pausa para no saturar
    }

    barEl.style.width = '100%';
    txtEl.textContent = `${total.toLocaleString()} / ${total.toLocaleString()}`;
    document.getElementById('importProgressPanel').style.display = 'none';
    document.getElementById('importResultPanel').style.display = 'block';
    document.getElementById('importStats').innerHTML = `
        <div class="bg-green-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-black text-green-600">${ok.toLocaleString()}</p>
            <p class="text-xs text-green-600 font-medium">Importadas</p>
        </div>
        <div class="bg-amber-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-black text-amber-600">${skip.toLocaleString()}</p>
            <p class="text-xs text-amber-600 font-medium">Salteadas (duplicado)</p>
        </div>
        <div class="bg-red-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-black text-red-600">${err.toLocaleString()}</p>
            <p class="text-xs text-red-600 font-medium">Errores</p>
        </div>
    `;
    showToast(`Importación completa: ${ok} empresas cargadas`);
    loadBizKpiStats();
}

function resetImport() {
    _importData = [];
    document.getElementById('importFile').value = '';
    document.getElementById('importDropZone').style.borderColor = '#d1d5db';
    document.getElementById('importDropZone').style.background = 'white';
    document.getElementById('importOptionsPanel').style.display = 'none';
    document.getElementById('importProgressPanel').style.display = 'none';
    document.getElementById('importResultPanel').style.display = 'none';
    document.getElementById('importPreview').innerHTML = '<p class="text-center py-6 text-gray-300"><i class="fas fa-table text-3xl mb-2 block"></i>Cargá un archivo para ver la vista previa</p>';
}

