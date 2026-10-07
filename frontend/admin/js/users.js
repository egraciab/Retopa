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
async function loadAdminUsers(page = 1) {
    currentUserPage = page;
    const q        = document.getElementById('userSearch')?.value?.trim() || '';
    const role     = document.getElementById('userFilterRole')?.value || '';
    const status   = document.getElementById('userFilterStatus')?.value || '';
    const inactive = document.getElementById('userFilterInactive')?.value || '';
    let url = `/users?limit=25&offset=${(page-1)*25}`;
    if (q)        url += `&q=${encodeURIComponent(q)}`;
    if (role)     url += `&role=${role}`;
    if (status !== '')   url += `&is_active=${status}`;
    if (inactive !== '') url += `&inactive_days=${encodeURIComponent(inactive)}`;

    const data = await apiAdminGet(url);
    if (!data.success) { showToast('Error cargando usuarios', 'error'); return; }

    const rows = data.data;
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
                        <p class="text-xs text-gray-500 truncate">${escapeHtml(u.email)}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4" col-hide-mobile">
                <select onchange="changeUserRole(${u.id}, this.value)"
                    class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer">
                    <option value="user"    ${u.role === 'user'    ? 'selected' : ''}>Usuario</option>
                    <option value="client"  ${u.role === 'client'  ? 'selected' : ''}>Cliente</option>
                    <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
                    <option value="godmode" ${u.role === 'godmode' ? 'selected' : ''}>GodMode</option>
                </select>
            </td>
            <td class="px-6 py-4">
                ${u.is_active
                    ? '<span class="badge badge-verified"><i class="fas fa-check"></i> Activo</span>'
                    : '<span class="badge badge-inactive"><i class="fas fa-ban"></i> Inactivo</span>'}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500" col-hide-mobile">${u.city || '<span class="text-gray-300">—</span>'}</td>
            <td class="px-6 py-4 text-sm text-gray-600 font-medium" col-hide-mobile">${u.business_count || 0}</td>
            <td class="px-6 py-4 text-sm col-hide-mobile">${userLastSeenLabel(u.last_seen_at)}</td>
            <td class="px-6 py-4 text-sm text-gray-500" col-hide-mobile">${formatDateShort(u.created_at)}</td>
            <td class="px-6 py-4">
                <div class="flex gap-1 justify-end">
                    <button onclick="openSendEmailToUser(${u.id},'${escapeHtml((u.email||'').replace(/'/g,"\\'"))}','${escapeHtml((u.name||'').replace(/'/g,"\\'"))}','${u.owned_slug||''}')"
                        class="text-xs bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition" title="Enviar correo / plantilla">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                    <button onclick="openEditUserModal(${u.id},'${escapeHtml((u.name||'').replace(/'/g,"\\'"))}','${escapeHtml((u.email||'').replace(/'/g,"\\'"))}','${u.role||'user'}',${u.is_active})"
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
function openEditUserModal(id, name, email, role, isActive) {
    document.getElementById('editUserModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'editUserModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50" onclick="closeEditUserModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <h3 class="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <i class="fas fa-user-edit text-[#0ea5e9]"></i> Editar usuario
                </h3>
                <button onclick="closeEditUserModal()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <div id="editUserError" class="hidden bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"></div>
                <div class="bg-gray-50 rounded-xl p-4">
                    <p class="font-semibold text-gray-800">${escapeHtml(name || email)}</p>
                    <p class="text-sm text-gray-500">${escapeHtml(email)}</p>
                </div>
                <div>
                    <label class="form-label">Rol</label>
                    <select id="editUserRole" class="form-input">
                        <option value="user"   ${role==='user'   ?'selected':''}>Usuario</option>
                        <option value="client" ${role==='client' ?'selected':''}>Cliente</option>
                        <option value="admin"  ${role==='admin'  ?'selected':''}>Admin</option>
                        <option value="god"    ${role==='god'    ?'selected':''}>GOD</option>
                    </select>
                </div>
                <div class="flex items-center gap-3">
                    <input type="checkbox" id="editUserActive" class="w-4 h-4 rounded border-gray-300" ${isActive ? 'checked' : ''}>
                    <label for="editUserActive" class="text-sm text-gray-700 font-medium">Usuario activo</label>
                </div>
                <div class="border border-gray-200 rounded-xl p-4">
                    <label class="form-label mb-2 block"><i class="fas fa-key text-amber-500 mr-1"></i> Resetear contraseña <span class="text-gray-400 font-normal text-xs">(vacío = no cambiar)</span></label>
                    <div class="relative">
                        <input type="password" id="editUserNewPass" class="form-input pr-10" minlength="8" placeholder="Nueva contraseña (mín. 8 caracteres)">
                        <button type="button" onclick="const i=document.getElementById('editUserNewPass');i.type=i.type==='password'?'text':'password'" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><i class="fas fa-eye"></i></button>
                    </div>
                </div>
                <!-- Empresas asignadas -->
                <div class="border border-gray-200 rounded-xl overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <span class="text-sm font-semibold text-gray-700"><i class="fas fa-building text-gray-400 mr-1"></i> Empresas asignadas</span>
                        <span id="editUserBizCount" class="text-xs text-gray-400">Cargando...</span>
                    </div>
                    <div id="editUserBizList" class="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                        <div class="px-4 py-3 text-center text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</div>
                    </div>
                </div>
                <div class="flex gap-3 pt-2 border-t border-gray-100">
                    <button onclick="closeEditUserModal()" class="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition">Cancelar</button>
                    <button onclick="saveEditUser(${id})" class="flex-1 bg-[#0ea5e9] text-white py-2.5 rounded-xl font-bold hover:bg-[#0284c7] transition flex items-center justify-center gap-2">
                        <i class="fas fa-save"></i> Guardar cambios
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    loadUserBusinesses(id);
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
                <p class="text-sm font-semibold text-gray-800 truncate">${escapeHtml(b.trade_name || b.name)}</p>
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
    const role     = document.getElementById('editUserRole').value;
    const isActive = document.getElementById('editUserActive').checked;
    const newPass  = document.getElementById('editUserNewPass').value.trim();
    const errEl    = document.getElementById('editUserError');
    errEl.classList.add('hidden');

    if (newPass && newPass.length < 8) {
        errEl.textContent = 'La contraseña debe tener al menos 8 caracteres';
        errEl.classList.remove('hidden'); return;
    }

    const resRole = await apiAdminPost(`/users/${id}/role`, { role }, 'PUT');
    if (!resRole.success) { errEl.textContent = resRole.error || 'Error al cambiar rol'; errEl.classList.remove('hidden'); return; }

    const resStatus = await apiAdminPost(`/users/${id}/status`, { is_active: isActive }, 'PUT');
    if (!resStatus.success) { errEl.textContent = resStatus.error || 'Error al cambiar estado'; errEl.classList.remove('hidden'); return; }

    if (newPass) {
        const resPass = await apiAdminPost(`/users/${id}/reset-password`, { password: newPass }, 'PUT');
        if (!resPass.success) { errEl.textContent = resPass.error || 'Error al cambiar contraseña'; errEl.classList.remove('hidden'); return; }
    }

    showToast('Usuario actualizado ✅');
    closeEditUserModal();
    loadAdminUsers(currentUserPage);
}
