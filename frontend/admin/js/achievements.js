/**
 * RetoPA Admin — js/achievements.js
 * Editor de LOGROS configurables (S31). Guarda en site_config.achievements_config
 * (JSON) vía PUT /site-config. El dashboard del cliente (cliente/js/dashboard.js)
 * lee esa misma config. La MÉTRICA de cada logro es FIJA (por id): acá sólo se
 * edita presentación (label/pista/ícono/color), umbral(es), on/off y orden.
 *
 * ⚠ ACH_DEFAULTS y achMergeConfig() deben ser IDÉNTICOS a los de
 *   cliente/js/dashboard.js (misma fuente de verdad de ids/métricas/defaults).
 */

// ── Fuente de verdad (misma que el cliente) ─────────────────────────────────
// hint admite placeholders {umbral} y {min_reviews} → se reemplazan por el valor
// vigente al renderizar (así el texto sigue al umbral cuando se cambia acá).
const ACH_DEFAULTS = [
    { id:'ficha_completa', metric:'completion_pct', enabled:true, label:'Ficha completa', icon:'fa-clipboard-check', color:'#22c55e', hint:'Completá tu ficha al {umbral}%',        threshold:100 },
    { id:'verificado',     metric:'verified',       enabled:true, label:'Verificado',     icon:'fa-circle-check',    color:'#0ea5e9', hint:'Verificación del equipo RetoPA' },
    { id:'bien_valorado',  metric:'rating_reviews', enabled:true, label:'Bien valorado',  icon:'fa-star',            color:'#f59e0b', hint:'Promedio {umbral}+ con {min_reviews} o más reseñas', threshold:4.5, minReviews:3 },
    { id:'con_resenas',    metric:'reviews',        enabled:true, label:'Con reseñas',    icon:'fa-comment-dots',    color:'#8b5cf6', hint:'Recibí al menos {umbral} reseña(s)',   threshold:1 },
    { id:'querido',        metric:'likes',          enabled:true, label:'Querido',        icon:'fa-heart',           color:'#ef4444', hint:'Sumá {umbral} “me gusta”',            threshold:10 },
    { id:'en_movimiento',  metric:'views_30d',      enabled:true, label:'En movimiento',  icon:'fa-eye',             color:'#14b8a6', hint:'{umbral}+ visitas en 30 días',         threshold:100 },
    { id:'impulso_activo', metric:'boosted',        enabled:true, label:'Impulso activo', icon:'fa-rocket',          color:'#4F46E5', hint:'Se activa al completar tu ficha: más visibilidad por 7 días' },
];

function achMergeConfig(saved) {
    const byId = {};
    if (Array.isArray(saved)) saved.forEach(s => { if (s && s.id) byId[s.id] = s; });
    return ACH_DEFAULTS.map((d, i) => {
        const s = byId[d.id] || {};
        const okColor = typeof s.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s.color);
        return {
            id: d.id, metric: d.metric,
            enabled:    (s.enabled != null ? !!s.enabled : d.enabled),
            label:      (typeof s.label === 'string' && s.label.trim()) ? s.label : d.label,
            hint:       (typeof s.hint  === 'string') ? s.hint : d.hint,
            icon:       (typeof s.icon  === 'string' && s.icon.trim()) ? s.icon.trim() : d.icon,
            color:      okColor ? s.color : d.color,
            threshold:  (s.threshold  != null && isFinite(s.threshold))  ? Number(s.threshold)  : d.threshold,
            minReviews: (s.minReviews != null && isFinite(s.minReviews)) ? Number(s.minReviews) : d.minReviews,
            order:      (s.order != null && isFinite(s.order)) ? Number(s.order) : i,
        };
    }).sort((a, b) => a.order - b.order);
}

// Metadatos de cada métrica para la UI (la métrica NO se edita, sólo se explica).
const ACH_METRIC_META = {
    completion_pct: { kind:'pct',    desc:'Completitud del perfil ≥ umbral',      thLabel:'Umbral (%)',      step:'1',   min:'0', max:'100' },
    verified:       { kind:'bool',   desc:'Verificado por el equipo RetoPA' },
    rating_reviews: { kind:'rating', desc:'Rating ≥ umbral y reseñas ≥ mínimo',    thLabel:'Rating mínimo',   step:'0.1', min:'0', max:'5', th2Label:'Reseñas mínimas' },
    reviews:        { kind:'num',    desc:'Cantidad de reseñas ≥ umbral',          thLabel:'Reseñas ≥',       step:'1',   min:'0' },
    likes:          { kind:'num',    desc:'Cantidad de “me gusta” ≥ umbral',       thLabel:'Likes ≥',         step:'1',   min:'0' },
    views_30d:      { kind:'num',    desc:'Visitas en 30 días ≥ umbral',           thLabel:'Visitas ≥',       step:'1',   min:'0' },
    boosted:        { kind:'bool',   desc:'Tiene impulso (boost) activo' },
};

let _logrosState = [];

function _lgEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

async function initLogrosSection() {
    const root = document.getElementById('logrosSection');
    if (!root) return;
    root.innerHTML = `<div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2 text-sm">Cargando logros…</p></div>`;
    let saved = null;
    try {
        const res = await apiAdminGet('/site-config');
        if (res && res.success && res.data && res.data.achievements_config) {
            const raw = res.data.achievements_config;
            saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
    } catch (e) { saved = null; }
    _logrosState = achMergeConfig(Array.isArray(saved) ? saved : null);
    renderLogrosEditor();
}

function renderLogrosEditor() {
    const root = document.getElementById('logrosSection');
    if (!root) return;
    const rows = _logrosState.map((a, i) => logrosRowHtml(a, i)).join('');
    root.innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <h3 class="text-lg font-black text-gray-900"><i class="fas fa-medal text-amber-400 mr-1"></i> Logros del dashboard del cliente</h3>
                <p class="text-sm text-gray-500 mt-0.5 max-w-2xl">Prendé/apagá cada logro y editá su texto, ícono, color, umbral y orden. La <b>métrica</b> de cada logro es fija (cómo se gana). Los cambios se ven en el panel del dueño de la ficha.</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="logrosReset()" class="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-rotate-left mr-1"></i> Restablecer</button>
                <button onclick="logrosSave()" id="logrosSaveBtn" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:#0ea5e9"><i class="fas fa-floppy-disk mr-1"></i> Guardar</button>
            </div>
        </div>
    </div>
    <div id="logrosList" class="space-y-3">${rows}</div>
    <div class="mt-5 flex items-center justify-end gap-2">
        <button onclick="logrosReset()" class="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-rotate-left mr-1"></i> Restablecer</button>
        <button onclick="logrosSave()" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:#0ea5e9"><i class="fas fa-floppy-disk mr-1"></i> Guardar</button>
    </div>`;
}

function logrosRowHtml(a, i) {
    const meta = ACH_METRIC_META[a.metric] || { kind:'bool', desc:a.metric };
    const dim = a.enabled ? '' : 'opacity:.55';
    // Umbrales según métrica
    let thresholdHtml = '';
    if (meta.kind === 'pct' || meta.kind === 'num') {
        thresholdHtml = `
        <div>
            <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">${_lgEsc(meta.thLabel)}</label>
            <input type="number" step="${meta.step||'1'}" ${meta.min!=null?`min="${meta.min}"`:''} ${meta.max!=null?`max="${meta.max}"`:''} value="${a.threshold != null ? a.threshold : ''}"
                oninput="logrosSet('${a.id}','threshold',this.value)"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9]">
        </div>`;
    } else if (meta.kind === 'rating') {
        thresholdHtml = `
        <div>
            <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">${_lgEsc(meta.thLabel)}</label>
            <input type="number" step="0.1" min="0" max="5" value="${a.threshold != null ? a.threshold : ''}"
                oninput="logrosSet('${a.id}','threshold',this.value)"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9]">
        </div>
        <div>
            <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">${_lgEsc(meta.th2Label)}</label>
            <input type="number" step="1" min="0" value="${a.minReviews != null ? a.minReviews : ''}"
                oninput="logrosSet('${a.id}','minReviews',this.value)"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9]">
        </div>`;
    } else {
        thresholdHtml = `<div class="sm:col-span-2 flex items-end"><p class="text-xs text-gray-400 italic pb-2">Sin umbral — se otorga por estado (sí/no).</p></div>`;
    }

    return `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4" data-lg="${a.id}" style="${dim}">
        <div class="flex items-center gap-3 flex-wrap">
            <!-- Orden -->
            <div class="flex flex-col">
                <button onclick="logrosMove('${a.id}',-1)" ${i===0?'disabled':''} class="w-7 h-6 rounded-t-md border border-gray-200 text-gray-500 text-xs disabled:opacity-30 hover:bg-gray-50"><i class="fas fa-chevron-up"></i></button>
                <button onclick="logrosMove('${a.id}',1)" ${i===_logrosState.length-1?'disabled':''} class="w-7 h-6 rounded-b-md border border-t-0 border-gray-200 text-gray-500 text-xs disabled:opacity-30 hover:bg-gray-50"><i class="fas fa-chevron-down"></i></button>
            </div>
            <!-- Preview del badge -->
            <div id="lgPrev-${a.id}" style="display:flex;flex-direction:column;align-items:center;gap:4px;width:70px">
                <div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${a.color}">
                    <i class="fas ${_lgEsc(a.icon)}" style="color:#fff;font-size:14px"></i>
                </div>
                <span style="font-size:10px;font-weight:700;text-align:center;line-height:1.15;color:#0f172a">${_lgEsc(a.label)}</span>
            </div>
            <!-- Métrica (solo lectura) -->
            <div class="flex-1 min-w-[180px]">
                <span class="inline-block text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Se gana con</span>
                <p class="text-sm text-gray-700 font-medium">${_lgEsc(meta.desc)}</p>
            </div>
            <!-- On/Off -->
            <label class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" ${a.enabled?'checked':''} onchange="logrosSet('${a.id}','enabled',this.checked)" class="w-5 h-5 accent-[#0ea5e9]">
                <span class="text-sm font-semibold text-gray-600">Activo</span>
            </label>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <div class="sm:col-span-2">
                <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre</label>
                <input type="text" value="${_lgEsc(a.label)}" oninput="logrosSet('${a.id}','label',this.value)"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9]">
            </div>
            <div>
                <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Ícono (Font Awesome)</label>
                <div class="flex items-center gap-2">
                    <span id="lgIcon-${a.id}" class="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0" style="background:#f8fafc"><i class="fas ${_lgEsc(a.icon)}" style="color:${a.color}"></i></span>
                    <input type="text" value="${_lgEsc(a.icon)}" oninput="logrosSet('${a.id}','icon',this.value)" placeholder="fa-star"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9]">
                </div>
            </div>
            <div>
                <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
                <div class="flex items-center gap-2">
                    <input type="color" value="${/^#[0-9a-fA-F]{6}$/.test(a.color)?a.color:'#0ea5e9'}" oninput="logrosSet('${a.id}','color',this.value)"
                        class="w-10 h-9 rounded-lg border border-gray-200 p-0.5 cursor-pointer flex-shrink-0">
                    <input type="text" value="${_lgEsc(a.color)}" oninput="logrosSet('${a.id}','color',this.value)"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#0ea5e9]">
                </div>
            </div>
            <div class="sm:col-span-2 lg:col-span-4">
                <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Pista (descripción para el dueño)</label>
                <input type="text" value="${_lgEsc(a.hint)}" oninput="logrosSet('${a.id}','hint',this.value)"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ea5e9]">
                ${(ACH_METRIC_META[a.metric]||{}).kind !== 'bool' ? `<p class="text-[11px] text-gray-400 mt-1">Podés usar <code class="bg-gray-100 px-1 rounded">{umbral}</code>${a.metric==='rating_reviews' ? ' y <code class="bg-gray-100 px-1 rounded">{min_reviews}</code>' : ''} — se reemplaza${a.metric==='rating_reviews'?'n':''} por el valor actual en el texto que ve el dueño.</p>` : ''}
            </div>
            ${thresholdHtml}
        </div>
    </div>`;
}

// Actualiza el estado y refresca SOLO el preview de esa fila (sin perder foco).
function logrosSet(id, field, value) {
    const a = _logrosState.find(x => x.id === id);
    if (!a) return;
    if (field === 'enabled') { a.enabled = !!value; renderLogrosEditor(); return; }
    if (field === 'threshold' || field === 'minReviews') {
        a[field] = (value === '' ? '' : Number(value));
    } else {
        a[field] = value;
    }
    // Refrescar preview (badge + ícono chico) en vivo.
    const prev = document.getElementById('lgPrev-' + id);
    if (prev) {
        const circle = prev.querySelector('div'); const ic = prev.querySelector('i'); const lbl = prev.querySelector('span');
        if (circle) circle.style.background = a.color;
        if (ic) ic.className = 'fas ' + (a.icon || '');
        if (lbl) lbl.textContent = a.label;
    }
    const iconBox = document.getElementById('lgIcon-' + id);
    if (iconBox) { const i2 = iconBox.querySelector('i'); if (i2) { i2.className = 'fas ' + (a.icon || ''); i2.style.color = a.color; } }
}

function logrosMove(id, dir) {
    const idx = _logrosState.findIndex(x => x.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= _logrosState.length) return;
    const tmp = _logrosState[idx]; _logrosState[idx] = _logrosState[j]; _logrosState[j] = tmp;
    renderLogrosEditor();
}

function logrosReset() {
    _logrosState = achMergeConfig(null); // DEFAULTS
    renderLogrosEditor();
    if (typeof showToast === 'function') showToast('Valores restablecidos. Acordate de Guardar.', 'info');
}

async function logrosSave() {
    const btn = document.getElementById('logrosSaveBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Guardando…'; }
    const payload = _logrosState.map((a, i) => {
        const meta = ACH_METRIC_META[a.metric] || {};
        const o = { id: a.id, enabled: !!a.enabled, label: a.label, hint: a.hint, icon: a.icon, color: a.color, order: i };
        if (meta.kind === 'pct' || meta.kind === 'num' || meta.kind === 'rating') o.threshold = Number(a.threshold) || 0;
        if (meta.kind === 'rating') o.minReviews = Number(a.minReviews) || 0;
        return o;
    });
    const res = await apiAdminPost('/site-config', { achievements_config: JSON.stringify(payload) }, 'PUT');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk mr-1"></i> Guardar'; }
    if (res && res.success) {
        if (typeof showToast === 'function') showToast('Logros guardados. Ya se ven en el panel del cliente.', 'success');
    } else {
        if (typeof showToast === 'function') showToast('No se pudo guardar: ' + ((res && res.error) || 'error'), 'error');
    }
}
