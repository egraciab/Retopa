/**
 * RetoPA — admin/js/promotions-admin.js
 * S6.4 — Menú Promociones en Panel Admin
 */

async function initPromosAdmin() {
    await loadPromosAdmin();
}

async function loadPromosAdmin() {
    await Promise.all([loadPromosKpis(), loadPendingBoosts(), loadPromosHistory()]);
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
async function loadPromosKpis() {
    const data = await apiAdminGet('/promotions/dashboard');
    if (!data.success) return;

    const p = data.promos;
    const b = data.boosts;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('kpiPromosActivas',   Number(p.activas||0).toLocaleString());
    set('kpiPromosExpiradas', Number(p.expiradas||0).toLocaleString());
    set('kpiPromosClicks',    Number(p.total_clicks||0).toLocaleString());
    set('kpiPromosIngresos',  'Gs. ' + Number(b.ingresos_gs||0).toLocaleString('es-PY'));

    // Badge en el menú
    const badge = document.getElementById('promosPendingBadge');
    const count = parseInt(b.pendientes||0);
    if (badge) {
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
    }
    const countEl = document.getElementById('pendingBoostCount');
    if (countEl) countEl.textContent = count > 0 ? count : '';
}

// ── Solicitudes pendientes ────────────────────────────────────────────────────
async function loadPendingBoosts() {
    const list = document.getElementById('pendingBoostsList');
    if (!list) return;

    const data = await apiAdminGet('/promotions/pending');
    if (!data.success) { list.innerHTML = '<p class="text-red-400 text-center py-4">Error al cargar</p>'; return; }

    if (!data.data.length) {
        list.innerHTML = `
        <div class="text-center py-8 text-gray-400">
            <i class="fas fa-check-circle text-3xl text-green-400 mb-2 block"></i>
            <p class="font-semibold">No hay solicitudes pendientes</p>
        </div>`;
        return;
    }

    const boostLabels = {
        boost_7d:       '7 días',
        boost_15d:      '15 días',
        boost_home_30d: '30 días + Home 🏠',
    };

    list.innerHTML = data.data.map(b => `
    <div class="flex items-start justify-between gap-4 p-4 border border-orange-100 bg-orange-50 rounded-xl mb-3">
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="font-bold text-gray-900 text-sm">${escapeHtml(b.trade_name||b.business_name)}</span>
                <span class="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                    ${boostLabels[b.boost_type]||b.boost_type}
                </span>
                <span class="text-xs font-bold text-gray-700">
                    Gs. ${Number(b.price_gs).toLocaleString('es-PY')}
                </span>
            </div>
            <p class="text-xs text-gray-500">${escapeHtml(b.user_name||'')} · ${escapeHtml(b.user_email||'')} · ${new Date(b.created_at).toLocaleDateString('es-PY')}</p>
            ${b.lead_id ? `<p class="text-xs text-gray-400 mt-0.5">Lead #${b.lead_id}</p>` : ''}
        </div>
        <div class="flex gap-2 flex-shrink-0">
            <button onclick="approveBoost(${b.id})"
                class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1">
                <i class="fas fa-check"></i> Aprobar
            </button>
            <button onclick="rejectBoost(${b.id})"
                class="bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1">
                <i class="fas fa-times"></i> Rechazar
            </button>
        </div>
    </div>`).join('');
}

async function approveBoost(id) {
    if (!confirm('¿Confirmar aprobación del boost? Se notificará al cliente.')) return;
    const res = await apiAdminPost(`/promotions/boosts/${id}/approve`, {});
    if (res.success) {
        showToast(`✅ ${res.message}`);
        loadPromosAdmin();
    } else {
        showToast('Error: ' + (res.error||'No se pudo aprobar'), 'error');
    }
}

async function rejectBoost(id) {
    const reason = prompt('Motivo del rechazo (opcional):');
    if (reason === null) return; // canceló
    const res = await apiAdminPost(`/promotions/boosts/${id}/reject`, { reason });
    if (res.success) {
        showToast('Solicitud rechazada');
        loadPromosAdmin();
    } else {
        showToast('Error: ' + (res.error||''), 'error');
    }
}

// ── Historial ─────────────────────────────────────────────────────────────────
async function loadPromosHistory() {
    const list = document.getElementById('promosHistoryList');
    if (!list) return;

    const status    = document.getElementById('promoFilterStatus')?.value || '';
    const boostType = document.getElementById('promoFilterType')?.value   || '';
    const params    = new URLSearchParams({ limit: 50, offset: 0 });
    if (status)    params.set('status',     status);
    if (boostType) params.set('boost_type', boostType);

    const data = await apiAdminGet(`/promotions/history?${params}`);
    if (!data.success) { list.innerHTML = '<p class="text-red-400 text-center py-4">Error</p>'; return; }

    if (!data.data.length) {
        list.innerHTML = '<div class="text-center py-8 text-gray-400">Sin resultados</div>';
        return;
    }

    const boostColors = {
        plan:           'bg-blue-100 text-blue-700',
        boost_7d:       'bg-orange-100 text-orange-700',
        boost_15d:      'bg-orange-100 text-orange-700',
        boost_home_30d: 'bg-purple-100 text-purple-700',
    };
    const boostLabels = {
        plan: 'Plan Pro', boost_7d: '7 días', boost_15d: '15 días', boost_home_30d: '30d + Home'
    };

    list.innerHTML = `
    <table class="w-full text-sm tbl-compact">
        <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
                <th class="px-4 py-3 text-left font-semibold">Empresa</th>
                <th class="px-4 py-3 text-left font-semibold">Título</th>
                <th class="px-4 py-3 text-left font-semibold col-hide-mobile">Tipo</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-right font-semibold col-hide-mobile">Clicks</th>
                <th class="px-4 py-3 text-right font-semibold col-hide-mobile">Ingreso</th>
                <th class="px-4 py-3 text-left font-semibold col-hide-mobile">Vence</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
        ${data.data.map(p => {
            const isActive = p.is_active && new Date(p.expires_at) > new Date();
            return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-3">
                    <p class="font-semibold text-gray-900 text-xs">${escapeHtml(p.trade_name||p.business_name)}</p>
                    <p class="text-[10px] text-gray-400">${escapeHtml(p.owner_email||'')}</p>
                </td>
                <td class="px-4 py-3 text-gray-700 text-xs max-w-[160px] truncate">${escapeHtml(p.title||'—')}</td>
                <td class="px-4 py-3 col-hide-mobile">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${boostColors[p.boost_type]||'bg-gray-100 text-gray-600'}">
                        ${boostLabels[p.boost_type]||p.boost_type}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                        ${isActive ? 'Activa' : 'Expirada'}
                    </span>
                </td>
                <td class="px-4 py-3 text-right text-xs font-bold text-gray-700 col-hide-mobile">${Number(p.clicks||0).toLocaleString()}</td>
                <td class="px-4 py-3 text-right text-xs font-bold text-[#E8B84B] col-hide-mobile">
                    ${p.boost_price_gs ? 'Gs. '+Number(p.boost_price_gs).toLocaleString('es-PY') : '—'}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap col-hide-mobile">
                    ${p.expires_at ? new Date(p.expires_at).toLocaleDateString('es-PY') : '—'}
                </td>
            </tr>`;
        }).join('')}
        </tbody>
    </table>`;
}
