/**
 * RetoPA Admin — js/merge.js  (2026-10-14)
 * Asistente de FICHAS DUPLICADAS en Captación / Leads.
 *
 *  - Tarjeta "Posibles fichas duplicadas": altas nuevas que coinciden con una ficha
 *    que ya existe por celular o correo. Cada propuesta muestra la evidencia con
 *    su FUENTE de los dos lados. Nada se fusiona solo.
 *  - Modal "Fusionar fichas": las dos lado a lado, campo por campo (por defecto
 *    se trae del alta SOLO lo que la que queda tiene vacío), qué se mueve, y
 *    "Fusionar". Después: "Avisar por WhatsApp" (sin cargarle nada al dueño).
 *  - "Fusiones hechas": historial con Revertir.
 *  - En el modal del lead: aviso si esa alta parece una ficha existente.
 */

window._mergeCands = window._mergeCands || [];
let _mergeState = null;   // { survivorId, duplicateId, preview }

const _mEsc = v => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v));
const _mNum = n => (Number(n) || 0).toLocaleString('es-PY');
const _mDate = d => { try { return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } };
const _mOwner = f => { const o = (f && f.users || []).find(u => u.is_owner); return o ? (o.name || o.email || o.phone || ('#' + o.id)) : ''; };
const _mPl = (n, one, many) => `${_mNum(n)} ${Number(n) === 1 ? one : many}`;
const _M_LABELS = { name: 'nombre', trade_name: 'nombre comercial', ruc: 'RUC', description: 'descripción', address: 'dirección',
    city: 'ciudad', phone: 'teléfono', whatsapp: 'WhatsApp', email: 'correo', website: 'sitio web', image_url: 'logo',
    cover_url: 'portada', logo_emoji: 'emoji', hours: 'horario', hours_json: 'horario', category_id: 'rubro' };
const _mFields = arr => (arr || []).map(f => _M_LABELS[f] || f.replace(/^social_/, '')).join(', ');
const _mFichaUrl = f => f && f.slug ? `/negocio/${encodeURIComponent(f.slug)}` : null;

// ── Tarjeta del asistente ────────────────────────────────────────────────────
async function loadMergeAssistant() {
    const box = document.getElementById('mergeAssistant');
    if (!box) return;
    const data = await apiAdminGet('/merges/candidates');
    window._mergeCands = (data && data.success && data.data) || [];
    if (typeof renderLeadsTable === 'function' && typeof allLeadsCache !== 'undefined' && allLeadsCache.length) {
        renderLeadsTable(allLeadsCache, document.getElementById('leadSearch')?.value?.trim() || '');
    }
    const n = window._mergeCands.length;
    if (!n) {
        box.innerHTML = `<div class="flex items-center gap-2 text-xs text-gray-400 px-1">
            <i class="fas fa-code-merge text-gray-300"></i> Sin fichas duplicadas a la vista.
            <button type="button" onclick="toggleMergeHistory()" class="underline hover:text-gray-600">Fusiones hechas</button></div>
            <div id="mergeHistory" class="hidden mt-2"></div>`;
        box.classList.remove('hidden');
        return;
    }
    box.innerHTML = `
      <div class="bg-white rounded-2xl border border-violet-200 shadow-sm overflow-hidden">
        <div class="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-start gap-3">
          <i class="fas fa-code-merge text-violet-500 mt-1"></i>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-violet-900 text-sm">Posibles fichas duplicadas (${n})</p>
            <p class="text-xs text-violet-700">Altas nuevas que coinciden con una ficha que ya existe. Nada se fusiona solo: revisá y decidí.</p>
          </div>
          <button type="button" onclick="toggleMergeHistory()" class="text-xs text-violet-600 underline whitespace-nowrap">Fusiones hechas</button>
        </div>
        <div class="divide-y divide-gray-100">${window._mergeCands.map(_mergeCandRow).join('')}</div>
        <div id="mergeHistory" class="hidden border-t border-gray-100"></div>
      </div>`;
    box.classList.remove('hidden');
}

function _mergeCandRow(c) {
    const o = c.original || {}, nw = c.nuevo || {};
    return `
      <div class="px-4 py-3" data-merge-new="${c.new_id}">
        <p class="text-sm text-gray-800 leading-snug">
          <b>«${_mEsc(nw.name)}»</b> <span class="text-gray-400">(alta del ${_mDate(nw.created_at)} · #${c.new_id})</span>
          parece ser <b>«${_mEsc(o.name)}»</b>
          <span class="text-gray-400">(#${c.old_id} · ${_mNum(o.views)} visitas · ${_mNum(o.clicks)} clics${_mOwner(o) ? ' · dueño: ' + _mEsc(_mOwner(o)) : ''})</span>
        </p>
        <ul class="mt-1.5 space-y-0.5">${(c.evidence || []).map(e => `
          <li class="text-xs text-gray-600 flex gap-1.5"><i class="fas ${e.kind === 'cel' ? 'fa-mobile-screen' : e.kind === 'mail' ? 'fa-at' : 'fa-font'} text-violet-400 mt-0.5 w-3"></i><span>${_mEsc(e.label)}</span></li>`).join('')}
        </ul>
        <div class="flex flex-wrap gap-2 mt-2">
          <button type="button" onclick="openMergeModal(${c.old_id}, ${c.new_id})"
            class="text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5"><i class="fas fa-code-merge mr-1"></i> Revisar y fusionar</button>
          <button type="button" onclick="discardMergeCandidate(${c.old_id}, ${c.new_id})"
            class="text-xs font-medium bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">No es la misma</button>
        </div>
      </div>`;
}

function mergeCandidateFor(businessId) {
    return (window._mergeCands || []).find(c => c.new_id === businessId || c.old_id === businessId) || null;
}

async function discardMergeCandidate(oldId, newId) {
    if (!confirm('¿No es el mismo negocio?\n\nEl asistente no la vuelve a proponer. Las dos fichas quedan como están.')) return false;
    const c = (window._mergeCands || []).find(x => x.old_id === oldId && x.new_id === newId) || {};
    const data = await apiAdminPost('/merges/discard', { old_id: oldId, new_id: newId, lead_id: c.lead_id, evidence: c.evidence || [] });
    if (data && data.success) { showToast('Listo: quedan como fichas distintas', 'info'); loadMergeAssistant(); return true; }
    showToast('Error: ' + ((data && data.error) || 'No se pudo guardar'), 'error');
    return false;
}

// ── Historial ────────────────────────────────────────────────────────────────
async function toggleMergeHistory() {
    const el = document.getElementById('mergeHistory');
    if (!el) return;
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<p class="px-4 py-3 text-xs text-gray-400">Cargando…</p>';
    const data = await apiAdminGet('/merges');
    const rows = (data && data.success && data.data || []).filter(m => m.status !== 'descartada');
    el.innerHTML = rows.length ? `<div class="divide-y divide-gray-100 bg-white rounded-xl">${rows.map(m => `
      <div class="px-4 py-2.5 flex flex-wrap items-center gap-2 text-xs" data-merge-id="${m.id}">
        <span class="flex-1 min-w-[12rem] text-gray-700">«${_mEsc(m.duplicate_name)}» <i class="fas fa-arrow-right text-gray-300 mx-1"></i> «${_mEsc(m.survivor_name)}» <span class="text-gray-400">#${m.survivor_id}</span>
          <span class="block text-gray-400">${_mDate(m.created_at)}${m.created_by_name ? ' · ' + _mEsc(m.created_by_name) : ''}${(m.fields_taken || []).length ? ' · trajo: ' + _mEsc(_mFields(m.fields_taken)) : ''}</span></span>
        ${m.status === 'aplicada'
          ? `<button type="button" onclick="revertMerge(${m.id})" class="font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1"><i class="fas fa-rotate-left mr-1"></i>Revertir</button>`
          : `<span class="text-gray-400"><i class="fas fa-rotate-left mr-1"></i>revertida ${_mDate(m.reverted_at)}</span>`}
      </div>`).join('')}</div>` : '<p class="px-4 py-3 text-xs text-gray-400">Todavía no hay fusiones.</p>';
}

async function revertMerge(id) {
    if (!confirm('¿Revertir esta fusión?\n\nLas dos fichas vuelven a como estaban (datos, fotos, visitas, cuenta y lead). Si el dueño cambió algo después, eso se respeta.')) return;
    const data = await apiAdminPost(`/merges/${id}/revert`, {});
    if (data && data.success) {
        const kept = (data.data && data.data.kept) || [];
        showToast(kept.length ? `↩ Revertida. No se tocó lo que el dueño cambió después: ${kept.join(', ')}` : '↩ Fusión revertida: las dos fichas volvieron a como estaban', 'info');
        if (typeof loadAdminLeads === 'function') loadAdminLeads(); else loadMergeAssistant();
    } else showToast('Error: ' + ((data && data.error) || 'No se pudo revertir'), 'error');
}

// ── Modal de fusión ──────────────────────────────────────────────────────────
function _mergeModalEl() {
    let el = document.getElementById('mergeModal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'mergeModal';
    el.className = 'fixed inset-0 z-[70] hidden';
    el.innerHTML = `<div class="absolute inset-0 bg-black/50" onclick="closeMergeModal()"></div>
      <div class="absolute inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <div id="mergeModalContent" class="p-4 sm:p-6"></div></div>`;
    document.body.appendChild(el);
    return el;
}
function closeMergeModal() { document.getElementById('mergeModal')?.classList.add('hidden'); _mergeState = null; }

async function openMergeModal(survivorId, duplicateId) {
    const el = _mergeModalEl();
    const box = el.querySelector('#mergeModalContent');
    box.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>Comparando las dos fichas…</p>';
    el.classList.remove('hidden');
    const data = await apiAdminGet(`/merges/preview?survivor_id=${survivorId}&duplicate_id=${duplicateId}`);
    if (!data || !data.success) { box.innerHTML = `<p class="text-sm text-red-500 py-6 text-center">${_mEsc((data && data.error) || 'No se pudo comparar')}</p>`; return; }
    _mergeState = { survivorId, duplicateId, preview: data.data };
    _renderMergeModal();
}

function _fichaCard(f, role) {
    const keep = role === 'survivor';
    const url = _mFichaUrl(f);
    return `
      <div class="rounded-xl border ${keep ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-gray-50'} p-3 min-w-0">
        <p class="text-[11px] font-bold uppercase tracking-wide ${keep ? 'text-emerald-700' : 'text-gray-500'}">
          ${keep ? '<i class="fas fa-check-circle mr-1"></i>Se queda' : '<i class="fas fa-arrow-right-to-bracket mr-1"></i>Se suma y se desactiva'}</p>
        <p class="font-bold text-gray-900 text-sm mt-1 break-words">${_mEsc(f.name)}</p>
        <p class="text-xs text-gray-500">#${f.id} · ${_mEsc(f.city || 'sin ciudad')} · creada ${_mDate(f.created_at)}</p>
        <p class="text-xs text-gray-600 mt-1">${_mPl(f.views, 'visita', 'visitas')} · ${_mPl(f.clicks, 'clic', 'clics')} · ${_mPl(f.photos, 'foto', 'fotos')}</p>
        ${_mOwner(f) ? `<p class="text-xs text-gray-600">Dueño: ${_mEsc(_mOwner(f))}</p>` : '<p class="text-xs text-gray-400">Sin dueño</p>'}
        ${url ? `<a href="${url}" target="_blank" rel="noopener" class="text-xs text-[#0ea5e9] hover:underline"><i class="fas fa-up-right-from-square mr-1"></i>Ver ficha</a>` : ''}
      </div>`;
}

function _fieldValue(f, v) {
    if (v === null || v === undefined || v === '') return '<span class="text-gray-300 italic">vacío</span>';
    if ((f === 'image_url' || f === 'cover_url') && /^https?:\/\/|^\//.test(String(v))) {
        return `<span class="inline-flex items-center gap-2"><img src="${_mEsc(v)}" alt="" class="w-8 h-8 rounded object-cover bg-gray-100" onerror="this.style.display='none'"><span class="break-all">${_mEsc(String(v).split('/').pop())}</span></span>`;
    }
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `<span class="break-words" title="${_mEsc(s)}">${_mEsc(s.length > 140 ? s.slice(0, 140) + '…' : s)}</span>`;
}

function _renderMergeModal() {
    const st = _mergeState; if (!st) return;
    const p = st.preview, s = p.survivor, d = p.duplicate;
    const fields = p.fields || [];
    const box = document.getElementById('mergeModalContent');
    box.innerHTML = `
      <div class="flex items-start gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center"><i class="fas fa-code-merge"></i></div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-bold text-gray-900">Fusionar fichas</h3>
          <p class="text-xs text-gray-500">El dueño no tiene que volver a cargar nada: lo del alta nueva se suma a su ficha de siempre.</p>
        </div>
        <button type="button" onclick="closeMergeModal()" class="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200" title="Cerrar"><i class="fas fa-times"></i></button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
        ${_fichaCard(s, 'survivor')}
        <button type="button" onclick="swapMergeSides()" class="self-center justify-self-center text-xs text-gray-500 hover:text-violet-600 border border-gray-200 rounded-full px-3 py-1.5 bg-white" title="Intercambiar cuál queda">
          <i class="fas fa-right-left mr-1"></i>Intercambiar</button>
        ${_fichaCard(d, 'duplicate')}
      </div>
      ${s.views < d.views ? `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2"><i class="fas fa-triangle-exclamation mr-1"></i>La que se desactiva tiene más visitas. ¿Querés intercambiar?</p>` : ''}

      ${(p.evidence || []).length ? `
      <div class="mt-4">
        <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Por qué parecen la misma</p>
        <ul class="space-y-0.5">${p.evidence.map(e => `<li class="text-xs text-gray-700 flex gap-1.5"><i class="fas fa-check text-violet-400 mt-0.5"></i><span>${_mEsc(e.label)}</span></li>`).join('')}</ul>
      </div>` : `<p class="text-xs text-gray-500 mt-4"><i class="fas fa-circle-info mr-1"></i>El asistente no encontró coincidencias de contacto entre estas dos: fijate bien antes de fusionar.</p>`}

      <div class="mt-4">
        <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Datos distintos — elegí cuál queda</p>
        ${fields.length ? `<div class="border border-gray-100 rounded-xl divide-y divide-gray-100" id="mergeFields">${fields.map(f => `
          <div class="p-3" data-field="${f.field}">
            <p class="text-xs font-semibold text-gray-700">${_mEsc(f.label)} <span class="font-normal text-gray-400">· ${_mEsc(f.reason)}</span></p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
              <label class="flex items-start gap-2 text-xs rounded-lg border px-2.5 py-2 cursor-pointer has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50">
                <input type="radio" name="mf_${f.field}" value="survivor" ${f.suggest === 'survivor' ? 'checked' : ''} class="mt-0.5">
                <span class="min-w-0"><span class="block text-[10px] text-gray-400">Mantener (#${s.id})</span>${_fieldValue(f.field, f.survivor)}</span></label>
              <label class="flex items-start gap-2 text-xs rounded-lg border px-2.5 py-2 cursor-pointer has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50">
                <input type="radio" name="mf_${f.field}" value="duplicate" ${f.suggest === 'duplicate' ? 'checked' : ''} class="mt-0.5">
                <span class="min-w-0"><span class="block text-[10px] text-gray-400">Traer del alta (#${d.id})</span>${_fieldValue(f.field, f.duplicate)}</span></label>
            </div>
          </div>`).join('')}</div>` : '<p class="text-xs text-gray-500">No hay datos distintos para traer: las dos tienen lo mismo.</p>'}
      </div>

      <div class="mt-4 bg-gray-50 rounded-xl p-3 text-xs text-gray-700 space-y-1">
        <p class="font-bold text-gray-800">Al fusionar</p>
        <p><i class="fas fa-images text-gray-400 w-4"></i> Pasan a la que queda: ${_mPl(p.moves.photos, 'foto', 'fotos')}, ${_mPl(p.moves.views, 'visita', 'visitas')} y ${_mPl(p.moves.clicks, 'clic', 'clics')} del alta.</p>
        <p><i class="fas fa-user text-gray-400 w-4"></i> ${p.moves.users ? 'La cuenta del alta pasa a la que queda.' : 'La cuenta queda como está (ya es de la que queda).'}</p>
        <p><i class="fas fa-eye-slash text-gray-400 w-4"></i> El alta nueva queda <b>inactiva</b> (no se borra) y su link lleva a la que queda. Su lead pasa a "Fusionado".</p>
        <p><i class="fas fa-rotate-left text-gray-400 w-4"></i> Se puede revertir desde "Fusiones hechas".</p>
      </div>
      ${(p.warnings || []).map(w => `<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2"><i class="fas fa-triangle-exclamation mr-1"></i>${_mEsc(w)}</p>`).join('')}
      ${p.blocked ? `<p class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2"><i class="fas fa-ban mr-1"></i>${_mEsc(p.blocked)}</p>` : ''}

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
        <button type="button" onclick="closeMergeModal()" class="border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
        <button type="button" id="mergeApplyBtn" onclick="applyMergeFromModal()" ${p.blocked ? 'disabled' : ''}
          class="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-bold"><i class="fas fa-code-merge mr-1"></i> Fusionar en #${s.id}</button>
      </div>`;
}

function swapMergeSides() {
    const st = _mergeState; if (!st) return;
    openMergeModal(st.duplicateId, st.survivorId);
}

async function applyMergeFromModal() {
    const st = _mergeState; if (!st) return;
    const p = st.preview;
    const take = (p.fields || []).filter(f => document.querySelector(`input[name="mf_${f.field}"]:checked`)?.value === 'duplicate').map(f => f.field);
    const btn = document.getElementById('mergeApplyBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Fusionando…'; }
    const data = await apiAdminPost('/merges/apply', {
        survivor_id: st.survivorId, duplicate_id: st.duplicateId, take, evidence: p.evidence || [], lead_id: p.lead_id || null,
    });
    if (data && data.success) {
        closeMergeModal();
        if (typeof closeModal === 'function' && !document.getElementById('leadDetailModal')?.classList.contains('hidden')) closeModal('leadDetailModal');
        showToast(`✓ Fusionadas: todo quedó en «${p.survivor.name}»`, 'success');
        if (typeof showNotifyOwnerPanel === 'function' && data.notify) showNotifyOwnerPanel('Fichas fusionadas', data.notify);
        if (typeof loadAdminLeads === 'function') loadAdminLeads(); else loadMergeAssistant();
    } else {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-code-merge mr-1"></i> Fusionar en #${p.survivor.id}`; }
        showToast('Error: ' + ((data && data.error) || 'No se pudo fusionar'), 'error');
    }
}

// ── Aviso dentro del modal del lead ──────────────────────────────────────────
async function fillLeadMergeHint(lead) {
    const el = document.getElementById('leadMergeHint');
    if (!el || !lead || !lead.business_id) return;
    if (lead.business_merged_into) {
        el.innerHTML = `<div class="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm text-gray-700">
            <i class="fas fa-code-merge text-violet-500 mr-1"></i> Esta alta se <b>fusionó</b> con la ficha #${lead.business_merged_into}.
            <button type="button" onclick="toggleMergeHistory(); closeModal('leadDetailModal')" class="underline text-violet-600 ml-1">Ver fusiones</button></div>`;
        return;
    }
    let c = mergeCandidateFor(lead.business_id);
    if (!c) {
        const data = await apiAdminGet(`/merges/candidates?business_id=${lead.business_id}`);
        c = data && data.success && data.data && data.data[0];
    }
    if (!c || !document.getElementById('leadMergeHint')) return;
    el.innerHTML = `<div class="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-4">
        <p class="text-sm text-violet-900"><i class="fas fa-code-merge text-violet-500 mr-1"></i>
          Esta alta parece ser <b>«${_mEsc(c.original.name)}»</b> (#${c.old_id} · ${_mNum(c.original.views)} visitas), que ya existe.</p>
        <ul class="mt-1 space-y-0.5">${(c.evidence || []).map(e => `<li class="text-xs text-violet-800">· ${_mEsc(e.label)}</li>`).join('')}</ul>
        <div class="flex flex-wrap gap-2 mt-2">
          <button type="button" onclick="openMergeModal(${c.old_id}, ${c.new_id})" class="text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5"><i class="fas fa-code-merge mr-1"></i> Revisar y fusionar</button>
          <button type="button" onclick="discardMergeCandidate(${c.old_id}, ${c.new_id}).then(ok => { const h = ok && document.getElementById('leadMergeHint'); if (h) h.innerHTML = ''; })" class="text-xs font-medium bg-white text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">No es la misma</button>
        </div></div>`;
}
