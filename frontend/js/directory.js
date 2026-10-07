/**
 * RetoPA — js/directory.js
 * loadCategories(), loadCities(), loadPopularTags()
 */

async function loadCategories() {
    const data = await apiGet('/categories');
    const grid = document.getElementById('categoriesGrid');
    const select = document.getElementById('categorySelect');
    const bizSelect = document.getElementById('bizCategory');

    if (!data.success || !data.data.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-500">No hay categorías disponibles</div>';
        return;
    }

    allCategories = data.data;

    // Separar padres y agrupar hijos por padre
    const parents = data.data.filter(c => !c.parentId)
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const kidsByParent = new Map();
    for (const c of data.data) {
        if (c.parentId) {
            const arr = kidsByParent.get(c.parentId) || [];
            arr.push(c);
            kidsByParent.set(c.parentId, arr);
        }
    }

    // Cards: mostrar PADRES con icon, conteo agregado (incluye hijos) y hint del nº de subcategorías
    const byCount = [...parents].sort((a, b) => (b.businessCount || 0) - (a.businessCount || 0));
    const VISIBLE = 8;
    const top  = byCount.slice(0, VISIBLE);
    const rest = byCount.slice(VISIBLE).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const renderCard = (cat, i) => {
        const kids = kidsByParent.get(cat.id) || [];
        return `
        <div class="category-card bg-white rounded-2xl p-5 text-center shadow-sm border border-gray-100 group ${i === 0 ? 'active' : ''}"
             onclick="filterByCategory('${cat.slug}', this)"
             data-slug="${cat.slug}">
            <div class="cat-icon w-14 h-14 mx-auto ${cat.bgColor || 'bg-gray-100'} rounded-2xl flex items-center justify-center text-2xl ${cat.color || 'text-gray-600'} mb-3 group-hover:scale-110 transition duration-300">
                <i class="fas ${cat.icon || 'fa-tag'}"></i>
            </div>
            <h4 class="font-bold text-gray-800 text-sm leading-tight">${cat.name}</h4>
            <p class="cat-count text-xs text-gray-400 mt-1 font-medium">
                ${(cat.businessCount || 0) > 0 ? Number(cat.businessCount).toLocaleString() + ' empresas' : 'Sin empresas'}
            </p>
            ${kids.length ? `<p class="text-[10px] text-gray-400 mt-0.5">${kids.length} subcategorías</p>` : ''}
        </div>`;
    };

    grid.innerHTML = top.map((cat, i) => renderCard(cat, i)).join('');

    // Botón "Ver todas las categorías raíz" si hay más
    if (rest.length > 0) {
        const expandBtn = document.createElement('button');
        expandBtn.id = 'expandCatsBtn';
        expandBtn.className = 'col-span-2 md:col-span-3 lg:col-span-5 text-sm text-brand-600 hover:text-brand-800 font-medium py-2 flex items-center justify-center gap-2 transition';
        expandBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver todas las categorías (${rest.length} más)`;
        expandBtn.onclick = () => {
            expandBtn.remove();
            grid.insertAdjacentHTML('beforeend', rest.map((cat, i) => renderCard(cat, i + VISIBLE)).join(''));
            const collapseBtn = document.createElement('button');
            collapseBtn.className = 'col-span-2 md:col-span-3 lg:col-span-5 text-sm text-gray-400 hover:text-gray-600 font-medium py-2 flex items-center justify-center gap-2 transition';
            collapseBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Mostrar menos';
            collapseBtn.onclick = () => { loadCategories(); };
            grid.appendChild(collapseBtn);
        };
        const btnWrapper = document.createElement('div');
        btnWrapper.className = 'col-span-2 md:col-span-3 lg:col-span-5';
        btnWrapper.appendChild(expandBtn);
        grid.appendChild(btnWrapper);
    }

    // Selects de filtros y formulario — agrupados por padre
    const buildGroupedOptions = (valueKey, includeAllOption) => {
        const padresAlpha = [...parents].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        const allOpt = includeAllOption ? `<option value="">${includeAllOption}</option>` : '';
        const groups = padresAlpha.map(p => {
            const kids = (kidsByParent.get(p.id) || []).slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'es'));
            const padreOpt = `<option value="${p[valueKey]}">${p.name} (todo)</option>`;
            const kidsOpts = kids.map(k => `<option value="${k[valueKey]}">${k.name}</option>`).join('');
            return `<optgroup label="${p.name}">${padreOpt}${kidsOpts}</optgroup>`;
        }).join('');
        return allOpt + groups;
    };

    if (select)    select.innerHTML    = buildGroupedOptions('slug', 'Todas las categorías');
    if (bizSelect) bizSelect.innerHTML = buildGroupedOptions('id',   'Seleccioná una categoría');

    // Alimentar combobox del hero (Sprint 5)
    if (typeof populateCatCombo === 'function') populateCatCombo(data.data);
}

async function loadCities() {
    const data = await apiGet('/cities');
    const citySelect = document.getElementById('citySelect');
    const filterCity = document.getElementById('filterCity');
    const bizCity = document.getElementById('bizCity');

    if (!data.success || !data.data.length) return;

    allCities = data.data;

    // Agrupar por departamento
    const byDept = {};
    data.data.forEach(c => {
        if (!byDept[c.department]) byDept[c.department] = [];
        byDept[c.department].push(c);
    });

    const buildOptions = () => {
        let html = '<option value="">Todas las ciudades</option>';
        Object.keys(byDept).sort().forEach(dept => {
            html += `<optgroup label="${dept}">`;
            byDept[dept].forEach(c => {
                html += `<option value="${c.name}">${c.name}</option>`;
            });
            html += '</optgroup>';
        });
        return html;
    };

    if (citySelect) citySelect.innerHTML = buildOptions();
    if (filterCity) filterCity.innerHTML = buildOptions();
    if (bizCity) bizCity.innerHTML = '<option value="">Seleccioná una ciudad</option>' + buildOptions().replace('<option value="">Todas las ciudades</option>', '');

    // Alimentar combobox del hero (Sprint 5)
    if (typeof populateCityCombo === 'function') populateCityCombo(data.data);
}

async function loadPopularTags() {
    const container = document.getElementById('popularTags');
    if (!container) return;

    // Intentar con /search/popular (basado en search_count)
    const data = await apiGet('/search/popular');

    if (data.success && data.data.length >= 3) {
        container.innerHTML = data.data.map(cat => `
            <button onclick="quickSearch('${cat.name}')"
                class="text-xs bg-gray-50 hover:bg-brand-50 text-gray-600 hover:text-brand-700 px-3 py-1.5 rounded-full font-medium cursor-pointer border border-gray-200 transition flex items-center gap-1">
                <i class="fas ${cat.icon || 'fa-tag'} text-[10px]"></i> ${cat.name}
            </button>
        `).join('');
    } else {
        // Fallback: top categorías por cantidad de empresas
        const cats = allCategories.length > 0 ? allCategories : (await apiGet('/categories')).data || [];
        const top = [...cats]
            .filter(c => (c.businessCount || 0) > 0)
            .sort((a, b) => (b.businessCount || 0) - (a.businessCount || 0))
            .slice(0, 5);

        if (top.length > 0) {
            container.innerHTML = top.map(cat => `
                <button onclick="filterByCategory('${cat.slug}', null); document.getElementById('directorio').scrollIntoView({behavior:'smooth'})"
                    class="text-xs bg-gray-50 hover:bg-brand-50 text-gray-600 hover:text-brand-700 px-3 py-1.5 rounded-full font-medium cursor-pointer border border-gray-200 transition flex items-center gap-1">
                    <i class="fas ${cat.icon || 'fa-tag'} text-[10px]"></i> ${cat.name}
                    <span class="text-gray-400 text-[10px] ml-0.5">${Number(cat.businessCount).toLocaleString()}</span>
                </button>
            `).join('');
        } else {
            container.innerHTML = `
                <button onclick="quickSearch('Servicios')" class="text-xs bg-gray-50 hover:bg-brand-50 text-gray-600 hover:text-brand-700 px-3 py-1.5 rounded-full font-medium cursor-pointer border border-gray-200 transition">💼 Servicios</button>
                <button onclick="quickSearch('Comercios')" class="text-xs bg-gray-50 hover:bg-brand-50 text-gray-600 hover:text-brand-700 px-3 py-1.5 rounded-full font-medium cursor-pointer border border-gray-200 transition">🏪 Comercios</button>
                <button onclick="quickSearch('Construcción')" class="text-xs bg-gray-50 hover:bg-brand-50 text-gray-600 hover:text-brand-700 px-3 py-1.5 rounded-full font-medium cursor-pointer border border-gray-200 transition">🏗️ Construcción</button>
            `;
        }
    }
}

// ============================================
// BÚSQUEDA Y RESULTADOS
