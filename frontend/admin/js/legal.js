// ═══════════════════════════════════════════════════════════════════════════
// Admin → Páginas legales (2026-10-28)
//   Datos del responsable · Términos · Privacidad (editor Markdown con vista
//   previa, versionado, historial y restaurar) · Pedidos sin cuenta · Aviso.
// Backend: /api/v2/admin/legal (routes/legal.routes.js). La vista previa la
// renderiza el servidor con el mismo sanitizador que la página pública.
// ═══════════════════════════════════════════════════════════════════════════
let _legal = { tab: 'datos', cfg: null, md: {}, reqFilter: 'pendiente', previewTimer: null };

const LEGAL_FIELDS = [
    ['legal_razon_social', 'Razón social', 'text', 'HEPTA E.A.S.'],
    ['legal_ruc', 'RUC (con dígito verificador)', 'text', '80117760-0'],
    ['legal_marca_operada', 'Marca operada', 'text', 'RetoPA (marca en trámite …)'],
    ['legal_domicilio', 'Domicilio legal', 'text', 'Calle 123, Asunción, Paraguay'],
    ['legal_email', 'Correo de contacto legal', 'email', 'legal@retopa.com.py'],
    ['legal_representante_nombre', 'Representante para notificaciones (Ley 4868, art. 19)', 'text', 'Nombre y apellido'],
    ['legal_representante_email', 'Correo del representante', 'email', 'representante@…'],
    ['legal_gracia_dias', 'Días de gracia (regla de 2.ª ficha, aún sin aplicar)', 'number', '90'],
];

function legalRucDv(base) {
    const s = String(base).replace(/\D/g, '');
    let k = 2, t = 0;
    for (let i = s.length - 1; i >= 0; i--) { t += (+s[i]) * k; k = k >= 11 ? 2 : k + 1; }
    const r = t % 11;
    return r > 1 ? 11 - r : 0;
}
const legalIsPlaceholder = v => /^\s*<<.*>>\s*$/.test(String(v || ''));

async function initLegalSection() {
    const data = await apiAdminGet('/legal/config');
    const root = document.getElementById('legalRoot');
    if (!data || !data.success) { root.innerHTML = '<div class="text-red-600 p-6">No se pudo cargar la configuración legal. ¿Se corrió la migración 2026-10-28_paginas_legales.sql?</div>'; return; }
    _legal.cfg = data.data;
    renderLegal();
}

function renderLegal() {
    const c = _legal.cfg, root = document.getElementById('legalRoot');
    const pend = (c.requests && c.requests.pendiente) || 0;
    const tab = (k, label) => `<button onclick="legalTab('${k}')" class="px-4 py-2 rounded-lg text-sm font-bold ${_legal.tab === k ? 'bg-[#1B3A6B] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-[#1B3A6B]'}">${label}</button>`;
    const warn = c.placeholders && c.placeholders.length
        ? `<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm mb-4"><i class="fas fa-triangle-exclamation mr-1"></i>
             Hay datos sin completar; en la página pública se ven como «[pendiente de completar]»: <b>${c.placeholders.map(k => escapeHtml(k.replace('legal_', '').replace(/_/g, ' '))).join(', ')}</b>.</div>` : '';
    root.innerHTML = `
      ${warn}
      <div class="flex flex-wrap gap-2 mb-5">
        ${tab('datos', 'Datos del responsable')}
        ${tab('terminos', `Términos · v${escapeHtml(c.pages.terminos.version)}`)}
        ${tab('privacidad', `Privacidad · v${escapeHtml(c.pages.privacidad.version)}`)}
        ${tab('pedidos', `Pedidos${pend ? ` · <span class="text-amber-300">${pend}</span>` : ''}`)}
        ${tab('aviso', `Aviso por correo${c.aviso.pendientes ? ` · ${c.aviso.pendientes}` : ''}`)}
      </div>
      <div id="legalBody"></div>`;
    if (_legal.tab === 'datos') renderLegalDatos();
    else if (_legal.tab === 'pedidos') loadLegalRequests();
    else if (_legal.tab === 'aviso') renderLegalAviso();
    else loadLegalEditor(_legal.tab);
}
function legalTab(k) { _legal.tab = k; renderLegal(); }

// ── Datos del responsable ───────────────────────────────────────────────────
function renderLegalDatos() {
    const v = _legal.cfg.config;
    let fuentes = v.legal_fuentes_publicas || '{}';
    try { fuentes = JSON.stringify(JSON.parse(fuentes), null, 2); } catch (e) {}
    document.getElementById('legalBody').innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-3xl">
      <h3 class="font-bold text-gray-900 mb-1">Datos del responsable</h3>
      <p class="text-xs text-gray-500 mb-5">Se usan en Términos, Privacidad y en el pie del sitio. En los textos van como variables, p. ej. <code>{{legal_ruc}}</code>.</p>
      <div class="grid md:grid-cols-2 gap-4">
        ${LEGAL_FIELDS.map(([k, label, type, ph]) => `
          <div class="${k === 'legal_marca_operada' || k === 'legal_domicilio' ? 'md:col-span-2' : ''}">
            <label class="block text-xs font-bold text-gray-600 mb-1">${escapeHtml(label)}</label>
            <input id="lg_${k}" type="${type === 'number' ? 'number' : 'text'}" ${type === 'number' ? 'min="1" max="365" step="1"' : ''}
                   value="${escapeHtml(legalIsPlaceholder(v[k]) ? '' : v[k])}" placeholder="${escapeHtml(legalIsPlaceholder(v[k]) ? v[k] : ph)}"
                   class="w-full border ${legalIsPlaceholder(v[k]) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'} rounded-lg px-3 py-2 text-sm">
          </div>`).join('')}
        <div class="md:col-span-2">
          <label class="block text-xs font-bold text-gray-600 mb-1">Fichas con atribución de fuente pública (origen → fuente)</label>
          <textarea id="lg_legal_fuentes_publicas" rows="4" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono">${escapeHtml(fuentes)}</textarea>
          <p class="text-[11px] text-gray-500 mt-1">Solo las fichas cuyo <code>source</code> figura acá muestran «Datos de contacto iniciales obtenidos de registros públicos (fuente, fecha)». Agregá un origen recién cuando confirmes que viene de un registro público.</p>
        </div>
        <label class="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
          <input id="lg_legal_mostrar_nota_revision" type="checkbox" ${v.legal_mostrar_nota_revision === 'true' ? 'checked' : ''}>
          Mostrar la nota «en revisión por asesoría jurídica» en las dos páginas
        </label>
      </div>
      <div id="lgDatosErr" class="hidden mt-4 text-sm text-red-600"></div>
      <button onclick="saveLegalDatos()" class="mt-5 btn-brand text-white px-5 py-2.5 rounded-lg text-sm font-bold"><i class="fas fa-save mr-1"></i> Guardar datos</button>
    </div>`;
}

async function saveLegalDatos() {
    const errEl = document.getElementById('lgDatosErr');
    const payload = {}, errs = [];
    for (const [k] of LEGAL_FIELDS) {
        const val = document.getElementById('lg_' + k).value.trim();
        if (val === '' && legalIsPlaceholder(_legal.cfg.config[k])) continue;   // sigue pendiente: no se toca
        payload[k] = val;
    }
    payload.legal_fuentes_publicas = document.getElementById('lg_legal_fuentes_publicas').value.trim() || '{}';
    payload.legal_mostrar_nota_revision = document.getElementById('lg_legal_mostrar_nota_revision').checked ? 'true' : 'false';
    if (payload.legal_ruc !== undefined) {
        const m = payload.legal_ruc.match(/^(\d{3,9})-(\d)$/);
        if (!m) errs.push('El RUC va con guion y dígito verificador (ej.: 80117760-0).');
        else if (legalRucDv(m[1]) !== +m[2]) errs.push(`El dígito verificador del RUC no coincide (debería ser ${legalRucDv(m[1])}).`);
    }
    for (const k of ['legal_email', 'legal_representante_email'])
        if (payload[k] !== undefined && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(payload[k])) errs.push(`Revisá el correo: ${k === 'legal_email' ? 'contacto legal' : 'representante'}.`);
    if (payload.legal_gracia_dias !== undefined && !(/^\d+$/.test(payload.legal_gracia_dias) && +payload.legal_gracia_dias >= 1 && +payload.legal_gracia_dias <= 365))
        errs.push('Días de gracia: entero entre 1 y 365.');
    try { JSON.parse(payload.legal_fuentes_publicas); } catch (e) { errs.push('Fuentes públicas: JSON inválido.'); }
    if (errs.length) { errEl.textContent = errs.join(' '); errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');
    const r = await apiAdminPost('/legal/config', payload, 'PUT');
    if (!r || !r.success) { errEl.textContent = (r && r.error) || 'No se pudo guardar.'; errEl.classList.remove('hidden'); return; }
    showToast('Datos legales guardados. Las páginas se actualizan al instante.', 'success');
    initLegalSection();
}

// ── Editor Markdown ─────────────────────────────────────────────────────────
async function loadLegalEditor(page) {
    const body = document.getElementById('legalBody');
    body.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>';
    const r = await apiAdminGet('/legal/page/' + page);
    if (!r || !r.success) { body.innerHTML = '<div class="text-red-600">No se pudo cargar el texto.</div>'; return; }
    const d = r.data;
    const url = page === 'terminos' ? '/terminos.html' : '/privacidad.html';
    body.innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <h3 class="font-bold text-gray-900 mr-auto">${page === 'terminos' ? 'Términos y Condiciones' : 'Política de Privacidad'}
          <span class="text-xs font-normal text-gray-500">· versión ${escapeHtml(d.version)} del ${escapeHtml(d.fecha)}</span></h3>
        <a href="${url}" target="_blank" class="text-xs font-bold text-[#1B3A6B] hover:underline"><i class="fas fa-up-right-from-square mr-1"></i>Ver publicada</a>
        <button onclick="showLegalHistory('${page}')" class="text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-[#1B3A6B]"><i class="fas fa-clock-rotate-left mr-1"></i>Ver historial</button>
      </div>
      <details class="mb-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
        <summary class="cursor-pointer font-bold">Formato y variables</summary>
        <div class="mt-2 leading-relaxed">
          <b>Formato:</b> <code>## Título {#ancla}</code> (cada <code>##</code> entra al índice) · párrafos separados por una línea en blanco ·
          <code>- ítem</code> · <code>1. ítem</code> · <code>**negrita**</code> · <code>*cursiva*</code> · <code>[texto](https://…)</code> ·
          tablas <code>| a | b |</code> con <code>|---|---|</code> · <code>&gt; nota</code>. El HTML no se interpreta: se muestra como texto.<br>
          <b>Variables</b> (tocá para insertar): ${d.vars.map(v => `<button type="button" onclick="legalInsertVar('{{${v}}}')" class="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 m-0.5 hover:border-[#1B3A6B]">{{${v}}}</button>`).join('')}
        </div>
      </details>
      <div class="grid lg:grid-cols-2 gap-4">
        <textarea id="legalMd" spellcheck="true" class="w-full border border-gray-200 rounded-xl p-3 font-mono text-xs leading-relaxed" style="min-height:620px" oninput="legalSchedulePreview('${page}')">${escapeHtml(d.md)}</textarea>
        <div class="border border-gray-200 rounded-xl p-4 overflow-auto bg-[#F5F7FB]" style="max-height:640px">
          <div id="legalPrevWarn" class="hidden text-xs text-red-600 mb-2"></div>
          <div id="legalPreview" class="legal-preview text-sm text-gray-800"></div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4 mt-4">
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input id="legalSust" type="checkbox"> <b>Cambio sustancial</b>
          <span class="text-xs text-gray-500">(sube la versión mayor, activa el aviso en el sitio 15 días y prepara el correo a los titulares)</span>
        </label>
        <button onclick="publishLegal('${page}')" class="ml-auto btn-brand text-white px-5 py-2.5 rounded-lg text-sm font-bold"><i class="fas fa-upload mr-1"></i> Publicar versión nueva</button>
      </div>
    </div>
    <div id="legalHistory" class="mt-5"></div>`;
    legalPreview(page);
}
function legalInsertVar(v) {
    const ta = document.getElementById('legalMd'); if (!ta) return;
    const a = ta.selectionStart, b = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + v + ta.value.slice(b);
    ta.focus(); ta.selectionStart = ta.selectionEnd = a + v.length;
    ta.dispatchEvent(new Event('input'));
}
function legalSchedulePreview(page) {
    clearTimeout(_legal.previewTimer);
    _legal.previewTimer = setTimeout(() => legalPreview(page), 600);
}
async function legalPreview(page) {
    const ta = document.getElementById('legalMd'); if (!ta) return;
    const r = await apiAdminPost('/legal/preview', { page, md: ta.value });
    const prev = document.getElementById('legalPreview'), warn = document.getElementById('legalPrevWarn');
    if (!prev) return;
    if (!r || !r.success) { prev.textContent = 'No se pudo generar la vista previa.'; return; }
    prev.innerHTML = r.data.html;   // HTML generado y sanitizado por el servidor (helpers/legalMarkdown.js)
    if (r.data.unknownVars.length) { warn.textContent = 'Variables desconocidas: ' + r.data.unknownVars.map(v => `{{${v}}}`).join(', '); warn.classList.remove('hidden'); }
    else warn.classList.add('hidden');
}
async function publishLegal(page) {
    const md = document.getElementById('legalMd').value;
    const sust = document.getElementById('legalSust').checked;
    const msg = sust
        ? '¿Publicar como CAMBIO SUSTANCIAL?\n\nSube la versión mayor, muestra un aviso en el sitio durante 15 días y deja listo el correo a todos los titulares de cuenta (lo mandás vos desde la pestaña «Aviso por correo»).'
        : '¿Publicar esta versión? La página pública cambia al instante.';
    if (!confirm(msg)) return;
    const r = await apiAdminPost('/legal/page/' + page, { md, sustancial: sust });
    if (!r || !r.success) { showToast('Error: ' + ((r && r.error) || 'no se pudo publicar'), 'error'); return; }
    showToast(`Publicada la versión ${r.data.version}.`, 'success');
    initLegalSection();
}

async function showLegalHistory(page) {
    const box = document.getElementById('legalHistory');
    const r = await apiAdminGet('/legal/versions/' + page);
    const rows = (r && r.success && r.data) || [];
    box.innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h4 class="font-bold text-gray-900 mb-3">Historial de versiones</h4>
      ${rows.length ? `<table class="w-full text-sm"><thead><tr class="text-left text-xs text-gray-500"><th class="py-1">Versión</th><th>Publicada</th><th>Por</th><th></th></tr></thead><tbody>
        ${rows.map((v, i) => `<tr class="border-t border-gray-100">
          <td class="py-2 font-bold">${escapeHtml(v.version)} ${v.sustancial ? '<span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">sustancial</span>' : ''} ${i === 0 ? '<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">vigente</span>' : ''}</td>
          <td>${new Date(v.published_at).toLocaleString('es-PY')}</td>
          <td class="text-gray-500">${escapeHtml(v.published_by_name || '—')}</td>
          <td class="text-right whitespace-nowrap">
            <button onclick="viewLegalVersion(${v.id})" class="text-xs font-bold text-[#1B3A6B] hover:underline mr-3">Ver</button>
            ${i === 0 ? '' : `<button onclick="restoreLegalVersion(${v.id}, '${escapeHtml(v.version)}')" class="text-xs font-bold text-amber-700 hover:underline">Restaurar</button>`}
          </td></tr>`).join('')}
      </tbody></table>` : '<p class="text-sm text-gray-500">Sin versiones.</p>'}
      <div id="legalVersionView" class="mt-4"></div>
    </div>`;
}
async function viewLegalVersion(id) {
    const r = await apiAdminGet('/legal/version/' + id);
    const el = document.getElementById('legalVersionView');
    if (!r || !r.success) { el.textContent = 'No se pudo cargar.'; return; }
    el.innerHTML = `<p class="text-xs text-gray-500 mb-1">Versión ${escapeHtml(r.data.version)} (Markdown, solo lectura)</p>
      <textarea readonly class="w-full border border-gray-200 rounded-xl p-3 font-mono text-xs bg-gray-50" style="min-height:300px">${escapeHtml(r.data.content_md)}</textarea>`;
}
async function restoreLegalVersion(id, version) {
    if (!confirm(`¿Restaurar el texto de la versión ${version}?\n\nSe publica como una versión NUEVA (el historial no se borra).`)) return;
    const r = await apiAdminPost(`/legal/version/${id}/restore`, { sustancial: false });
    if (!r || !r.success) { showToast('Error: ' + ((r && r.error) || 'no se pudo restaurar'), 'error'); return; }
    showToast(`Restaurado como versión ${r.data.version}.`, 'success');
    initLegalSection();
}

// ── Pedidos de baja / rectificación / retiro ────────────────────────────────
const LEGAL_TIPO = { baja: 'Baja', rectificacion: 'Rectificación', actualizacion: 'Actualización', retiro: 'Denuncia / retiro' };
const LEGAL_ESTADO = { pendiente: 'Pendiente', en_curso: 'En curso', resuelta: 'Resuelta', rechazada: 'Rechazada' };
async function loadLegalRequests() {
    const body = document.getElementById('legalBody');
    const f = _legal.reqFilter;
    const r = await apiAdminGet('/legal/requests' + (f ? '?estado=' + f : ''));
    const rows = (r && r.success && r.data) || [];
    const counts = _legal.cfg.requests || {};
    const chip = (k, label) => `<button onclick="_legal.reqFilter='${k}';loadLegalRequests()" class="text-xs font-bold px-3 py-1 rounded-full border ${f === k ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]' : 'bg-white text-gray-600 border-gray-200'}">${label}${k && counts[k] ? ' · ' + counts[k] : ''}</button>`;
    const ago = ts => new Date(ts).toLocaleString('es-PY');
    body.innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div class="flex flex-wrap gap-2 mb-1">${chip('pendiente', 'Pendientes')}${chip('en_curso', 'En curso')}${chip('resuelta', 'Resueltas')}${chip('rechazada', 'Rechazadas')}${chip('', 'Todas')}</div>
      <p class="text-xs text-gray-500 mb-4">Plazos: baja / corrección <b>10 días hábiles</b>; denuncias <b>5 días hábiles</b>. Si dudás de quién pide la baja, confirmalo por WhatsApp al número de la ficha.</p>
      ${rows.length ? '' : '<p class="text-sm text-gray-400 py-4">No hay pedidos en este estado.</p>'}
      <div class="space-y-3">${rows.map(x => `
        <div class="border border-gray-100 rounded-xl p-4">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${x.tipo === 'retiro' ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}">${LEGAL_TIPO[x.tipo] || escapeHtml(x.tipo)}</span>
            <b class="text-sm text-gray-900">#${x.id} · ${x.business_name ? `<a href="#" onclick="event.preventDefault(); typeof openBusinessModal==='function' && openBusinessModal(${x.business_id})" class="hover:underline">${escapeHtml(x.business_name)}</a>` : '<span class="text-gray-500">ficha no identificada</span>'}</b>
            <span class="text-xs text-gray-400 ml-auto">${ago(x.created_at)}</span>
          </div>
          <div class="text-xs text-gray-600 break-all">${escapeHtml(x.business_url)}</div>
          <div class="text-sm text-gray-800 mt-2"><b>${escapeHtml(x.nombre)}</b> · ${escapeHtml(x.email_o_whatsapp)}${x.vinculo ? ' · ' + escapeHtml(x.vinculo) : ''}${x.tipo === 'retiro' ? (x.buena_fe ? ' · <span class="text-green-700">declaró buena fe</span>' : '') : ''}</div>
          <div class="text-sm text-gray-700 mt-1 whitespace-pre-line bg-gray-50 rounded-lg p-2">${escapeHtml(x.detalle)}</div>
          <div class="flex flex-wrap items-start gap-2 mt-3">
            <select id="lrEstado${x.id}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">${Object.entries(LEGAL_ESTADO).map(([k, l]) => `<option value="${k}" ${x.estado === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <textarea id="lrNotas${x.id}" rows="1" placeholder="Notas internas (qué se hizo, cuándo se respondió)" class="flex-1 min-w-[220px] border border-gray-200 rounded-lg px-2 py-1.5 text-sm">${escapeHtml(x.notas || '')}</textarea>
            <button onclick="saveLegalRequest(${x.id})" class="btn-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold">Guardar</button>
          </div>
          ${x.resolved_at ? `<div class="text-[11px] text-gray-400 mt-1">Cerrado: ${ago(x.resolved_at)}</div>` : ''}
        </div>`).join('')}</div>
    </div>`;
}
async function saveLegalRequest(id) {
    const r = await apiAdminPost('/legal/requests/' + id, {
        estado: document.getElementById('lrEstado' + id).value,
        notas: document.getElementById('lrNotas' + id).value,
    }, 'PATCH');
    if (!r || !r.success) { showToast('Error: ' + ((r && r.error) || 'no se pudo guardar'), 'error'); return; }
    showToast('Pedido actualizado.', 'success');
    const c = await apiAdminGet('/legal/config');
    if (c && c.success) _legal.cfg = c.data;
    loadLegalRequests();
}

// ── Aviso por correo de cambio sustancial ───────────────────────────────────
function renderLegalAviso() {
    const a = _legal.cfg.aviso, banner = _legal.cfg.banner;
    document.getElementById('legalBody').innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
      <h3 class="font-bold text-gray-900 mb-1">Aviso de cambio sustancial</h3>
      <p class="text-sm text-gray-600 mb-4">Al publicar con «cambio sustancial» se activa el aviso en el sitio por 15 días y queda lista esta lista de correo (titulares de cuenta con correo). El correo usa la plantilla <code>legal_update</code>; podés editar el asunto y el mensaje con las claves <code>tpl_legal_update_subject</code> y <code>tpl_legal_update_message</code>.</p>
      <div class="grid grid-cols-2 gap-3 mb-5 text-sm">
        <div class="bg-gray-50 rounded-xl p-3"><div class="text-xs text-gray-500">Aviso en el sitio hasta</div><b>${banner ? escapeHtml(banner) : '—'}</b></div>
        <div class="bg-gray-50 rounded-xl p-3"><div class="text-xs text-gray-500">Correos pendientes</div><b id="lgAvisoPend">${a.id ? a.pendientes : '—'}</b></div>
      </div>
      ${a.id ? `<p class="text-xs text-gray-500 mb-3">Publicación: <code>${escapeHtml(a.id)}</code>. Se manda en tandas de 25 (≈ 9 s cada una); a quien ya le llegó no se le repite.</p>
        <button id="lgAvisoBtn" onclick="sendLegalAviso()" ${a.pendientes ? '' : 'disabled'} class="btn-brand text-white px-5 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"><i class="fas fa-paper-plane mr-1"></i> Mandar una tanda</button>
        <div id="lgAvisoMsg" class="text-sm text-gray-600 mt-3"></div>`
      : '<p class="text-sm text-gray-500">Todavía no se publicó ningún cambio sustancial.</p>'}
    </div>`;
}
async function sendLegalAviso() {
    const btn = document.getElementById('lgAvisoBtn'), msg = document.getElementById('lgAvisoMsg');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Mandando…';
    const r = await apiAdminPost('/legal/aviso/send', { limit: 25 });
    if (!r || !r.success) { msg.textContent = 'Error: ' + ((r && r.error) || 'no se pudo mandar'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> Mandar una tanda'; return; }
    _legal.cfg.aviso.pendientes = r.data.pendientes;
    document.getElementById('lgAvisoPend').textContent = r.data.pendientes;
    msg.textContent = `Enviados ${r.data.sent}${r.data.failed ? ` · fallaron ${r.data.failed} (ver Logs de correos)` : ''} · quedan ${r.data.pendientes}.`;
    btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> Mandar una tanda';
    btn.disabled = !r.data.pendientes;
}
