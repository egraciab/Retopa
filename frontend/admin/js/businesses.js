/**
 * RetoPA Admin — js/businesses.js
 * Empresas: listado, modal, verificar, eliminar
 */

// ── Ordenamiento de la tabla de empresas (3/4) ────────────────────────────
let currentBizSort = 'created';   // default: más nuevas primero
let currentBizDir  = 'desc';
const BIZ_TEXT_SORTS = ['name', 'city', 'plan'];   // arrancan ascendente
function setBizSort(key) {
    if (currentBizSort === key) currentBizDir = (currentBizDir === 'asc') ? 'desc' : 'asc';
    else { currentBizSort = key; currentBizDir = BIZ_TEXT_SORTS.includes(key) ? 'asc' : 'desc'; }
    loadAdminBusinesses(1);
}
function updateBizSortArrows() {
    ['name','city','plan','verified','rating','likes','views_30d','wa_30d'].forEach(k => {
        const el = document.getElementById('bizArrow-' + k);
        if (el) el.textContent = (k === currentBizSort) ? (currentBizDir === 'asc' ? '▲' : '▼') : '';
    });
}

// ── Kits QR por lote (usa el filtro categoría/ciudad actual) ──────────────
async function downloadAdminKits() {
    const category = document.getElementById('bizFilterCategory')?.value || '';
    const city     = document.getElementById('bizFilterCity')?.value || '';
    if (!category && !city) { showToast('Filtrá por categoría y/o ciudad para bajar los kits (tope 100)', 'error'); return; }
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (city)     qs.set('city', city);
    showToast('Generando kits…');
    try {
        const res = await fetch(`${API_BASE}/kits.pdf?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${getAdminToken()}` } });
        if (!res.ok) { showToast(res.status === 404 ? 'No hay negocios para ese filtro' : 'No se pudo generar', 'error'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'kits-retopa.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { showToast('Error al generar kits', 'error'); }
}

// ================================================================
// EMPRESAS
// ================================================================
let bizDebounceTimer = null;
function debounceBizSearch() {
    if (bizDebounceTimer) clearTimeout(bizDebounceTimer);
    bizDebounceTimer = setTimeout(() => { currentBizPage = 1; loadAdminBusinesses(1); }, 300);
}

function clearBizFilters() {
    document.getElementById('bizSearch').value = '';
    document.getElementById('bizFilterPlan').value = '';
    document.getElementById('bizFilterVerified').value = '';
    document.getElementById('bizFilterCategory').value = '';
    document.getElementById('bizFilterCity').value = '';
    const ambFilter = document.getElementById('bizFilterAmbassador');
    if (ambFilter) ambFilter.value = '';
    loadAdminBusinesses(1);
}

function setBizFilter(type, val) {
    if (type === 'plan')     document.getElementById('bizFilterPlan').value = val;
    if (type === 'verified') document.getElementById('bizFilterVerified').value = val;
    if (type === 'city')     document.getElementById('bizFilterCity').value = val;
    loadAdminBusinesses(1);
}

async function loadBizKpiStats() {
    const data = await apiAdminGet('/dashboard');
    if (!data.success) return;
    const s = data.stats;
    const total = (s.basic_plan || 0) + (s.featured_plan || 0) + (s.premium_plan || 0);
    document.getElementById('bizStatTotal').textContent = total.toLocaleString();
    document.getElementById('bizStatVerified').textContent = (s.verified || 0).toLocaleString();
    document.getElementById('bizStatUnverified').textContent = (s.pending_verification || 0).toLocaleString();
    document.getElementById('bizStatBasic').textContent = (s.basic_plan || 0).toLocaleString();
    document.getElementById('bizStatFeatured').textContent = (s.featured_plan || 0).toLocaleString();
    document.getElementById('bizStatPremium').textContent = (s.premium_plan || 0).toLocaleString();

    // Poblar filtro de categorías si está vacío
    const catSel = document.getElementById('bizFilterCategory');
    if (catSel && catSel.options.length === 1) {
        await loadCategoriesCache();
        categoriesCache.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            catSel.appendChild(opt);
        });
    }

    // Poblar filtro de ciudades si está vacío
    const citySel = document.getElementById('bizFilterCity');
    if (citySel && citySel.options.length === 1) {
        const citiesData = await apiAdminGet('/cities?limit=500');
        if (citiesData.success) {
            (citiesData.data || []).sort((a,b) => a.name.localeCompare(b.name,'es')).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = `${c.name}${c.department ? ' (' + c.department + ')' : ''}`;
                citySel.appendChild(opt);
            });
        }
    }

    // Poblar filtro de embajadores si está vacío
    const ambSel = document.getElementById('bizFilterAmbassador');
    if (ambSel && ambSel.options.length === 1) {
        const ambData = await apiAdminGet('/ambassador/ambassadors');
        if (ambData.success) {
            (ambData.data || []).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = `${a.name || a.email} (${a.total_publicadas} pub.)`;
                ambSel.appendChild(opt);
            });
        }
    }
}

// ── D6.2 — Destacado Fundador (UI) ───────────────────────────────────────────
function founderDaysLeft(iso){ if(!iso) return 0; return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now())/86400000)); }
function fmtFounderDate(iso){ if(!iso) return ''; try { return new Date(iso).toLocaleDateString('es-PY',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return String(iso); } }

// Bloque de control dentro del modal de empresa
function renderFounderBlock(b){
  const active = !!b.founder_expires_at;
  const plan = b.plan_type || 'basic';
  let inner;
  if (active) {
    inner = `<div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-amber-700 font-medium">Activo · vence ${fmtFounderDate(b.founder_expires_at)} (${founderDaysLeft(b.founder_expires_at)} días)</span>
        <button type="button" onclick="revokeFounder(${b.id})" class="text-xs bg-white border border-amber-300 text-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 font-semibold">Quitar</button>
      </div>`;
  } else if (plan === 'basic') {
    inner = `<div class="flex items-center gap-2 flex-wrap">
        <input type="number" id="founderDays" value="90" min="1" max="730" class="form-input" style="width:80px;padding:6px 8px">
        <span class="text-xs text-amber-700">días</span>
        <button type="button" onclick="grantFounder(${b.id})" class="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 font-bold">Dar Destacado Fundador</button>
      </div>`;
  } else {
    inner = `<span class="text-xs text-amber-700">La ficha está en plan <b>${plan}</b>. El Destacado Fundador es para fichas básicas.</span>`;
  }
  return `<div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-sm font-bold text-amber-800"><i class="fas fa-medal mr-1"></i> Destacado Fundador</div>
        ${inner}
      </div>
      <p class="text-[11px] text-amber-600 mt-1.5 leading-snug">Pone la ficha en "Destacado" por tiempo limitado (el público lo ve como Destacado normal). Al vencer vuelve sola al plan anterior y se dispara el email de conversión.</p>
    </div>`;
}

async function grantFounder(id){
  const days = parseInt(document.getElementById('founderDays')?.value) || 90;
  const res = await apiAdminPost(`/businesses/${id}/founder`, { days });
  if (res && res.success) { showToast('Destacado Fundador otorgado ✅'); await openBusinessModal(id); loadAdminBusinesses(currentBizPage); }
  else showToast((res && res.error) || 'No se pudo otorgar', 'error');
}
async function revokeFounder(id){
  const res = await apiAdminPost(`/businesses/${id}/founder/revoke`, {});
  if (res && res.success) { showToast('Destacado Fundador quitado'); await openBusinessModal(id); loadAdminBusinesses(currentBizPage); }
  else showToast((res && res.error) || 'No se pudo quitar', 'error');
}

async function loadAdminBusinesses(page = 1) {
    currentBizPage = page;
    const plan       = document.getElementById('bizFilterPlan')?.value || '';
    const verified   = document.getElementById('bizFilterVerified')?.value || '';
    const q          = document.getElementById('bizSearch')?.value?.trim() || '';
    const category   = document.getElementById('bizFilterCategory')?.value || '';
    const city       = document.getElementById('bizFilterCity')?.value || '';
    const ambassador = document.getElementById('bizFilterAmbassador')?.value || '';

    let url = `/businesses?page=${page}&limit=20`;
    if (plan)       url += `&plan=${plan}`;
    if (verified)   url += `&verified=${verified}`;
    if (category)   url += `&category=${category}`;
    if (city)       url += `&city=${encodeURIComponent(city)}`;
    if (q)          url += `&q=${encodeURIComponent(q)}`;
    if (ambassador) url += `&ambassador=${ambassador}`;
    url += `&sort=${currentBizSort}&dir=${currentBizDir}`;

    const data = await apiAdminGet(url);
    if (!data.success) { showToast('Error cargando empresas', 'error'); return; }

    const tbody = document.getElementById('businessesTable');
    tbody.innerHTML = data.data.length === 0
        ? '<tr><td colspan="10" class="px-6 py-8 text-center text-gray-400"><i class="fas fa-inbox text-2xl mb-2 block"></i>No se encontraron empresas</td></tr>'
        : data.data.map(b => `
        <tr class="table-row transition">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    ${b.image_url ? `<img src="${escapeHtml(b.image_url)}" class="w-10 h-10 object-cover rounded-lg border border-gray-200 shrink-0" onerror="this.outerHTML='<div class=\'w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg shrink-0\'>&#128188;</div>'">` : `<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg shrink-0">${b.logo_emoji || '&#128188;'}</div>`}
                    <div class="min-w-0">
                        <p class="font-medium text-gray-900 text-sm truncate">${escapeHtml(b.name)}</p>
                        <p class="text-xs text-gray-500">${b.ruc ? 'RUC: ' + b.ruc : b.email || 'Sin RUC'}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-600 col-hide-mobile">
                <span class="inline-flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-blue-400"></span>
                    ${b.category_name || '-'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 col-hide-mobile">${b.city || '-'}</td>
            <td class="px-6 py-4 col-hide-mobile"><span class="badge ${b.plan_type === 'premium' ? 'badge-premium' : b.plan_type === 'featured' ? 'badge-featured' : 'badge-basic'}">${b.plan_type || 'basic'}</span>${b.founder_expires_at ? `<span class="badge ml-1" style="background:#fef3c7;color:#b45309" title="Destacado Fundador · vence ${fmtFounderDate(b.founder_expires_at)} (${founderDaysLeft(b.founder_expires_at)} días)"><i class="fas fa-medal"></i> Fundador</span>` : ''}</td>
            <td class="px-6 py-4">${b.verified ? '<span class="badge badge-verified"><i class="fas fa-check"></i> Verif.</span>' : '<span class="badge badge-pending"><i class="fas fa-clock"></i> Pend.</span>'}</td>
            <td class="px-6 py-4 col-hide-mobile">
                <div class="flex items-center gap-1 text-amber-500 text-sm">
                    <i class="fas fa-star"></i>
                    <span class="font-bold text-gray-700">${parseFloat(b.rating || 0).toFixed(1)}</span>
                    <span class="text-gray-400 text-xs">(${b.review_count || 0})</span>
                </div>
            </td>
            <td class="px-6 py-4 col-hide-mobile">
                <div class="flex items-center gap-1 text-red-400 text-sm">
                    <i class="fas fa-heart text-xs"></i>
                    <span class="font-bold text-gray-700">${b.like_count || 0}</span>
                </div>
            </td>
            <td class="px-6 py-4 col-hide-mobile">
                <span class="font-bold text-gray-800 text-sm">${(b.views_30d || 0).toLocaleString('es-PY')}</span>
            </td>
            <td class="px-6 py-4 col-hide-mobile">
                <span class="font-bold text-gray-800 text-sm">${(b.wa_30d || 0).toLocaleString('es-PY')}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex gap-1 justify-end">
                    <button onclick="openBusinessModal(${b.id})" class="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition" title="Ver/Editar"><i class="fas fa-edit"></i></button>
                    ${!b.verified
                        ? `<button onclick="verifyBusiness(${b.id}, true)" class="text-xs bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition" title="Verificar"><i class="fas fa-check"></i></button>`
                        : `<button onclick="verifyBusiness(${b.id}, false)" class="text-xs bg-amber-50 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition" title="Des-verificar"><i class="fas fa-undo"></i></button>`
                    }
                    <button onclick="deleteBusiness(${b.id})" class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`).join('');

    updateBizSortArrows();

    const p = data.pagination;
    document.getElementById('bizPaginationInfo').textContent =
        `${Math.min((p.page-1)*p.limit+1, p.total)}-${Math.min(p.page*p.limit, p.total)} de ${p.total} empresas`;
    let pagesHtml = '';
    if (p.page > 1) pagesHtml += `<button onclick="loadAdminBusinesses(${p.page-1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = Math.max(1, p.page-2); i <= Math.min(p.pages, p.page+2); i++)
        pagesHtml += `<button onclick="loadAdminBusinesses(${i})" class="px-3 py-1 border ${i === p.page ? 'bg-[#0ea5e9] text-white border-[#0ea5e9]' : 'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
    if (p.page < p.pages) pagesHtml += `<button onclick="loadAdminBusinesses(${p.page+1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-right"></i></button>`;
    document.getElementById('bizPaginationControls').innerHTML = pagesHtml;
}

async function openBusinessModal(id) {
    editingBusinessId = id;
    const data = await apiAdminGet(`/businesses/${id}`);
    if (!data.success) { showToast('Error cargando empresa', 'error'); return; }
    const b = data.data;

    // Preload caches
    await loadCategoriesCache();
    await loadCitiesCache();

    document.getElementById('businessModalContent').innerHTML = `
        <div class="flex justify-between items-start mb-6">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl">${b.logo_emoji || '&#128188;'}</div>
                <div>
                    <h2 class="text-xl font-bold text-gray-900">${escapeHtml(b.name)}</h2>
                    <p class="text-sm text-gray-500">${b.ruc || 'Sin RUC'} &bull; ID: ${b.id}</p>
                    <div class="mt-1.5 inline-flex items-center gap-3 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
                        <span class="text-gray-700" title="Visitas en los últimos 30 días"><i class="fas fa-eye text-gray-400 mr-1"></i><b>${(b.views_30d || 0).toLocaleString('es-PY')}</b> visitas</span>
                        <span class="text-gray-700" title="Clics de WhatsApp en los últimos 30 días"><i class="fab fa-whatsapp text-green-500 mr-1"></i><b>${(b.wa_30d || 0).toLocaleString('es-PY')}</b> WA</span>
                        <span class="text-gray-300">últimos 30 días</span>
                    </div>
                </div>
            </div>
            <button onclick="closeModal('businessModal')" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"><i class="fas fa-times"></i></button>
        </div>
        <form id="editBusinessForm" class="space-y-4">
            <div class="grid md:grid-cols-2 gap-4">
                <div><label class="form-label">Nombre Comercial / Marca *</label><input type="text" name="trade_name" value="${escapeHtml(b.trade_name || b.name)}" required class="form-input" placeholder="Ej: Panadería Pinocho"></div>
                <div><label class="form-label">Razón Social</label><input type="text" name="name" value="${escapeHtml(b.name)}" class="form-input" placeholder="Nombre legal completo"></div>
                <div><label class="form-label">RUC / CI</label><input type="text" name="ruc" value="${b.ruc || ''}" class="form-input"></div>
            </div>
            <div class="grid md:grid-cols-2 gap-4">
                <div>
                    <label class="form-label">Categor&iacute;as <span class="text-xs text-gray-400 font-normal">(la primera es la primaria)</span></label>
                    <div id="catChipsWrap" class="border border-gray-200 rounded-xl p-2 flex flex-wrap gap-1.5 min-h-[42px] bg-white"></div>
                    <select id="catChipsAdd" class="form-input mt-2" onchange="addCatChip(this.value); this.value=''"></select>
                    <p id="catChipsHint" class="text-xs text-gray-400 mt-1"></p>
                </div>
                <div><label class="form-label">Plan</label><select name="plan_type" class="form-input" onchange="renderCatChips()"><option value="basic" ${b.plan_type === 'basic' ? 'selected' : ''}>B&aacute;sico</option><option value="featured" ${b.plan_type === 'featured' ? 'selected' : ''}>Destacado</option><option value="premium" ${b.plan_type === 'premium' ? 'selected' : ''}>Pro</option></select></div>
            </div>
            ${renderFounderBlock(b)}
            <div><label class="form-label">Descripci&oacute;n</label><textarea name="description" rows="3" class="form-input">${b.description || ''}</textarea></div>
            <div class="grid md:grid-cols-2 gap-4">
                <div><label class="form-label">Direcci&oacute;n</label><input type="text" name="address" value="${b.address || ''}" class="form-input"></div>
                <div>
                    <label class="form-label">Ciudad</label>
                    <select name="city" class="form-input">${buildCityOptions(b.city)}</select>
                </div>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
                <div><label class="form-label">Teléfono</label><input type="text" name="phone" value="${b.phone || ''}" class="form-input"></div>
                <div><label class="form-label"><i class="fab fa-whatsapp text-green-500 mr-1"></i> WhatsApp <span class="text-gray-400 font-normal text-xs">(botón ficha)</span></label><input type="text" name="whatsapp" value="${b.whatsapp || b.phone || ''}" class="form-input" placeholder="595981620195"></div>
                <div><label class="form-label">Email</label><input type="email" name="email" value="${b.email || ''}" class="form-input"></div>
                <div><label class="form-label">Web</label><input type="url" name="website" value="${b.website || ''}" class="form-input"></div>
            </div>

            <!-- Redes Sociales -->
            <div class="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <label class="form-label mb-1 block"><i class="fas fa-share-alt mr-1 text-gray-400"></i> Redes Sociales <span class="text-gray-400 font-normal text-xs">(URL completa o @usuario)</span></label>
                <p class="text-xs text-gray-400 mb-3">Básico: solo WhatsApp · Negocio Digital: 2 redes · Pro: todas</p>
                <div class="grid md:grid-cols-3 gap-3">
                    <div><label class="form-label text-xs"><i class="fab fa-instagram mr-1" style="color:#E1306C"></i> Instagram</label><input type="text" name="social_instagram" value="${b.social_instagram || ''}" class="form-input" placeholder="@usuario o URL"></div>
                    <div><label class="form-label text-xs"><i class="fab fa-facebook-f mr-1" style="color:#1877F2"></i> Facebook</label><input type="text" name="social_facebook" value="${b.social_facebook || ''}" class="form-input" placeholder="@pagina o URL"></div>
                    <div><label class="form-label text-xs"><i class="fab fa-tiktok mr-1"></i> TikTok</label><input type="text" name="social_tiktok" value="${b.social_tiktok || ''}" class="form-input" placeholder="@usuario o URL"></div>
                    <div><label class="form-label text-xs"><i class="fab fa-linkedin-in mr-1" style="color:#0A66C2"></i> LinkedIn</label><input type="text" name="social_linkedin" value="${b.social_linkedin || ''}" class="form-input" placeholder="empresa o URL"></div>
                    <div><label class="form-label text-xs"><i class="fab fa-x-twitter mr-1"></i> X / Twitter</label><input type="text" name="social_twitter" value="${b.social_twitter || ''}" class="form-input" placeholder="@usuario o URL"></div>
                    <div><label class="form-label text-xs"><i class="fab fa-youtube mr-1" style="color:#FF0000"></i> YouTube</label><input type="text" name="social_youtube" value="${b.social_youtube || ''}" class="form-input" placeholder="@canal o URL"></div>
                </div>
            </div>

            <!-- Imágenes -->
            <div class="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <label class="form-label mb-3 block"><i class="fas fa-image mr-1 text-gray-400"></i> Im&aacute;genes</label>
                <div class="grid md:grid-cols-2 gap-4">
                    <!-- Logo -->
                    <div>
                        <p class="text-xs font-medium text-gray-600 mb-2">Logo / Imagen principal <span class="text-gray-400 font-normal">(cuadrado, 400×400)</span></p>
                        <div class="upload-zone" id="logoZone_${b.id}"
                            style="border:2px dashed #d1d5db;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;background:white;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;"
                            ondragover="event.preventDefault();this.style.borderColor='#0ea5e9';this.style.background='#f0f9ff'"
                            ondragleave="this.style.borderColor='#d1d5db';this.style.background='white'"
                            ondrop="handleAdminImageDrop(event,'logo',${b.id})"
                            onclick="document.getElementById('logoFile_${b.id}').click()">
                            <input type="file" id="logoFile_${b.id}" accept="image/*" class="hidden"
                                onchange="handleAdminImageSelect(this,'logo',${b.id})">
                            <div id="logoPreview_${b.id}">
                                ${b.image_url
                                    ? '<img src="' + escapeHtml(b.image_url) + '" class="w-20 h-20 object-cover rounded-xl mx-auto mb-2" onerror="this.style.display=\'none\'"><p class="text-xs text-gray-500">Clic o arrastrá para cambiar</p>'
                                    : '<i class="fas fa-cloud-upload-alt text-2xl text-gray-300 mb-2"></i><p class="text-xs text-gray-400">Arrastrá o clic para subir</p><p class="text-xs text-gray-300 mt-1">JPG, PNG, WebP — máx 10MB</p>'
                                }
                            </div>
                        </div>
                        <input type="hidden" name="image_url" id="imageUrlHidden_${b.id}" value="${escapeHtml(b.image_url || '')}">
                        <p class="text-xs text-gray-400 mt-1">Se comprime a WebP 400×400 automáticamente</p>
                    </div>
                    <!-- Portada -->
                    <div>
                        <p class="text-xs font-medium text-gray-600 mb-2">Portada / Banner <span class="text-gray-400 font-normal">(1200×300, auto-ajuste)</span></p>
                        <div class="upload-zone" id="coverZone_${b.id}"
                            style="border:2px dashed #d1d5db;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;background:white;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;"
                            ondragover="event.preventDefault();this.style.borderColor='#0ea5e9';this.style.background='#f0f9ff'"
                            ondragleave="this.style.borderColor='#d1d5db';this.style.background='white'"
                            ondrop="handleAdminImageDrop(event,'cover',${b.id})"
                            onclick="document.getElementById('coverFile_${b.id}').click()">
                            <input type="file" id="coverFile_${b.id}" accept="image/*" class="hidden"
                                onchange="handleAdminImageSelect(this,'cover',${b.id})">
                            <div id="coverPreview_${b.id}">
                                ${b.cover_url
                                    ? '<img src="${escapeHtml(b.cover_url)}" class="w-full h-16 object-cover rounded-lg mx-auto mb-2" onerror="this.style.display=\'none\'"><p class="text-xs text-gray-500">Clic o arrastrá para cambiar</p>'
                                    : '<i class="fas fa-panorama text-2xl text-gray-300 mb-2"></i><p class="text-xs text-gray-400">Arrastrá o clic para subir portada</p><p class="text-xs text-gray-300 mt-1">Recomendado: 1200×300 px</p>'
                                }
                            </div>
                        </div>
                        <input type="hidden" name="cover_url" id="coverUrlHidden_${b.id}" value="${escapeHtml(b.cover_url || '')}">
                        <p class="text-xs text-gray-400 mt-1">Se comprime a WebP 1200×300 y se muestra como banner en el Directorio</p>
                    </div>
                </div>
            </div>

            <div class="grid md:grid-cols-2 gap-4">
                <div><label class="form-label">Horarios de atención</label>
                    <div id="admHoursWidget_${b.id}" class="space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-200 text-sm">
                        <!-- días generados por initAdminHoursWidget() -->
                    </div>
                    <div class="flex gap-2 mt-2 flex-wrap">
                        <button type="button" onclick="applyAdminHoursPreset('lv',${b.id})" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition">Lun–Vie</button>
                        <button type="button" onclick="applyAdminHoursPreset('lvs',${b.id})" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition">Lun–Sáb</button>
                        <button type="button" onclick="applyAdminHoursPreset('247',${b.id})" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition">24/7</button>
                        <button type="button" onclick="applyAdminHoursPreset('clear',${b.id})" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition">Limpiar</button>
                    </div>
                    <p class="text-[10px] text-gray-400 mt-1" id="admHoursPreview_${b.id}"></p>
                    <input type="hidden" name="hours_json_widget" id="admHoursHidden_${b.id}">
                </div>
                <div><label class="form-label">Tags (separados por coma)</label><input type="text" name="tags" value="${(b.tags || []).join(', ')}" class="form-input" placeholder="tag1, tag2, tag3"></div>
            </div>
            <div class="border border-gray-100 rounded-xl p-4 bg-gray-50 mt-2">
                <label class="form-label mb-3 block"><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i> Ubicaci&oacute;n</label>

                <!-- Geocodificar desde dirección -->
                <div class="flex gap-2 mb-3">
                    <button type="button" onclick="geocodeBusinessAddress(${b.id})"
                        class="flex-1 bg-[#0ea5e9] text-white text-sm py-2 px-4 rounded-lg font-medium hover:bg-[#0284c7] transition flex items-center justify-center gap-2">
                        <i class="fas fa-search-location"></i> Buscar coordenadas desde direcci&oacute;n
                    </button>
                    <button type="button" onclick="clearBusinessMap(${b.id})"
                        class="border border-gray-200 text-gray-500 text-sm py-2 px-3 rounded-lg hover:bg-gray-100 transition" title="Limpiar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Mapa interactivo -->
                <div id="adminMap_${b.id}" style="width:100%;height:220px;border-radius:10px;border:1px solid #e5e7eb;background:#f3f4f6;overflow:hidden;"
                    class="mb-3 flex items-center justify-center text-gray-400 text-sm">
                    <div id="adminMapPlaceholder_${b.id}">
                        <i class="fas fa-map-marked-alt text-2xl mb-1 block text-center text-gray-300"></i>
                        <p>Hacé clic en "Buscar coordenadas" o en el mapa para marcar la ubicaci&oacute;n</p>
                    </div>
                </div>

                <!-- Lat/Lng editables -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">Latitud</label>
                        <input type="number" step="any" name="lat" id="latInput_${b.id}" value="${b.lat || ''}"
                            class="form-input text-sm" placeholder="-25.2867"
                            onchange="updateAdminMapPin(${b.id})">
                    </div>
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">Longitud</label>
                        <input type="number" step="any" name="lng" id="lngInput_${b.id}" value="${b.lng || ''}"
                            class="form-input text-sm" placeholder="-57.6478"
                            onchange="updateAdminMapPin(${b.id})">
                    </div>
                </div>
                <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>Tambi&eacute;n pod&eacute;s hacer clic directamente en el mapa para mover el marcador.</p>
            </div>
            <div class="flex items-center gap-2 pt-2">
                <input type="checkbox" name="verified" ${b.verified ? 'checked' : ''} class="w-4 h-4 text-[#0ea5e9] rounded" id="editVerified">
                <label for="editVerified" class="text-sm text-gray-700">Empresa verificada</label>
            </div>
            <div class="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onclick="closeModal('businessModal')" class="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50">Cancelar</button>
                <button type="submit" class="flex-1 btn-brand text-white py-2.5 rounded-lg font-bold"><i class="fas fa-save mr-2"></i> Guardar cambios</button>
            </div>
        </form>

        ${b.reviews && b.reviews.length ? `
        <div class="mt-6 pt-6 border-t border-gray-100">
            <h4 class="font-bold text-gray-900 mb-3">Rese&ntilde;as (${b.reviews.length})</h4>
            <div class="space-y-3 max-h-48 overflow-y-auto">
                ${b.reviews.map(r => `
                    <div class="bg-gray-50 rounded-lg p-3 text-sm">
                        <div class="flex items-center gap-2 mb-1"><span class="font-bold text-gray-900">${r.authorName || 'An&oacute;nimo'}</span><span class="text-amber-500">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5-r.rating)}</span><span class="text-xs text-gray-400 ml-auto">${formatDateShort(r.createdAt)}</span></div>
                        <p class="text-gray-600">${r.comment}</p>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}

        ${b.owners !== undefined ? `
        <div class="mt-6 pt-6 border-t border-gray-100">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-bold text-gray-900 flex items-center gap-2">
                    <i class="fas fa-users text-brand-500"></i> Propietarios / Acceso
                </h4>
                <button onclick="openDelegateModal(${b.id})"
                    style="font-size:.75rem;background:#0ea5e9;color:white;padding:.375rem .75rem;border-radius:.5rem;font-weight:700;display:flex;align-items:center;gap:.375rem;border:none;cursor:pointer">
                    <i class="fas fa-user-plus"></i> Delegar
                </button>
            </div>
            <div id="ownersList_${b.id}" class="space-y-2">
                ${b.owners && b.owners.length ? b.owners.map(o => `
                    <div class="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
                                ${(o.name||'?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-800">${escapeHtml(o.name||'')}</p>
                                <p class="text-xs text-gray-400">${escapeHtml(o.email||'')} · ${o.is_owner ? '<span class="text-brand-600 font-bold">Dueño</span>' : 'Editor'}</p>
                            </div>
                        </div>
                        <button onclick="revokeAccess(${b.id}, ${o.user_id||o.id}, '${escapeHtml(o.name||'')}')"
                            class="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>`).join('') : '<p class="text-xs text-gray-400">Sin propietario asignado</p>'}
            </div>
        </div>` : ''}
    `;

    // Inicializar chips de categorías a partir del pivot (b.categories) o b.category_id legacy
    _bizCatIds = Array.isArray(b.categories) && b.categories.length
        ? b.categories.slice().sort((a, c) => (a.isPrimary === c.isPrimary ? (a.position || 0) - (c.position || 0) : (a.isPrimary ? -1 : 1))).map(c => c.id)
        : (b.category_id ? [b.category_id] : []);
    renderCatChips();
    initAdminHoursWidget(b.id, b.hours_json || b.hoursJson || null);

    document.getElementById('editBusinessForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            name: fd.get('name') || fd.get('trade_name'), // fallback
            trade_name: fd.get('trade_name') || fd.get('name'),
            ruc: fd.get('ruc') || null,
            category_ids: _bizCatIds.slice(),
            category_id: _bizCatIds[0] || null,
            description: fd.get('description') || null,
            address: fd.get('address') || null,
            city: fd.get('city') || null,
            phone: fd.get('phone') || null,
            email: fd.get('email') || null,
            website: fd.get('website') || null,
            plan_type: fd.get('plan_type'),
            hours: null, // deprecado — mantenido por compat, se ignora
            hours_json: getAdminHoursJson(editingBusinessId),
            tags: fd.get('tags') ? fd.get('tags').split(',').map(t => t.trim()).filter(t => t) : null,
            lat: fd.get('lat') ? parseFloat(fd.get('lat')) : null,
            lng: fd.get('lng') ? parseFloat(fd.get('lng')) : null,
            verified: fd.get('verified') === 'on',
            image_url: document.getElementById(`imageUrlHidden_${editingBusinessId}`)?.value || fd.get('image_url') || null,
            cover_url: document.getElementById(`coverUrlHidden_${editingBusinessId}`)?.value || fd.get('cover_url') || null,
            social_instagram: fd.get('social_instagram') || null,
            social_facebook:  fd.get('social_facebook')  || null,
            social_tiktok:    fd.get('social_tiktok')    || null,
            social_linkedin:  fd.get('social_linkedin')  || null,
            social_twitter:   fd.get('social_twitter')   || null,
            social_youtube:   fd.get('social_youtube')   || null,
        };
        const res = await apiAdminPost(`/businesses/${editingBusinessId}`, data, 'PUT');
        if (res.success) {
            showToast('Empresa actualizada');
            closeModal('businessModal');
            loadAdminBusinesses(currentBizPage);
            if (currentSection === 'dashboard') loadDashboard();
        } else {
            showToast('Error: ' + (res.error || 'No se pudo actualizar'), 'error');
        }
    });

    document.getElementById('businessModal').classList.remove('hidden');

    // Inicializar mapa de ubicación después de que el modal es visible
    setTimeout(() => initAdminMap(b.id, b.lat, b.lng), 300);
}

async function verifyBusiness(id, verify) {
    const endpoint = verify ? `/businesses/${id}/verify` : `/businesses/${id}/unverify`;
    const res = await apiAdminPost(endpoint, {});
    if (res.success) {
        showToast(verify ? 'Empresa verificada' : 'Verificaci\u00f3n removida');
        loadAdminBusinesses(currentBizPage);
        if (currentSection === 'dashboard') loadDashboard();
    } else {
        showToast('Error: ' + (res.error || 'No se pudo actualizar'), 'error');
    }
}

async function deleteBusiness(id) {
    if (!confirm('\u00bfDesactivar esta empresa?')) return;
    const res = await apiAdminPost(`/businesses/${id}`, {}, 'DELETE');
    if (res.success) { showToast('Empresa desactivada'); loadAdminBusinesses(currentBizPage); }
    else { showToast('Error: ' + (res.error || 'No se pudo eliminar'), 'error'); }
}


// ── Delegación de empresas ────────────────────────────────────────────────
let _delegateBizId = null;

async function openDelegateModal(bizId) {
    _delegateBizId = bizId;
    const existing = document.getElementById('delegateModal');
    if (existing) existing.remove();

    // Cargar usuarios disponibles
    const users = await apiAdminGet('/users?limit=100');
    const userOptions = (users.data || [])
        .filter(u => u.is_active)
        .map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)} — ${u.email} (${u.role})</option>`)
        .join('');

    const modal = document.createElement('div');
    modal.id = 'delegateModal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50" onclick="closeDelegateModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <button onclick="closeDelegateModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <i class="fas fa-times text-xs"></i>
            </button>
            <h3 class="font-bold text-gray-900 mb-1 flex items-center gap-2">
                <i class="fas fa-user-plus text-brand-500"></i> Delegar empresa
            </h3>
            <p class="text-sm text-gray-400 mb-5">Asigná un usuario como propietario o editor de esta empresa.</p>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Usuario *</label>
                    <select id="delegateUserId" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-400">
                        <option value="">Seleccioná un usuario...</option>
                        ${userOptions}
                    </select>
                </div>
                <div class="flex gap-3">
                    <label class="flex items-center gap-2 flex-1 bg-gray-50 rounded-xl p-3 cursor-pointer border border-gray-200 hover:border-brand-400">
                        <input type="radio" name="delegateRole" value="owner" checked class="text-brand-500">
                        <div>
                            <p class="text-sm font-bold text-gray-800">Dueño</p>
                            <p class="text-xs text-gray-400">Control total</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-2 flex-1 bg-gray-50 rounded-xl p-3 cursor-pointer border border-gray-200 hover:border-brand-400">
                        <input type="radio" name="delegateRole" value="editor" class="text-brand-500">
                        <div>
                            <p class="text-sm font-bold text-gray-800">Editor</p>
                            <p class="text-xs text-gray-400">Solo editar datos</p>
                        </div>
                    </label>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Notas internas (opcional)</label>
                    <input type="text" id="delegateNotes" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="Ej: Cliente verificado vía teléfono">
                </div>
                <div id="delegateError" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
                <button onclick="confirmDelegate()"
                    style="width:100%;background:#0ea5e9;color:white;font-weight:700;padding:.75rem;border-radius:.75rem;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem">
                    <i class="fas fa-check"></i> Confirmar delegación
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function closeDelegateModal() {
    document.getElementById('delegateModal')?.remove();
}

async function confirmDelegate() {
    const userId   = document.getElementById('delegateUserId').value;
    const roleVal  = document.querySelector('input[name="delegateRole"]:checked')?.value;
    const notes    = document.getElementById('delegateNotes').value.trim();
    const errEl    = document.getElementById('delegateError');
    errEl.classList.add('hidden');

    if (!userId) { errEl.textContent = 'Seleccioná un usuario'; errEl.classList.remove('hidden'); return; }

    const res = await apiAdminPost(`/businesses/${_delegateBizId}/delegate`, {
        user_id:  parseInt(userId),
        is_owner: roleVal === 'owner',
        can_edit: true,
        notes
    });

    if (!res.success) { errEl.textContent = res.error || 'Error al delegar'; errEl.classList.remove('hidden'); return; }

    showToast(`✅ Empresa delegada a ${res.user?.name || 'usuario'}`);
    closeDelegateModal();
    // Recargar el detalle de la empresa para mostrar el nuevo owner
    openBusinessModal(_delegateBizId);
}

async function revokeAccess(bizId, userId, userName) {
    if (!confirm(`¿Revocar acceso de ${userName}?`)) return;
    const res = await apiAdminPost(`/businesses/${bizId}/delegate/${userId}`, {}, 'DELETE');
    if (res.success) { showToast('Acceso revocado'); openBusinessModal(bizId); }
    else showToast('Error: ' + (res.error || 'No se pudo revocar'), 'error');
}

// ════════════════════════════════════════════════════════════════════
// Multi-categoría: chips + límite por plan
// ════════════════════════════════════════════════════════════════════
let _bizCatIds = [];

function renderCatChips() {
    const wrap = document.getElementById('catChipsWrap');
    const sel  = document.getElementById('catChipsAdd');
    const hint = document.getElementById('catChipsHint');
    if (!wrap || !sel || !hint) return;

    const planType = document.querySelector('[name=plan_type]')?.value || 'basic';
    const max = (typeof getMaxCategoriesForPlan === 'function') ? getMaxCategoriesForPlan(planType) : 1;

    // Recortar si el plan bajó por debajo del cupo actual
    if (_bizCatIds.length > max) _bizCatIds = _bizCatIds.slice(0, max);

    wrap.innerHTML = _bizCatIds.length === 0
        ? '<span class="text-xs text-gray-400 py-1.5">Sin categorías asignadas</span>'
        : _bizCatIds.map((id, i) => {
            const c = (typeof getCategoryById === 'function') ? getCategoryById(id) : null;
            const name = c ? c.name : `#${id}`;
            const isPrimary = i === 0;
            return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${isPrimary ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}">
                ${isPrimary ? '<i class="fas fa-star text-blue-500" title="Primaria"></i>' : ''}
                ${escapeHtml(name)}
                <button type="button" onclick="removeCatChip(${id})" class="ml-0.5 hover:text-red-600" title="Quitar"><i class="fas fa-times text-[10px]"></i></button>
            </span>`;
        }).join('');

    const atMax = _bizCatIds.length >= max;
    sel.disabled = atMax;
    sel.innerHTML = `<option value="">${atMax ? `Límite alcanzado (${max})` : '+ Agregar categoría...'}</option>` +
        ((typeof buildCategoryGroupedHtml === 'function') ? buildCategoryGroupedHtml(null, new Set(_bizCatIds)) : '');

    hint.textContent = `Plan ${planType}: hasta ${max} categoría(s) · ${_bizCatIds.length}/${max} usadas` + (max > 1 ? ' · La primera es la primaria ⭐' : '');
}

function addCatChip(id) {
    const idNum = parseInt(id);
    if (!idNum || _bizCatIds.includes(idNum)) return;
    const planType = document.querySelector('[name=plan_type]')?.value || 'basic';
    const max = (typeof getMaxCategoriesForPlan === 'function') ? getMaxCategoriesForPlan(planType) : 1;
    if (_bizCatIds.length >= max) {
        showToast(`Tu plan permite hasta ${max} categoría(s)`, 'warn');
        return;
    }
    _bizCatIds.push(idNum);
    renderCatChips();
}

function removeCatChip(id) {
    _bizCatIds = _bizCatIds.filter(x => x !== id);
    renderCatChips();
}

// ================================================================
// CREAR EMPRESA — Modal de nueva empresa
// ================================================================
function openNewBusinessModal() {
    const modal = document.createElement('div');
    modal.id = 'newBizModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50" onclick="closeNewBizModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <h3 class="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <i class="fas fa-plus-circle text-[#0ea5e9]"></i> Nueva Empresa
                </h3>
                <button onclick="closeNewBizModal()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="newBizForm" class="px-6 py-4 space-y-4">
                <div id="newBizError" class="hidden bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"></div>
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Nombre comercial <span class="text-red-500">*</span></label>
                        <input type="text" name="trade_name" class="form-input" placeholder="Ej: Ferretería El Martillo" required>
                    </div>
                    <div>
                        <label class="form-label">Razón social</label>
                        <input type="text" name="name" class="form-input" placeholder="Nombre legal completo">
                    </div>
                </div>
                <div>
                    <label class="form-label">Descripción</label>
                    <textarea name="description" class="form-input" rows="2" placeholder="Breve descripción del negocio..."></textarea>
                </div>
                <div class="grid md:grid-cols-3 gap-4">
                    <div><label class="form-label">Teléfono</label><input type="text" name="phone" class="form-input" placeholder="0981000000"></div>
                    <div><label class="form-label"><i class="fab fa-whatsapp text-green-500 mr-1"></i> WhatsApp</label><input type="text" name="whatsapp" class="form-input" placeholder="595981000000"></div>
                    <div><label class="form-label">Email</label><input type="email" name="email" class="form-input"></div>
                    <div><label class="form-label">Sitio web</label><input type="url" name="website" class="form-input" placeholder="https://..."></div>
                    <div><label class="form-label">RUC</label><input type="text" name="ruc" class="form-input"></div>
                    <div>
                        <label class="form-label">Plan</label>
                        <select name="plan_type" class="form-input">
                            <option value="basic">Básico</option>
                            <option value="featured">Destacado</option>
                            <option value="premium">Pro</option>
                        </select>
                    </div>
                </div>
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Ciudad</label>
                        <select name="city" class="form-input" id="newBizCity">
                            <option value="">Seleccioná una ciudad...</option>
                        </select>
                    </div>
                    <div><label class="form-label">Dirección</label><input type="text" name="address" class="form-input"></div>
                </div>
                <div>
                    <label class="form-label">Categoría</label>
                    <select name="category_id" class="form-input" id="newBizCategory">
                        <option value="">Seleccioná una categoría...</option>
                    </select>
                </div>
                <div class="flex items-center gap-3">
                    <input type="checkbox" name="verified" id="newBizVerified" class="w-4 h-4 rounded border-gray-300">
                    <label for="newBizVerified" class="text-sm text-gray-700 font-medium">
                        <i class="fas fa-check-circle text-green-500 mr-1"></i> Marcar como verificada
                    </label>
                </div>
                <div class="flex gap-3 pt-2 border-t border-gray-100">
                    <button type="button" onclick="closeNewBizModal()" class="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition">Cancelar</button>
                    <button type="submit" class="flex-1 bg-[#0ea5e9] text-white py-2.5 rounded-xl font-bold hover:bg-[#0284c7] transition flex items-center justify-center gap-2">
                        <i class="fas fa-plus"></i> Crear empresa
                    </button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(modal);

    // Poblar ciudades
    apiAdminGet('/cities?limit=500').then(data => {
        if (!data.success) return;
        const sel = document.getElementById('newBizCity');
        (data.data || []).sort((a,b) => a.name.localeCompare(b.name,'es')).forEach(c => {
            const o = document.createElement('option');
            o.value = c.name; o.textContent = `${c.name}${c.department ? ' (' + c.department + ')' : ''}`;
            sel.appendChild(o);
        });
    });

    // Poblar categorías
    apiAdminGet('/categories').then(data => {
        if (!data.success) return;
        const sel = document.getElementById('newBizCategory');
        const parents = data.data.filter(c => !c.parent_id).sort((a,b) => (a.display_order||0)-(b.display_order||0));
        const kids = data.data.filter(c => c.parent_id);
        parents.forEach(p => {
            const og = document.createElement('optgroup');
            og.label = p.name;
            const po = document.createElement('option'); po.value = p.id; po.textContent = `${p.name} (todo)`; og.appendChild(po);
            kids.filter(k => k.parent_id === p.id).sort((a,b) => a.name.localeCompare(b.name,'es')).forEach(k => {
                const ko = document.createElement('option'); ko.value = k.id; ko.textContent = k.name; og.appendChild(ko);
            });
            sel.appendChild(og);
        });
    });

    // Submit
    document.getElementById('newBizForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const fd = new FormData(this);
        const payload = {
            trade_name: (fd.get('trade_name')||'').trim(),
            name: (fd.get('name')||'').trim() || (fd.get('trade_name')||'').trim(),
            description: (fd.get('description')||'').trim() || null,
            phone: (fd.get('phone')||'').trim() || null,
            whatsapp: (fd.get('whatsapp')||'').trim() || null,
            email: (fd.get('email')||'').trim() || null,
            website: (fd.get('website')||'').trim() || null,
            ruc: (fd.get('ruc')||'').trim() || null,
            plan_type: fd.get('plan_type'),
            city: fd.get('city') || null,
            address: (fd.get('address')||'').trim() || null,
            category_id: fd.get('category_id') || null,
            verified: fd.get('verified') === 'on',
        };
        const errEl = document.getElementById('newBizError');
        errEl.classList.add('hidden');
        const btn = this.querySelector('[type=submit]');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creando...';
        const res = await apiAdminPost('/businesses', payload);
        if (res.success) {
            showToast('Empresa creada correctamente ✅');
            closeNewBizModal();
            loadAdminBusinesses(1);
            loadBizKpiStats();
        } else {
            errEl.textContent = res.error || 'Error al crear la empresa';
            errEl.classList.remove('hidden');
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Crear empresa';
        }
    });
}

function closeNewBizModal() {
    document.getElementById('newBizModal')?.remove();
}

// ============================================================
// HOURS WIDGET — Panel Admin (v2.6 S3.1)
// Mismo comportamiento que panel cliente, prefijo _adm para
// evitar colisión si ambos paneles se cargan juntos.
// ============================================================
const ADM_DAYS = [
    { key: 'Lun' }, { key: 'Mar' }, { key: 'Mié' },
    { key: 'Jue' }, { key: 'Vie' }, { key: 'Sáb' }, { key: 'Dom' }
];
const _admHoursState = {}; // keyed by bizId

function initAdminHoursWidget(bizId, hoursJson) {
    // Reset
    _admHoursState[bizId] = {};
    ADM_DAYS.forEach(d => {
        _admHoursState[bizId][d.key] = { open: '09:00', close: '18:00', h24: false, closed: true };
    });

    // Parsear hoursJson si existe
    if (hoursJson) {
        const hj = typeof hoursJson === 'string' ? JSON.parse(hoursJson) : hoursJson;
        ADM_DAYS.forEach(d => {
            const s = hj[d.key];
            if (!s) return;
            _admHoursState[bizId][d.key] = {
                open:   s.open   || '09:00',
                close:  s.close  || '18:00',
                h24:    s.h24    || false,
                closed: s.closed !== false ? (s.closed || false) : false
            };
        });
    }
    renderAdminHoursWidget(bizId);
}

function renderAdminHoursWidget(bizId) {
    const container = document.getElementById(`admHoursWidget_${bizId}`);
    if (!container) return;
    const state = _admHoursState[bizId];
    container.innerHTML = ADM_DAYS.map(d => {
        const s = state[d.key];
        return `
        <div class="flex items-center gap-2 py-1">
            <label class="flex items-center gap-2 cursor-pointer w-24 flex-shrink-0">
                <div class="relative">
                    <input type="checkbox" class="sr-only peer" ${!s.closed ? 'checked' : ''}
                        onchange="admToggleDay(${bizId},'${d.key}',this.checked)">
                    <div class="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-brand-500 transition"></div>
                    <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition peer-checked:translate-x-4"></div>
                </div>
                <span class="text-sm font-medium ${!s.closed ? 'text-gray-900' : 'text-gray-400'}">${d.key}</span>
            </label>
            ${!s.closed ? `
                <label class="flex items-center gap-1">
                    <input type="checkbox" class="w-3 h-3 rounded accent-brand-500" ${s.h24 ? 'checked' : ''}
                        onchange="admToggleH24(${bizId},'${d.key}',this.checked)">
                    <span class="text-xs text-gray-500">24h</span>
                </label>
                ${!s.h24 ? `
                <input type="time" value="${s.open}" class="text-xs border border-gray-200 rounded-lg px-2 py-1 w-20"
                    onchange="admUpdateTime(${bizId},'${d.key}','open',this.value)">
                <span class="text-gray-400 text-xs">–</span>
                <input type="time" value="${s.close}" class="text-xs border border-gray-200 rounded-lg px-2 py-1 w-20"
                    onchange="admUpdateTime(${bizId},'${d.key}','close',this.value)">` : ''}
            ` : '<span class="text-xs text-gray-400 ml-2">Cerrado</span>'}
        </div>`;
    }).join('');
    updateAdminHoursHidden(bizId);
}

function admToggleDay(bizId, key, val) {
    _admHoursState[bizId][key].closed = !val;
    renderAdminHoursWidget(bizId);
}
function admToggleH24(bizId, key, val) {
    _admHoursState[bizId][key].h24 = val;
    renderAdminHoursWidget(bizId);
}
function admUpdateTime(bizId, key, field, val) {
    _admHoursState[bizId][key][field] = val;
    updateAdminHoursHidden(bizId);
}
function updateAdminHoursHidden(bizId) {
    const hidden = document.getElementById(`admHoursHidden_${bizId}`);
    if (!hidden) return;
    const json = getAdminHoursJson(bizId);
    hidden.value = json ? JSON.stringify(json) : '';
    const prev = document.getElementById(`admHoursPreview_${bizId}`);
    if (prev) prev.textContent = buildAdminHoursPreview(bizId);
}
function getAdminHoursJson(bizId) {
    const state = _admHoursState[bizId];
    if (!state) return null;
    const result = {};
    ADM_DAYS.forEach(d => {
        const s = state[d.key];
        result[d.key] = s.closed
            ? { closed: true }
            : { open: s.open, close: s.close, h24: s.h24 || false, closed: false };
    });
    return result;
}
function buildAdminHoursPreview(bizId) {
    const state = _admHoursState[bizId];
    if (!state) return '';
    const open = ADM_DAYS.filter(d => !state[d.key].closed);
    if (!open.length) return 'Sin horario';
    return open.map(d => {
        const s = state[d.key];
        return s.h24 ? `${d.key} 24h` : `${d.key} ${s.open}–${s.close}`;
    }).join(' | ');
}
function applyAdminHoursPreset(preset, bizId) {
    ADM_DAYS.forEach(d => { _admHoursState[bizId][d.key].closed = true; });
    if (preset === 'lv') {
        ['Lun','Mar','Mié','Jue','Vie'].forEach(k => {
            _admHoursState[bizId][k] = { open:'09:00', close:'18:00', h24:false, closed:false };
        });
    } else if (preset === 'lvs') {
        ['Lun','Mar','Mié','Jue','Vie','Sáb'].forEach(k => {
            _admHoursState[bizId][k] = { open:'09:00', close:'18:00', h24:false, closed:false };
        });
    } else if (preset === '247') {
        ADM_DAYS.forEach(d => {
            _admHoursState[bizId][d.key] = { open:'00:00', close:'23:59', h24:true, closed:false };
        });
    }
    renderAdminHoursWidget(bizId);
}
