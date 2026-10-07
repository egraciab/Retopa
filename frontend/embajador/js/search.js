/**
 * RetoPA — Panel Embajador · Buscador global de fichas (#2)
 * Busca por nombre en TODO el directorio (no solo el pool tomable) y ofrece
 * la acción correcta según el estado de cada ficha:
 *   - tomable            → "Tomar y completar" (la toma y abre el editor)
 *   - publicada/reclamada/con otro embajador → "Ver ficha" (solo lectura)
 */
let _fichaSearchQ    = '';
let _fichaSearchPage = 1;
let _fichaSearchTimer = null;

function _sEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Muestra el pool y oculta la búsqueda (sin disparar consultas)
function resetFichaSearch(){
  _fichaSearchQ = ''; _fichaSearchPage = 1;
  const inp = document.getElementById('fichaSearchInput'); if (inp) inp.value = '';
  const clr = document.getElementById('fichaSearchClear'); if (clr) clr.classList.add('hidden');
  document.getElementById('searchView')?.classList.add('hidden');
  document.getElementById('availPoolView')?.classList.remove('hidden');
}

function clearFichaSearch(){ resetFichaSearch(); }

function onFichaSearchInput(){
  const inp = document.getElementById('fichaSearchInput');
  const q = (inp?.value || '').trim();
  const clr = document.getElementById('fichaSearchClear');
  if (clr) clr.classList.toggle('hidden', q.length === 0);
  clearTimeout(_fichaSearchTimer);
  if (q.length < 2){ // muy corto → volver al pool
    document.getElementById('searchView')?.classList.add('hidden');
    document.getElementById('availPoolView')?.classList.remove('hidden');
    return;
  }
  _fichaSearchTimer = setTimeout(() => doFichaSearch(1), 350);
}

async function doFichaSearch(page = 1){
  const inp = document.getElementById('fichaSearchInput');
  const q = (inp?.value || '').trim();
  if (q.length < 2) return;
  _fichaSearchQ = q; _fichaSearchPage = page;

  document.getElementById('availPoolView')?.classList.add('hidden');
  const view = document.getElementById('searchView'); if (view) view.classList.remove('hidden');
  const cont = document.getElementById('searchResults');
  if (cont) cont.innerHTML = '<div class="col-span-2 text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Buscando...</div>';

  let res;
  try { res = await ambGet(`/ambassador/search?q=${encodeURIComponent(q)}&page=${page}&limit=12`); }
  catch(e){ res = null; }

  if (!res || !res.success){ if (cont) cont.innerHTML = '<p class="col-span-2 text-red-400 text-sm text-center py-8">Error en la búsqueda</p>'; return; }

  const rows = res.data || [];
  const summ = document.getElementById('searchSummary');
  if (summ) summ.innerHTML = `<strong>${res.pagination.total}</strong> resultado${res.pagination.total!==1?'s':''} para «${_sEsc(q)}»`;

  if (!rows.length){
    if (cont) cont.innerHTML = `<div class="col-span-2 bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div class="text-3xl mb-2">🔍</div>
        <p class="font-bold text-gray-800">Sin resultados</p>
        <p class="text-sm text-gray-500 mt-1">Probá con otro nombre.</p>
      </div>`;
    renderSearchPagination({ total:0, page:1, pages:0, limit:12 });
    return;
  }
  if (cont) cont.innerHTML = rows.map(renderSearchCard).join('');
  renderSearchPagination(res.pagination);
}

function _searchStatusChip(b){
  if (b.takeable)      return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Tomable</span>';
  if (b.mine)          return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">Tuya</span>';
  if (b.is_claimed)    return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Reclamada</span>';
  if (b.owner_amb)     return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Con embajador</span>';
  return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Publicada</span>';
}

function renderSearchCard(b){
  const name = b.trade_name || b.name || '—';
  const logo = b.image_url
    ? `<img src="${_sEsc(b.image_url)}" class="w-full h-full object-cover">`
    : (b.logo_emoji || '🏢');
  const verFicha = b.slug
    ? `<a href="/empresa/${_sEsc(b.slug)}" target="_blank" rel="noopener" class="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 font-semibold"><i class="fas fa-external-link-alt mr-1"></i>Ver ficha</a>`
    : '';
  const primary = b.takeable
    ? `<button onclick="searchTakeAndComplete(${b.id}, this)" class="text-xs bg-brand-500 text-white px-3 py-2 rounded-lg hover:bg-brand-600 font-bold"><i class="fas fa-hand-pointer mr-1"></i>Tomar y completar</button>`
    : '';
  return `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3" id="search-card-${b.id}">
    <div class="flex gap-3 items-center">
      <div class="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl overflow-hidden shrink-0">${logo}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-bold text-gray-900 text-sm leading-tight truncate">${_sEsc(name)}</p>
          ${_searchStatusChip(b)}
        </div>
        <p class="text-xs text-gray-400 mt-0.5 truncate">${b.category_name ? _sEsc(b.category_name)+' · ' : ''}${_sEsc(b.city||'—')}</p>
        <p class="text-xs text-gray-500 mt-1"><i class="fas fa-eye text-gray-400 mr-1"></i>${(b.views_30d||0).toLocaleString('es-PY')} visitas <span class="mx-1 text-gray-300">·</span><i class="fab fa-whatsapp text-green-500 mr-1"></i>${(b.wa_30d||0).toLocaleString('es-PY')} WA <span class="text-gray-300">30d</span></p>
      </div>
    </div>
    <div class="flex flex-wrap gap-2 mt-3">
      ${primary}${verFicha}
      ${(!primary && !verFicha) ? '<span class="text-xs text-gray-400 px-2 py-2">Sin acciones</span>' : ''}
    </div>
  </div>`;
}

async function searchTakeAndComplete(id, btn){
  if (btn){ btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Tomando...'; }
  const res = await ambPost(`/ambassador/available/${id}/take`, {});
  if (res && res.success){
    showToastAmb(`✅ "${res.data?.trade_name || res.data?.name || 'Ficha'}" es tuya — abriendo para completar…`);
    _availStats = null;
    if (typeof loadAmbDashboard === 'function') loadAmbDashboard();
    if (typeof openEditFichaModal === 'function') openEditFichaModal(id);
  } else {
    showToastAmb((res && res.error) || 'No se pudo tomar la ficha', 'warning');
    if (btn){ btn.disabled = false; btn.innerHTML = '<i class="fas fa-hand-pointer mr-1"></i>Tomar y completar'; }
  }
}

function renderSearchPagination(p){
  const infoEl = document.getElementById('searchPaginationInfo');
  const ctrlEl = document.getElementById('searchPaginationControls');
  if (infoEl) infoEl.textContent = p.total > 0
    ? `${Math.min((p.page-1)*p.limit+1,p.total)}–${Math.min(p.page*p.limit,p.total)} de ${p.total}`
    : '';
  if (!ctrlEl) return;
  let html = '';
  if (p.page>1) html += `<button onclick="doFichaSearch(${p.page-1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-left"></i></button>`;
  for (let i=Math.max(1,p.page-2);i<=Math.min(p.pages,p.page+2);i++)
    html += `<button onclick="doFichaSearch(${i})" class="px-3 py-1 border ${i===p.page?'bg-brand-500 text-white border-brand-500':'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
  if (p.page<p.pages) html += `<button onclick="doFichaSearch(${p.page+1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-right"></i></button>`;
  ctrlEl.innerHTML = html;
}
