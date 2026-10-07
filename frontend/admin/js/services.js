/**
 * RetoPA Admin — js/services.js
 * Servicios: CRUD + icon picker + CTA (Sprint 6)
 */

// ================================================================
// ICON PICKER para Servicios (independiente del de Categorías)
// ================================================================
const SERVICE_ICONS = [
    'fa-globe','fa-rocket','fa-star','fa-heart','fa-bolt','fa-fire','fa-gem','fa-crown',
    'fa-shield-alt','fa-lock','fa-key','fa-cog','fa-tools','fa-wrench','fa-hammer',
    'fa-chart-line','fa-chart-bar','fa-chart-pie','fa-analytics',
    'fa-users','fa-users-cog','fa-user-tie','fa-user-check','fa-handshake',
    'fa-envelope','fa-envelope-open','fa-paper-plane','fa-inbox',
    'fa-phone','fa-mobile-alt','fa-headset','fa-comments','fa-comment-dots',
    'fa-shopping-cart','fa-store','fa-tag','fa-tags','fa-box','fa-boxes',
    'fa-laptop','fa-desktop','fa-server','fa-database','fa-code','fa-terminal',
    'fa-wifi','fa-signal','fa-broadcast-tower','fa-satellite',
    'fa-map-marker-alt','fa-map','fa-location-arrow','fa-directions',
    'fa-car','fa-truck','fa-plane','fa-ship','fa-motorcycle',
    'fa-home','fa-building','fa-city','fa-warehouse','fa-store-alt',
    'fa-leaf','fa-seedling','fa-tree','fa-sun','fa-cloud',
    'fa-flask','fa-microscope','fa-dna','fa-heartbeat','fa-hospital',
    'fa-graduation-cap','fa-book','fa-pencil-alt','fa-chalkboard-teacher',
    'fa-palette','fa-camera','fa-video','fa-music','fa-headphones',
    'fa-dollar-sign','fa-coins','fa-credit-card','fa-piggy-bank','fa-wallet',
    'fa-calendar','fa-clock','fa-hourglass','fa-stopwatch',
    'fa-file-alt','fa-file-pdf','fa-file-excel','fa-file-contract',
    'fa-puzzle-piece','fa-magic','fa-wand-magic-sparkles','fa-sparkles',
    'fa-award','fa-medal','fa-trophy','fa-certificate','fa-badge-check',
    'fa-thumbs-up','fa-check-circle','fa-check-double','fa-infinity',
    'fa-th-large','fa-th','fa-grip-lines','fa-list-ul',
];

let _svcIconPickerInit = false;

function initServiceIconPicker() {
    const grid = document.getElementById('svcIconPickerGrid');
    if (!grid || _svcIconPickerInit) return;
    _svcIconPickerInit = true;
    SERVICE_ICONS.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = icon;
        btn.className = 'w-9 h-9 flex items-center justify-center rounded-lg hover:bg-blue-100 hover:text-[#0ea5e9] text-gray-600 transition text-sm';
        btn.innerHTML = `<i class="fas ${icon}"></i>`;
        btn.onclick = () => {
            document.getElementById('serviceFormIcon').value = icon;
            updateServiceIconPreview();
            document.getElementById('svcIconPickerPanel').classList.add('hidden');
        };
        grid.appendChild(btn);
    });
}

function toggleServiceIconPicker() {
    initServiceIconPicker();
    document.getElementById('svcIconPickerPanel').classList.toggle('hidden');
}

function updateServiceIconPreview() {
    const val = document.getElementById('serviceFormIcon')?.value?.trim() || 'fa-star';
    const prev = document.getElementById('svcIconPreviewIcon');
    if (prev) prev.className = `fas ${val}`;
}

// ================================================================
// PALETA rápida de colores (icono + fondo)
// ================================================================
const SVC_COLOR_PRESETS = [
    { label:'Azul',    color:'text-brand-600',  bg:'bg-brand-100'  },
    { label:'Celeste', color:'text-sky-600',     bg:'bg-sky-100'    },
    { label:'Púrpura', color:'text-purple-600',  bg:'bg-purple-100' },
    { label:'Verde',   color:'text-green-600',   bg:'bg-green-100'  },
    { label:'Amarillo',color:'text-yellow-600',  bg:'bg-yellow-100' },
    { label:'Naranja', color:'text-orange-600',  bg:'bg-orange-100' },
    { label:'Rojo',    color:'text-red-600',     bg:'bg-red-100'    },
    { label:'Rosa',    color:'text-pink-600',    bg:'bg-pink-100'   },
    { label:'Gris',    color:'text-gray-600',    bg:'bg-gray-100'   },
    { label:'Dorado',  color:'text-amber-600',   bg:'bg-amber-100'  },
];

function renderColorPresets() {
    const wrap = document.getElementById('svcColorPresets');
    if (!wrap || wrap.children.length > 0) return;
    SVC_COLOR_PRESETS.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = p.label;
        btn.className = `w-8 h-8 rounded-lg flex items-center justify-center text-sm transition border-2 border-transparent hover:border-gray-400 ${p.bg} ${p.color}`;
        btn.innerHTML = `<i class="fas fa-circle text-xs"></i>`;
        btn.onclick = () => {
            document.getElementById('serviceFormIconColor').value = p.color;
            document.getElementById('serviceFormIconBg').value    = p.bg;
        };
        wrap.appendChild(btn);
    });
}

// ================================================================
// SERVICIOS — CRUD principal
// ================================================================
let _servicesCache = [];

async function loadAdminServices() {
    const data = await apiAdminGet('/services');
    if (!data.success) { showToast('Error cargando servicios', 'error'); return; }

    _servicesCache = data.data;

    document.getElementById('servicesTable').innerHTML = data.data.length === 0
        ? '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400">No hay servicios. Creá uno con el botón "Nuevo servicio".</td></tr>'
        : data.data.map(s => {
            const features = Array.isArray(s.features) ? s.features : [];
            return `
            <tr class="table-row transition">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 ${s.icon_bg || 'bg-gray-100'} rounded-xl flex items-center justify-center ${s.icon_color || 'text-gray-600'} text-base shrink-0">
                            <i class="fas ${s.icon || 'fa-star'}"></i>
                        </div>
                        <div>
                            <p class="font-semibold text-gray-900 text-sm">${escapeHtml(s.title)}</p>
                            <p class="text-xs text-gray-400 mt-0.5 max-w-xs truncate">${escapeHtml(s.description || '')}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-xs text-gray-500">
                    ${features.slice(0,3).map(f => `<span class="inline-flex items-center gap-1 mr-1 whitespace-nowrap"><i class="fas fa-check text-green-500 text-[10px]"></i>${escapeHtml(f)}</span>`).join('<br>')}
                    ${features.length > 3 ? `<span class="text-gray-400">+${features.length-3} más</span>` : ''}
                </td>
                <td class="px-6 py-4 text-xs text-gray-500">
                    ${s.cta_text ? `<span class="font-medium text-gray-700">${escapeHtml(s.cta_text)}</span><br><span class="text-gray-400 font-mono text-[10px] truncate block max-w-[120px]">${escapeHtml(s.cta_url || '')}</span>` : '<span class="text-gray-300">—</span>'}
                </td>
                <td class="px-6 py-4 text-center text-sm text-gray-600">${s.display_order || 0}</td>
                <td class="px-6 py-4 text-center">
                    ${s.is_active
                        ? '<span class="badge badge-verified"><i class="fas fa-check"></i> Activo</span>'
                        : '<span class="badge badge-inactive"><i class="fas fa-ban"></i> Oculto</span>'}
                </td>
                <td class="px-6 py-4">
                    <div class="flex gap-1 justify-end">
                        <button onclick="editServiceInline(${s.id})"
                            class="text-xs bg-blue-50 text-[#0ea5e9] px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button onclick="deleteService(${s.id},'${escapeHtml(s.title).replace(/'/g,"\\'")}')"
                            class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
}

function openServiceForm(clear = true) {
    if (clear) {
        document.getElementById('serviceFormId').value        = '';
        document.getElementById('serviceFormTitle_').value   = '';
        document.getElementById('serviceFormDesc').value     = '';
        document.getElementById('serviceFormIcon').value     = '';
        document.getElementById('serviceFormIconColor').value = '';
        document.getElementById('serviceFormIconBg').value   = '';
        document.getElementById('serviceFormOrder').value    = '0';
        document.getElementById('serviceFormFeatures').value = '';
        document.getElementById('serviceFormCtaText').value  = '';
        document.getElementById('serviceFormCtaUrl').value   = '';
        document.getElementById('serviceFormActive').checked = true;
        document.getElementById('svcIconPreviewIcon').className = 'fas fa-star text-gray-400';
        document.querySelector('#serviceFormPanel h4').textContent = 'Nuevo servicio';
    }
    renderColorPresets();
    document.getElementById('serviceFormPanel').classList.remove('hidden');
    document.getElementById('serviceFormTitle_').focus();
}

function closeServiceForm() {
    document.getElementById('serviceFormPanel').classList.add('hidden');
    document.getElementById('svcIconPickerPanel').classList.add('hidden');
}

function editServiceInline(id) {
    const s = _servicesCache.find(x => x.id === id);
    if (!s) return;
    document.getElementById('serviceFormId').value        = s.id;
    document.getElementById('serviceFormTitle_').value   = s.title || '';
    document.getElementById('serviceFormDesc').value     = s.description || '';
    document.getElementById('serviceFormIcon').value     = s.icon || '';
    document.getElementById('serviceFormIconColor').value = s.icon_color || '';
    document.getElementById('serviceFormIconBg').value   = s.icon_bg || '';
    document.getElementById('serviceFormOrder').value    = s.display_order || 0;
    document.getElementById('serviceFormFeatures').value = Array.isArray(s.features) ? s.features.join('\n') : '';
    document.getElementById('serviceFormCtaText').value  = s.cta_text || '';
    document.getElementById('serviceFormCtaUrl').value   = s.cta_url || '';
    document.getElementById('serviceFormActive').checked = s.is_active !== false;
    document.getElementById('svcIconPreviewIcon').className = `fas ${s.icon || 'fa-star'} ${s.icon_color || 'text-gray-500'}`;
    document.querySelector('#serviceFormPanel h4').textContent = 'Editar servicio';
    openServiceForm(false);
}

document.getElementById('serviceForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('serviceFormId').value;
    const payload = {
        title:        document.getElementById('serviceFormTitle_').value.trim(),
        description:  document.getElementById('serviceFormDesc').value.trim() || null,
        icon:         document.getElementById('serviceFormIcon').value.trim() || 'fa-star',
        icon_color:   document.getElementById('serviceFormIconColor').value.trim() || 'text-brand-600',
        icon_bg:      document.getElementById('serviceFormIconBg').value.trim() || 'bg-brand-100',
        display_order: parseInt(document.getElementById('serviceFormOrder').value) || 0,
        features:     document.getElementById('serviceFormFeatures').value,
        cta_text:     document.getElementById('serviceFormCtaText').value.trim() || null,
        cta_url:      document.getElementById('serviceFormCtaUrl').value.trim() || null,
        is_active:    document.getElementById('serviceFormActive').checked,
    };
    const btn = this.querySelector('[type=submit]');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Guardando...';
    const res = id
        ? await apiAdminPost(`/services/${id}`, payload, 'PUT')
        : await apiAdminPost('/services', payload);
    if (res.success) {
        showToast(id ? 'Servicio actualizado' : 'Servicio creado');
        closeServiceForm();
        loadAdminServices();
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
    }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i>Guardar';
});

async function deleteService(id, name) {
    if (!confirm(`¿Eliminar el servicio "${name}"?\nDesaparecerá del sitio público.`)) return;
    const res = await apiAdminPost(`/services/${id}`, {}, 'DELETE');
    if (res.success) { showToast('Servicio eliminado'); loadAdminServices(); }
    else showToast('Error: ' + (res.error || 'No se pudo eliminar'), 'error');
}
