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
        <div class="flex items-center gap-2">
            <div class="relative">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input id="claimSearch" type="text" placeholder="Buscar empresa, dueño o email..."
                    class="border border-gray-200 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9] w-72"
                    oninput="doClaimSearch(this.value)">
            </div>
            <button onclick="loadClaims(_claimPage)" class="btn-brand text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <i class="fas fa-sync-alt"></i> Actualizar
            </button>
        </div>
    </div>
    <div id="claimsStats" class="grid grid-cols-3 gap-4 mb-6"></div>
    <div id="claimsList" class="space-y-4">
        <div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
    </div>
    <div id="claimsPagination" class="flex items-center justify-center gap-2 mt-6"></div>`;
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
        const totalAll = s.total    ?? _allClaims.length;

        // Badge en el menú (siempre el total GLOBAL de pendientes)
        const badge = document.getElementById('claimsBadge');
        if (badge) {
            badge.textContent = pending;
            badge.classList.toggle('hidden', pending === 0);
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
            statsEl.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
            statsEl.innerHTML =
                card('all', totalAll, 'Todos', _claimFilter==='all',
                    { active:'bg-sky-50 border-sky-400', idle:'bg-white border-gray-100 hover:border-gray-200', num:'text-sky-600', txt:'text-sky-700' }) +
                card('pending', pending, 'Pendientes', _claimFilter==='pending',
                    { active:'bg-amber-50 border-amber-400', idle:'bg-amber-50/40 border-transparent hover:border-amber-200', num:'text-amber-600', txt:'text-amber-700' }) +
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
            const statusColor = c.claim_status === 'pending'  ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : c.claim_status === 'approved' ? 'bg-green-100 text-green-700 border-green-200'
                              : 'bg-red-100 text-red-600 border-red-200';
            const statusLabel = c.claim_status === 'pending'  ? '⏳ Pendiente'
                              : c.claim_status === 'approved' ? '✅ Aprobado'
                              : '❌ Rechazado';
            const claimedDate = c.claimed_at
                ? new Date(c.claimed_at).toLocaleDateString('es-PY', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                : '—';

            return `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <h4 class="font-bold text-gray-900">${c.trade_name || c.name}</h4>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}">${statusLabel}</span>
                        </div>
                        <p class="text-xs text-gray-400 mb-3">${c.name !== c.trade_name ? c.name + ' · ' : ''}${c.city || ''}
                            <span class="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.origin === 'formulario' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}">${c.origin === 'formulario' ? 'Formulario' : 'Cuenta'}</span>
                        </p>
                        <div class="grid grid-cols-2 gap-2 text-xs text-gray-500">
                            <div><i class="fas fa-user text-gray-300 mr-1"></i> ${c.contact_name || c.user_name || '—'}</div>
                            <div><i class="fas fa-envelope text-gray-300 mr-1"></i> ${c.contact_email || c.user_email || c.email || '—'}</div>
                            <div><i class="fas fa-phone text-gray-300 mr-1"></i> ${c.contact_phone || '—'}</div>
                            <div><i class="fas fa-clock text-gray-300 mr-1"></i> ${claimedDate}</div>
                        </div>
                        ${(c.message || c.evidence_url) ? `
                        <div class="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                            ${c.message ? `<p class="text-gray-700 mb-1"><i class="fas fa-comment-dots text-amber-500 mr-1"></i> ${escapeHtml(c.message)}</p>` : ''}
                            ${c.evidence_url ? `<a href="${escapeHtml(c.evidence_url)}" target="_blank" class="text-brand-600 hover:underline break-all"><i class="fas fa-link mr-1"></i> ${escapeHtml(c.evidence_url)}</a>` : ''}
                        </div>` : ''}
                    </div>
                    <div class="flex flex-col gap-2 flex-shrink-0">
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
                        ${c.claim_status === 'approved' ? (c.user_id
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
