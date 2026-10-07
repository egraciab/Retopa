/**
 * RetoPA Admin — js/leads.js
 * CRM Leads: listado, modal, export
 */

// ================================================================
// LEADS PRO - SPRINT 2 v2
// ================================================================
function debounceLoadLeads() {
    if (leadsDebounceTimer) clearTimeout(leadsDebounceTimer);
    leadsDebounceTimer = setTimeout(() => { currentLeadPage = 1; loadAdminLeads(); }, 300);
}

function setLeadFilter(status) {
    document.getElementById('leadFilterStatus').value = status;
    showSection('leads');
}

// Cambiar entre vista de activos y archivados
function setLeadView(view) {
    window.currentLeadView = view;
    currentLeadPage = 1;
    // Actualizar estilo de los botones del toggle
    ['active', 'archived'].forEach(v => {
        const btn = document.getElementById('leadViewBtn_' + v);
        if (btn) {
            if (v === view) {
                btn.className = 'px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#0ea5e9] text-white transition';
            } else {
                btn.className = 'px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100 transition';
            }
        }
    });
    loadAdminLeads();
}

// Archivar o desarchivar un lead
async function archiveLead(id, archived) {
    const res = await apiAdminPost(`/leads/${id}/archive`, { archived }, 'PUT');
    if (res && res.success) {
        showToast(archived ? 'Lead archivado' : 'Lead restaurado', 'success');
        loadAdminLeads();
    } else {
        showToast('Error al archivar', 'error');
    }
}

function sortLeads(field) {
    if (currentSortField === field) {
        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDir = 'asc';
    }
    ['contact_name','business_name','created_at'].forEach(f => {
        const icon = document.getElementById(`sortIcon_${f}`);
        if (icon) {
            icon.className = 'fas fa-sort text-gray-300 ml-1';
            if (f === currentSortField) {
                icon.className = currentSortDir === 'asc' ? 'fas fa-sort-up text-[#0ea5e9] ml-1' : 'fas fa-sort-down text-[#0ea5e9] ml-1';
            }
        }
    });
    loadAdminLeads();
}

async function loadAdminLeads() {
    const status = document.getElementById('leadFilterStatus')?.value || '';
    const service = document.getElementById('leadFilterService')?.value || '';
    const search = document.getElementById('leadSearch')?.value?.trim() || '';
    const sortBy = document.getElementById('leadSortBy')?.value || 'created_at_desc';

    if (sortBy) {
        const parts = sortBy.split('_');
        currentSortDir = parts.pop();
        currentSortField = parts.join('_');
    }

    ['contact_name','business_name','created_at'].forEach(f => {
        const icon = document.getElementById(`sortIcon_${f}`);
        if (icon) {
            icon.className = 'fas fa-sort text-gray-300 ml-1';
            if (f === currentSortField) {
                icon.className = currentSortDir === 'asc' ? 'fas fa-sort-up text-[#0ea5e9] ml-1' : 'fas fa-sort-down text-[#0ea5e9] ml-1';
            }
        }
    });

    const origin = document.getElementById('leadFilterOrigin')?.value || '';

    let url = `/leads?limit=${leadsPerPage}&offset=${(currentLeadPage - 1) * leadsPerPage}`;
    url += `&view=${window.currentLeadView || 'active'}`;
    if (status) url += `&status=${status}`;
    if (origin) url += `&origin=${origin}`;
    if (service) url += `&service_type=${service}`;
    if (search) url += `&q=${encodeURIComponent(search)}`;
    url += `&sort=${currentSortField}&dir=${currentSortDir}`;

    const data = await apiAdminGet(url);

    // Load stats
    loadLeadsStats();

    if (!data.success) {
        document.getElementById('leadsTable').innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>Error cargando leads</td></tr>`;
        showToast('Error cargando leads: ' + (data.error || ''), 'error');
        document.getElementById('leadsPaginationInfo').textContent = 'Error';
        document.getElementById('leadsPaginationControls').innerHTML = '';
        return;
    }

    allLeadsCache = data.data || [];
    renderLeadsTable(allLeadsCache, search);

    const pagination = data.pagination || { page: currentLeadPage, pages: 1, total: allLeadsCache.length, limit: leadsPerPage };
    renderLeadsPagination(pagination);
}

// KPIs dinámicos, separados por CAPTACIÓN vs VENTA, con deltas temporales.
// Se calcula sobre TODO el universo (view=all) para poder contar también los
// tratados (verificados/descartados/ganados/perdidos), que ya no están en "Activos".
async function loadLeadsStats() {
    const all = await apiAdminGet('/leads?limit=9999&view=all');
    if (!all || !all.success || !all.data) return;

    const now = Date.now();
    const D7 = now - 7 * 86400000;
    const monthStart = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); })();
    const ts = l => { const t = new Date(l.created_at).getTime(); return Number.isFinite(t) ? t : 0; };
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    const cap = all.data.filter(isCaptacionLead);
    const venta = all.data.filter(l => !isCaptacionLead(l));

    // ── CAPTACIÓN ──
    const porVerificar = cap.filter(l => (l.status || 'pending') === 'pending');
    const verificados  = cap.filter(l => l.status === 'verificado');
    const descartados  = cap.filter(l => l.status === 'descartado');
    const resueltos = verificados.length + descartados.length;
    const tasa = resueltos > 0 ? Math.round(verificados.length / resueltos * 100) : null;

    set('capKpiPorVerificar', porVerificar.length.toLocaleString());
    set('capKpiPorVerificarDelta', (() => {
        const nuevas7 = porVerificar.filter(l => ts(l) >= D7).length;
        return nuevas7 > 0 ? `+${nuevas7} nuevas · 7 días` : (porVerificar.length ? 'sin altas nuevas · 7 días' : 'todo al día ✓');
    })());
    set('capKpiVerificados', verificados.length.toLocaleString());
    set('capKpiVerificadosDelta', `${verificados.filter(l => ts(l) >= monthStart).length} este mes`);
    set('capKpiTasa', tasa === null ? '—' : tasa + '%');
    set('capKpiTasaDelta', resueltos > 0 ? `de ${resueltos} resueltos` : 'sin resueltos aún');
    set('capKpiDescartados', descartados.length.toLocaleString());
    set('capKpiDescartadosDelta', `${descartados.filter(l => ts(l) >= monthStart).length} este mes`);

    // ── VENTA ──
    const pipeline = venta.filter(l => ['pending', 'contacted', 'negotiating', 'follow_up'].includes(l.status || 'pending'));
    const vContact = venta.filter(l => l.status === 'contacted');
    const ganados  = venta.filter(l => l.status === 'won' || l.status === 'closed');
    const perdidos = venta.filter(l => l.status === 'lost');

    set('ventaKpiPipeline', pipeline.length.toLocaleString());
    set('ventaKpiPipelineDelta', `${venta.filter(l => (l.status || 'pending') === 'pending').length} sin contactar`);
    set('ventaKpiContactados', vContact.length.toLocaleString());
    set('ventaKpiContactadosDelta', `${venta.filter(l => l.status === 'negotiating').length} negociando`);
    set('ventaKpiGanados', ganados.length.toLocaleString());
    set('ventaKpiGanadosDelta', `${ganados.filter(l => ts(l) >= monthStart).length} este mes`);
    set('ventaKpiPerdidos', perdidos.length.toLocaleString());
    const cerrados = ganados.length + perdidos.length;
    set('ventaKpiPerdidosDelta', cerrados > 0 ? `cierre ${Math.round(ganados.length / cerrados * 100)}% ganado` : 'sin cierres aún');
}

// Filtro accionable desde las tarjetas KPI: setea origen/estado/vista y recarga.
function filterLeadsBy(opts) {
    opts = opts || {};
    const oEl = document.getElementById('leadFilterOrigin'); if (oEl) oEl.value = opts.origin || '';
    const sEl = document.getElementById('leadFilterStatus'); if (sEl) sEl.value = opts.status || '';
    if (opts.view && opts.view !== (window.currentLeadView || 'active')) {
        setLeadView(opts.view); // actualiza el toggle y recarga
    } else {
        currentLeadPage = 1;
        loadAdminLeads();
    }
}

function renderLeadsTable(leads, search) {
    const tbody = document.getElementById('leadsTable');
    if (!leads || leads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-400"><i class="fas fa-inbox text-2xl mb-2 block"></i>No se encontraron leads</td></tr>`;
        return;
    }

    tbody.innerHTML = leads.map(l => {
        const isSelected = selectedLeads.has(l.id);
        const bizData = parseLeadNotes(l);
        const bizName = bizData.business_name || l.business_name;
        const isCap = isCaptacionLead(l);

        return `
            <tr class="table-row transition ${isSelected ? 'selected' : ''}" data-lead-id="${l.id}">
                <td class="px-4 py-4 col-hide-mobile"><input type="checkbox" ${isSelected ? 'checked' : ''} onclick="toggleLeadSelection(${l.id}, this.checked)" class="w-4 h-4 rounded border-gray-300 lead-checkbox"></td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-[#0ea5e9] text-xs font-bold">${(l.contact_name || 'L').charAt(0).toUpperCase()}</div>
                        <div class="min-w-0">
                            <p class="font-medium text-gray-900 text-sm">${highlightMatch(l.contact_name, search)}</p>
                            <p class="text-xs text-gray-500">${l.contact_email ? highlightMatch(l.contact_email, search) : '-'}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-sm col-hide-mobile">
                    ${bizName ? `<span class="text-[#0ea5e9] font-medium">${highlightMatch(bizName, search)}</span>${bizData.ruc ? `<span class="text-xs text-gray-400 ml-2 font-mono">RUC: ${bizData.ruc}</span>` : ''}` : '<span class="text-gray-400">-</span>'}
                </td>
                <td class="px-6 py-4 col-hide-mobile">
                    <span class="badge ${l.service_type === 'premium' ? 'badge-premium' : l.service_type === 'featured' ? 'badge-featured' : 'badge-basic'}">${l.service_type || 'basic'}</span>
                </td>
                <td class="px-6 py-4">${(isCap && (l.status || 'pending') === 'pending')
                    ? '<span class="badge badge-pending"><i class="fas fa-inbox"></i> Nuevo · por verificar</span>'
                    : getStatusBadge(l.status || 'pending')}</td>
                <td class="px-6 py-4 text-sm text-gray-500 col-hide-mobile">${formatDate(l.created_at)}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex gap-1 justify-end">
                        <button onclick="openLeadModal(${l.id})" class="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition" title="Ver ficha"><i class="fas fa-eye"></i></button>
                        ${isCap ? `
                        ${l.status !== 'verificado' ? `<button onclick="verifyFichaFromLead(${l.id})" class="text-xs bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition" title="Verificar ficha"><i class="fas fa-shield-alt"></i></button>` : ''}
                        ${l.status !== 'descartado' ? `<button onclick="updateLeadStatus(${l.id}, 'descartado')" class="text-xs bg-gray-50 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition" title="Descartar"><i class="fas fa-ban"></i></button>` : ''}
                        ` : `
                        ${l.status !== 'contacted' ? `<button onclick="updateLeadStatus(${l.id}, 'contacted')" class="text-xs bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition" title="Contactado"><i class="fas fa-phone"></i></button>` : ''}
                        ${l.status !== 'won' && l.status !== 'closed' ? `<button onclick="updateLeadStatus(${l.id}, 'won')" class="text-xs bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition" title="Ganado"><i class="fas fa-trophy"></i></button>` : ''}
                        ${l.status !== 'lost' ? `<button onclick="updateLeadStatus(${l.id}, 'lost')" class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition" title="Perdido"><i class="fas fa-times"></i></button>` : ''}
                        ${l.status !== 'follow_up' ? `<button onclick="updateLeadStatus(${l.id}, 'follow_up')" class="text-xs bg-orange-50 text-orange-600 px-2.5 py-1.5 rounded-lg hover:bg-orange-100 transition" title="Seguimiento"><i class="fas fa-redo"></i></button>` : ''}
                        `}
                        ${(window.currentLeadView === 'archived' || l.archived)
                            ? `<button onclick="archiveLead(${l.id}, false)" class="text-xs bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 transition" title="Restaurar"><i class="fas fa-box-open"></i></button>`
                            : `<button onclick="archiveLead(${l.id}, true)" class="text-xs bg-gray-50 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition" title="Archivar"><i class="fas fa-archive"></i></button>`}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateBatchBar();
}

function renderLeadsPagination(p) {
    const page = parseInt(p.page) || 1;
    const pages = parseInt(p.pages) || 1;
    const total = parseInt(p.total) || 0;
    const limit = parseInt(p.limit) || leadsPerPage;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    document.getElementById('leadsPaginationInfo').textContent = total > 0 ? `${start}-${end} de ${total}` : 'Sin resultados';
    
    let html = '';
    if (page > 1) html += `<button onclick="goToLeadPage(${page - 1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-left"></i></button>`;
    
    const minPage = Math.max(1, page - 2);
    const maxPage = Math.min(pages, page + 2);
    for (let i = minPage; i <= maxPage; i++) {
        html += `<button onclick="goToLeadPage(${i})" class="px-3 py-1 border ${i === page ? 'bg-[#0ea5e9] text-white border-[#0ea5e9]' : 'border-gray-200 hover:bg-gray-50'} rounded-lg text-sm">${i}</button>`;
    }
    if (page < pages) html += `<button onclick="goToLeadPage(${page + 1})" class="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-chevron-right"></i></button>`;
    
    html += `<select onchange="changeLeadPageSize(this.value)" class="ml-2 border border-gray-200 rounded-lg px-2 py-1 text-xs">`;
    [10, 20, 50, 100].forEach(s => {
        html += `<option value="${s}" ${s === leadsPerPage ? 'selected' : ''}>${s}/p\u00e1g</option>`;
    });
    html += `</select>`;
    
    document.getElementById('leadsPaginationControls').innerHTML = html;
}

function goToLeadPage(page) {
    currentLeadPage = page;
    loadAdminLeads();
}

function changeLeadPageSize(size) {
    leadsPerPage = parseInt(size);
    currentLeadPage = 1;
    loadAdminLeads();
}

// Selection
function toggleLeadSelection(id, checked) {
    if (checked) selectedLeads.add(id); else selectedLeads.delete(id);
    const row = document.querySelector(`tr[data-lead-id="${id}"]`);
    if (row) row.classList.toggle('selected', checked);
    updateBatchBar();
}

function toggleAllLeads() {
    const checked = document.getElementById('leadSelectAll').checked;
    document.querySelectorAll('.lead-checkbox').forEach(cb => {
        cb.checked = checked;
        const row = cb.closest('tr');
        const id = parseInt(row.dataset.leadId);
        if (checked) selectedLeads.add(id); else selectedLeads.delete(id);
        row.classList.toggle('selected', checked);
    });
    updateBatchBar();
}

function updateBatchBar() {
    const count = selectedLeads.size;
    document.getElementById('leadsSelectedCount').textContent = count;
    const bar = document.getElementById('leadsBatchBar');
    if (count > 0) bar.classList.remove('hidden');
    else { bar.classList.add('hidden'); document.getElementById('leadSelectAll').checked = false; }
}

function clearLeadSelection() {
    selectedLeads.clear();
    document.querySelectorAll('.lead-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.table-row.selected').forEach(r => r.classList.remove('selected'));
    document.getElementById('leadSelectAll').checked = false;
    updateBatchBar();
}

async function batchUpdateStatus(status) {
    if (selectedLeads.size === 0) return;
    const ids = Array.from(selectedLeads);
    showToast(`Actualizando ${ids.length} leads...`, 'info');
    let success = 0, failed = 0;
    for (const id of ids) {
        const res = await apiAdminPost(`/leads/${id}/status`, { status }, 'PUT');
        if (res.success) success++; else failed++;
    }
    if (success > 0) showToast(`${success} leads actualizados a "${getStatusLabel(status)}"`, 'success');
    if (failed > 0) showToast(`${failed} leads fallaron`, 'error');
    clearLeadSelection();
    loadAdminLeads();
    if (currentSection === 'dashboard') loadDashboard();
}

async function updateLeadStatus(id, status) {
    const res = await apiAdminPost(`/leads/${id}`, { status }, 'PUT');
    if (res.success) {
        showToast(`Lead marcado como "${getStatusLabel(status)}"`);
        await loadAdminLeads();
        if (currentSection === 'dashboard') await loadDashboard();
    } else {
        showToast('Error: ' + (res.error || 'No se pudo actualizar'), 'error');
    }
    return res.success;
}

// ================================================================
// LEAD DETAIL MODAL - PRO VERSION
// ================================================================
async function openLeadModal(id) {
    editingLeadId = id;
    let lead = allLeadsCache.find(l => l.id === id);
    if (!lead) {
        const res = await apiAdminGet(`/leads/${id}`);
        if (res.success) lead = res.data;
    }
    if (!lead) { showToast('Lead no encontrado', 'error'); return; }

    // Load categories and cities cache for dropdowns
    await loadCategoriesCache();
    await loadCitiesCache();
    const biz = parseLeadNotes(lead);
    const currentStatus = lead.status || 'pending';
    const isCap = isCaptacionLead(lead);

    // Build pipeline visual — CAPTACIÓN: Nuevo → Verificado · VENTA: pipeline comercial
    const pipelineStatuses = isCap ? ['pending', 'verificado'] : ['pending', 'contacted', 'negotiating', 'won'];
    const pipelineLabels = isCap
        ? { pending: 'Nuevo', verificado: 'Verificado' }
        : { pending: 'Pendiente', contacted: 'Contactado', negotiating: 'Negociando', won: 'Ganado' };
    const currentIdx = pipelineStatuses.indexOf(currentStatus);

    let pipelineHtml = '<div class="flex items-center mb-6 px-2">';
    pipelineStatuses.forEach((s, i) => {
        const isActive = s === currentStatus;
        const isCompleted = i < currentIdx;
        const dotClass = isActive ? 'active' : isCompleted ? 'completed' : '';
        const labelClass = isActive ? 'active' : isCompleted ? 'completed' : '';
        // En captación, el paso "Verificado" dispara la verificación completa (no un mero cambio de estado)
        const onClick = (isCap && s === 'verificado')
            ? `verifyFichaFromLead(${id})`
            : `updateLeadStatusFromModal(${id}, '${s}')`;
        pipelineHtml += `
            <div class="pipeline-step ${i < pipelineStatuses.length - 1 ? '' : ''}">
                ${i < pipelineStatuses.length - 1 ? `<div class="pipeline-line ${isCompleted ? 'completed' : ''}"></div>` : ''}
                <div class="pipeline-dot ${dotClass}" style="cursor:pointer" onclick="${onClick}" title="${pipelineLabels[s]}"></div>
                <div class="pipeline-label ${labelClass}">${pipelineLabels[s]}</div>
            </div>
        `;
    });
    pipelineHtml += '</div>';

    // Quick status buttons
    let statusButtonsHtml;
    if (isCap) {
        // CAPTACIÓN: prospecto por verificar. Acciones: Verificar ficha / Descartar / (volver a) Nuevo
        statusButtonsHtml = `
        <div class="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
            <i class="fas fa-seedling text-sky-500 mt-0.5"></i>
            <div class="text-sm text-sky-800">
                <span class="font-bold">Etapa de captación.</span>
                Este registro se dio de alta desde la web: todavía es un <b>potencial cliente</b>, no una venta.
                Al <b>verificar la ficha</b> se envía el correo de verificación y se crea una <b>oportunidad de onboarding sin asignar</b> para derivar a un embajador.
            </div>
        </div>
        <div class="flex flex-wrap gap-2 mb-6">
            ${currentStatus !== 'verificado' ? `<button onclick="verifyFichaFromLead(${id})"
                class="text-sm px-4 py-2 rounded-lg font-bold transition flex items-center gap-2 bg-green-500 text-white hover:bg-green-600 shadow-sm">
                <i class="fas fa-shield-alt"></i> Verificar ficha</button>` : `<span class="text-sm px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-green-100 text-green-700"><i class="fas fa-check-circle"></i> Ficha verificada</span>`}
            ${currentStatus !== 'descartado' ? `<button onclick="updateLeadStatusFromModal(${id}, 'descartado')"
                class="text-sm px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200">
                <i class="fas fa-ban"></i> Descartar</button>` : ''}
            ${currentStatus !== 'pending' ? `<button onclick="updateLeadStatusFromModal(${id}, 'pending')"
                class="text-sm px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200">
                <i class="fas fa-inbox"></i> Volver a Nuevo</button>` : ''}
        </div>`;
    } else {
        const allStatuses = [
            { key: 'pending', label: 'Pendiente', icon: 'fa-clock', color: 'amber' },
            { key: 'contacted', label: 'Contactado', icon: 'fa-phone', color: 'blue' },
            { key: 'negotiating', label: 'Negociando', icon: 'fa-handshake', color: 'purple' },
            { key: 'won', label: 'Ganado', icon: 'fa-trophy', color: 'green' },
            { key: 'lost', label: 'Perdido', icon: 'fa-times', color: 'red' },
            { key: 'follow_up', label: 'Seguimiento', icon: 'fa-redo', color: 'orange' }
        ];
        statusButtonsHtml = '<div class="flex flex-wrap gap-2 mb-6">';
        allStatuses.forEach(s => {
            const isCurrent = s.key === currentStatus;
            statusButtonsHtml += `
                <button onclick="updateLeadStatusFromModal(${id}, '${s.key}')"
                    class="text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5 ${isCurrent ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'}">
                    <i class="fas ${s.icon}"></i> ${s.label} ${isCurrent ? '<i class="fas fa-check ml-1"></i>' : ''}
                </button>
            `;
        });
        statusButtonsHtml += '</div>';
    }

    const isLocked = ['won', 'lost'].includes(currentStatus);
    const lockedBannerHtml = isLocked ? `
        <div class="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl border-2 ${currentStatus === 'won' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}">
            <i class="fas ${currentStatus === 'won' ? 'fa-trophy text-green-500' : 'fa-lock text-red-400'}"></i>
            <div class="flex-1 text-sm">
                <span class="font-bold">${currentStatus === 'won' ? 'Lead ganado — cerrado' : 'Lead perdido — cerrado'}</span>
                <span class="text-xs ml-2 opacity-70">Para editar, cambiá el estado a Pendiente, Contactado o Negociando</span>
            </div>
        </div>` : '';

    document.getElementById('leadDetailContent').innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-[#0ea5e9] text-xl font-bold">${(lead.contact_name || 'L').charAt(0).toUpperCase()}</div>
                <div>
                    <h2 class="text-xl font-bold text-gray-900">${escapeHtml(lead.contact_name)}</h2>
                    <p class="text-sm text-gray-500">ID: ${lead.id} &bull; ${getStatusBadge(currentStatus)}</p>
                </div>
            </div>
            <button onclick="closeModal('leadDetailModal')" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"><i class="fas fa-times"></i></button>
        </div>

        ${lockedBannerHtml}
        ${pipelineHtml}
        ${statusButtonsHtml}

        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-4">
            <div class="flex">
                <div class="tab-btn active" onclick="switchLeadTab('contact')" id="tab-contact"><i class="fas fa-user mr-1"></i> Info Contacto</div>
                <div class="tab-btn" onclick="switchLeadTab('business')" id="tab-business"><i class="fas fa-building mr-1"></i> Datos Empresa</div>
            </div>
        </div>

        <!-- Tab: Contact Info -->
        <div class="tab-panel active" id="panel-contact">

            ${lead.service_type === 'claim' ? (() => {
                let cd = {}; try { cd = JSON.parse(lead.notes || '{}'); } catch(e) {}
                const dt = cd.claimed_at ? new Date(cd.claimed_at).toLocaleDateString('es-PY') : '';
                return `<div class="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-5">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-ribbon text-amber-500 text-lg"></i>
                        <span class="font-bold text-amber-800 text-sm">Solicitud de Reclamo de Empresa</span>
                        <span class="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full ml-auto">${dt}</span>
                    </div>
                    ${cd.message ? `<div class="mb-3">
                        <p class="text-xs font-bold text-amber-700 mb-1"><i class="fas fa-comment-dots mr-1"></i> Mensaje / Evidencia del reclamante:</p>
                        <p class="text-sm text-gray-800 bg-white rounded-lg p-3 border border-amber-200 leading-relaxed">${cd.message}</p>
                    </div>` : '<p class="text-xs text-amber-600 italic mb-2">Sin mensaje de evidencia adjunto.</p>'}
                    ${cd.evidence_url ? `<div class="mb-3">
                        <p class="text-xs font-bold text-amber-700 mb-1"><i class="fas fa-link mr-1"></i> Enlace de evidencia:</p>
                        <a href="${cd.evidence_url}" target="_blank" class="text-xs text-blue-600 hover:underline break-all">${cd.evidence_url}</a>
                    </div>` : ''}
                    <div class="flex gap-2 pt-3 border-t border-amber-200">
                        <button type="button" onclick="verifyClaimedBusiness(${lead.id})"
                            class="text-xs bg-green-500 text-white px-3 py-2 rounded-lg font-bold hover:bg-green-600 flex items-center gap-1.5">
                            <i class="fas fa-check-circle"></i> Verificar y aprobar
                        </button>
                        <button type="button" onclick="updateLeadStatusFromModal(${lead.id}, 'lost')"
                            class="text-xs bg-white border border-red-300 text-red-600 px-3 py-2 rounded-lg font-bold hover:bg-red-50 flex items-center gap-1.5">
                            <i class="fas fa-times"></i> Rechazar
                        </button>
                    </div>
                </div>`;
            })() : ''}

            <form id="editLeadContactForm" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Nombre de contacto *</label>
                        <input type="text" id="editLeadName" value="${escapeHtml(lead.contact_name || '')}" required class="form-input">
                    </div>
                    <div>
                        <label class="form-label">Email del contacto</label>
                        <input type="email" id="editLeadEmail" value="${escapeHtml(lead.contact_email || '')}" class="form-input">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Tel&eacute;fono del contacto</label>
                        <input type="text" id="editLeadPhone" value="${escapeHtml(lead.contact_phone || '')}" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">Tel&eacute;fono de la empresa</label>
                        <input type="text" id="editLeadBizPhone" value="${escapeHtml(biz.phone || '')}" class="form-input">
                    </div>
                </div>
                <div>
                    <label class="form-label">Nombre de la empresa</label>
                    <input type="text" id="editLeadBizName" value="${escapeHtml(lead.business_name || biz.business_name || '')}" class="form-input">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Plan solicitado</label>
                        <select id="editLeadService" class="form-input">
                            <option value="basic" ${(lead.service_type || '') === 'basic' ? 'selected' : ''}>B&aacute;sico</option>
                            <option value="featured" ${(lead.service_type || '') === 'featured' ? 'selected' : ''}>Destacado</option>
                            <option value="premium" ${(lead.service_type || '') === 'premium' ? 'selected' : ''}>Pro</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">Estado</label>
                        <select id="editLeadStatus" class="form-input">
                            ${isCap ? `
                            <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Nuevo</option>
                            <option value="verificado" ${currentStatus === 'verificado' ? 'selected' : ''}>Verificado</option>
                            <option value="descartado" ${currentStatus === 'descartado' ? 'selected' : ''}>Descartado</option>
                            ` : `
                            <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pendiente</option>
                            <option value="contacted" ${currentStatus === 'contacted' ? 'selected' : ''}>Contactado</option>
                            <option value="negotiating" ${currentStatus === 'negotiating' ? 'selected' : ''}>Negociando</option>
                            <option value="won" ${currentStatus === 'won' || currentStatus === 'closed' ? 'selected' : ''}>Ganado</option>
                            <option value="lost" ${currentStatus === 'lost' ? 'selected' : ''}>Perdido</option>
                            <option value="follow_up" ${currentStatus === 'follow_up' ? 'selected' : ''}>Seguimiento</option>
                            `}
                        </select>
                    </div>
                </div>
                <div>
                    <label class="form-label">Notas del administrador</label>
                    <textarea id="editLeadAdminNotes" rows="3" class="form-input" placeholder="Notas internas sobre este lead...">${escapeHtml(biz.plainNotes || '')}</textarea>
                </div>
            </form>
        </div>

        <!-- Tab: Business Data -->
        <div class="tab-panel" id="panel-business">
            ${(biz.hasJsonData || biz.business_name || biz.city || biz.phone) ? `
            <form id="editLeadBusinessForm" class="space-y-4">
                <div class="bg-blue-50 rounded-xl p-4 mb-4 flex items-center gap-3">
                    <i class="fas fa-info-circle text-[#0ea5e9]"></i>
                    <span class="text-sm text-blue-700">Datos de la empresa registrada desde el formulario de registro.</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Nombre de la empresa</label>
                        <input type="text" id="editBizName" value="${escapeHtml(biz.business_name)}" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">RUC</label>
                        <input type="text" id="editBizRuc" value="${escapeHtml(biz.ruc)}" class="form-input">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Categor&iacute;a</label>
                        <select id="editBizCategory" class="form-input">
                            ${buildCategoryOptions(biz.category_id)}
                        </select>
                    </div>
                    <div>
                        <label class="form-label">Ciudad</label>
                        <select id="editBizCity" class="form-input">
                            ${buildCityOptions(biz.city)}
                        </select>
                    </div>
                </div>
                <div>
                    <label class="form-label">Direcci&oacute;n</label>
                    <input type="text" id="editBizAddress" value="${escapeHtml(biz.address)}" class="form-input">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Tel&eacute;fono de la empresa</label>
                        <input type="text" id="editBizPhone" value="${escapeHtml(biz.phone)}" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">Email de la empresa</label>
                        <input type="email" id="editBizEmail" value="${escapeHtml(biz.business_email || biz.email)}" class="form-input">
                    </div>
                </div>
                <div>
                    <label class="form-label">Sitio Web</label>
                    <input type="url" id="editBizWebsite" value="${escapeHtml(biz.website)}" class="form-input">
                </div>
                <div>
                    <label class="form-label">Descripci&oacute;n</label>
                    <textarea id="editBizDescription" rows="3" class="form-input">${escapeHtml(biz.description)}</textarea>
                </div>
                <div class="border-t border-gray-100 pt-4">
                    <label class="form-label mb-2 block"><i class="fas fa-image mr-1 text-gray-400"></i> Im&aacute;genes de la empresa</label>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-xs text-gray-500 mb-1">Logo (cuadrado)</p>
                            ${biz.image_url ? `<img src="${escapeHtml(biz.image_url)}" class="w-16 h-16 object-cover rounded-xl border border-gray-200 mb-2">` : ''}
                            <input type="url" id="editBizLogoUrl" value="${escapeHtml(biz.image_url || '')}" class="form-input text-xs" placeholder="URL del logo">
                        </div>
                        <div>
                            <p class="text-xs text-gray-500 mb-1">Portada (banner)</p>
                            <input type="url" id="editBizCoverUrl" value="" class="form-input text-xs" placeholder="URL de portada (banner)">
                            <p class="text-xs text-gray-400 mt-1">Se ver&aacute; como banner en el Directorio</p>
                        </div>
                    </div>
                </div>
            </form>
            ` : `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-building text-4xl mb-3 block text-gray-300"></i>
                <p class="text-sm">No hay datos de empresa registrados para este lead.</p>
                <p class="text-xs text-gray-400 mt-1">Los datos aparecer&aacute;n cuando el lead se genera desde el formulario de registro.</p>
            </div>
            `}

            <!-- Debug: JSON crudo del backend -->
            <div class="mt-4 pt-4 border-t border-gray-100">
                <details class="text-xs">
                    <summary class="text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                        <i class="fas fa-bug mr-1"></i> Ver datos crudos del backend (debug)
                    </summary>
                    <div class="mt-2 bg-gray-900 rounded-lg p-3 overflow-x-auto">
                        <pre class="text-green-400 font-mono text-[11px] whitespace-pre-wrap">${escapeHtml(biz.rawNotes || lead.notes || 'Sin datos')}</pre>
                    </div>
                    <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                        <div>business_name: "${escapeHtml(biz.business_name)}"</div>
                        <div>category_id: "${escapeHtml(biz.category_id)}"</div>
                        <div>category_name: "${escapeHtml(biz.category_name)}"</div>
                        <div>address: "${escapeHtml(biz.address)}"</div>
                        <div>city: "${escapeHtml(biz.city)}"</div>
                        <div>phone: "${escapeHtml(biz.phone)}"</div>
                        <div>business_email: "${escapeHtml(biz.business_email)}"</div>
                        <div>description: "${escapeHtml(biz.description.substring(0,50))}${biz.description.length>50?'...':''}"</div>
                    </div>
                </details>
            </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between pt-4 mt-4 border-t border-gray-100">
            <div class="text-xs text-gray-400">
                <span>Creado: ${formatDate(lead.created_at)}</span>
                ${lead.updated_at ? `<span class="ml-4">Actualizado: ${formatDate(lead.updated_at)}</span>` : ''}
            </div>
            <div class="flex gap-2">
                <button onclick="closeModal('leadDetailModal')" class="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Cerrar</button>
                <button onclick="saveLeadChanges(${id})" class="btn-brand text-white px-5 py-2 rounded-lg text-sm font-bold"><i class="fas fa-save mr-1"></i> Guardar cambios</button>
            </div>
        </div>
    `;

    document.getElementById('leadDetailModal').classList.remove('hidden');
}

function switchLeadTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`panel-${tab}`).classList.add('active');
}

async function verifyClaimedBusiness(leadId) {
    if (!confirm('¿Verificar y aprobar esta solicitud de reclamo? La empresa quedará marcada como verificada.')) return;
    const lead = allLeadsCache.find(l => l.id === leadId);
    if (!lead) return showToast('Lead no encontrado', 'error');

    const bizId = lead.business_id;
    if (bizId) {
        // Usar PATCH /verify que solo toca el campo verified
        const res = await apiAdminPost(`/businesses/${bizId}/verify`, { verified: true }, 'PATCH');
        if (!res.success) return showToast('Error al verificar empresa: ' + res.error, 'error');
    }

    await apiAdminPost(`/leads/${leadId}`, { status: 'won' }, 'PUT');
    showToast('✅ Empresa verificada y lead marcado como ganado');
    closeModal('leadDetailModal');
    loadBusinesses();
    loadLeads();
}

// CAPTACIÓN → CONVERSIÓN: verificar la ficha desde el propio Lead.
// Marca la empresa como verificada, envía el correo de verificación y crea
// una oportunidad de onboarding SIN asignar (el admin la deriva luego).
async function verifyFichaFromLead(leadId) {
    if (!confirm('¿Verificar esta ficha?\n\n• La empresa quedará marcada como VERIFICADA\n• Se enviará el correo de verificación al dueño\n• Se creará una Oportunidad de onboarding (sin asignar) para derivar a un embajador')) return;
    const res = await apiAdminPost(`/leads/${leadId}/verify-ficha`, {});
    if (!res || !res.success) return showToast('Error al verificar la ficha: ' + (res?.error || ''), 'error');
    showToast(res.opportunity_created
        ? '✅ Ficha verificada · oportunidad de onboarding creada (sin asignar)'
        : '✅ Ficha verificada · ya existía una oportunidad activa para esta empresa', 'success');
    closeModal('leadDetailModal');
    loadAdminLeads();
    if (typeof loadBusinesses === 'function') loadBusinesses();
}

async function updateLeadStatusFromModal(id, status) {
    const ok = await updateLeadStatus(id, status);
    if (ok) openLeadModal(id);
}

async function saveLeadChanges(id) {
    // Gather data from both tabs
    const data = {
        contact_name: document.getElementById('editLeadName').value,
        contact_email: document.getElementById('editLeadEmail').value,
        contact_phone: document.getElementById('editLeadPhone').value,
        business_name: document.getElementById('editLeadBizName').value,
        service_type: document.getElementById('editLeadService').value,
        status: document.getElementById('editLeadStatus').value
    };

    // If business data exists, update the notes JSON too
    const lead = allLeadsCache.find(l => l.id === id);
    const biz = lead ? parseLeadNotes(lead) : null;
    if (biz && (biz.hasJsonData || biz.business_name || biz.city || biz.phone)) {
        // Category: dropdown returns numeric ID
        const catSelectEl = document.getElementById('editBizCategory');
        const catId = catSelectEl ? parseInt(catSelectEl.value) || null : biz.category_id || null;
        const catName = catId ? getCategoryName(catId) : '';

        // City: dropdown returns city name string
        const cityVal = document.getElementById('editBizCity')?.value || biz.city || '';

        const baseNotes = biz.hasJsonData && lead.notes ? JSON.parse(lead.notes) : {};
        const updatedBiz = {
            ...baseNotes,
            business_name: document.getElementById('editBizName')?.value || biz.business_name,
            name: document.getElementById('editBizName')?.value || biz.business_name,
            ruc: document.getElementById('editBizRuc')?.value || biz.ruc,
            category_id: catId,
            category_name: catName,
            city: cityVal,
            address: document.getElementById('editBizAddress')?.value || biz.address,
            phone: document.getElementById('editBizPhone')?.value || biz.phone,
            email: document.getElementById('editBizEmail')?.value || biz.business_email || biz.email,
            business_email: document.getElementById('editBizEmail')?.value || biz.business_email || biz.email,
            website: document.getElementById('editBizWebsite')?.value || biz.website,
            description: document.getElementById('editBizDescription')?.value || biz.description,
            image_url: document.getElementById('editBizLogoUrl')?.value || biz.image_url || ''
        };
        data.notes = JSON.stringify(updatedBiz);
        // Also update business_name column for quick display
        data.business_name = updatedBiz.business_name;

        // Si está vinculado a una empresa, actualizar SOLO para leads de tipo plan
        // NUNCA para promo_boost, claim u otros tipos — para evitar pisar datos existentes
        const planLeadTypes = ['basic', 'featured', 'premium'];
        const leadServiceType = document.getElementById('editLeadService')?.value || '';
        if (lead.business_id && planLeadTypes.includes(leadServiceType)) {
            const bizUpdate = {
                name: updatedBiz.business_name,
                description: updatedBiz.description,
                phone: updatedBiz.phone,
                email: updatedBiz.email,
                address: updatedBiz.address,
                city: cityVal,
                category_id: catId,
                website: updatedBiz.website,
                ruc: updatedBiz.ruc,
                image_url: document.getElementById('editBizLogoUrl')?.value || null
            };
            apiAdminPost(`/businesses/${lead.business_id}`, bizUpdate, 'PUT').catch(() => {});
        }
    } else if (document.getElementById('editLeadAdminNotes')) {
        data.notes = document.getElementById('editLeadAdminNotes').value;
    }

    const res = await apiAdminPost(`/leads/${id}`, data, 'PUT');
    if (res.success) {
        if (res.plan_synced) {
            const planLabel = { featured: 'Negocio Digital', premium: 'Empresa Pro' }[res.plan_synced] || res.plan_synced;
            showToast(`✅ Lead ganado — plan de la empresa actualizado a ${planLabel}`);
        } else {
            showToast('Lead actualizado correctamente');
        }
        await loadAdminLeads();
        if (currentSection === 'dashboard') await loadDashboard();
        openLeadModal(id);
    } else if (res.locked) {
        showToast(`Lead cerrado (${res.current_status}). Cambiá el estado a Pendiente para editar.`, 'error');
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
    }
}

// Export CSV
async function exportLeadsCSV() {
    showToast('Generando CSV...', 'info');
    const status = document.getElementById('leadFilterStatus')?.value || '';
    const service = document.getElementById('leadFilterService')?.value || '';
    const search = document.getElementById('leadSearch')?.value?.trim() || '';

    let url = '/leads?limit=9999';
    if (status) url += `&status=${status}`;
    if (service) url += `&service_type=${service}`;
    if (search) url += `&q=${encodeURIComponent(search)}`;

    const data = await apiAdminGet(url);
    if (!data.success || !data.data || data.data.length === 0) {
        showToast('No hay leads para exportar', 'error');
        return;
    }

    const leads = data.data;
    const headers = ['ID', 'Contacto', 'Email', 'Telefono', 'Empresa', 'RUC', 'Plan', 'Estado', 'Direccion', 'Ciudad', 'Website', 'Fecha'];
    const rows = leads.map(l => {
        const biz = parseLeadNotes(l);
        return [
            l.id,
            escapeCsv(l.contact_name),
            escapeCsv(l.contact_email),
            escapeCsv(l.contact_phone || ''),
            escapeCsv(biz.business_name || l.business_name || ''),
            escapeCsv(biz.ruc),
            l.service_type || 'basic',
            l.status || 'pending',
            escapeCsv(biz.address),
            escapeCsv(biz.city),
            escapeCsv(biz.website),
            l.created_at
        ];
    });

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads-retopa-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast(`${leads.length} leads exportados`, 'success');
}

function escapeCsv(val) {
    if (!val) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

