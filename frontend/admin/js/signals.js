// ── D9.4 — Disparadores de venta (vista admin) ──────────────────────────────
const SIG_META = {
  onb_bienvenida:     { label:'Bienvenida / Onboarding', cls:'bg-emerald-100 text-emerald-700', ev:e=>`Ficha recién verificada${e && e.city?' · '+e.city:''}` },
  t4_fundador_d75:    { label:'Fundador por vencer',     cls:'bg-blue-100 text-blue-700',     ev:e=>`${_sigVence(e)} · ${e.views_30d||0} visitas 30d` },
  t3_boost_vencido:   { label:'Boost exitoso',           cls:'bg-blue-100 text-blue-700',     ev:e=>`${e.views_during} vs ${e.views_prev} visitas (durante/antes)` },
  t2_destacado_datos: { label:'Con datos para Destacar', cls:'bg-blue-100 text-blue-700',     ev:e=>`${e.views_30d||0} visitas · ${e.wa_30d||0} WA (30d)` },
  t5_candidato_hc:    { label:'Candidato Hepta Cloud',   cls:'bg-purple-100 text-purple-700', ev:e=>`RUC ${e.ruc||'—'} · ${e.rubro||''}` },
  t1_listo_boost:     { label:'Listo para Boost',        cls:'bg-amber-100 text-amber-700',   ev:e=>`Ficha ${e.completion}% completa` },
  t6_ficha_abandonada:{ label:'Ficha por completar',     cls:'bg-rose-100 text-rose-700',     ev:e=>`Faltan ${e.missing_count||0} datos (${e.completion}%)` },
};
const SIG_STATUS = {
  nueva:'bg-green-100 text-green-700', vista:'bg-sky-100 text-sky-700', contactado:'bg-indigo-100 text-indigo-700',
  convertida:'bg-emerald-100 text-emerald-700', descartada:'bg-gray-100 text-gray-500', expirada:'bg-gray-100 text-gray-400',
};
const SIG_THRESH = [
  { key:'signals_cooldown_days', label:'Cooldown (días)', type:'number' },
  { key:'signals_ttl_days', label:'Expiración (días)', type:'number' },
  { key:'signal_t1_completion', label:'T1 · completitud mín (%)', type:'number' },
  { key:'signal_t1_days', label:'T1 · reclamada desde (días)', type:'number' },
  { key:'signal_t1_days_max', label:'T1 · reclamada hasta (días)', type:'number' },
  { key:'signal_t2_views', label:'T2 · visitas 30d ≥', type:'number' },
  { key:'signal_t2_clicks', label:'T2 · clics WA 30d ≥', type:'number' },
  { key:'signal_t3_days', label:'T3 · boost vencido ≤ (días)', type:'number' },
  { key:'signal_t4_enabled', label:'T4 · habilitado', type:'bool' },
  { key:'signal_t4_days_before', label:'T4 · días antes de vencer', type:'number' },
  { key:'signal_t5_categories', label:'T5 · categorías (slugs)', type:'text' },
  { key:'signal_t5_wa', label:'T5 · clics WA 30d ≥', type:'number' },
  { key:'signal_t5_active_days', label:'T5 · actividad (días)', type:'number' },
  { key:'signal_t6_completion', label:'T6 · completitud < (%)', type:'number' },
  { key:'signal_onboarding_ttl_days', label:'Onboarding · expiración (días)', type:'number' },
  { key:'signal_msg_onb_bienvenida', label:'Onboarding · mensaje ({business})', type:'text' },
];
let _sigAmbs = [];
let _sigDebTimer = null;
function _sigDebounce(){ clearTimeout(_sigDebTimer); _sigDebTimer = setTimeout(loadSignalsList, 350); }
function _sigAge(iso){ try { const d=Math.floor((Date.now()-new Date(iso).getTime())/86400000); return d<=0?'hoy':(d+'d'); } catch(e){ return ''; } }
// Diferencia en DÍAS CALENDARIO (hora local) entre una fecha y hoy. Es lo
// intuitivo para "vence hoy / mañana / hace Xd" sin que 2 horas cuenten como día.
function _calDaysFromNow(iso){
  const exp = new Date(iso); if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const a = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime())/86400000);
}
// Recalcula "vence en Xd" EN VIVO desde evidence.expires_at (no el snapshot
// congelado days_left). Si ya pasó, muestra "venció hace Xd" en rojo.
function _sigVence(e){
  let d = (e && e.days_left != null) ? e.days_left : null;
  if (e && e.expires_at){ const c = _calDaysFromNow(e.expires_at); if (c != null) d = c; }
  if (d == null) return 'Fundador por vencer';
  if (d > 1)    return `Vence en ${d}d`;
  if (d === 1)  return 'Vence mañana';
  if (d === 0)  return '<span class="text-amber-600 font-semibold">Vence hoy</span>';
  return `<span class="text-rose-600 font-semibold">Venció hace ${Math.abs(d)}d</span>`;
}

// C2 — Regenerar señales on-demand: corre el job de generación (mismo que el
// cron) y recarga la lista. No envía emails de digest.
let _sigRegenerating = false;
async function regenerateSignals(){
  if (_sigRegenerating) return;
  _sigRegenerating = true;
  const btn = document.getElementById('btnRegenSignals');
  const prev = btn ? btn.innerHTML : '';
  if (btn){ btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Regenerando…'; }
  let res;
  try { res = await apiAdminPost('/signals/regenerate', {}); } catch(e){ res = null; }
  if (btn){ btn.disabled = false; btn.innerHTML = prev; }
  _sigRegenerating = false;
  if (res && res.success){
    showToast(`✅ Señales: ${res.created||0} nuevas · ${res.expired||0} expiradas · ${res.autoclosed||0} auto-cerradas`);
    loadSignals();
  } else {
    showToast('No se pudieron regenerar: ' + ((res && res.error) || 'error'), 'error');
  }
}

async function loadSignals(){
  // Resumen + embajadores + umbrales, y luego la lista
  let s;
  try { s = await apiAdminGet('/signals/summary'); } catch(e){ s = null; }
  if (s && s.success) {
    _sigAmbs = s.data.ambassadors || [];
    renderSignalsSummary(s.data);
    // poblar filtro de embajadores (conservando opciones fijas)
    const sel = document.getElementById('sigFAmbassador');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = `<option value="">Todos los embajadores</option><option value="none">⚠ Sin embajador</option>` +
        _sigAmbs.map(a=>`<option value="${a.id}">${escapeHtml(a.name||a.email)}</option>`).join('');
      sel.value = cur;
    }
    const badge = document.getElementById('signalsBadge');
    if (badge) { badge.textContent = s.data.active; badge.classList.toggle('hidden', !s.data.active); }
  }
  loadSignalThresholds();
  loadSignalsList();
}

function renderSignalsSummary(d){
  const cont = document.getElementById('signalsSummary');
  if (!cont) return;
  const conv = (d.by_trigger||[]).filter(t=>t.cerradas>0).sort((a,b)=>(b.rate||0)-(a.rate||0));
  const convHtml = conv.length
    ? conv.map(t=>`<div class="flex items-center justify-between text-xs"><span class="text-gray-500">${(SIG_META[t.trigger_key]||{label:t.trigger_key}).label}</span><span class="font-bold text-gray-800">${t.rate}% <span class="text-gray-400 font-normal">(${t.convertidas}/${t.cerradas})</span></span></div>`).join('')
    : '<p class="text-xs text-gray-400">Sin cierres aún</p>';
  cont.innerHTML = `
    <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm"><h3 class="text-2xl font-black text-gray-900">${d.active}</h3><p class="text-sm text-gray-500 mt-1">Señales activas</p></div>
    <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm"><h3 class="text-2xl font-black text-gray-900">${d.created_month}</h3><p class="text-sm text-gray-500 mt-1">Generadas este mes</p></div>
    <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm col-span-2"><p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Conversión por trigger</p><div class="space-y-1">${convHtml}</div></div>`;
}

async function loadSignalsList(){
  const body = document.getElementById('signalsBody');
  if (!body) return;
  body.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-400">Cargando…</td></tr>`;
  const p = new URLSearchParams();
  const g = id => document.getElementById(id)?.value || '';
  if (g('sigFStatus')) p.set('status', g('sigFStatus'));
  if (g('sigFTrigger')) p.set('trigger', g('sigFTrigger'));
  if (g('sigFProduct')) p.set('product', g('sigFProduct'));
  if (g('sigFAmbassador')) p.set('ambassador_id', g('sigFAmbassador'));
  if (g('sigFCity')) p.set('city', g('sigFCity'));
  let res;
  try { res = await apiAdminGet('/signals?' + p.toString()); } catch(e){ res = null; }
  if (!res || !res.success) { body.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500">No se pudo cargar.</td></tr>`; return; }
  const rows = res.data || [];
  if (!rows.length) { body.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-400">Sin señales para este filtro.</td></tr>`; return; }

  const ambOpts = (sel) => `<option value="">— sin embajador —</option>` + _sigAmbs.map(a=>`<option value="${a.id}" ${String(a.id)===String(sel)?'selected':''}>${escapeHtml(a.name||a.email)}</option>`).join('');

  body.innerHTML = rows.map(r => {
    const m = SIG_META[r.trigger_key] || { label:r.trigger_key, cls:'bg-gray-100 text-gray-600', ev:()=>'' };
    const active = ['nueva','vista','contactado'].includes(r.status);
    const noAmb = r.assigned_ambassador_id == null;
    return `<tr class="hover:bg-gray-50 ${noAmb && active ? 'bg-rose-50/40' : ''}">
      <td class="px-4 py-3">
        <p class="font-semibold text-gray-800">${escapeHtml(r.business_name||'—')} <span class="text-[11px] px-2 py-0.5 rounded-full font-bold ${m.cls}">${m.label}</span></p>
        <p class="text-xs text-gray-400 mt-0.5">${escapeHtml(r.city||'')} · ${m.ev(r.evidence||{})}</p>
      </td>
      <td class="px-4 py-3">
        ${active
          ? `<select onchange="assignSignal(${r.id}, this.value)" class="border ${noAmb?'border-rose-300 bg-rose-50':'border-gray-200'} rounded-lg px-2 py-1 text-xs max-w-[150px]">${ambOpts(r.assigned_ambassador_id)}</select>`
          : `<span class="text-xs text-gray-500">${escapeHtml(r.ambassador_name||'—')}</span>`}
      </td>
      <td class="px-4 py-3"><span class="text-[11px] px-2 py-0.5 rounded-full font-bold ${SIG_STATUS[r.status]||'bg-gray-100 text-gray-500'}">${r.status}</span><span class="block text-[11px] text-gray-400 mt-1">${_sigAge(r.created_at)}</span></td>
      <td class="px-4 py-3 text-right">
        ${active ? `<div class="flex gap-1 justify-end">
           <button onclick="closeSignal(${r.id},'convertida')" class="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 font-bold" title="Marcar convertida"><i class="fas fa-trophy"></i></button>
           <button onclick="closeSignal(${r.id},'descartada')" class="text-xs bg-gray-50 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-100" title="Descartar"><i class="fas fa-xmark"></i></button>
         </div>` : `<span class="text-xs text-gray-400">${r.note ? escapeHtml(r.note) : ''}</span>`}
      </td>
    </tr>`;
  }).join('');
}

async function assignSignal(id, ambassadorId){
  const res = await apiAdminPost(`/signals/${id}/assign`, { ambassador_id: ambassadorId || null });
  if (res && res.success) { showToast('Embajador actualizado'); loadSignals(); }
  else showToast('Error: ' + ((res&&res.error)||'no se pudo'), 'error');
}

async function closeSignal(id, status){
  let note = null;
  if (status === 'descartada') { note = prompt('Motivo del descarte (opcional):', ''); if (note === null) return; }
  else if (!confirm('¿Marcar esta señal como CONVERTIDA (se vendió el producto)?')) return;
  const res = await apiAdminPost(`/signals/${id}/close`, { status, note });
  if (res && res.success) { showToast(status === 'convertida' ? 'Marcada como convertida ✅' : 'Señal descartada'); loadSignals(); }
  else showToast('Error: ' + ((res&&res.error)||'no se pudo'), 'error');
}

async function loadSignalThresholds(){
  const cont = document.getElementById('signalThresholds');
  if (!cont) return;
  let res;
  try { res = await apiAdminGet('/site-config'); } catch(e){ res = null; }
  const cfg = (res && res.success && res.data) ? res.data : {};
  cont.innerHTML = SIG_THRESH.map(t => {
    const v = cfg[t.key] != null ? cfg[t.key] : '';
    if (t.type === 'bool') {
      return `<div class="flex items-center justify-between gap-2">
        <label class="text-xs text-gray-600">${t.label}</label>
        <select id="th_${t.key}" class="border border-gray-200 rounded-lg px-2 py-1 text-xs"><option value="true" ${v==='true'?'selected':''}>Sí</option><option value="false" ${v!=='true'?'selected':''}>No</option></select>
      </div>`;
    }
    return `<div class="flex items-center justify-between gap-2">
      <label class="text-xs text-gray-600">${t.label}</label>
      <input id="th_${t.key}" type="${t.type==='number'?'number':'text'}" value="${escapeHtml(v)}" class="border border-gray-200 rounded-lg px-2 py-1 text-xs ${t.type==='text'?'w-40':'w-20'} text-right">
    </div>`;
  }).join('');
}

async function saveSignalThresholds(){
  const payload = {};
  SIG_THRESH.forEach(t => { const el = document.getElementById('th_'+t.key); if (el) payload[t.key] = String(el.value).trim(); });
  const res = await apiAdminPost('/site-config', payload, 'PUT');
  if (res && res.success) showToast('Umbrales guardados ✅ (se aplican en la próxima corrida del job)');
  else showToast('Error: ' + ((res&&res.error)||'no se pudo guardar'), 'error');
}
