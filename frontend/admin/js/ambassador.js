/**
 * RetoPA Admin — js/ambassador.js
 * Cola de revisión de fichas de embajadores + gestión de embajadores
 */

let _ambReviewPage = 1;

// ── Cola de revisión ────────────────────────────────────────────────────────
async function loadAmbassadorReview(page = 1) {
    _ambReviewPage = page;
    const ambassador = document.getElementById('ambFilterAmbassador')?.value || '';
    let url = `/ambassador/pending?page=${page}&limit=15`;
    if (ambassador) url += `&ambassador_id=${ambassador}`;

    const data = await apiAdminGet(url);
    const container = document.getElementById('ambassadorReviewList');
    if (!container) return;

    if (!data.success) {
        container.innerHTML = '<p class="text-red-400 text-sm text-center py-8">Error cargando cola</p>';
        return;
    }

    // Badge en menú
    const badge = document.getElementById('ambassadorPendingBadge');
    if (badge) {
        const total = parseInt(data.pagination?.total || 0);
        badge.textContent = total;
        badge.classList.toggle('hidden', total === 0);
    }

    if (!data.data.length) {
        container.innerHTML = `<div class="text-center py-12 text-gray-400">
            <i class="fas fa-check-circle text-4xl mb-3 block text-green-400"></i>
            <p class="font-medium">No hay fichas pendientes</p>
            <p class="text-sm mt-1">¡Todo al día!</p>
        </div>`;
        return;
    }

    container.innerHTML = data.data.map(b => {
        const cats = (b.categories || []).map(c => `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">${escapeHtml(c.name)}</span>`).join(' ');
        return `
        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden" id="review-card-${b.id}">
            <div class="flex items-start gap-4 p-4">
                <div class="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0 overflow-hidden border border-gray-200">
                    ${b.image_url ? `<img src="${escapeHtml(b.image_url)}" class="w-full h-full object-cover">` : (b.logo_emoji || '🏢')}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                            <p class="font-bold text-gray-900">${escapeHtml(b.trade_name || b.name)}</p>
                            ${b.name && b.name !== b.trade_name ? `<p class="text-xs text-gray-400">${escapeHtml(b.name)}</p>` : ''}
                        </div>
                        <span class="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold shrink-0">
                            <i class="fas fa-user-tie mr-1"></i>${escapeHtml(b.ambassador_name || b.ambassador_email)}
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-1 mt-1.5">${cats}</div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-gray-500">
                        ${b.city ? `<span><i class="fas fa-map-marker-alt mr-1 text-gray-300"></i>${escapeHtml(b.city)}</span>` : ''}
                        ${b.whatsapp ? `<span><i class="fab fa-whatsapp mr-1 text-green-400"></i>${escapeHtml(b.whatsapp)}</span>` : '<span class="text-red-300"><i class="fas fa-exclamation-circle mr-1"></i>Sin WhatsApp</span>'}
                        ${b.phone ? `<span><i class="fas fa-phone mr-1 text-gray-300"></i>${escapeHtml(b.phone)}</span>` : ''}
                        ${b.email ? `<span><i class="fas fa-envelope mr-1 text-gray-300"></i>${escapeHtml(b.email)}</span>` : ''}
                    </div>
                    ${b.description ? `<p class="text-xs text-gray-500 mt-1.5 line-clamp-2">${escapeHtml(b.description)}</p>` : '<p class="text-xs text-red-300 mt-1.5"><i class="fas fa-exclamation-circle mr-1"></i>Sin descripción</p>'}
                    ${b.address ? `<p class="text-xs text-gray-400 mt-1"><i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(b.address)}</p>` : ''}
                </div>
            </div>
            <!-- Acciones -->
            <div class="border-t border-gray-100 px-4 py-3 flex items-center gap-2 flex-wrap bg-gray-50">
                <button onclick="openBusinessModal(${b.id})" class="text-xs border border-gray-200 bg-white text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                    <i class="fas fa-edit mr-1"></i>Ver completa
                </button>
                <div class="flex-1"></div>
                <button onclick="rejectAmbassadorBiz(${b.id})" class="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition font-medium">
                    <i class="fas fa-times mr-1"></i>Rechazar
                </button>
                <button onclick="approveAmbassadorBiz(${b.id})" class="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition font-bold">
                    <i class="fas fa-check mr-1"></i>Aprobar y publicar
                </button>
            </div>
        </div>`;
    }).join('');

    // Paginación
    const p = data.pagination;
    document.getElementById('ambReviewPaginationInfo').textContent =
        `${Math.min((p.page-1)*p.limit+1, p.total)}–${Math.min(p.page*p.limit, p.total)} de ${p.total} pendientes`;
    let pHtml = '';
    if (p.page > 1) pHtml += `<button onclick="loadAmbassadorReview(${p.page-1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = Math.max(1, p.page-2); i <= Math.min(p.pages, p.page+2); i++)
        pHtml += `<button onclick="loadAmbassadorReview(${i})" class="px-3 py-1 border ${i === p.page ? 'bg-[#0ea5e9] text-white border-[#0ea5e9]' : 'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
    if (p.page < p.pages) pHtml += `<button onclick="loadAmbassadorReview(${p.page+1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-right"></i></button>`;
    document.getElementById('ambReviewPaginationControls').innerHTML = pHtml;
}

async function approveAmbassadorBiz(id) {
    if (!confirm('¿Aprobar y publicar esta ficha?')) return;
    const res = await apiAdminPost(`/ambassador/businesses/${id}/approve`, {});
    if (res.success) {
        showToast('Ficha aprobada y publicada ✅');
        document.getElementById(`review-card-${id}`)?.remove();
        loadAmbassadorReview(_ambReviewPage);
    } else {
        showToast('Error: ' + (res.error || 'No se pudo aprobar'), 'error');
    }
}

async function rejectAmbassadorBiz(id) {
    const note = prompt('Motivo del rechazo (se mostrará al embajador):');
    if (!note?.trim()) return;
    const res = await apiAdminPost(`/ambassador/businesses/${id}/reject`, { note });
    if (res.success) {
        showToast('Ficha rechazada');
        document.getElementById(`review-card-${id}`)?.remove();
        loadAmbassadorReview(_ambReviewPage);
    } else {
        showToast('Error: ' + (res.error || 'No se pudo rechazar'), 'error');
    }
}

// ── Gestión de Embajadores ──────────────────────────────────────────────────
async function loadAmbassadorsList() {
    const data = await apiAdminGet('/ambassador/ambassadors');
    const container = document.getElementById('ambassadorsList');
    if (!container) return;

    if (!data.success || !data.data.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No hay embajadores aún. Creá el primero.</p>';
        return;
    }

    container.innerHTML = data.data.map(a => `
        <div class="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4">
            <div class="w-10 h-10 rounded-full bg-[#1B3A6B] flex items-center justify-center text-white font-bold shrink-0">
                ${(a.name || a.email).charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 text-sm">${escapeHtml(a.name || '—')}</p>
                <p class="text-xs text-gray-400">${escapeHtml(a.email)}${a.phone ? ' · ' + a.phone : ''}</p>
            </div>
            <div class="flex gap-4 text-center shrink-0">
                <div>
                    <p class="font-black text-[#1B3A6B] text-lg leading-none">${a.total_publicadas || 0}</p>
                    <p class="text-[10px] text-gray-400">Public.</p>
                </div>
                <div>
                    <p class="font-black text-amber-500 text-lg leading-none">${a.total_pendientes || 0}</p>
                    <p class="text-[10px] text-gray-400">Pend.</p>
                </div>
                <div>
                    <p class="font-black text-gray-400 text-lg leading-none">${a.total_cargadas || 0}</p>
                    <p class="text-[10px] text-gray-400">Total</p>
                </div>
            </div>
            <span class="shrink-0 text-xs ${a.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'} px-2.5 py-1 rounded-full font-medium">
                ${a.is_active ? 'Activo' : 'Inactivo'}
            </span>
        </div>
    `).join('');
}

function openNewAmbassadorModal() {
    const existing = document.getElementById('newAmbassadorModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'newAmbassadorModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50" onclick="document.getElementById('newAmbassadorModal').remove()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <button onclick="document.getElementById('newAmbassadorModal').remove()"
                class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <i class="fas fa-times text-xs"></i>
            </button>
            <h3 class="font-bold text-gray-900 mb-1 flex items-center gap-2">
                <i class="fas fa-user-tie text-[#0ea5e9]"></i> Asignar Embajador
            </h3>
            <p class="text-sm text-gray-400 mb-5">Podés asignar el rol a un usuario existente o crear uno nuevo.</p>

            <!-- Tab toggle -->
            <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
                <button onclick="switchAmbTab('existing')" id="ambTabExisting"
                    class="flex-1 py-2 text-xs font-bold rounded-lg bg-white shadow text-gray-900 transition">
                    Usuario existente
                </button>
                <button onclick="switchAmbTab('new')" id="ambTabNew"
                    class="flex-1 py-2 text-xs font-bold rounded-lg text-gray-500 transition hover:text-gray-700">
                    Crear nuevo
                </button>
            </div>

            <div id="newAmbError" class="hidden mb-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"></div>

            <!-- Panel: usuario existente -->
            <div id="ambPanelExisting" class="space-y-4">
                <div>
                    <label class="form-label">Buscar usuario por nombre o email</label>
                    <input type="text" id="ambUserSearch" class="form-input" placeholder="Escribí para buscar..."
                        oninput="searchAmbassadorUsers(this.value)">
                    <div id="ambUserResults" class="mt-2 border border-gray-200 rounded-xl overflow-hidden hidden max-h-48 overflow-y-auto"></div>
                </div>
                <div id="ambSelectedUser" class="hidden bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
                    <p class="text-sm font-bold text-brand-800" id="ambSelectedUserName"></p>
                    <p class="text-xs text-brand-600" id="ambSelectedUserEmail"></p>
                </div>
                <input type="hidden" id="ambSelectedUserId">
                <button onclick="assignExistingAmbassador()"
                    style="width:100%;background:#0ea5e9;color:white;font-weight:700;padding:.75rem;border-radius:.75rem;border:none;cursor:pointer">
                    <i class="fas fa-user-check mr-2"></i>Asignar como Embajador
                </button>
            </div>

            <!-- Panel: nuevo usuario -->
            <div id="ambPanelNew" class="hidden space-y-4">
                <div><label class="form-label">Nombre completo *</label><input type="text" id="newAmbName" class="form-input" placeholder="Juan Pérez"></div>
                <div><label class="form-label">Email *</label><input type="email" id="newAmbEmail" class="form-input" placeholder="juan@email.com"></div>
                <div><label class="form-label">Teléfono</label><input type="text" id="newAmbPhone" class="form-input" placeholder="0981000000"></div>
                <div><label class="form-label">Contraseña temporal *</label><input type="password" id="newAmbPassword" class="form-input" placeholder="Mín. 8 caracteres"></div>
                <button onclick="createNewAmbassador()"
                    style="width:100%;background:#0ea5e9;color:white;font-weight:700;padding:.75rem;border-radius:.75rem;border:none;cursor:pointer">
                    <i class="fas fa-plus mr-2"></i>Crear y asignar Embajador
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function switchAmbTab(tab) {
    document.getElementById('ambPanelExisting').classList.toggle('hidden', tab !== 'existing');
    document.getElementById('ambPanelNew').classList.toggle('hidden', tab !== 'new');
    document.getElementById('ambTabExisting').className = `flex-1 py-2 text-xs font-bold rounded-lg transition ${tab==='existing'?'bg-white shadow text-gray-900':'text-gray-500 hover:text-gray-700'}`;
    document.getElementById('ambTabNew').className = `flex-1 py-2 text-xs font-bold rounded-lg transition ${tab==='new'?'bg-white shadow text-gray-900':'text-gray-500 hover:text-gray-700'}`;
}

let _ambUserSearchTimer = null;
async function searchAmbassadorUsers(q) {
    clearTimeout(_ambUserSearchTimer);
    _ambUserSearchTimer = setTimeout(async () => {
        if (!q.trim()) { document.getElementById('ambUserResults').classList.add('hidden'); return; }
        const data = await apiAdminGet(`/ambassador/users?q=${encodeURIComponent(q)}`);
        const list = document.getElementById('ambUserResults');
        if (!data.success || !data.data.length) {
            list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>';
        } else {
            list.innerHTML = data.data.map(u => `
                <div onclick="selectAmbassadorUser(${u.id},'${escapeHtml(u.name||u.email)}','${escapeHtml(u.email)}')"
                    class="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                    <p class="text-sm font-medium text-gray-900">${escapeHtml(u.name||'—')}</p>
                    <p class="text-xs text-gray-400">${escapeHtml(u.email)} · ${u.role}${u.is_ambassador?' · <span class="text-green-600 font-bold">Ya es embajador</span>':''}</p>
                </div>`).join('');
        }
        list.classList.remove('hidden');
    }, 300);
}

function selectAmbassadorUser(id, name, email) {
    document.getElementById('ambSelectedUserId').value = id;
    document.getElementById('ambSelectedUserName').textContent = name;
    document.getElementById('ambSelectedUserEmail').textContent = email;
    document.getElementById('ambSelectedUser').classList.remove('hidden');
    document.getElementById('ambUserResults').classList.add('hidden');
    document.getElementById('ambUserSearch').value = name;
}

async function assignExistingAmbassador() {
    const userId = document.getElementById('ambSelectedUserId').value;
    const errEl  = document.getElementById('newAmbError');
    errEl.classList.add('hidden');
    if (!userId) { errEl.textContent='Seleccioná un usuario primero'; errEl.classList.remove('hidden'); return; }
    const res = await apiAdminPost('/ambassador/ambassadors', { user_id: parseInt(userId) });
    if (res.success) {
        showToast(`✅ Embajador asignado correctamente`);
        document.getElementById('newAmbassadorModal').remove();
        loadAmbassadorsList();
    } else {
        errEl.textContent = res.error||'Error al asignar'; errEl.classList.remove('hidden');
    }
}

async function createNewAmbassador() {
    const errEl    = document.getElementById('newAmbError');
    const name     = document.getElementById('newAmbName').value.trim();
    const email    = document.getElementById('newAmbEmail').value.trim();
    const phone    = document.getElementById('newAmbPhone').value.trim();
    const password = document.getElementById('newAmbPassword').value;
    errEl.classList.add('hidden');
    if (!name||!email||!password) { errEl.textContent='Nombre, email y contraseña son requeridos'; errEl.classList.remove('hidden'); return; }
    if (password.length<8) { errEl.textContent='La contraseña debe tener al menos 8 caracteres'; errEl.classList.remove('hidden'); return; }
    const res = await apiAdminPost('/ambassador/ambassadors', { name, email, phone, password });
    if (res.success) {
        showToast(res.existing ? `✅ ${name} ya existía y fue asignado como Embajador` : `✅ Embajador ${name} creado`);
        document.getElementById('newAmbassadorModal').remove();
        loadAmbassadorsList();
    } else {
        errEl.textContent = res.error||'Error al crear'; errEl.classList.remove('hidden');
    }
}
