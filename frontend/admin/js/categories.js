/**
 * RetoPA Admin — js/categories.js
 * Categorías: CRUD, icon picker base
 */

// ================================================================
// PALETA DE COLOR para Categorías (Sprint 7)
// ================================================================
const CAT_COLOR_PRESETS = [
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
    { label:'Índigo',  color:'text-indigo-600',  bg:'bg-indigo-100' },
    { label:'Teal',    color:'text-teal-600',    bg:'bg-teal-100'   },
];

let _catColorPresetsInit = false;
function initCatColorPresets() {
    const wrap = document.getElementById('catColorPresets');
    if (!wrap || _catColorPresetsInit) return;
    _catColorPresetsInit = true;
    CAT_COLOR_PRESETS.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = p.label;
        btn.className = `w-7 h-7 rounded-lg flex items-center justify-center text-xs transition border-2 border-transparent hover:border-gray-400 ${p.bg} ${p.color}`;
        btn.innerHTML = `<i class="fas fa-circle text-[10px]"></i>`;
        btn.onclick = () => {
            document.getElementById('catFormColor').value = p.color;
            document.getElementById('catFormBg').value    = p.bg;
        };
        wrap.appendChild(btn);
    });
}

// ================================================================
// CATEGORÍAS
// ================================================================
let _adminCategoriesCache = [];

async function loadAdminCategories() {
    const data = await apiAdminGet('/categories');
    if (!data.success) { showToast('Error cargando categorías', 'error'); return; }

    _adminCategoriesCache = data.data;

    // Refrescar el select de padre (solo categorías raíz)
    const parentSel = document.getElementById('catFormParent');
    if (parentSel) {
        const currentVal = parentSel.value;
        parentSel.innerHTML = '<option value="">— Sin padre (es raíz) —</option>'
            + data.data
                .filter(c => !c.parent_id)
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
        parentSel.value = currentVal;
    }

    // Ordenar para que cada padre aparezca con sus hijos contiguos
    const padres = data.data.filter(c => !c.parent_id)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const hijosBy = new Map();
    for (const c of data.data) {
        if (c.parent_id) {
            const arr = hijosBy.get(c.parent_id) || [];
            arr.push(c);
            hijosBy.set(c.parent_id, arr);
        }
    }
    const ordered = [];
    for (const p of padres) {
        ordered.push(p);
        const kids = (hijosBy.get(p.id) || []).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        ordered.push(...kids);
    }
    // Categorías huérfanas (con parent_id que no existe) — defensivo
    const orphans = data.data.filter(c => c.parent_id && !padres.find(p => p.id === c.parent_id));
    ordered.push(...orphans);

    document.getElementById('categoriesTable').innerHTML = ordered.length === 0
        ? '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-400">No hay categorías</td></tr>'
        : ordered.map(c => {
            const isChild = !!c.parent_id;
            const parentLabel = c.parent_name ? escapeHtml(c.parent_name) : '<span class="text-gray-300">—</span>';
            const kidsCount = isChild ? 0 : (hijosBy.get(c.id) || []).length;
            const collapsed = window._collapsedCats && window._collapsedCats.has(c.id);
            return `
        <tr class="table-row transition ${isChild ? 'cat-child cat-child-' + c.parent_id + (collapsedParent(c.parent_id) ? ' hidden' : '') + ' bg-gray-50/50' : 'font-medium'}">
            <td class="px-6 py-3">
                <div class="flex items-center gap-3" ${isChild ? 'style="padding-left: 24px;"' : ''}>
                    ${isChild
                        ? '<i class="fas fa-level-up-alt fa-rotate-90 text-gray-300 text-xs"></i>'
                        : (kidsCount > 0
                            ? `<button onclick="toggleCatGroup(${c.id})" class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 transition" title="Mostrar/ocultar subcategorías"><i class="fas fa-chevron-${collapsed ? 'right' : 'down'} text-xs" id="catChev${c.id}"></i></button>`
                            : '<span class="w-5"></span>')}
                    <div class="w-9 h-9 ${c.bg_color || 'bg-gray-100'} rounded-xl flex items-center justify-center ${c.color || 'text-gray-600'} text-base shrink-0">
                        <i class="fas ${c.icon || 'fa-tag'}"></i>
                    </div>
                    <div>
                        <p class="font-medium text-gray-900 text-sm">${escapeHtml(c.name)}${kidsCount > 0 ? ` <span class="text-xs text-gray-400 font-normal">(${kidsCount})</span>` : ''}</p>
                        <p class="text-xs text-gray-400 font-mono">${c.color || ''} / ${c.bg_color || ''}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-3 text-sm text-gray-500 font-mono">${c.slug}</td>
            <td class="px-6 py-3 text-sm text-gray-600">${parentLabel}</td>
            <td class="px-6 py-3 text-center"><span class="text-sm font-bold text-gray-700">${c.real_count || 0}</span></td>
            <td class="px-6 py-3 text-center"><span class="text-sm text-gray-500">${c.search_count || 0}</span></td>
            <td class="px-6 py-3 text-center"><span class="text-sm text-gray-500">${c.display_order || 0}</span></td>
            <td class="px-6 py-3">
                <div class="flex gap-1 justify-end">
                    <button onclick="editCategoryInline(${c.id})"
                        class="text-xs bg-blue-50 text-[#0ea5e9] px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button onclick="deleteCategory(${c.id},'${escapeJs(c.name)}')"
                        class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
        }).join('');
}

// Estado de grupos colapsados de categorías
window._collapsedCats = window._collapsedCats || new Set();
function collapsedParent(pid) { return window._collapsedCats && window._collapsedCats.has(pid); }

function toggleCatGroup(parentId) {
    if (!window._collapsedCats) window._collapsedCats = new Set();
    const isCollapsed = window._collapsedCats.has(parentId);
    if (isCollapsed) window._collapsedCats.delete(parentId);
    else window._collapsedCats.add(parentId);

    // Mostrar/ocultar las filas hijas
    document.querySelectorAll('.cat-child-' + parentId).forEach(row => {
        row.classList.toggle('hidden', !isCollapsed);
    });
    // Rotar el chevron
    const chev = document.getElementById('catChev' + parentId);
    if (chev) chev.className = `fas fa-chevron-${isCollapsed ? 'down' : 'right'} text-xs`;
}

function openCategoryForm(clear = true) {
    if (clear) {
        document.getElementById('catFormId').value = '';
        document.getElementById('catFormName').value = '';
        document.getElementById('catFormSlug').value = '';
        document.getElementById('catFormIcon').value = '';
        document.getElementById('catFormColor').value = '';
        document.getElementById('catFormBg').value = '';
        document.getElementById('catFormOrder').value = '0';
        const parentSel = document.getElementById('catFormParent');
        if (parentSel) parentSel.value = '';
        document.getElementById('categoryFormTitle').textContent = 'Nueva categoría';
    }
    document.getElementById('categoryFormPanel').classList.remove('hidden');
    initCatColorPresets(); // Sprint 7: paleta de colores
    document.getElementById('catFormName').focus();
}

function closeCategoryForm() {
    document.getElementById('categoryFormPanel').classList.add('hidden');
}

function editCategoryInline(id) {
    const c = (_adminCategoriesCache || []).find(x => x.id === id);
    if (!c) return;
    document.getElementById('catFormId').value = c.id;
    document.getElementById('catFormName').value = c.name || '';
    document.getElementById('catFormSlug').value = c.slug || '';
    document.getElementById('catFormIcon').value = c.icon || '';
    document.getElementById('catFormColor').value = c.color || '';
    document.getElementById('catFormBg').value = c.bg_color || '';
    document.getElementById('catFormOrder').value = c.display_order || 0;
    const parentSel = document.getElementById('catFormParent');
    if (parentSel) parentSel.value = c.parent_id || '';
    document.getElementById('categoryFormTitle').textContent = 'Editar categoría';
    if (typeof updateIconPreview === 'function') updateIconPreview();
    openCategoryForm(false);
}

// Auto-slug from name
document.getElementById('catFormName')?.addEventListener('input', function() {
    const slugField = document.getElementById('catFormSlug');
    if (!document.getElementById('catFormId').value) {
        slugField.value = this.value.toLowerCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    }
});

document.getElementById('categoryForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('catFormId').value;
    const parentVal = document.getElementById('catFormParent')?.value || '';
    const payload = {
        name: document.getElementById('catFormName').value,
        slug: document.getElementById('catFormSlug').value,
        icon: document.getElementById('catFormIcon').value,
        color: document.getElementById('catFormColor').value,
        bg_color: document.getElementById('catFormBg').value,
        display_order: parseInt(document.getElementById('catFormOrder').value) || 0,
        parent_id: parentVal ? parseInt(parentVal) : null
    };
    const res = id
        ? await apiAdminPost(`/categories/${id}`, payload, 'PUT')
        : await apiAdminPost('/categories', payload);
    if (res.success) {
        showToast(id ? 'Categoría actualizada' : 'Categoría creada');
        closeCategoryForm();
        loadAdminCategories();
        loadCategoriesCache.clear?.();
        categoriesCache = [];
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
    }
});

async function deleteCategory(id, name) {
    if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;
    const res = await apiAdminPost(`/categories/${id}`, {}, 'DELETE');
    if (res.success) { showToast('Categoría eliminada'); loadAdminCategories(); categoriesCache = []; }
    else showToast('Error: ' + (res.error || 'No se pudo eliminar'), 'error');
}

function escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ================================================================
// PLANES
// ================================================================
