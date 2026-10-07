/**
 * RetoPA — Panel Embajador
 * dashboard.js: métricas del embajador + últimas fichas
 */

async function loadAmbDashboard() {
    // Métricas personales
    const me = await ambGet('/ambassador/me');
    if (me.success) {
        const m = me.data;
        document.getElementById('kpiTotal').textContent     = m.total_cargadas     || 0;
        document.getElementById('kpiPublished').textContent = m.total_publicadas    || 0;
        document.getElementById('kpiPending').textContent   = m.total_pendientes    || 0;
        document.getElementById('kpiRejected').textContent  = m.total_rechazadas    || 0;
        // Borradores en badge del menú
        const drafts = parseInt(m.total_borradores || 0);
        const badge  = document.getElementById('bnavDraftBadge');
        if (badge) { badge.textContent = drafts; badge.classList.toggle('hidden', drafts === 0); }
        const pending = parseInt(m.total_pendientes || 0) + drafts;
        const bnavBadge = document.getElementById('bnavPendingBadge');
        if (bnavBadge) { bnavBadge.textContent = pending; bnavBadge.classList.toggle('hidden', pending === 0); }
    }

    // Últimas fichas cargadas (5)
    const fichas = await ambGet('/ambassador/businesses?page=1&limit=5');
    const container = document.getElementById('dashUltimasFichas');
    if (!container) return;

    if (!fichas.success || !fichas.data.length) {
        container.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-building text-4xl text-gray-200 mb-3 block"></i>
                <p class="font-bold text-gray-700 mb-2">Todavía no cargaste ninguna ficha</p>
                <p class="text-sm text-gray-400 mb-4">Cada ficha que agregás ayuda a conectar negocios con clientes</p>
                <button onclick="showSection('nueva')"
                    class="bg-brand-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-brand-600 transition inline-flex items-center gap-2">
                    <i class="fas fa-plus"></i> Cargar primera ficha
                </button>
            </div>`;
        return;
    }

    container.innerHTML = fichas.data.map(b => renderFichaRow(b)).join('');
}

function renderFichaRow(b) {
    const statusBadge = b.data_status === 'pending_review'
        ? `<span class="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-clock mr-1"></i>En revisión</span>`
        : b.data_status === 'rejected'
        ? `<span class="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-times mr-1"></i>Rechazada</span>`
        : `<span class="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold"><i class="fas fa-check mr-1"></i>Publicada</span>`;

    const rejNote = b.data_status === 'rejected' && b.review_note
        ? `<p class="text-xs text-red-500 mt-1"><i class="fas fa-info-circle mr-1"></i>${escHtml(b.review_note)}</p>`
        : '';

    return `
    <div class="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
        <div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0 overflow-hidden border border-gray-200">
            ${b.image_url ? `<img src="${escHtml(b.image_url)}" class="w-full h-full object-cover">` : (b.logo_emoji || '🏢')}
        </div>
        <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-bold text-gray-900 text-sm truncate">${escHtml(b.trade_name || b.name)}</p>
                    <p class="text-xs text-gray-400">${escHtml(b.category_name || '')}${b.city ? ' · ' + escHtml(b.city) : ''}</p>
                    ${rejNote}
                </div>
                ${statusBadge}
            </div>
        </div>
    </div>`;
}
