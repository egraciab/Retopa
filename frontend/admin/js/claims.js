/**
 * RetoPA — admin/js/claims.js
 * Panel de Claims pendientes de aprobación (S3.2)
 */

// Estado del panel (filtro + búsqueda + página). Server-side para escalar.
let _allClaims = [];
let _claimFilter = 'all';
let _claimQ = '';
let _claimPage = 1;

async function initClaimsSection() {
    _claimFilter = 'all'; _claimQ = ''; _claimPage = 1;
    const container = document.getElementById('claimsSection');
    if (!container) return;
    container.innerHTML = `
    <div class="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
            <h2 class="text-2xl font-bold text-gray-900">Reclamos de empresas</h2>
            <p class="text-sm text-gray-500 mt-1">Empresas reclamadas por sus dueños — verificación y acceso</p>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto">
            <div class="relative flex-1 min-w-0">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input id="claimSearch" type="text" placeholder="Buscar empresa, dueño o email..."
                    class="border border-gray-200 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9] w-full sm:w-72"
                    oninput="doClaimSearch(this.value)">
            </div>
            <button onclick="loadClaims(_claimPage)" class="btn-brand text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <i class="fas fa-sync-alt"></i> Actualizar
            </button>
        </div>
    </div>
    <div id="claimRequests"></div>
    <div id="accessRequests"></div>
    <div id="claimFunnel" class="mb-6"></div>
    <div id="claimsStats" class="grid grid-cols-3 gap-4 mb-6"></div>
    <div id="claimsList" class="space-y-4">
        <div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
    </div>
    <div id="claimsPagination" class="flex items-center justify-center gap-2 mt-6"></div>`;
    loadClaimRequests();
    loadAccessRequests();
    if (typeof loadClaimFunnel === 'function') loadClaimFunnel();
    loadClaims(1);
}

async function loadClaims(page = 1) {
    _claimPage = page;
    try {
        const params = new URLSearchParams({ page, limit: 25 });
        if (_claimFilter !== 'all') params.set('status', _claimFilter);
        if (_claimQ) params.set('q', _claimQ);
        const data = await apiAdminGet(`/claims?${params}`);
        if (!data.success) return;

        _allClaims = data.data || [];
        const s = data.stats || {};
        const pending  = s.pending  ?? 0;
        const approved = s.approved ?? 0;
        const rejected = s.rejected ?? 0;
        const toReview = s.to_review ?? 0;
        const totalAll = s.total    ?? _allClaims.length;

        // Badge en el menú (siempre el total GLOBAL de pendientes)
        const badge = document.getElementById('claimsBadge');
        if (badge) {
            badge.textContent = pending + toReview;
            badge.classList.toggle('hidden', (pending + toReview) === 0);
        }

        // Stats clickeables (filtran al tocar) — números GLOBALES del backend
        const statsEl = document.getElementById('claimsStats');
        const card = (key, count, label, active, cls) => `
            <div onclick="filterClaims('${key}')"
                 class="cursor-pointer rounded-xl p-4 text-center border-2 transition ${active ? cls.active : cls.idle}">
                <div class="text-2xl font-black ${cls.num}">${count.toLocaleString()}</div>
                <div class="text-xs font-semibold mt-1 ${cls.txt}">${label}</div>
            </div>`;
        if (statsEl) {
            statsEl.className = 'grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6';
            statsEl.innerHTML =
                card('all', totalAll, 'Todos', _claimFilter==='all',
                    { active:'bg-sky-50 border-sky-400', idle:'bg-white border-gray-100 hover:border-gray-200', num:'text-sky-600', txt:'text-sky-700' }) +
                card('pending', pending, 'Pendientes', _claimFilter==='pending',
                    { active:'bg-amber-50 border-amber-400', idle:'bg-amber-50/40 border-transparent hover:border-amber-200', num:'text-amber-600', txt:'text-amber-700' }) +
                card('review', toReview, 'A revisar', _claimFilter==='review',
                    { active:'bg-violet-50 border-violet-400', idle:'bg-violet-50/40 border-transparent hover:border-violet-200', num:'text-violet-600', txt:'text-violet-700' }) +
                card('approved', approved, 'Aprobados', _claimFilter==='approved',
                    { active:'bg-green-50 border-green-400', idle:'bg-green-50/40 border-transparent hover:border-green-200', num:'text-green-600', txt:'text-green-700' }) +
                card('rejected', rejected, 'Rechazados', _claimFilter==='rejected',
                    { active:'bg-red-50 border-red-400', idle:'bg-red-50/40 border-transparent hover:border-red-200', num:'text-red-500', txt:'text-red-600' });
        }

        renderClaimsList(_allClaims);
        renderClaimsPagination(data.pagination);
    } catch(e) {
        console.error('[Claims]', e);
        const listEl = document.getElementById('claimsList');
        if (listEl) listEl.innerHTML = `<div class="text-center py-8 text-red-400">Error al cargar claims</div>`;
    }
}

// Filtrar por estado al tocar una tarjeta (server-side, vuelve a página 1)
function filterClaims(status) {
    _claimFilter = status;
    loadClaims(1);
}

// Búsqueda con debounce (server-side)
let _claimSearchTimer = null;
function doClaimSearch(val) {
    _claimQ = (val || '').trim();
    clearTimeout(_claimSearchTimer);
    _claimSearchTimer = setTimeout(() => loadClaims(1), 300);
}

function renderClaimsPagination(p) {
    const el = document.getElementById('claimsPagination');
    if (!el) return;
    if (!p || p.pages <= 1) { el.innerHTML = ''; return; }
    let html = `<span class="text-sm text-gray-500 mr-2">${((p.page-1)*p.limit)+1}–${Math.min(p.page*p.limit, p.total)} de ${p.total.toLocaleString()}</span>`;
    if (p.page > 1) html += `<button onclick="loadClaims(${p.page-1})" class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = Math.max(1, p.page-2); i <= Math.min(p.pages, p.page+2); i++)
        html += `<button onclick="loadClaims(${i})" class="px-3 py-1.5 rounded-lg border ${i===p.page?'border-[#0ea5e9] bg-[#0ea5e9] text-white font-bold':'border-gray-200 hover:bg-gray-50'}">${i}</button>`;
    if (p.page < p.pages) html += `<button onclick="loadClaims(${p.page+1})" class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><i class="fas fa-chevron-right"></i></button>`;
    el.innerHTML = html;
}

function renderClaimsList(rows) {
    const listEl = document.getElementById('claimsList');
    if (!listEl) return;

    const claims = rows || _allClaims;

    if (!claims.length) {
        const filtered = _claimFilter !== 'all' || _claimQ;
        listEl.innerHTML = `<div class="text-center py-16 text-gray-400">
            <i class="fas fa-ribbon text-4xl mb-4 block"></i>
            <p class="font-semibold">${filtered ? 'Sin claims con estos filtros' : 'No hay claims todavía'}</p>
            <p class="text-sm mt-1">${filtered ? 'Probá con otro estado o búsqueda' : 'Aparecerán aquí cuando una empresa sea reclamada'}</p>
        </div>`; return;
    }

    // El backend ya ordena (pendientes primero). Render directo.
    listEl.innerHTML = claims.map(c => {
            const statusColor = c.to_review ? 'bg-violet-100 text-violet-700 border-violet-200'
                              : c.claim_status === 'pending'  ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : c.claim_status === 'approved' ? 'bg-green-100 text-green-700 border-green-200'
                              : 'bg-red-100 text-red-600 border-red-200';
            const statusLabel = c.to_review ? '⚡ Aprobado automáticamente · revisar'
                              : c.claim_status === 'pending'  ? '⏳ Pendiente'
                              : c.claim_status === 'approved' ? '✅ Aprobado'
                              : '❌ Rechazado';
            const originChip = c.origin === 'enlace' ? ['bg-emerald-100 text-emerald-700', 'Enlace']
                             : c.origin === 'formulario' ? ['bg-sky-100 text-sky-700', 'Formulario'] : ['bg-violet-100 text-violet-700', 'Cuenta'];
            const CR_LBL = { name: 'Razón social', trade_name: 'Nombre', phone: 'Teléfono', whatsapp: 'WhatsApp', email: 'Correo' };
            const crs = Array.isArray(c.change_requests) ? c.change_requests : [];
            const claimedDate = c.claimed_at
                ? new Date(c.claimed_at).toLocaleDateString('es-PY', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                : '—';

            return `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <h4 class="font-bold text-gray-900">${escapeHtml(c.trade_name || c.name)}</h4>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}">${statusLabel}</span>
                        </div>
                        <p class="text-xs text-gray-400 mb-3">${c.trade_name && c.name !== c.trade_name ? escapeHtml(c.name) + ' · ' : ''}${escapeHtml(c.city || '')}
                            <span class="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${originChip[0]}">${originChip[1]}</span>
                        </p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500 break-words">
                            <div><i class="fas fa-user text-gray-300 mr-1"></i> ${escapeHtml(c.contact_name || c.user_name || '—')}</div>
                            <div><i class="fas fa-envelope text-gray-300 mr-1"></i> ${escapeHtml(c.contact_email || c.user_email || c.email || '—')}</div>
                            <div><i class="fas fa-phone text-gray-300 mr-1"></i> ${escapeHtml(c.contact_phone || '—')}${c.user_phone_verified_at ? ' <span class="text-emerald-600 font-semibold" title="Es el número de la ficha al que le escribimos">✓ verificado</span>' : ''}</div>
                            <div><i class="fas fa-clock text-gray-300 mr-1"></i> ${claimedDate}</div>
                        </div>
                        ${(c.message || c.evidence_url) ? `
                        <div class="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                            ${c.message ? `<p class="text-gray-700 mb-1"><i class="fas fa-comment-dots text-amber-500 mr-1"></i> ${escapeHtml(c.message)}</p>` : ''}
                            ${c.evidence_url ? `<a href="${escapeHtml(c.evidence_url)}" target="_blank" class="text-brand-600 hover:underline break-all"><i class="fas fa-link mr-1"></i> ${escapeHtml(c.evidence_url)}</a>` : ''}
                        </div>` : ''}
                        ${crs.length ? `
                        <div class="mt-3 bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs" data-cr-box="${c.id}">
                            <p class="font-bold text-violet-800 mb-2"><i class="fas fa-user-pen mr-1"></i> Cambios que pidió el dueño</p>
                            ${crs.map(r => `
                            <div class="py-2 border-t border-violet-100 first:border-0">
                                <div class="font-semibold text-gray-700 mb-1">${escapeHtml(CR_LBL[r.field] || r.field)}</div>
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-gray-400 line-through break-all">${escapeHtml(r.old_value || '—')}</span>
                                    <span class="text-gray-400">→</span>
                                    <span class="text-gray-900 font-semibold break-all">${escapeHtml(r.new_value || '—')}</span>
                                    <span class="ml-auto flex gap-1">
                                        <button onclick="decideChangeRequest(${r.id}, 'approve')" class="bg-green-500 text-white font-bold px-3 py-1.5 rounded-lg" title="Aplicar el cambio">✓</button>
                                        <button onclick="decideChangeRequest(${r.id}, 'reject')" class="bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg" title="Descartar">✗</button>
                                    </span>
                                </div>
                            </div>`).join('')}
                        </div>` : ''}
                    </div>
                    <div class="flex flex-row flex-wrap items-center sm:flex-col sm:items-stretch gap-2 flex-shrink-0">
                        <a href="/negocio/${c.slug}" target="_blank"
                            class="text-xs text-brand-600 font-semibold hover:underline flex items-center gap-1">
                            <i class="fas fa-external-link-alt text-[10px]"></i> Ver perfil
                        </a>
                        ${c.claim_status === 'pending' ? `
                        <button onclick="approveClaim(${c.id})"
                            class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
                            ✓ Aprobar
                        </button>
                        <button onclick="rejectClaim(${c.id})"
                            class="bg-red-100 hover:bg-red-200 text-red-600 text-xs font-bold px-3 py-1.5 rounded-lg transition">
                            ✗ Rechazar
                        </button>` : ''}
                        ${c.to_review ? `
                        <button onclick="confirmAutoClaim(${c.id})"
                            class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
                            ✓ Confirmar
                        </button>
                        <button onclick="revertAutoClaim(${c.id})"
                            class="bg-red-100 hover:bg-red-200 text-red-600 text-xs font-bold px-3 py-1.5 rounded-lg transition" title="No era el dueño: vuelve la ficha a como estaba">
                            ↩ Revertir
                        </button>` : ''}
                        ${c.claim_status === 'approved' && c.user_id ? `
                        <button onclick="sendAccessLink(${c.user_id})"
                            class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg transition" title="Link de un solo uso para entrar sin contraseña (7 días)">
                            <i class="fab fa-whatsapp mr-1"></i> Link de acceso
                        </button>` : ''}
                        ${c.claim_status === 'approved' && c.origin !== 'enlace' ? (c.user_id
                            ? `<span class="text-[11px] text-green-600 font-semibold flex items-center gap-1"><i class="fas fa-user-check"></i> Dueño con acceso</span>
                               <button onclick="grantClaimAccess(${c.id})" class="text-[11px] text-gray-500 hover:text-brand-600 hover:underline">Reenviar activación</button>`
                            : `<button onclick="grantClaimAccess(${c.id})"
                                   class="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition" title="Crea/vincula la cuenta del dueño y le envía el enlace de activación">
                                   <i class="fas fa-key mr-1"></i> Dar acceso al dueño
                               </button>`) : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
}

async function approveClaim(businessId) {
    if (!confirm('¿Aprobar este claim, verificar la empresa y dar acceso al dueño?')) return;
    try {
        const data = await apiAdminPost('/claims/approve', { business_id: businessId });
        if (data.success) {
            const a = data.access || {};
            showToast(a.created
                ? `✅ Aprobado — se creó la cuenta del dueño y se le envió el enlace de activación${a.email ? ' a ' + a.email : ''}`
                : (a.user_id ? '✅ Aprobado — el dueño ya tiene acceso y fue notificado' : '✅ Claim aprobado — empresa verificada'),
                'success');
            loadClaims();
        } else {
            showToast('Error: ' + (data.error || 'No se pudo aprobar'), 'error');
        }
    } catch(e) {
        showToast('Error de conexión', 'error');
    }
}

// Da/reenvía acceso al dueño de un claim ya aprobado (crea/vincula cuenta + activación).
async function grantClaimAccess(businessId) {
    if (!confirm('¿Dar acceso al dueño?\n\nSe crea/vincula su cuenta y se le envía el enlace para crear su contraseña y gestionar la ficha.')) return;
    try {
        const data = await apiAdminPost('/claims/grant-access', { business_id: businessId });
        if (data.success) {
            const a = data.access || {};
            showToast(a.created
                ? `🔑 Cuenta creada y enlace de activación enviado${a.email ? ' a ' + a.email : ''}`
                : `🔑 Acceso otorgado — el dueño ya puede gestionar su ficha${a.email ? ' (' + a.email + ')' : ''}`,
                'success');
            loadClaims();
        } else {
            showToast('Error: ' + (data.error || 'No se pudo otorgar acceso'), 'error');
        }
    } catch(e) {
        showToast('Error de conexión', 'error');
    }
}

// ── Pedidos de RECLAMO desde la ficha pública (2026-10-14) ──────────────────
// whatsapp: el dueño nos escribe desde el WhatsApp de la ficha con un código.
// revision: pidió con otro número. En los dos casos: "Mandar link" abre el chat
// con su link de reclamo (el flujo de siempre, sin contraseña).
const _fmtPY = wa => { const m = String(wa || '').match(/^595(9\d{2})(\d{3})(\d{3})$/); return m ? `0${m[1]} ${m[2]} ${m[3]}` : (wa || ''); };
// Vista 'sent': los ya mandados (7 días). "Mandar link" los saca de pendientes aunque
// el chat no haya llegado a salir (pestaña bloqueada/cerrada) → desde acá se reenvían.
let _crView = 'pending';
function setClaimRequestsView(v) { _crView = v; loadClaimRequests(); }
async function loadClaimRequests() {
    const box = document.getElementById('claimRequests');
    if (!box) return;
    const [pend, sentRes] = await Promise.all([apiAdminGet('/claim-requests'), apiAdminGet('/claim-requests?status=sent')]);
    const pending = (pend && pend.success && pend.data) || [];
    const sent = (sentRes && sentRes.success && sentRes.data) || [];
    if (!pending.length && !sent.length) { box.innerHTML = ''; return; }
    if (_crView === 'sent' && !sent.length) _crView = 'pending';
    const isSent = _crView === 'sent';
    const rows = isSent ? sent : pending;
    const ago = ts => { const m = (Date.now() - new Date(ts).getTime()) / 60000;
        return m < 60 ? `hace ${Math.max(1, Math.round(m))} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
    const tab = (v, label, n) => `<button onclick="setClaimRequestsView('${v}')" class="text-xs font-bold px-3 py-1 rounded-full border ${_crView === v ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}">${label} · ${n}</button>`;
    box.innerHTML = `
    <div class="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 mb-6" id="crCard">
        <div class="flex items-center gap-2 flex-wrap mb-1">
            <h3 class="text-sm font-bold text-gray-900 mr-auto"><i class="fas fa-store text-amber-500 mr-1"></i> Pedidos de reclamo desde la ficha</h3>
            ${tab('pending', 'Pendientes', pending.length)}
            ${sent.length ? tab('sent', 'Enviados (7 días)', sent.length) : ''}
        </div>
        <p class="text-xs text-gray-500 mb-3">${isSent
            ? 'Ya les mandaste el link. Si el chat no llegó a salir o no lo encuentra, <b>reenviáselo</b>: es el mismo link. Cuando reclama, aparece “ya tiene dueño”.'
            : 'Con <b>código</b>: mandale el link solo si el chat llegó <b>desde el número indicado</b> con ese código. Sin código: revisá lo que cuenta antes de mandarlo.'}</p>
        ${rows.length ? '' : '<div class="text-xs text-gray-400 py-2">No hay pedidos pendientes.</div>'}
        <div class="space-y-2">${rows.map(r => `
            <div class="cr-row border border-gray-100 rounded-xl p-3" data-cr="${r.id}">
                <div class="flex items-start gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="font-semibold text-sm text-gray-900">
                            <a href="#" onclick="event.preventDefault(); typeof openBusinessModal === 'function' && openBusinessModal(${r.business_id})" class="hover:underline">${escapeHtml(r.business)}</a>
                            ${r.verified ? '<i class="fas fa-circle-check text-sky-500 text-xs" title="Verificada"></i>' : ''}
                            <span class="font-normal text-gray-400 text-xs">${escapeHtml(r.city || '')}</span>
                        </div>
                        ${r.kind === 'whatsapp'
                            ? `<div class="text-xs text-gray-700 mt-0.5"><i class="fab fa-whatsapp text-green-500"></i> ${isSent ? 'Escribió desde' : 'Tiene que escribir desde'} <b>${escapeHtml(_fmtPY(r.phone))}</b> con el código <b class="font-mono">${escapeHtml(r.code || '')}</b></div>`
                            : `<div class="text-xs text-gray-700 mt-0.5"><i class="fas fa-user-clock text-amber-500"></i> <b>${escapeHtml(r.name || '')}</b> · ${escapeHtml(_fmtPY(r.phone))}${r.email ? ' · ' + escapeHtml(r.email) : ''} <span class="text-amber-700">(otro número: revisar)</span></div>
                               ${r.message ? `<div class="text-xs text-gray-500 mt-1 italic">“${escapeHtml(r.message)}”</div>` : ''}`}
                        <div class="text-[11px] text-gray-400 mt-0.5">${isSent ? `pedido ${ago(r.created_at)} · link enviado ${ago(r.handled_at)}` : ago(r.created_at)}${r.has_owner ? ` · <span class="${isSent ? 'text-green-600' : 'text-red-600'} font-semibold">ya tiene dueño</span>` : ''}</div>
                    </div>
                    <div class="flex items-center gap-1">
                        ${r.has_owner ? '' : `<button onclick="sendClaimRequestLink(${r.id})" class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><i class="fab fa-whatsapp mr-1"></i> ${isSent ? 'Reenviar link' : 'Mandar link'}</button>`}
                        ${isSent ? '' : `<button onclick="dismissClaimRequest(${r.id})" class="text-xs text-gray-500 hover:text-gray-800 px-2 py-2">Descartar</button>`}
                    </div>
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}
async function sendClaimRequestLink(id) {
    const win = window.open('about:blank', '_blank');
    const data = await apiAdminPost(`/claim-requests/${id}/link`, {});
    if (!data || !data.success) { if (win) win.close(); showToast('Error: ' + ((data && data.error) || 'No se pudo generar el link'), 'error'); loadClaimRequests(); return; }
    const msg = data.data.message;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg); } catch (e) {}
    const waUrl = `https://wa.me/${data.data.wa}?text=${encodeURIComponent(msg)}`;
    if (win) { try { win.opener = null; } catch (e) {} win.location.href = waUrl; } else window.open(waUrl, '_blank', 'noopener');
    showToast('Chat abierto con el link de reclamo (también quedó copiado).', 'success');
    loadClaimRequests();
}
async function dismissClaimRequest(id) {
    await apiAdminPost(`/claim-requests/${id}/dismiss`, {});
    loadClaimRequests();
}

// ── Pedidos de acceso por WhatsApp (login sin contraseña, 2026-10-13) ───────
async function loadAccessRequests() {
    const box = document.getElementById('accessRequests');
    if (!box) return;
    const data = await apiAdminGet('/access-requests');
    const rows = (data && data.success && data.data) || [];
    if (!rows.length) { box.innerHTML = ''; return; }
    const ago = ts => { const m = (Date.now() - new Date(ts).getTime()) / 60000;
        return m < 60 ? `hace ${Math.max(1, Math.round(m))} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
    box.innerHTML = `
    <div class="bg-white rounded-2xl border border-green-200 shadow-sm p-4 mb-6" id="arCard">
        <h3 class="text-sm font-bold text-gray-900 mb-1"><i class="fab fa-whatsapp text-green-500 mr-1"></i> Pedidos de acceso · ${rows.length}</h3>
        <p class="text-xs text-gray-500 mb-3">Pidieron entrar sin contraseña. Fijate que el chat venga del <b>mismo número</b> y mandales su link.</p>
        <div class="space-y-2">${rows.map(r => `
            <div class="ar-row flex items-center gap-3 flex-wrap border border-gray-100 rounded-xl p-3">
                <div class="min-w-0 flex-1">
                    <div class="font-semibold text-sm text-gray-900 truncate">${escapeHtml(r.user_name || 'Sin cuenta con ese número')}${r.business ? ' · <span class="font-normal text-gray-500">' + escapeHtml(r.business) + '</span>' : ''}</div>
                    <div class="text-[11px] text-gray-500">${escapeHtml(r.phone)} · ${ago(r.created_at)}</div>
                </div>
                ${r.user_id
                    ? `<button onclick="answerAccessRequest(${r.user_id}, '${escapeHtml(r.phone)}')" class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><i class="fab fa-whatsapp mr-1"></i> Mandar link</button>`
                    : ''}
                <button onclick="dismissAccessRequest('${escapeHtml(r.phone)}')" class="text-xs text-gray-500 hover:text-gray-800 px-2 py-2">${r.user_id ? 'Ya lo atendí' : 'Descartar'}</button>
            </div>`).join('')}
        </div>
    </div>`;
}
async function answerAccessRequest(userId, phone) {
    await sendAccessLink(userId);
    await apiAdminPost('/access-requests/handled', { phone });
    loadAccessRequests();
}
async function dismissAccessRequest(phone) {
    await apiAdminPost('/access-requests/handled', { phone });
    loadAccessRequests();
}

// ── E1: reclamos automáticos ───────────────────────────────────────────────
async function confirmAutoClaim(businessId) {
    const data = await apiAdminPost('/claims/confirm-auto', { business_id: businessId });
    if (data.success) {
        showToast('✅ Reclamo confirmado — la ficha queda verificada', 'success');
        showNotifyOwnerPanel('Reclamo confirmado', data.notify);
        loadClaims(); if (typeof loadClaimFunnel === 'function') loadClaimFunnel();
    }
    else showToast('Error: ' + (data.error || 'No se pudo confirmar'), 'error');
}

// Panel "Avisar al dueño": el correo ya salió (si tenía); el WhatsApp es opcional y
// es un enlace real (lo toca el admin → el navegador no lo bloquea).
function showNotifyOwnerPanel(title, n) {
    document.getElementById('notifyOwnerPanel')?.remove();
    if (!n) return;
    const waHref = n.wa ? `https://wa.me/${n.wa}?text=${encodeURIComponent(n.message || '')}` : null;
    const mail = n.email
        ? (n.emailed ? `<i class="fas fa-envelope-circle-check text-emerald-600 mr-1"></i>Le mandamos un correo a <b>${escapeHtml(n.email)}</b>.`
                     : `<i class="fas fa-envelope text-amber-500 mr-1"></i>No se pudo mandar el correo a ${escapeHtml(n.email)}.`)
        : `<i class="fas fa-envelope text-gray-300 mr-1"></i>No dejó correo.`;
    const el = document.createElement('div');
    el.id = 'notifyOwnerPanel';
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:10000;max-width:420px;margin:0 auto';
    el.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4">
        <div class="flex items-start gap-2">
          <p class="flex-1 font-bold text-gray-900 text-sm">${escapeHtml(title)} · ¿le avisamos?</p>
          <button type="button" onclick="document.getElementById('notifyOwnerPanel').remove()" class="text-gray-400 text-lg leading-none" title="Cerrar">✕</button>
        </div>
        <p class="text-xs text-gray-500 mt-1">${mail}</p>
        ${waHref
          ? `<a id="notifyOwnerWa" href="${waHref}" target="_blank" rel="noopener" onclick="setTimeout(() => document.getElementById('notifyOwnerPanel')?.remove(), 300)"
               class="mt-3 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold text-sm rounded-xl py-2.5"><i class="fab fa-whatsapp"></i> Avisar por WhatsApp</a>`
          : `<p class="text-xs text-gray-400 mt-2">Sin celular registrado para WhatsApp.</p>`}
      </div>`;
    document.body.appendChild(el);
}
async function revertAutoClaim(businessId) {
    if (!confirm('¿Revertir este reclamo?\n\nLa ficha vuelve EXACTAMENTE a como estaba antes (datos, rubro y fotos), y la persona pierde el acceso.')) return;
    const data = await apiAdminPost('/claims/revert', { business_id: businessId });
    if (data.success) { showToast('↩ Reclamo revertido — la ficha volvió a como estaba', 'info'); loadClaims(); if (typeof loadClaimFunnel === 'function') loadClaimFunnel(); }
    else showToast('Error: ' + (data.error || 'No se pudo revertir'), 'error');
}
async function decideChangeRequest(id, decision) {
    const data = await apiAdminPost('/claims/change-request', { id, decision });
    if (data.success) {
        showToast(decision === 'approve' ? '✓ Cambio aplicado en la ficha' : 'Cambio descartado', decision === 'approve' ? 'success' : 'info');
        showNotifyOwnerPanel(decision === 'approve' ? 'Cambio aplicado' : 'Cambio descartado', data.notify);
        loadClaims();
    }
    else showToast('Error: ' + (data.error || 'No se pudo resolver'), 'error');
}
// Link de acceso de un solo uso → WhatsApp del dueño (o al portapapeles si no hay celular).
async function sendAccessLink(userId) {
    const win = window.open('about:blank', '_blank');
    const data = await apiAdminPost(`/users/${userId}/access-link`, {});
    if (!data || !data.success) { if (win) win.close(); showToast('Error: ' + ((data && data.error) || 'No se pudo generar el link'), 'error'); return; }
    const hola = data.name ? `¡Hola ${data.name}!` : '¡Hola!';
    const msg = `${hola} Este es tu acceso a RetoPA${data.business ? ' para gestionar ' + data.business : ''}: ${data.url}\n(Vale 7 días y un solo uso. Si vence, pedinos otro por acá.)`;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg); } catch (e) {}
    if (data.wa) {
        const waUrl = `https://wa.me/${data.wa}?text=${encodeURIComponent(msg)}`;
        if (win) { try { win.opener = null; } catch (e) {} win.location.href = waUrl; } else window.open(waUrl, '_blank', 'noopener');
        showToast('Chat abierto con el link de acceso (también quedó copiado).', 'success');
    } else {
        if (win) win.close();
        showToast('Sin celular registrado: el link de acceso quedó copiado para que lo mandes.', 'info');
    }
}

async function rejectClaim(businessId) {
    const reason = prompt('Motivo del rechazo (opcional):');
    if (reason === null) return; // canceló
    try {
        const data = await apiAdminPost('/claims/reject', { business_id: businessId, reason });
        if (data.success) {
            showToast('Claim rechazado', 'info');
            loadClaims();
        }
    } catch(e) {
        showToast('Error de conexión', 'error');
    }
}
