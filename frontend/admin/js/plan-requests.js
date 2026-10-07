// ── D7.3 — Solicitudes de plan (Tpago): vista admin ──────────────────────────
function prNum(n){ return Number(n || 0).toLocaleString('es-PY'); }
function prPlanLabel(p){ return p === 'premium' ? 'Empresa Pro' : p === 'featured' ? 'Negocio Digital' : p; }
function prFmtDate(iso){ try { return new Date(iso).toLocaleDateString('es-PY', { day:'2-digit', month:'short', year:'numeric' }); } catch(e){ return ''; } }
// Extrae el motivo de cancelación guardado en notes (formato: "... | Cancelada: <motivo>")
function prMotivo(notes){
    if (!notes) return '';
    const m = String(notes).match(/\|\s*Cancelada:\s*([\s\S]+)$/);
    return m ? m[1].trim() : '';
}

async function loadPlanRequests(){
    const body = document.getElementById('planReqBody');
    if (!body) return;
    const status = document.getElementById('planReqStatus')?.value || 'pending';
    body.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-400">Cargando…</td></tr>`;

    const res = await apiAdminGet(`/plan-requests?status=${encodeURIComponent(status)}`);
    if (!res || !res.success) { body.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-500">No se pudo cargar.</td></tr>`; return; }
    const rows = res.data || [];

    // Badge con el conteo de pendientes
    if (status === 'pending') {
        const badge = document.getElementById('planReqBadge');
        if (badge) { badge.textContent = rows.length; badge.classList.toggle('hidden', rows.length === 0); }
    }

    if (!rows.length) { body.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-400">Sin solicitudes ${status === 'pending' ? 'pendientes' : status === 'confirmed' ? 'confirmadas' : 'canceladas'}.</td></tr>`; return; }

    body.innerHTML = rows.map(r => {
        const name = escapeHtml(r.trade_name || r.name || r.slug || '—');
        const planLabel = escapeHtml(r.plan_name || prPlanLabel(r.plan));
        const isPending = r.status === 'pending';
        const motivo = r.status === 'cancelled' ? prMotivo(r.notes) : '';
        const actions = isPending
            ? `<div class="flex gap-1 justify-end">
                 ${r.tpago_link ? `<a href="${escapeHtml(r.tpago_link)}" target="_blank" rel="noopener" class="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100" title="Ver link de pago"><i class="fas fa-link"></i></a>` : ''}
                 <button onclick="confirmPlanRequest(${r.id})" class="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-bold"><i class="fas fa-check mr-1"></i> Confirmar pago</button>
                 <button onclick="cancelPlanRequest(${r.id})" class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100" title="Cancelar"><i class="fas fa-times"></i></button>
               </div>`
            : `<div class="text-right">
                 <span class="text-xs ${r.status === 'confirmed' ? 'text-green-600' : 'text-gray-400'}">${r.status === 'confirmed' ? 'Confirmada ' + prFmtDate(r.confirmed_at) : 'Cancelada ' + prFmtDate(r.confirmed_at)}</span>
                 ${motivo ? `<p class="text-xs text-gray-500 mt-0.5 italic max-w-[220px] ml-auto"><i class="fas fa-comment-dots text-gray-300 mr-1"></i>${escapeHtml(motivo)}</p>` : ''}
               </div>`;
        return `<tr class="hover:bg-gray-50">
            <td class="px-4 py-3">
                <p class="font-semibold text-gray-800">${name}</p>
                <p class="text-xs text-gray-400">${escapeHtml(r.city || '')}${r.owner_email ? ' · ' + escapeHtml(r.owner_email) : ''}</p>
            </td>
            <td class="px-4 py-3"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold ${r.plan === 'premium' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}">${planLabel}</span></td>
            <td class="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">Gs. ${prNum(r.amount_gs)}</td>
            <td class="px-4 py-3 text-gray-500">${prFmtDate(r.created_at)}</td>
            <td class="px-4 py-3 text-right">${actions}</td>
        </tr>`;
    }).join('');
}

let _prBusy = false; // guard anti-doble-clic (evita disparar 2 confirmaciones seguidas)
async function confirmPlanRequest(id){
    if (_prBusy) return;
    if (!confirm('¿Confirmar el pago y activar el plan? Si renueva antes de vencer, se le suman los días. Cada confirmación = 1 mes.')) return;
    _prBusy = true;
    try {
        const res = await apiAdminPost(`/plan-requests/${id}/confirm`, {});
        if (res && res.success) {
            showToast('Plan activado ✅ — vence ' + prFmtDate(res.data?.expires_at));
            loadPlanRequests();
        } else {
            showToast('Error: ' + ((res && res.error) || 'no se pudo confirmar'), 'error');
        }
    } finally { _prBusy = false; }
}

async function cancelPlanRequest(id){
    const note = prompt('Motivo de la cancelación (opcional):', '');
    if (note === null) return; // cerró el prompt
    const res = await apiAdminPost(`/plan-requests/${id}/cancel`, { notes: note });
    if (res && res.success) { showToast('Solicitud cancelada'); loadPlanRequests(); }
    else showToast('Error: ' + ((res && res.error) || 'no se pudo cancelar'), 'error');
}
