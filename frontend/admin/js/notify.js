/**
 * RetoPA Admin — js/notify.js
 * Panel de notificación masiva por email
 */

let _notifyPage       = 1;
let _notifyTotal      = 0;
let _notifySelected   = new Set();
let _notifySelectAll  = false;
let _notifyFilters    = { notified: 'no', q: '', source: '' };

// ── Inicialización ────────────────────────────────────────────────────────────
async function initNotifySection() {
    // Cargar cooldown actual
    const cfgData = await apiAdminGet('/notify/candidates?limit=1');
    if (cfgData.cooldown_days) {
        const el = document.getElementById('cooldownDays');
        if (el) el.value = cfgData.cooldown_days;
    }
    await loadNotifyCandidates(1);
}

// ── Cargar candidatos ─────────────────────────────────────────────────────────
async function loadNotifyCandidates(page = 1) {
    _notifyPage = page;
    _notifySelected.clear();
    _notifySelectAll = false;
    updateNotifySelectionUI();

    const params = new URLSearchParams({
        page,
        limit: 50,
        notified: _notifyFilters.notified,
        ...(  _notifyFilters.q      && { q:      _notifyFilters.q      }),
        ...(  _notifyFilters.source && { source: _notifyFilters.source }),
    });

    const data = await apiAdminGet(`/notify/candidates?${params}`);
    if (!data.success) { showToast('Error cargando candidatos', 'error'); return; }

    _notifyTotal = data.pagination.total;

    // Stats
    const s = data.stats;
    document.getElementById('notifyStatNotificables').textContent  = s.notificables.toLocaleString();
    document.getElementById('notifyStatPending').textContent       = s.sin_notificar.toLocaleString();
    document.getElementById('notifyStatSent').textContent          = s.ya_notificadas.toLocaleString();
    const elegEl = document.getElementById('notifyStatElegibles');
    if (elegEl) elegEl.textContent = (s.elegibles_cooldown ?? '—').toLocaleString();

    // Tabla
    const tbody = document.getElementById('notifyTableBody');
    if (!data.data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400">
            <i class="fas fa-check-circle text-3xl mb-2 block text-green-400"></i>
            No hay empresas pendientes de notificar con estos filtros
        </td></tr>`;
    } else {
        tbody.innerHTML = data.data.map(biz => `
            <tr class="table-row border-b border-gray-50 hover:bg-blue-50/30 transition-colors" data-id="${biz.id}">
                <td class="py-3 px-4">
                    <input type="checkbox" class="notify-check w-4 h-4 rounded text-[#0ea5e9]"
                        value="${biz.id}" onchange="toggleNotifyItem(${biz.id}, this.checked)"
                        ${_notifySelected.has(biz.id) ? 'checked' : ''}>
                </td>
                <td class="py-3 px-4">
                    <p class="font-medium text-gray-900 text-sm">${escapeHtml(biz.name)}</p>
                    <p class="text-xs text-gray-400">${biz.source || '—'}</p>
                </td>
                <td class="py-3 px-4 text-sm text-gray-600">${escapeHtml(biz.email || '—')}</td>
                <td class="py-3 px-4 text-sm text-gray-500">${escapeHtml(biz.city || '—')}</td>
                <td class="py-3 px-4 text-center">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                        ${biz.quality_score >= 40 ? 'bg-green-100 text-green-700' :
                          biz.quality_score >= 15 ? 'bg-yellow-100 text-yellow-700' :
                                                     'bg-gray-100 text-gray-500'}">
                        ${biz.quality_score}
                    </span>
                </td>
                <td class="py-3 px-4 text-center text-xs text-gray-400">
                    ${biz.notified_at
                        ? `<span class="text-amber-600 font-medium">
                            <i class="fas fa-paper-plane mr-1"></i>${new Date(biz.notified_at).toLocaleDateString('es-PY')}
                            ${biz.notify_count > 1 ? `(${biz.notify_count}x)` : ''}
                           </span>`
                        : `<span class="text-gray-300">—</span>`}
                </td>
            </tr>
        `).join('');
    }

    // Paginación
    renderNotifyPagination(data.pagination);
    updateNotifySelectionUI();
}

function renderNotifyPagination(p) {
    const el = document.getElementById('notifyPagination');
    if (p.pages <= 1) { el.innerHTML = ''; return; }
    let html = `<div class="flex items-center gap-2 text-sm">
        <span class="text-gray-500">${((p.page-1)*p.limit)+1}–${Math.min(p.page*p.limit, p.total)} de ${p.total.toLocaleString()}</span>
        <button onclick="loadNotifyCandidates(${p.page-1})" ${p.page<=1?'disabled':''} class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
            <i class="fas fa-chevron-left"></i>
        </button>`;
    const start = Math.max(1, p.page-2), end = Math.min(p.pages, p.page+2);
    for (let i = start; i <= end; i++) {
        html += `<button onclick="loadNotifyCandidates(${i})" class="px-3 py-1.5 rounded-lg border ${i===p.page ? 'border-[#0ea5e9] bg-[#0ea5e9] text-white font-bold' : 'border-gray-200 hover:bg-gray-50'}">${i}</button>`;
    }
    html += `<button onclick="loadNotifyCandidates(${p.page+1})" ${p.page>=p.pages?'disabled':''} class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
        <i class="fas fa-chevron-right"></i>
    </button></div>`;
    el.innerHTML = html;
}

// ── Selección ─────────────────────────────────────────────────────────────────
function toggleNotifyItem(id, checked) {
    if (checked) _notifySelected.add(id);
    else         _notifySelected.delete(id);
    _notifySelectAll = false;
    updateNotifySelectionUI();
}

function toggleNotifyAll() {
    _notifySelectAll = !_notifySelectAll;
    _notifySelected.clear();

    document.querySelectorAll('.notify-check').forEach(cb => {
        cb.checked = _notifySelectAll;
        if (_notifySelectAll) _notifySelected.add(parseInt(cb.value));
    });
    updateNotifySelectionUI();
}

function updateNotifySelectionUI() {
    const count = _notifySelectAll ? _notifyTotal : _notifySelected.size;
    const btn   = document.getElementById('notifySendBtn');
    const label = document.getElementById('notifySelectionLabel');
    const allCb = document.getElementById('notifySelectAllCheck');

    if (allCb) allCb.indeterminate = _notifySelected.size > 0 && !_notifySelectAll;
    if (allCb) allCb.checked       = _notifySelectAll;

    if (count === 0) {
        label.textContent = 'Seleccioná empresas para notificar';
        btn.disabled = true;
        btn.classList.add('opacity-50');
    } else {
        label.textContent = `${count.toLocaleString()} empresa${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}`;
        btn.disabled = false;
        btn.classList.remove('opacity-50');
    }
}

// ── Filtros ───────────────────────────────────────────────────────────────────
function applyNotifyFilters() {
    _notifyFilters.notified = document.getElementById('notifyFilterNotified').value;
    _notifyFilters.q        = document.getElementById('notifyFilterQ').value.trim();
    _notifyFilters.source   = document.getElementById('notifyFilterSource').value;
    loadNotifyCandidates(1);
}

// ── Preview + Envío ───────────────────────────────────────────────────────────
async function openNotifyPreview() {
    const ids = _notifySelectAll ? 'all' : Array.from(_notifySelected);
    if (!_notifySelectAll && _notifySelected.size === 0) return;

    const data = await apiAdminPost('/notify/preview', { ids });
    if (!data.success) { showToast('Error: ' + data.error, 'error'); return; }

    const modal = document.getElementById('notifyPreviewModal');
    document.getElementById('notifyPreviewCount').textContent = data.count.toLocaleString();
    document.getElementById('notifyPreviewSample').innerHTML = data.sample.map(b => `
        <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-[#0ea5e9]">
                ${b.name.charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">${escapeHtml(b.name)}</p>
                <p class="text-xs text-gray-400 truncate">${escapeHtml(b.email)}</p>
            </div>
            ${b.city ? `<span class="text-xs text-gray-400 shrink-0">${escapeHtml(b.city)}</span>` : ''}
        </div>
    `).join('');

    modal.classList.remove('hidden');
}

function closeNotifyPreview() {
    document.getElementById('notifyPreviewModal').classList.add('hidden');
}

async function confirmNotifySend() {
    closeNotifyPreview();

    const ids = _notifySelectAll ? 'all' : Array.from(_notifySelected);
    const progressEl = document.getElementById('notifyProgress');
    const logEl      = document.getElementById('notifyLog');
    progressEl.classList.remove('hidden');
    logEl.innerHTML  = '';

    document.getElementById('notifySendBtn').disabled = true;

    const data = await apiAdminPost('/notify/send', { ids });

    progressEl.classList.add('hidden');
    document.getElementById('notifySendBtn').disabled = false;

    if (data.success) {
        showToast(`✅ ${data.sent} emails enviados${data.failed ? `, ${data.failed} fallidos` : ''}`, data.failed ? 'warn' : 'success');
        if (data.errors?.length) {
            logEl.innerHTML = data.errors.map(e =>
                `<div class="text-red-500 text-xs">✗ ${escapeHtml(e.name)} (${escapeHtml(e.email)}): ${escapeHtml(e.error)}</div>`
            ).join('');
            logEl.classList.remove('hidden');
        }
        await loadNotifyCandidates(_notifyPage);
    } else {
        showToast('Error: ' + data.error, 'error');
    }
}

// ── Preview del email ─────────────────────────────────────────────────────────
async function openNotifyEmailPreview() {
    const modal = document.getElementById('notifyEmailPreviewModal');
    modal.classList.remove('hidden');
    document.getElementById('notifyEmailPreviewBody').innerHTML =
        '<div class="text-center py-8 text-gray-300"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';

    const data = await apiAdminGet('/notify/email-preview');
    if (!data.success) {
        document.getElementById('notifyEmailPreviewBody').innerHTML =
            `<div class="text-center py-8 text-red-400">${data.error || 'Error cargando preview'}</div>`;
        return;
    }

    document.getElementById('notifyPreviewFrom').textContent    = data.from    || '—';
    document.getElementById('notifyPreviewSubject').textContent = data.subject || '—';

    const ccRow = document.getElementById('notifyPreviewCcRow');
    if (data.cc) {
        document.getElementById('notifyPreviewCc').textContent = data.cc;
        ccRow.classList.remove('hidden');
    } else {
        ccRow.classList.add('hidden');
    }

    // Render HTML en iframe para aislarlo del panel
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;border:0;min-height:600px';
    iframe.sandbox = 'allow-same-origin';
    document.getElementById('notifyEmailPreviewBody').innerHTML = '';
    document.getElementById('notifyEmailPreviewBody').appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(data.html);
    iframe.contentDocument.close();
    // Auto-resize
    setTimeout(() => {
        try { iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px'; } catch(e) {}
    }, 300);
}

// ── Cooldown ──────────────────────────────────────────────────────────────────
async function saveCooldown() {
    const days = parseInt(document.getElementById('cooldownDays')?.value);
    if (!days || days < 1) { showToast('Ingresá un valor válido (mín. 1 día)', 'error'); return; }
    const res = await apiAdminPost('/notify/cooldown', { days });
    if (res.success) {
        showToast(`Cooldown guardado: ${res.cooldown_days} días ✅`);
        loadNotifyCandidates(1); // Refrescar stats
    } else { showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error'); }
}

// ── Parámetros de campaña (fuente/ciudad/score/tope/cooldown) ─────────────────
function _campaignParams() {
    const p = {};
    const src  = document.getElementById('campSource')?.value;
    const city = document.getElementById('campCity')?.value?.trim();
    const ms   = parseInt(document.getElementById('campMinScore')?.value, 10);
    const lim  = parseInt(document.getElementById('campLimit')?.value, 10);
    if (src)  p.source = src;
    if (city) p.city = city;
    if (Number.isFinite(ms)  && ms  > 0) p.min_score = ms;
    if (Number.isFinite(lim) && lim > 0) p.limit = lim;
    // checkbox: por defecto true (incluir re-notificaciones por cooldown)
    p.include_cooldown = document.getElementById('campIncludeCooldown')?.checked !== false;
    return p;
}

function _campaignFiltersText(p) {
    const parts = [];
    if (p.source)    parts.push(`fuente=${p.source}`);
    if (p.city)      parts.push(`ciudad=${p.city}`);
    if (p.min_score) parts.push(`score≥${p.min_score}`);
    if (p.limit)     parts.push(`tope=${p.limit.toLocaleString()}/tanda`);
    parts.push(p.include_cooldown ? 'incluye re-notif.' : 'solo nunca notificadas');
    return parts.join(' · ');
}

// ── Recalcular (dry-run): cuántas y a quiénes se enviaría, SIN enviar ─────────
async function recalcularCampaign() {
    const box = document.getElementById('campaignResult');
    const p = _campaignParams();
    if (box) {
        box.classList.remove('hidden');
        box.classList.remove('bg-red-50','border-red-200','text-red-700');
        box.classList.add('bg-green-50','border-green-200','text-green-700');
        box.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Recalculando…';
    }
    const res = await apiAdminPost('/notify/campaign-preview', p);
    if (!res.success) {
        if (box) box.innerHTML = `<span class="text-red-600">❌ Error: ${escapeHtml(res.error || '')}</span>`;
        return;
    }
    const sample = (res.sample || []).map(b =>
        `${escapeHtml(b.name)}${b.city ? ` · ${escapeHtml(b.city)}` : ''} <span class="text-gray-400">(score ${b.quality_score})</span>`
    ).join('<br>');
    if (box) box.innerHTML = `
        <p class="font-bold">📊 Se enviarían <span class="text-lg">${res.to_send.toLocaleString()}</span> correos${
            res.cap && res.to_send < res.total_eligible ? ` (tope de ${res.cap.toLocaleString()} por tanda; ${res.total_eligible.toLocaleString()} elegibles en total)` : ` de ${res.total_eligible.toLocaleString()} elegibles`
        }.</p>
        <p class="text-xs text-gray-500 mt-1">Filtros: ${escapeHtml(_campaignFiltersText(p))}</p>
        ${sample ? `<div class="text-xs text-gray-600 mt-2 pt-2 border-t border-green-200"><span class="font-semibold">Primeras:</span><br>${sample}</div>` : ''}`;
}

// ── Campaña automática (usa los parámetros + recalcula antes de confirmar) ─────
async function launchCampaign() {
    const p = _campaignParams();

    // Recalcular para confirmar con el número exacto (refleja filtros + cooldown + tope).
    const pre = await apiAdminPost('/notify/campaign-preview', p);
    if (!pre.success) { showToast('Error: ' + (pre.error || 'no se pudo calcular'), 'error'); return; }
    if (!pre.to_send) { showToast('No hay empresas elegibles con estos parámetros', 'error'); return; }

    if (!confirm(`¿Iniciar campaña?\n\n→ ${pre.to_send.toLocaleString()} de ${pre.total_eligible.toLocaleString()} elegibles\n→ ${_campaignFiltersText(p)}\n→ Rate limit: 3 emails/segundo\n\nEsto puede tomar varios minutos.`)) return;

    const resultEl = document.getElementById('campaignResult');
    if (resultEl) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando campaña... no cerrés esta ventana.';
    }

    const res = await apiAdminPost('/notify/campaign', p);

    if (res.success) {
        let msg = `✅ Campaña finalizada — ${res.sent.toLocaleString()} enviados, ${res.failed} fallidos`;
        if (res.remaining) msg += `. Quedan ${res.remaining.toLocaleString()} elegibles${res.capped ? ' (volvé a lanzar para la próxima tanda)' : ''}.`;
        if (resultEl) resultEl.innerHTML = msg;
        showToast(msg);
        loadNotifyCandidates(1);
    } else {
        if (resultEl) resultEl.innerHTML = `<span class="text-red-600">❌ Error: ${res.error}</span>`;
        showToast('Error en la campaña: ' + (res.error || 'desconocido'), 'error');
    }
}
