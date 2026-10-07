/**
 * RetoPA Admin — js/cities.js
 * Ciudades: CRUD, departamentos
 */

// ================================================================
// CIUDADES
// ================================================================
let _cityDebounceTimer = null;
function debounceCitySearch() {
    if (_cityDebounceTimer) clearTimeout(_cityDebounceTimer);
    _cityDebounceTimer = setTimeout(() => loadAdminCities(1), 300);
}
const PARAGUAY_DEPTS = ['Alto Paraguay','Alto Paraná','Amambay','Asunción','Boquerón',
    'Caaguazú','Caazapá','Canindeyú','Central','Concepción','Cordillera',
    'Guairá','Itapúa','Misiones','Ñeembucú','Paraguarí','Presidente Hayes','San Pedro'];

// Poblar select de departamentos en el form de ciudades
function initDeptSelect() {
    const sel = document.getElementById('cityFormDept');
    if (!sel || sel.options.length > 1) return; // ya poblado
    PARAGUAY_DEPTS.forEach(d => {
        const o = document.createElement('option');
        o.value = d; o.textContent = d;
        sel.appendChild(o);
    });
}

let currentCityPage = 1;
window._collapsedDepts = window._collapsedDepts || new Set();

async function loadAdminCities(page = 1) {
    currentCityPage = page;
    const q    = document.getElementById('citySearch')?.value?.trim() || '';
    const dept = document.getElementById('cityFilterDept')?.value || '';
    // Cargar todas para agrupar por departamento (Paraguay: ~18 deptos)
    let url = `/cities?limit=9999`;
    if (q)    url += `&q=${encodeURIComponent(q)}`;
    if (dept) url += `&department=${encodeURIComponent(dept)}`;

    const data = await apiAdminGet(url);
    if (!data.success) { showToast('Error cargando ciudades', 'error'); return; }

    const allCitiesRaw = data.data || [];

    // Populate dept filter desde TODAS las ciudades (antes de filtrar)
    const deptSel = document.getElementById('cityFilterDept');
    if (deptSel && deptSel.options.length <= 1) {
        const depts = [...new Set(allCitiesRaw.map(c => c.department).filter(Boolean))].sort();
        depts.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = d; deptSel.appendChild(o); });
    }

    // El backend admin devuelve TODAS las ciudades; filtramos del lado cliente
    let allCities = allCitiesRaw;
    if (q) {
        const qLow = q.toLowerCase();
        allCities = allCities.filter(c => (c.name || '').toLowerCase().includes(qLow));
    }
    if (dept) allCities = allCities.filter(c => c.department === dept);
    data.data = allCities;

    const tbody = document.getElementById('citiesTable');
    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400"><i class="fas fa-map-marker-alt text-2xl mb-2 block text-gray-300"></i>No se encontraron ciudades</td></tr>';
        const pc = document.getElementById('cityPaginationControls'); if (pc) pc.innerHTML = '';
        const pi = document.getElementById('cityPaginationInfo'); if (pi) pi.textContent = '';
        return;
    }

    // Agrupar por departamento
    const byDept = new Map();
    for (const c of data.data) {
        const d = c.department || 'Sin departamento';
        if (!byDept.has(d)) byDept.set(d, []);
        byDept.get(d).push(c);
    }
    const deptNames = [...byDept.keys()].sort();

    let rows = '';
    for (const d of deptNames) {
        const cities = byDept.get(d).sort((a, b) => a.name.localeCompare(b.name));
        const collapsed = window._collapsedDepts.has(d);
        const totalBiz = cities.reduce((s, c) => s + (parseInt(c.business_count) || 0), 0);
        const deptId = 'dept_' + d.replace(/[^a-zA-Z0-9]/g, '_');

        // Fila de cabecera del departamento (colapsable)
        rows += `
        <tr class="bg-gray-100/70 cursor-pointer hover:bg-gray-100 transition" onclick="toggleDeptGroup('${d.replace(/'/g, "\\'")}')">
            <td colspan="5" class="px-6 py-2.5">
                <div class="flex items-center gap-2">
                    <i class="fas fa-chevron-${collapsed ? 'right' : 'down'} text-xs text-gray-400 w-3" id="chev_${deptId}"></i>
                    <i class="fas fa-map-marked-alt text-gray-400 text-sm"></i>
                    <span class="font-bold text-gray-700 text-sm">${escapeHtml(d)}</span>
                    <span class="text-xs text-gray-400">${cities.length} ciudad${cities.length !== 1 ? 'es' : ''}</span>
                    ${totalBiz > 0 ? `<span class="text-xs text-[#0ea5e9] font-semibold ml-auto">${totalBiz.toLocaleString('es-PY')} empresas</span>` : ''}
                </div>
            </td>
        </tr>`;

        // Filas de ciudades del departamento
        rows += cities.map(c => `
        <tr class="table-row transition dept-row-${deptId}${collapsed ? ' hidden' : ''}">
            <td class="px-6 py-3 font-medium text-gray-900 text-sm" style="padding-left:48px">${escapeHtml(c.name)}</td>
            <td class="px-6 py-3">
                <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">${c.department || '-'}</span>
            </td>
            <td class="px-6 py-3 text-center">
                <span class="text-sm font-bold ${(c.business_count||0) > 0 ? 'text-[#0ea5e9]' : 'text-gray-400'}">${c.business_count || 0}</span>
            </td>
            <td class="px-6 py-3 text-xs text-gray-500 font-mono">
                ${c.lat && c.lng ? `${parseFloat(c.lat).toFixed(4)}, ${parseFloat(c.lng).toFixed(4)}` : '<span class="text-gray-300">Sin coords</span>'}
            </td>
            <td class="px-6 py-3">
                <div class="flex gap-1 justify-end">
                    <button onclick="editCityInline(${c.id},'${escapeJs(c.name)}','${escapeJs(c.department||'')}','${c.slug||''}',${c.lat||'null'},${c.lng||'null'})"
                        class="text-xs bg-blue-50 text-[#0ea5e9] px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button onclick="deleteCity(${c.id},'${escapeJs(c.name)}')"
                        class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');
    }
    tbody.innerHTML = rows;

    // Info de total y sin controles de paginación numérica (ya agrupado)
    const pi = document.getElementById('cityPaginationInfo');
    if (pi) pi.textContent = `${data.data.length} ciudades en ${deptNames.length} departamentos`;
    const pc = document.getElementById('cityPaginationControls');
    if (pc) pc.innerHTML = '';
}

// Colapsar/expandir un departamento
function toggleDeptGroup(dept) {
    if (!window._collapsedDepts) window._collapsedDepts = new Set();
    const deptId = 'dept_' + dept.replace(/[^a-zA-Z0-9]/g, '_');
    const isCollapsed = window._collapsedDepts.has(dept);
    if (isCollapsed) window._collapsedDepts.delete(dept);
    else window._collapsedDepts.add(dept);

    document.querySelectorAll('.dept-row-' + deptId).forEach(row => {
        row.classList.toggle('hidden', !isCollapsed);
    });
    const chev = document.getElementById('chev_' + deptId);
    if (chev) chev.className = `fas fa-chevron-${isCollapsed ? 'down' : 'right'} text-xs text-gray-400 w-3`;
}

function openCityForm(clear = true) {
    if (clear) {
        document.getElementById('cityFormId').value = '';
        document.getElementById('cityFormName').value = '';
        document.getElementById('cityFormDept').value = '';
        document.getElementById('cityFormSlug').value = '';
        document.getElementById('cityFormLat').value = '';
        document.getElementById('cityFormLng').value = '';
        document.getElementById('cityFormTitle').textContent = 'Nueva ciudad';
    }
    document.getElementById('cityFormPanel').classList.remove('hidden');
    document.getElementById('cityFormName').focus();
}

function closeCityForm() {
    document.getElementById('cityFormPanel').classList.add('hidden');
}

function editCityInline(id, name, dept, slug, lat, lng) {
    document.getElementById('cityFormId').value = id;
    document.getElementById('cityFormName').value = name;
    document.getElementById('cityFormDept').value = dept;
    document.getElementById('cityFormSlug').value = slug;
    document.getElementById('cityFormLat').value = lat || '';
    document.getElementById('cityFormLng').value = lng || '';
    document.getElementById('cityFormTitle').textContent = 'Editar ciudad';
    openCityForm(false);
}

document.getElementById('cityFormName')?.addEventListener('input', function() {
    if (!document.getElementById('cityFormId').value) {
        document.getElementById('cityFormSlug').value = this.value.toLowerCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    }
});

document.getElementById('cityForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('cityFormId').value;
    const payload = {
        name: document.getElementById('cityFormName').value,
        department: document.getElementById('cityFormDept').value,
        slug: document.getElementById('cityFormSlug').value,
        lat: parseFloat(document.getElementById('cityFormLat').value) || null,
        lng: parseFloat(document.getElementById('cityFormLng').value) || null,
    };
    const res = id
        ? await apiAdminPost(`/cities/${id}`, payload, 'PUT')
        : await apiAdminPost('/cities', payload);
    if (res.success) {
        showToast(id ? 'Ciudad actualizada' : 'Ciudad agregada');
        closeCityForm();
        loadAdminCities(currentCityPage);
        citiesCache = [];
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
    }
});

async function deleteCity(id, name) {
    if (!confirm(`¿Eliminar la ciudad "${name}"?`)) return;
    const res = await apiAdminPost(`/cities/${id}`, {}, 'DELETE');
    if (res.success) { showToast('Ciudad eliminada'); loadAdminCities(); citiesCache = []; }
    else showToast('Error: ' + (res.error || 'No se pudo eliminar'), 'error');
}

// ================================================================
// SITE CONFIG & SETTINGS    // ================================================================
// SITE CONFIG & SETTINGS
// ================================================================
