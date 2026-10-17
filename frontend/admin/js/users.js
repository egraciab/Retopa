/**
 * RetoPA Admin — js/users.js
 * Usuarios: dark mode, debounce, CRUD usuarios
 */

// ================================================================
// USUARIOS
// ================================================================
// ================================================================
// DARK MODE
// ================================================================
function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('adminDarkMode', isDark ? '1' : '0');
    document.getElementById('darkToggleIcon').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}
// Init dark mode from saved preference
if (localStorage.getItem('adminDarkMode') === '1') {
    document.documentElement.classList.add('dark');
    document.addEventListener('DOMContentLoaded', () => {
        const icon = document.getElementById('darkToggleIcon');
        if (icon) icon.className = 'fas fa-sun';
    });
}

// ================================================================
// DEBOUNCE utility
// ================================================================
function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ================================================================
// USUARIOS
// ================================================================
let currentUserPage = 1;
let _usersById = {};
// Rol del admin logueado (del JWT) — para no ofrecer lo que el backend rechaza.
function _adminSelf() {
    try { return JSON.parse(atob((getAdminToken() || '').split('.')[1] || '')) || {}; } catch (e) { return {}; }
}
// +5959XXXXXXXX → +595 981 123 456
// "usar": el WhatsApp de su ficha pasa a ser el de su cuenta (con confirmación).
// Mismo PUT que el modal (mismas validaciones y guardas); no cambia nada más.
async function adoptFichaWa(id) {
    const u = _usersById[id];
    if (!u || !u.owned_wa) return;
    if (!confirm(`¿Usar ${_fmtWa(u.owned_wa)} (WhatsApp de su ficha «${u.owned_name || ''}») como WhatsApp de la cuenta de ${u.name || 'este usuario'}?\n\nCon ese número va a poder entrar sin contraseña.`)) return;
    const res = await apiAdminPost(`/users/${id}`, { name: u.name || u.email || 'Usuario', email: u.email || '', phone: '+' + u.owned_wa, role: u.role, is_active: u.is_active }, 'PUT');
    if (res && res.success) { showToast('WhatsApp guardado en la cuenta', 'success'); if (typeof loadAdminUsers === 'function') loadAdminUsers(currentUserPage); }
    else showToast('Error: ' + ((res && res.error) || 'No se pudo guardar'), 'error');
}

function _fmtWa(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    const m = d.match(/^(?:595|0)?(9\d{2})(\d{3})(\d{3})$/);
    return m ? `+595 ${m[1]} ${m[2]} ${m[3]}` : (phone || '');
}
async function loadAdminUsers(page = 1) {
    currentUserPage = page;
    const q        = document.getElementById('userSearch')?.value?.trim() || '';
    const role     = document.getElementById('userFilterRole')?.value || '';
    const status   = document.getElementById('userFilterStatus')?.value || '';
    const inactive = document.getElementById('userFilterInactive')?.value || '';
    let url = `/users?limit=25&page=${page}`;
    if (q)        url += `&q=${encodeURIComponent(q)}`;
    if (role)     url += `&role=${role}`;
    if (status !== '')   url += `&is_active=${status}`;
    if (inactive !== '') url += `&inactive_days=${encodeURIComponent(inactive)}`;

    const data = await apiAdminGet(url);
    if (!data.success) { showToast('Error cargando usuarios', 'error'); return; }

    const rows = data.data;
    _usersById = {}; rows.forEach(u => { _usersById[u.id] = u; });
    const meSelf = _adminSelf();
    // KPIs GLOBALES (del backend). Fallback a conteo por página si no vinieran.
    const s = data.stats || {};
    document.getElementById('userStatTotal').textContent  = s.total   ?? (data.pagination?.total || rows.length);
    document.getElementById('userStatActive').textContent = s.active  ?? rows.filter(u => u.is_active).length;
    document.getElementById('userStatClient').textContent = s.clients ?? rows.filter(u => u.role === 'client').length;
    document.getElementById('userStatAdmin').textContent  = s.admins  ?? rows.filter(u => u.role === 'admin').length;
    document.getElementById('userStatGod').textContent    = s.godmode ?? rows.filter(u => u.role === 'godmode').length;

    document.getElementById('usersTable').innerHTML = rows.length === 0
        ? '<tr><td colspan="8" class="px-6 py-8 text-center text-gray-400"><i class="fas fa-users text-2xl mb-2 block text-gray-300"></i>No se encontraron usuarios</td></tr>'
        : rows.map(u => `
        <tr class="table-row transition">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                        ${u.role === 'godmode' ? 'bg-red-100 text-red-600' : u.role === 'admin' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-gray-100 text-gray-600'}">
                        ${(u.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                        <p class="font-medium text-gray-900 text-sm truncate">${escapeHtml(u.name || 'Sin nombre')}</p>
                        <p class="text-xs text-gray-500 truncate">${u.email
                            ? `${escapeHtml(u.email)} ${u.email_verified
                                ? '<i class="fas fa-circle-check text-emerald-500" title="Correo confirmado"></i>'
                                : '<span class="text-amber-600" title="Todavía no tocó el enlace de confirmación">· sin confirmar</span>'}`
                            : '<span class="text-emerald-600">Sin correo · entra por WhatsApp</span>'}</p>
                        ${u.phone
                            ? `<p class="text-xs text-gray-400 truncate"><i class="fab fa-whatsapp text-green-500 mr-1"></i>${escapeHtml(_fmtWa(u.phone))}${u.phone_verified ? ' <i class="fas fa-circle-check text-emerald-500" title="WhatsApp probado: es el número de su ficha"></i>' : ''}${u.has_password === false ? ' · <span class="text-amber-600">sin contraseña</span>' : ''}</p>`
                            : (u.owned_wa ? `<p class="text-xs text-gray-400 truncate italic" title="Es el WhatsApp de su ficha, no de su usuario"><i class="fab fa-whatsapp text-gray-300 mr-1"></i>ficha: ${escapeHtml(_fmtWa(u.owned_wa))}${u.role !== 'admin' && u.role !== 'godmode'
                                ? ` <button type="button" onclick="adoptFichaWa(${u.id})" class="not-italic font-semibold text-green-600 hover:underline ml-1" title="Usar este número como WhatsApp de su cuenta">usar</button>` : ''}</p>` : '')}
                        ${u.owned_name ? `<button type="button" onclick="openBusinessModal(${Number(u.owned_id) || 0})" class="md:hidden block max-w-full text-left text-[11px] text-[#0ea5e9] hover:underline truncate"><i class="fas fa-store mr-1"></i>${escapeHtml(u.owned_name)}</button>` : ''}
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 col-hide-mobile">
                <select onchange="changeUserRole(${u.id}, this.value)" ${String(meSelf.id) === String(u.id) || (u.role === 'godmode' && meSelf.role !== 'godmode') ? 'disabled title="No se puede cambiar este rol"' : ''}
                    class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                    <option value="user"    ${u.role === 'user'    ? 'selected' : ''}>Usuario</option>
                    <option value="client"  ${u.role === 'client'  ? 'selected' : ''}>Cliente</option>
                    <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
                    ${meSelf.role === 'godmode' || u.role === 'godmode' ? `<option value="godmode" ${u.role === 'godmode' ? 'selected' : ''}>GodMode</option>` : ''}
                </select>
            </td>
            <td class="px-6 py-4">
                ${u.is_active
                    ? '<span class="badge badge-verified"><i class="fas fa-check"></i> Activo</span>'
                    : '<span class="badge badge-inactive"><i class="fas fa-ban"></i> Inactivo</span>'}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 col-hide-mobile">${u.city || '<span class="text-gray-300">—</span>'}</td>
            <td class="px-6 py-4 text-sm text-gray-600 col-hide-mobile">
                ${u.owned_name
                    ? `<button type="button" onclick="openBusinessModal(${Number(u.owned_id) || 0})" class="u-biz text-left font-medium text-[#0ea5e9] hover:underline max-w-[220px] truncate block" title="Ver / editar la ficha">${escapeHtml(u.owned_name)}</button>
                       ${u.business_count > 1 ? `<span class="text-[11px] text-gray-400">+${u.business_count - 1} más</span>` : ''}`
                    : `<span class="text-gray-300">${u.business_count ? u.business_count + ' (delegadas)' : '—'}</span>`}
            </td>
            <td class="px-6 py-4 text-sm col-hide-mobile">${userLastSeenLabel(u.last_seen_at)}</td>
            <td class="px-6 py-4 text-sm text-gray-500 col-hide-mobile">${formatDateShort(u.created_at)}</td>
            <td class="px-6 py-4">
                <div class="flex gap-1 justify-end">
                    ${['admin','godmode'].includes(u.role)
                        ? `<button disabled class="text-xs bg-gray-50 text-gray-300 px-2.5 py-1.5 rounded-lg cursor-not-allowed" title="Los administradores entran con contraseña (sin link de acceso)">
                               <i class="fab fa-whatsapp"></i></button>`
                        : `<button onclick="sendAccessLink(${u.id})"
                        class="text-xs bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition" title="Link de acceso por WhatsApp (un solo uso, 7 días)">
                        <i class="fab fa-whatsapp"></i>
                    </button>`}
                    <button onclick="openSendEmailToUser(${u.id},'${escapeHtml((u.email||'').replace(/'/g,"\\'"))}','${escapeHtml((u.name||'').replace(/'/g,"\\'"))}','${u.owned_slug||''}')"
                        class="text-xs bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition" title="Enviar correo / plantilla">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                    <button onclick="openEditUserModal(${u.id})"
                        class="text-xs bg-blue-50 text-[#0ea5e9] px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition" title="Editar usuario">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="toggleUserStatus(${u.id}, ${!u.is_active})"
                        class="text-xs ${u.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'} px-2.5 py-1.5 rounded-lg transition">
                        <i class="fas ${u.is_active ? 'fa-ban' : 'fa-check'}"></i>
                        ${u.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onclick="deleteUser(${u.id}, '${escapeHtml((u.name||u.email||'').replace(/'/g,"\\'"))}')"
                        class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition" title="Eliminar usuario">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');

    const p = data.pagination;
    if (p) {
        document.getElementById('userPaginationInfo').textContent =
            `${Math.min((p.page-1)*p.limit+1, p.total)}-${Math.min(p.page*p.limit, p.total)} de ${p.total} usuarios`;
        let html = '';
        if (p.page > 1) html += `<button onclick="loadAdminUsers(${p.page-1})" class="px-3 py-1 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"><i class="fas fa-chevron-left"></i></button>`;
        for (let i = Math.max(1,p.page-2); i <= Math.min(p.pages||1,p.page+2); i++)
            html += `<button onclick="loadAdminUsers(${i})" class="px-3 py-1 border ${i===p.page?'bg-[#0ea5e9] text-white border-[#0ea5e9]':'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
        if (p.page < (p.pages||1)) html += `<button onclick="loadAdminUsers(${p.page+1})" class="px-3 py-1 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"><i class="fas fa-chevron-right"></i></button>`;
        document.getElementById('userPaginationControls').innerHTML = html;
    }
}

// Etiqueta relativa del último acceso (last_seen_at), con color por recencia.
function userLastSeenLabel(ts) {
    if (!ts) return '<span class="text-gray-300">Nunca</span>';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '<span class="text-gray-300">—</span>';
    const min = (Date.now() - d.getTime()) / 60000;
    const days = min / 1440;
    if (min < 5) return '<span class="text-green-600 font-medium"><i class="fas fa-circle text-[7px] mr-1"></i>En línea</span>';
    if (d.toDateString() === new Date().toDateString())
        return `<span class="text-gray-700">Hoy ${d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>`;
    if (days < 2) return '<span class="text-gray-600">Ayer</span>';
    if (days < 30) return `<span class="text-gray-500">hace ${Math.floor(days)} días</span>`;
    if (days < 365) return `<span class="text-amber-600">hace ${Math.floor(days / 30)} mes(es)</span>`;
    return '<span class="text-red-500">hace +1 año</span>';
}

// Enviar una plantilla por correo a un usuario (invitarlo a usar el sistema, tips…).
// Reusa /notify/send-template; si el usuario tiene ficha propia, la usa como origen
// de datos para los placeholders ({businessName}, etc.).
function openSendEmailToUser(id, email, name, ownedSlug) {
    document.getElementById('sendUserEmailModal')?.remove();
    const defs = (typeof TEMPLATE_DEFS !== 'undefined') ? TEMPLATE_DEFS : [];
    const opts = defs.map(t => `<option value="${t.key}">${escapeHtml(t.label || t.key)}</option>`).join('');
    const modal = document.createElement('div');
    modal.id = 'sendUserEmailModal';
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-gray-900"><i class="fas fa-paper-plane text-emerald-500 mr-2"></i>Enviar correo</h3>
          <button onclick="document.getElementById('sendUserEmailModal').remove()" class="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-sm text-gray-500 mb-1">Para: <span class="font-medium text-gray-800">${escapeHtml(name || '')}</span></p>
        <p class="text-xs text-gray-400 mb-4">${escapeHtml(email || '')} ${ownedSlug ? '· usa su ficha como datos' : '· sin ficha propia'}</p>
        <label class="form-label">Plantilla</label>
        <select id="userEmailTemplate" class="form-input mb-2">${opts || '<option value="">(sin plantillas)</option>'}</select>
        <p class="text-[11px] text-gray-400 mb-4">Se env&iacute;a un correo REAL y queda en Logs de correos.</p>
        <div class="flex gap-2 justify-end">
          <button onclick="document.getElementById('sendUserEmailModal').remove()" class="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onclick="sendTemplateToUser('${escapeHtml((email || '').replace(/'/g, "\\'"))}','${ownedSlug || ''}')" class="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600"><i class="fas fa-paper-plane mr-1"></i> Enviar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
}
async function sendTemplateToUser(email, ownedSlug) {
    const sel = document.getElementById('userEmailTemplate');
    const tpl = sel ? sel.value : '';
    if (!tpl) return showToast('Eleg&iacute; una plantilla', 'error');
    const label = (sel && sel.options[sel.selectedIndex]) ? sel.options[sel.selectedIndex].text : tpl;
    if (!confirm(`¿Enviar la plantilla "${label}" a ${email}?`)) return;
    const res = await apiAdminPost('/notify/send-template', { template: tpl, to: email, business_slug: ownedSlug || '' });
    if (res && res.success) {
        showToast(`Correo enviado a ${email} ✅`);
        document.getElementById('sendUserEmailModal')?.remove();
        if (typeof loadEmailLogs === 'function') setTimeout(loadEmailLogs, 1500);
    } else {
        showToast('Error: ' + ((res && res.error) || 'No se pudo enviar'), 'error');
    }
}

// ================================================================
// ENVÍO EN LOTE — plantilla a TODO el segmento filtrado (reactivación, etc.)
// ================================================================
// Lee los MISMOS filtros del listado (rol/estado/sin acceso/búsqueda) y manda
// una plantilla al segmento, con cooldown por destinatario para no spamear.
function _bulkParams() {
    const p = {};
    const q        = document.getElementById('userSearch')?.value?.trim() || '';
    const role     = document.getElementById('userFilterRole')?.value || '';
    const status   = document.getElementById('userFilterStatus')?.value ?? '';
    const inactive = document.getElementById('userFilterInactive')?.value || '';
    const tpl      = document.getElementById('bulkTemplate')?.value || '';
    const cd       = parseInt(document.getElementById('bulkCooldown')?.value, 10);
    const lim      = parseInt(document.getElementById('bulkLimit')?.value, 10);
    if (tpl)             p.template = tpl;
    if (q)               p.q = q;
    if (role)            p.role = role;
    if (status !== '')   p.is_active = status;        // 'true' | 'false'
    if (inactive !== '') p.inactive_days = inactive;  // '7'|'30'|'90'
    p.cooldown_days = Number.isFinite(cd) ? cd : 7;
    if (Number.isFinite(lim) && lim > 0) p.limit = lim;
    return p;
}

function _bulkSegmentText() {
    const role     = document.getElementById('userFilterRole')?.value || '';
    const status   = document.getElementById('userFilterStatus')?.value ?? '';
    const inactive = document.getElementById('userFilterInactive')?.value || '';
    const q        = document.getElementById('userSearch')?.value?.trim() || '';
    const parts = [];
    parts.push(role ? `rol=${role}` : 'todos los roles');
    if (status === 'true') parts.push('activos'); else if (status === 'false') parts.push('inactivos');
    if (inactive) parts.push(`sin acceso +${inactive} días`);
    if (q) parts.push(`búsqueda "${q}"`);
    return parts.join(' · ');
}

function openBulkEmailModal() {
    document.getElementById('bulkEmailModal')?.remove();
    const defs = (typeof TEMPLATE_DEFS !== 'undefined') ? TEMPLATE_DEFS : [];
    const opts = defs.map(t => `<option value="${t.key}" ${t.key === 'reactivation' ? 'selected' : ''}>${escapeHtml(t.label || t.key)}</option>`).join('');
    const modal = document.createElement('div');
    modal.id = 'bulkEmailModal';
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-gray-900"><i class="fas fa-bullhorn text-emerald-500 mr-2"></i>Enviar plantilla al segmento</h3>
          <button onclick="document.getElementById('bulkEmailModal').remove()" class="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-xs text-gray-500 mb-4">Segmento actual (según los filtros de arriba): <span class="font-semibold text-gray-700">${escapeHtml(_bulkSegmentText())}</span></p>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="col-span-2">
            <label class="block text-xs font-semibold text-gray-500 mb-1">Plantilla</label>
            <select id="bulkTemplate" class="form-input">${opts || '<option value="">(sin plantillas)</option>'}</select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1" title="No re-manda esta plantilla al mismo email dentro de N días">Cooldown (días)</label>
            <input type="number" id="bulkCooldown" min="0" max="365" value="7" class="form-input">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1" title="Máximo a enviar en esta tanda">Tope por tanda</label>
            <input type="number" id="bulkLimit" min="1" value="500" class="form-input">
          </div>
        </div>
        <div class="flex items-center gap-2 mb-3">
          <button onclick="recalcBulk()" class="px-4 py-2 rounded-lg text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700"><i class="fas fa-calculator mr-1"></i> Recalcular</button>
          <span class="text-[11px] text-gray-400">Simula sin enviar.</span>
        </div>
        <div id="bulkResult" class="hidden text-sm rounded-xl p-3 mb-3"></div>
        <div class="flex gap-2 justify-end">
          <button onclick="document.getElementById('bulkEmailModal').remove()" class="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button id="bulkSendBtn" onclick="sendBulk()" class="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600"><i class="fas fa-paper-plane mr-1"></i> Enviar al segmento</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    recalcBulk(); // primer cálculo automático
}

function _bulkShow(html, kind) {
    const box = document.getElementById('bulkResult');
    if (!box) return;
    box.className = 'text-sm rounded-xl p-3 mb-3 ' + (kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200');
    box.innerHTML = html;
}

async function recalcBulk() {
    const p = _bulkParams();
    if (!p.template) return _bulkShow('Elegí una plantilla', 'error');
    _bulkShow('<i class="fas fa-spinner fa-spin mr-1"></i> Recalculando…');
    const res = await apiAdminPost('/users/bulk-email', { ...p, preview: true });
    if (!res || !res.success) return _bulkShow('Error: ' + ((res && res.error) || 'no se pudo calcular'), 'error');
    const sample = (res.sample || []).map(u => `${escapeHtml(u.name || u.email)}${u.owned_name ? ` · ${escapeHtml(u.owned_name)}` : ''}`).join('<br>');
    _bulkShow(`
        <p class="font-bold">📊 Se enviarían <span class="text-base">${res.would_send.toLocaleString()}</span> correos${
            res.eligible > res.would_send ? ` (tope; ${res.eligible.toLocaleString()} elegibles)` : ''
        }.</p>
        <p class="text-xs mt-1">${res.matched.toLocaleString()} en el segmento · ${res.skipped_cooldown.toLocaleString()} saltados por cooldown (${res.cooldown_days}d)</p>
        ${sample ? `<div class="text-xs text-gray-500 mt-2 pt-2 border-t border-emerald-200">Primeros: ${sample}</div>` : ''}`);
}

async function sendBulk() {
    const p = _bulkParams();
    if (!p.template) return showToast('Elegí una plantilla', 'error');
    const pre = await apiAdminPost('/users/bulk-email', { ...p, preview: true });
    if (!pre || !pre.success) return showToast('Error: ' + ((pre && pre.error) || 'no se pudo calcular'), 'error');
    if (!pre.would_send) return showToast('No hay destinatarios elegibles (revisá filtros/cooldown)', 'error');
    const label = document.getElementById('bulkTemplate');
    const tplLabel = label && label.options[label.selectedIndex] ? label.options[label.selectedIndex].text : p.template;
    if (!confirm(`¿Enviar "${tplLabel}" a ${pre.would_send.toLocaleString()} usuarios del segmento?\n\n${_bulkSegmentText()}\n→ ${pre.skipped_cooldown} saltados por cooldown (${pre.cooldown_days}d)\n→ Rate limit: 3 emails/segundo`)) return;
    const btn = document.getElementById('bulkSendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Enviando…'; }
    _bulkShow('<i class="fas fa-spinner fa-spin mr-1"></i> Enviando campaña… no cierres esta ventana.');
    const res = await apiAdminPost('/users/bulk-email', p);
    if (res && res.success) {
        let msg = `✅ ${res.sent.toLocaleString()} enviados${res.failed ? `, ${res.failed} fallidos` : ''}`;
        if (res.remaining) msg += ` · quedan ${res.remaining.toLocaleString()} para la próxima tanda`;
        _bulkShow(msg);
        showToast(msg);
        if (typeof loadEmailLogs === 'function') setTimeout(loadEmailLogs, 1500);
    } else {
        _bulkShow('Error: ' + ((res && res.error) || 'no se pudo enviar'), 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> Enviar al segmento'; }
}

async function changeUserRole(id, role) {
    // (el backend valida: rol propio, GodMode solo por GodMode)
    const res = await apiAdminPost(`/users/${id}/role`, { role }, 'PUT');
    if (res.success) { showToast('Rol actualizado'); loadAdminUsers(currentUserPage); }
    else showToast('Error: ' + (res.error || 'No se pudo actualizar'), 'error');
}

async function toggleUserStatus(id, isActive) {
    const res = await apiAdminPost(`/users/${id}/status`, { is_active: isActive }, 'PUT');
    if (res.success) { showToast(isActive ? 'Usuario activado' : 'Usuario desactivado'); loadAdminUsers(currentUserPage); }
    else showToast('Error: ' + (res.error || 'No se pudo actualizar'), 'error');
}

async function deleteUser(id, name) {
    if (!confirm(`¿Eliminar al usuario "${name}"?\nEsta acción no se puede deshacer.`)) return;
    const res = await apiAdminPost(`/users/${id}`, {}, 'DELETE');
    if (res.success) { showToast('Usuario eliminado'); loadAdminUsers(currentUserPage); }
    else showToast('Error: ' + (res.error || 'No se pudo eliminar'), 'error');
}

function openNewUserModal() {
    const modal = document.createElement('div');
    modal.id = 'newUserModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50" onclick="closeNewUserModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 class="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <i class="fas fa-user-plus text-[#0ea5e9]"></i> Nuevo Usuario
                </h3>
                <button onclick="closeNewUserModal()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="newUserForm" class="px-6 py-4 space-y-4">
                <div id="newUserError" class="hidden bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"></div>
                <div>
                    <label class="form-label">Nombre <span class="text-red-500">*</span></label>
                    <input type="text" name="name" class="form-input" required placeholder="Nombre completo">
                </div>
                <div>
                    <label class="form-label">Email <span class="text-red-500">*</span></label>
                    <input type="email" name="email" class="form-input" required placeholder="usuario@email.com">
                </div>
                <div>
                    <label class="form-label">Teléfono</label>
                    <input type="text" name="phone" class="form-input" placeholder="0981000000">
                </div>
                <div>
                    <label class="form-label">Contraseña <span class="text-red-500">*</span></label>
                    <div class="relative">
                        <input type="password" name="password" id="newUserPwd" class="form-input pr-10" required minlength="8" placeholder="Mínimo 8 caracteres">
                        <button type="button" onclick="document.getElementById('newUserPwd').type = document.getElementById('newUserPwd').type === 'password' ? 'text' : 'password'"
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="form-label">Rol</label>
                    <select name="role" class="form-input">
                        <option value="user">Usuario</option>
                        <option value="client">Cliente</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <div class="flex gap-3 pt-2 border-t border-gray-100">
                    <button type="button" onclick="closeNewUserModal()" class="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition">Cancelar</button>
                    <button type="submit" class="flex-1 bg-[#0ea5e9] text-white py-2.5 rounded-xl font-bold hover:bg-[#0284c7] transition flex items-center justify-center gap-2">
                        <i class="fas fa-user-plus"></i> Crear usuario
                    </button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('newUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const fd = new FormData(this);
        const payload = {
            name: (fd.get('name')||'').trim(),
            email: (fd.get('email')||'').trim().toLowerCase(),
            phone: (fd.get('phone')||'').trim() || null,
            password: fd.get('password'),
            role: fd.get('role'),
        };
        const errEl = document.getElementById('newUserError');
        errEl.classList.add('hidden');
        const btn = this.querySelector('[type=submit]');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creando...';
        const res = await apiAdminPost('/users', payload);
        if (res.success) {
            showToast('Usuario creado correctamente ✅');
            closeNewUserModal();
            loadAdminUsers(1);
        } else {
            errEl.textContent = res.error || 'Error al crear el usuario';
            errEl.classList.remove('hidden');
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Crear usuario';
        }
    });
}

function closeNewUserModal() {
    document.getElementById('newUserModal')?.remove();
}


// ================================================================
// EDITAR USUARIO — modal con rol, estado, reset clave y empresas
// ================================================================
function openEditUserModal(id) {
    const u = _usersById[id];
    if (!u) { showToast('Recargá la lista e intentá de nuevo', 'error'); return; }
    document.getElementById('editUserModal')?.remove();
    const me = _adminSelf();
    const self = String(me.id) === String(u.id);
    const isAdminRole = ['admin', 'godmode'].includes(u.role);
    const roleLocked = self || (u.role === 'godmode' && me.role !== 'godmode');
    const canGod = me.role === 'godmode' || u.role === 'godmode';
    const waLocal = (() => { const m = String(u.phone || '').replace(/\D/g, '').match(/^(?:595|0)?(9\d{8})$/); return m ? m[1].replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3') : ''; })();
    const ROLE_LBL = { user: 'Usuario', client: 'Cliente', admin: 'Admin', godmode: 'GodMode' };
    const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0ea5e9] focus:border-[#0ea5e9] outline-none';
    const modal = document.createElement('div');
    modal.id = 'editUserModal';
    modal.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50" onclick="closeEditUserModal()"></div>
        <div class="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div class="w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0 ${u.role === 'godmode' ? 'bg-red-100 text-red-600' : u.role === 'admin' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-gray-100 text-gray-600'}">${escapeHtml((u.name || 'U').charAt(0).toUpperCase())}</div>
                <div class="min-w-0 flex-1">
                    <h3 class="font-bold text-gray-900 truncate">${escapeHtml(u.name || 'Sin nombre')}</h3>
                    <p class="text-xs text-gray-500 truncate">${ROLE_LBL[u.role] || u.role} · ${u.is_active ? 'Activo' : 'Inactivo'} · Último acceso: ${userLastSeenLabel(u.last_seen_at).replace(/<[^>]+>/g, '')}</p>
                </div>
                <button onclick="closeEditUserModal()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 shrink-0" title="Cerrar"><i class="fas fa-times"></i></button>
            </div>
            <div class="px-5 py-4 space-y-4">
                <div id="editUserError" class="hidden bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"></div>

                ${u.owned_name ? `
                <div class="flex items-stretch bg-sky-50 border border-sky-100 rounded-xl overflow-hidden">
                    <button type="button" id="editUserBizMain" onclick="openBusinessModal(${Number(u.owned_id) || 0})" title="Ver / editar la ficha"
                       class="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-sky-100 transition">
                        <i class="fas fa-store text-sky-600"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-[11px] uppercase tracking-wide font-bold text-sky-700">Negocio principal</p>
                            <p class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(u.owned_name)}</p>
                        </div>
                        <span class="text-xs font-bold text-sky-700 whitespace-nowrap"><i class="fas fa-edit mr-1"></i>Ver ficha</span>
                    </button>
                    <a href="/negocio/${encodeURIComponent(u.owned_slug || '')}" target="_blank" rel="noopener" id="editUserBizPublic" title="Abrir la ficha pública"
                       class="flex items-center px-3 border-l border-sky-100 text-sky-500 hover:bg-sky-100"><i class="fas fa-external-link-alt text-xs"></i></a>
                </div>` : ''}

                <div>
                    <p class="text-[11px] uppercase tracking-wide font-bold text-gray-400 mb-2">Datos de contacto</p>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1" for="editUserName">Nombre</label>
                            <input id="editUserName" class="${inp}" value="${escapeHtml(u.name || '')}" autocomplete="off">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1" for="editUserPhone">WhatsApp</label>
                            <div class="flex items-stretch border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#0ea5e9]">
                                <span class="flex items-center px-3 bg-gray-50 border-r border-gray-200 text-gray-700 font-semibold text-sm whitespace-nowrap">🇵🇾 +595</span>
                                <input id="editUserPhone" type="tel" inputmode="tel" class="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none" placeholder="981 123 456" value="${escapeHtml(waLocal)}">
                            </div>
                            ${u.phone && !waLocal ? `<p class="text-xs text-amber-600 mt-1">Guardado hoy: ${escapeHtml(u.phone)} (no es un celular válido)</p>` : ''}
                            <div id="editUserWaSuggest"></div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1" for="editUserEmail">Correo <span class="text-gray-400 font-normal">(opcional)</span></label>
                            <input id="editUserEmail" type="email" class="${inp}" value="${escapeHtml(u.email || '')}" placeholder="correo@ejemplo.com" autocomplete="off">
                        </div>
                    </div>
                </div>

                <div>
                    <p class="text-[11px] uppercase tracking-wide font-bold text-gray-400 mb-2">Acceso</p>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1" for="editUserRole">Rol</label>
                            <select id="editUserRole" class="${inp} bg-white disabled:opacity-60" ${roleLocked ? 'disabled title="No se puede cambiar este rol"' : ''}>
                                <option value="user"   ${u.role === 'user'   ? 'selected' : ''}>Usuario</option>
                                <option value="client" ${u.role === 'client' ? 'selected' : ''}>Cliente</option>
                                <option value="admin"  ${u.role === 'admin'  ? 'selected' : ''}>Admin</option>
                                ${canGod ? `<option value="godmode" ${u.role === 'godmode' ? 'selected' : ''}>GodMode</option>` : ''}
                            </select>
                        </div>
                        <label class="flex items-center gap-2 mt-6 text-sm text-gray-700 font-medium ${self ? 'opacity-60' : ''}">
                            <input type="checkbox" id="editUserActive" class="w-4 h-4 rounded border-gray-300" ${u.is_active ? 'checked' : ''} ${self ? 'disabled' : ''}> Usuario activo
                        </label>
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm font-medium text-gray-700 mb-1" for="editUserNewPass">
                            ${u.has_password === false ? 'Crear contraseña' : 'Nueva contraseña'} <span class="text-gray-400 font-normal text-xs">(vacío = no cambiar)</span>
                        </label>
                        <div class="relative">
                            <input type="password" id="editUserNewPass" class="${inp} pr-10" placeholder="Mín. 8 caracteres" autocomplete="new-password">
                            <button type="button" onclick="const i=document.getElementById('editUserNewPass');i.type=i.type==='password'?'text':'password'" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><i class="fas fa-eye"></i></button>
                        </div>
                        ${u.has_password === false ? '<p class="text-xs text-gray-500 mt-1">Hoy no tiene contraseña: entra con link de acceso.</p>' : ''}
                    </div>
                    ${isAdminRole ? '' : `
                    <button type="button" id="editUserAccessBtn" onclick="sendAccessLink(${u.id})"
                        class="mt-3 w-full flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-sm py-2.5 rounded-xl transition">
                        <i class="fab fa-whatsapp"></i> Mandar link de acceso por WhatsApp
                    </button>`}
                </div>

                <div class="border border-gray-200 rounded-xl overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <span class="text-sm font-semibold text-gray-700"><i class="fas fa-building text-gray-400 mr-1"></i> Empresas asignadas</span>
                        <span id="editUserBizCount" class="text-xs text-gray-400">Cargando...</span>
                    </div>
                    <div id="editUserBizList" class="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                        <div class="px-4 py-3 text-center text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</div>
                    </div>
                </div>
            </div>
            <div class="flex gap-3 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
                <button onclick="closeEditUserModal()" class="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition">Cancelar</button>
                <button id="editUserSave" onclick="saveEditUser(${u.id})" class="flex-1 bg-[#0ea5e9] text-white py-2.5 rounded-xl font-bold hover:bg-[#0284c7] transition flex items-center justify-center gap-2">
                    <i class="fas fa-save"></i> Guardar cambios
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    loadUserBusinesses(u.id);
    if (!waLocal) loadUserContactSuggestions(u.id);
}

// Sin WhatsApp en el usuario: sugerencias CON FUENTE (su ficha, su formulario).
// Nada se guarda solo: un toque llena el campo y después se guarda.
async function loadUserContactSuggestions(userId) {
    const box = document.getElementById('editUserWaSuggest');
    if (!box) return;
    const res = await apiAdminGet(`/users/${userId}/contact-suggestions`);
    const list = (res && res.success && res.data) || [];
    if (!list.length) { box.innerHTML = '<p class="text-xs text-gray-400 mt-1">No dejó WhatsApp en su usuario ni en su ficha.</p>'; return; }
    box.innerHTML = `
        <p class="text-xs text-gray-500 mt-2 mb-1">Sin WhatsApp en su usuario. Encontramos:</p>
        <div class="flex flex-col gap-1">${list.map(sg => `
            <button type="button" class="wa-sug text-left text-xs border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg px-2.5 py-1.5"
                    onclick="useWaSuggestion('${sg.wa}')">
                <i class="fab fa-whatsapp text-green-600 mr-1"></i><b>${escapeHtml(_fmtWa(sg.wa))}</b>
                <span class="text-gray-500"> · ${escapeHtml(sg.source)}</span> <span class="text-green-700 font-bold">Usar</span>
            </button>`).join('')}
        </div>`;
}
function useWaSuggestion(wa) {
    const m = String(wa).match(/^595(9\d{2})(\d{3})(\d{3})$/);
    const el = document.getElementById('editUserPhone');
    if (el && m) { el.value = `${m[1]} ${m[2]} ${m[3]}`; el.focus(); }
    showToast('WhatsApp cargado — tocá "Guardar cambios" para confirmarlo');
}

function closeEditUserModal() {
    document.getElementById('editUserModal')?.remove();
}

async function loadUserBusinesses(userId) {
    const list = document.getElementById('editUserBizList');
    const count = document.getElementById('editUserBizCount');
    if (!list) return;
    const data = await apiAdminGet(`/users/${userId}/businesses`);
    if (!data.success || !data.data.length) {
        list.innerHTML = '<div class="px-4 py-4 text-center text-sm text-gray-400">Sin empresas asignadas</div>';
        if (count) count.textContent = '0 empresas';
        return;
    }
    if (count) count.textContent = `${data.data.length} empresa${data.data.length !== 1 ? 's' : ''}`;
    list.innerHTML = data.data.map(b => `
        <div class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition" id="ubiz_${b.id}">
            <div class="flex-1 min-w-0">
                <button type="button" onclick="openBusinessModal(${Number(b.id) || 0})" class="block max-w-full text-left text-sm font-semibold text-[#0ea5e9] hover:underline truncate" title="Ver / editar la ficha">${escapeHtml(b.trade_name || b.name)}</button>
                <p class="text-xs text-gray-400">${b.city || ''}${b.is_owner ? ' · <span class="text-amber-600 font-medium">Propietario</span>' : ' · Delegado'}</p>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${b.plan_type === 'premium' ? 'bg-blue-100 text-blue-700' : b.plan_type === 'featured' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}">${b.plan_type}</span>
            <button onclick="removeUserBusiness(${userId}, ${b.id}, '${escapeHtml((b.trade_name||b.name).replace(/'/g,"\\'"))}')"
                class="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition flex-shrink-0" title="Desafectar esta empresa">
                <i class="fas fa-unlink"></i>
            </button>
        </div>`).join('');
}

async function removeUserBusiness(userId, bizId, bizName) {
    if (!confirm(`¿Desafectar "${bizName}" de este usuario?\nEl usuario ya no tendrá acceso a esta empresa.`)) return;
    const res = await apiAdminPost(`/users/${userId}/businesses/${bizId}`, {}, 'DELETE');
    if (res.success) {
        document.getElementById(`ubiz_${bizId}`)?.remove();
        showToast(`"${bizName}" desafectada ✅`);
        // Actualizar contador
        const list = document.getElementById('editUserBizList');
        const count = document.getElementById('editUserBizCount');
        if (list && count) {
            const remaining = list.querySelectorAll('[id^="ubiz_"]').length;
            count.textContent = `${remaining} empresa${remaining !== 1 ? 's' : ''}`;
            if (remaining === 0) list.innerHTML = '<div class="px-4 py-4 text-center text-sm text-gray-400">Sin empresas asignadas</div>';
        }
    } else {
        showToast('Error: ' + (res.error || 'No se pudo desafectar'), 'error');
    }
}

async function saveEditUser(id) {
    const errEl = document.getElementById('editUserError');
    const btn = document.getElementById('editUserSave');
    const showErr = (msg, field) => {
        errEl.textContent = msg; errEl.classList.remove('hidden');
        const map = { name: 'editUserName', email: 'editUserEmail', phone: 'editUserPhone', password: 'editUserNewPass' };
        const el = map[field] && document.getElementById(map[field]);
        if (el) { el.focus(); el.classList.add('ring-2', 'ring-red-300'); setTimeout(() => el.classList.remove('ring-2', 'ring-red-300'), 2500); }
    };
    errEl.classList.add('hidden');
    const name = document.getElementById('editUserName').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const phoneRaw = document.getElementById('editUserPhone').value.trim();
    const newPass = document.getElementById('editUserNewPass').value;
    const roleEl = document.getElementById('editUserRole');
    const activeEl = document.getElementById('editUserActive');
    if (!name) return showErr('El nombre es obligatorio', 'name');
    const digits = phoneRaw.replace(/\D/g, '');
    const m = digits.match(/^(?:595|0)?(9\d{8})$/);
    if (phoneRaw && !m) return showErr('WhatsApp inválido (ej: 981 123 456)', 'phone');
    if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return showErr('Correo inválido', 'email');
    if (!email && !m) return showErr('Dejá al menos un correo o un WhatsApp para que pueda entrar', 'email');
    if (newPass && newPass.length < 8) return showErr('La contraseña debe tener al menos 8 caracteres', 'password');

    const body = { name, email, phone: m ? '+595' + m[1] : '' };
    if (!roleEl.disabled) body.role = roleEl.value;
    if (!activeEl.disabled) body.is_active = activeEl.checked;
    if (newPass) body.password = newPass;
    btn.disabled = true;
    const res = await apiAdminPost(`/users/${id}`, body, 'PUT');
    btn.disabled = false;
    if (!res || !res.success) return showErr((res && res.error) || 'No se pudo guardar', res && res.field);
    showToast('Usuario actualizado ✅');
    closeEditUserModal();
    loadAdminUsers(currentUserPage);
}
