/**
 * RetoPA — admin/js/prospects.js
 * Panel de Prospectos: contactar por WhatsApp a fichas cargadas por prospección.
 *
 * - Filtra por origen (source, dropdown desde /prospects/sources), y por rubro /
 *   ciudad / estado / búsqueda (del lado del cliente, para respuesta inmediata).
 * - Tabla AGRUPADA por número de WhatsApp (una fila por número, con sus fichas).
 * - Plantilla de mensaje editable (persistida en localStorage) con placeholders
 *   {nombre} {rubro} {ciudad} {link_ficha}. Para grupos con varias sucursales se
 *   usa la ficha principal (la primera) y un solo {link_ficha}.
 * - Botón WhatsApp: abre wa.me con el mensaje y marca el grupo como 'enviado'.
 * - Envío UNO A UNO desde el WhatsApp del operador (no masivo/automático).
 */
const PROSPECT_TEMPLATE_KEY = 'retopa_prospect_template';
const PROSPECT_DEFAULT_TEMPLATE =
`¡Hola! 👋 Te escribo de RetoPA. Sumamos gratis tu negocio {nombre} ({rubro} · {ciudad}) a nuestro directorio.
Mirá tu ficha acá: {link_ficha}

¿La querés gestionar y aparecer como *verificado*? Te ayudo en 2 minutos. 🙌`;
const PROSPECT_ESTADOS = ['pendiente', 'enviado', 'respondio', 'reclamo', 'rechazo'];
const PROSPECT_ESTADO_LABEL = { pendiente: 'Pendiente', enviado: 'Enviado', respondio: 'Respondió', reclamo: 'Reclamó', rechazo: 'Rechazó' };
const PROSPECT_ESTADO_COLOR = { pendiente: '#64748b', enviado: '#0ea5e9', respondio: '#16a34a', reclamo: '#8b5cf6', rechazo: '#ef4444' };
const PROSPECT_DAILY_WARN = 30; // aviso anti-ban de WhatsApp

let _prospAll = [];       // todos los grupos del origen actual
let _prospSummary = null; // resumen del origen actual

function _pEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _pNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function prospectGetTemplate() {
    try { return localStorage.getItem(PROSPECT_TEMPLATE_KEY) || PROSPECT_DEFAULT_TEMPLATE; }
    catch (e) { return PROSPECT_DEFAULT_TEMPLATE; }
}
function prospectSaveTemplate() {
    const t = document.getElementById('prospTemplate');
    if (!t) return;
    try { localStorage.setItem(PROSPECT_TEMPLATE_KEY, _prospSanitize(t.value)); } catch (e) {}
    const s = document.getElementById('prospTemplateSaved');
    if (s) { s.textContent = 'Guardada ✓'; setTimeout(() => { s.textContent = ''; }, 1500); }
}

// Quita caracteres de reemplazo (U+FFFD "�") que dejan los emojis pegados desde
// una fuente mal codificada, y colapsa el espacio doble que suele quedar. Así el
// mensaje que va a WhatsApp nunca lleva un "�" (el operador ya no tiene que
// borrarlo y reescribir el emoji). Los emojis REALES (👋, 🙌, etc.) pasan intactos.
function _prospSanitize(s) {
    return String(s == null ? '' : s)
        .replace(/�/g, '')          // caracteres rotos
        .replace(/[ \t]{2,}/g, ' ')      // espacios dobles que quedan al sacarlos
        .replace(/ +\n/g, '\n');         // espacios colgando al final de línea
}

// Construye el mensaje para un grupo usando su ficha PRINCIPAL (la primera).
function prospectBuildMessage(group) {
    const f = (group.fichas && group.fichas[0]) || {};
    const tplEl = document.getElementById('prospTemplate');
    const tpl = tplEl ? tplEl.value : prospectGetTemplate();
    const msg = tpl
        .replace(/\{nombre\}/g, f.trade_name || f.name || '')
        .replace(/\{rubro\}/g, f.rubro || '')
        .replace(/\{ciudad\}/g, f.ciudad || '')
        .replace(/\{link_ficha\}/g, f.ficha_url || '');
    return _prospSanitize(msg);
}

// Inserta un emoji REAL en la posición del cursor de la plantilla (evita pegar
// emojis rotos desde otras fuentes). Guarda y re-renderiza la vista previa.
function prospectInsertEmoji(ch) {
    const t = document.getElementById('prospTemplate');
    if (!t) return;
    const start = t.selectionStart != null ? t.selectionStart : t.value.length;
    const end   = t.selectionEnd   != null ? t.selectionEnd   : t.value.length;
    t.value = t.value.slice(0, start) + ch + t.value.slice(end);
    const pos = start + ch.length;
    t.focus(); try { t.setSelectionRange(pos, pos); } catch (e) {}
    prospectSaveTemplate();
    if (typeof prospectRenderTable === 'function') prospectRenderTable();
}

async function initProspectsSection() {
    const root = document.getElementById('prospectsSection');
    if (!root) return;
    root.innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <h3 class="text-lg font-black text-gray-900"><i class="fab fa-whatsapp text-green-500 mr-1"></i> Prospectos por WhatsApp</h3>
                <p class="text-sm text-gray-500 mt-0.5">Contactá una vez por número. El envío es manual, desde tu WhatsApp.</p>
            </div>
            <div id="prospCounters" class="text-sm"></div>
        </div>
        <div id="prospWarn" class="hidden mt-3 text-sm rounded-xl px-4 py-2.5" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a"></div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Plantilla del mensaje
            <span class="normal-case font-normal text-gray-400">— placeholders: {nombre} {rubro} {ciudad} {link_ficha}</span>
        </label>
        <textarea id="prospTemplate" rows="4" oninput="prospectSaveTemplate(); prospectRenderTable();"
            class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0ea5e9]"></textarea>
        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
            <span class="text-xs text-gray-400 mr-1">Insertar emoji:</span>
            ${['👋','🙌','✅','📍','📞','🏪','⭐','🔧','💬','🙂'].map(e =>
                `<button type="button" onclick="prospectInsertEmoji('${e}')" title="Insertar ${e}"
                    class="text-base leading-none w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50">${e}</button>`).join('')}
        </div>
        <div class="text-xs text-gray-400 mt-1">Se guarda en este navegador. Usá estos botones para poner emojis (los pegados de otro lado pueden llegar rotos a WhatsApp). <span id="prospTemplateSaved" class="text-green-600 font-semibold"></span></div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Origen</label>
                <select id="prospSource" onchange="prospectLoad()" class="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-gray-50"></select>
            </div>
            <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Rubro</label>
                <select id="prospRubro" onchange="prospectRenderTable()" class="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-gray-50"><option value="">Todos</option></select>
            </div>
            <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Ciudad</label>
                <select id="prospCiudad" onchange="prospectRenderTable()" class="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-gray-50"><option value="">Todas</option></select>
            </div>
            <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Estado</label>
                <select id="prospEstado" onchange="prospectRenderTable()" class="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-gray-50">
                    <option value="">Todos</option>
                    ${PROSPECT_ESTADOS.map(e => `<option value="${e}">${PROSPECT_ESTADO_LABEL[e]}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Buscar</label>
                <input id="prospSearch" oninput="prospectRenderTable()" placeholder="Nombre…" class="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-gray-50">
            </div>
        </div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-4 py-3">Ficha(s)</th>
                        <th class="text-left px-4 py-3">Rubro · Ciudad</th>
                        <th class="text-left px-4 py-3">WhatsApp</th>
                        <th class="text-left px-4 py-3">Estado</th>
                        <th class="text-left px-4 py-3">Notas</th>
                        <th class="text-left px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody id="prospTableBody"></tbody>
            </table>
        </div>
        <div id="prospEmpty" class="hidden text-center text-gray-400 py-12">Sin prospectos para este filtro.</div>
    </div>`;

    const tpl = document.getElementById('prospTemplate');
    if (tpl) tpl.value = prospectGetTemplate();

    await prospectLoadSources();
    await prospectLoad();
}

async function prospectLoadSources() {
    const sel = document.getElementById('prospSource');
    if (!sel) return;
    const res = await apiAdminGet('/prospects/sources');
    const sources = (res && res.success && Array.isArray(res.data)) ? res.data : [];
    // Preferir 'prospeccion_agente' si existe; si no, el de mayor conteo.
    let def = sources.find(s => s.source === 'prospeccion_agente');
    if (!def && sources.length) def = sources[0];
    sel.innerHTML = sources.map(s => `<option value="${_pEsc(s.source)}">${_pEsc(s.source)} (${s.count})</option>`).join('');
    if (def) sel.value = def.source;
}

async function prospectLoad() {
    const sel = document.getElementById('prospSource');
    const source = sel ? sel.value : '';
    const body = document.getElementById('prospTableBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i> Cargando…</td></tr>';
    if (!source) { _prospAll = []; _prospSummary = null; prospectRenderTable(); prospectRenderCounters(); return; }

    const res = await apiAdminGet('/prospects?source=' + encodeURIComponent(source));
    _prospAll = (res && res.success && Array.isArray(res.data)) ? res.data : [];
    _prospSummary = (res && res.summary) || null;

    // Poblar dropdowns de rubro y ciudad desde el dataset completo del origen.
    const rubros = new Map(), ciudades = new Set();
    _prospAll.forEach(g => g.fichas.forEach(f => {
        if (f.rubro_slug && f.rubro) rubros.set(f.rubro_slug, f.rubro);
        if (f.ciudad) ciudades.add(f.ciudad);
    }));
    const rubroSel = document.getElementById('prospRubro');
    const ciudadSel = document.getElementById('prospCiudad');
    if (rubroSel) rubroSel.innerHTML = '<option value="">Todos</option>' + [...rubros.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([slug, name]) => `<option value="${_pEsc(slug)}">${_pEsc(name)}</option>`).join('');
    if (ciudadSel) ciudadSel.innerHTML = '<option value="">Todas</option>' + [...ciudades].sort((a, b) => a.localeCompare(b)).map(c => `<option value="${_pEsc(c)}">${_pEsc(c)}</option>`).join('');

    prospectRenderCounters();
    prospectRenderTable();
}

// Filtros client-side (rubro/ciudad/estado/búsqueda). Los contadores quedan sobre
// el TOTAL del origen (progreso global), no sobre el filtro.
function prospectFilteredGroups() {
    const rubro  = (document.getElementById('prospRubro')  || {}).value || '';
    const ciudad = (document.getElementById('prospCiudad') || {}).value || '';
    const estado = (document.getElementById('prospEstado') || {}).value || '';
    const q = _pNorm((document.getElementById('prospSearch') || {}).value || '');
    return _prospAll.filter(g => {
        if (estado && (g.estado || 'pendiente') !== estado) return false;
        if (rubro  && !g.fichas.some(f => f.rubro_slug === rubro)) return false;
        if (ciudad && !g.fichas.some(f => f.ciudad === ciudad)) return false;
        if (q && !g.fichas.some(f => _pNorm(f.trade_name || f.name).includes(q))) return false;
        return true;
    });
}

function prospectRenderCounters() {
    const el = document.getElementById('prospCounters');
    if (!el) return;
    // Recalcular sobre TODOS los grupos del origen (no el filtro).
    const s = { enviados_hoy: 0, por_estado: {} };
    PROSPECT_ESTADOS.forEach(e => s.por_estado[e] = 0);
    const now = new Date();
    _prospAll.forEach(g => {
        const e = g.estado || 'pendiente';
        if (s.por_estado[e] != null) s.por_estado[e]++;
        if (g.fecha_contacto) {
            const f = new Date(g.fecha_contacto);
            if (f.getFullYear() === now.getFullYear() && f.getMonth() === now.getMonth() && f.getDate() === now.getDate()) s.enviados_hoy++;
        }
    });
    el.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap justify-end">
            <span class="font-bold text-gray-900">Enviados hoy: <span id="prospSentToday">${s.enviados_hoy}</span></span>
            ${PROSPECT_ESTADOS.map(e => `<span class="text-[11px] font-bold px-2 py-1 rounded-lg" style="background:${PROSPECT_ESTADO_COLOR[e]}1a;color:${PROSPECT_ESTADO_COLOR[e]}">${PROSPECT_ESTADO_LABEL[e]}: ${s.por_estado[e]}</span>`).join('')}
        </div>`;
    const warn = document.getElementById('prospWarn');
    if (warn) {
        if (s.enviados_hoy >= PROSPECT_DAILY_WARN) {
            warn.classList.remove('hidden');
            warn.innerHTML = `<i class="fas fa-triangle-exclamation mr-1"></i> Ya enviaste <b>${s.enviados_hoy}</b> mensajes hoy. Para evitar bloqueos de WhatsApp, conviene espaciar los envíos.`;
        } else {
            warn.classList.add('hidden');
        }
    }
}

function prospectRenderTable() {
    const body = document.getElementById('prospTableBody');
    const empty = document.getElementById('prospEmpty');
    if (!body) return;
    const groups = prospectFilteredGroups();
    if (!groups.length) {
        body.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    body.innerHTML = groups.map(g => {
        const f0 = g.fichas[0] || {};
        const nombres = g.fichas.map(f => _pEsc(f.trade_name || f.name)).join('<br>');
        const multi = g.count > 1 ? `<span class="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded ml-1">×${g.count}</span>` : '';
        const rubroCiudad = `${_pEsc(f0.rubro || '—')} · ${_pEsc(f0.ciudad || '—')}`;
        const estado = g.estado || 'pendiente';
        const hasWa = !!g.whatsapp;
        const waKey = hasWa ? g.whatsapp : '';
        const fecha = g.fecha_contacto ? new Date(g.fecha_contacto).toLocaleDateString('es-PY') : '';

        const waCell = hasWa
            ? `<span class="font-mono text-xs text-gray-700">+${_pEsc(g.whatsapp)}</span>`
            : `<span class="text-xs text-amber-600 font-semibold"><i class="fas fa-ban mr-1"></i>sin WhatsApp</span>`;

        const estadoSel = hasWa
            ? `<select onchange="prospectSetEstado('${waKey}', this.value)" class="text-xs border border-gray-200 rounded-lg px-2 py-1.5" style="color:${PROSPECT_ESTADO_COLOR[estado]};font-weight:700">
                    ${PROSPECT_ESTADOS.map(e => `<option value="${e}" ${e === estado ? 'selected' : ''}>${PROSPECT_ESTADO_LABEL[e]}</option>`).join('')}
               </select>${fecha ? `<div class="text-[10px] text-gray-400 mt-0.5">${fecha}</div>` : ''}`
            : `<span class="text-xs text-gray-400">—</span>`;

        const notas = hasWa
            ? `<input value="${_pEsc(g.notas || '')}" placeholder="Notas…" onblur="prospectSaveNotas('${waKey}', this.value)" class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-40">`
            : `<span class="text-xs text-gray-300">—</span>`;

        const waBtn = hasWa
            ? `<button onclick="prospectWhatsApp('${waKey}')" class="inline-flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-lg" style="background:#0F7A43"><i class="fab fa-whatsapp"></i> WhatsApp</button>`
            : `<button disabled class="inline-flex items-center gap-1.5 text-gray-400 text-xs font-bold px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed"><i class="fab fa-whatsapp"></i> WhatsApp</button>`;

        return `<tr class="border-t border-gray-50 align-top" data-wa="${_pEsc(waKey)}">
            <td class="px-4 py-3 text-gray-900 font-medium">${nombres}${multi}
                ${f0.ficha_url ? `<a href="${_pEsc(f0.ficha_url)}" target="_blank" class="block text-[11px] text-brand-500 hover:underline mt-0.5">ver ficha ↗</a>` : ''}
            </td>
            <td class="px-4 py-3 text-gray-600">${rubroCiudad}</td>
            <td class="px-4 py-3">${waCell}</td>
            <td class="px-4 py-3">${estadoSel}</td>
            <td class="px-4 py-3">${notas}</td>
            <td class="px-4 py-3">${waBtn}</td>
        </tr>`;
    }).join('');
}

// Abre wa.me con el mensaje y marca el grupo como 'enviado'.
function prospectWhatsApp(whatsapp) {
    if (!whatsapp) return;
    const group = _prospAll.find(g => g.whatsapp === whatsapp);
    if (!group) return;
    const msg = prospectBuildMessage(group);
    // Respaldo: dejamos el mensaje limpio (con sus emojis) en el portapapeles, así
    // si el prefill de WhatsApp llega a mostrar algo raro, se pega con un Ctrl/Cmd+V
    // en vez de reescribir. Best-effort, no bloquea la apertura del chat.
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg); } catch (e) {}
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    if (typeof showToast === 'function') showToast('Chat abierto. Mensaje copiado por si necesitás pegarlo (Ctrl/Cmd+V).', 'success');
    // Marcar 'enviado' con fecha (no pisa un estado más avanzado si el operador ya lo movió).
    prospectSetEstado(whatsapp, 'enviado', true);
}

async function prospectSetEstado(whatsapp, estado, fromSend) {
    if (!whatsapp) return;
    const res = await apiAdminPost('/prospects/outreach/' + encodeURIComponent(whatsapp), { estado }, 'PATCH');
    if (res && res.success) {
        const g = _prospAll.find(x => x.whatsapp === whatsapp);
        if (g && res.data) { g.estado = res.data.estado; g.fecha_contacto = res.data.fecha_contacto; if (res.data.notas != null) g.notas = res.data.notas; }
        prospectRenderCounters();
        prospectRenderTable();
    } else if (typeof showToast === 'function') {
        showToast('No se pudo actualizar el estado', 'error');
    }
}

async function prospectSaveNotas(whatsapp, notas) {
    if (!whatsapp) return;
    const g = _prospAll.find(x => x.whatsapp === whatsapp);
    const estado = (g && g.estado) || 'pendiente';
    const res = await apiAdminPost('/prospects/outreach/' + encodeURIComponent(whatsapp), { estado, notas }, 'PATCH');
    if (res && res.success && g && res.data) { g.notas = res.data.notas; g.estado = res.data.estado; }
}
