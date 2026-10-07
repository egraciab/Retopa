/**
 * RetoPA — admin/js/templates.js
 * D-mail.2 — Editor de emails transaccionales por CAMPOS SEGUROS.
 * Cada plantilla expone asunto + textos clave + botón (el layout/diseño queda fijo).
 * Los textos admiten placeholders {token} que se reemplazan por datos reales al enviar.
 * Vacío = se usa el texto por defecto (definido en backend/config/mail.js).
 */

const TEMPLATE_DEFS = [
    {
        key: 'notifyBiz', label: '📣 Notificación a empresas (masiva)', special: 'notify',
        desc: 'Email que se envía al notificar a una empresa que ya está en RetoPA (para que reclame su perfil). El perfil y el botón de reclamo se agregan solos.',
        vars: ['{{nombre}}', '{{ciudad}}', '{{sitio}}'],
        fields: [
            { key:'subject', cfg:'notify_subject', label:'Asunto', type:'text', ph:'{{nombre}} ya está en {{sitio}} — reclamá tu perfil' },
            { key:'cc', cfg:'notify_cc', label:'CC (en copia) — separar con comas', type:'text', ph:'ventas@retopa.com.py, admin@retopa.com.py' },
            { key:'body', cfg:'notify_body', label:'Cuerpo (párrafo introductorio)', type:'area', ph:'Hola, encontramos a {{nombre}} y ya creamos un perfil en {{sitio}}…' },
        ],
    },
    {
        key: 'welcome', label: '👋 Bienvenida (usuario nuevo)',
        desc: 'Se envía cuando un nuevo usuario registra su empresa.',
        vars: ['{name}', '{businessName}', '{siteName}', '{siteUrl}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'Bienvenido a {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Tu empresa {businessName} ha sido registrada exitosamente en nuestro directorio.' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver directorio' },
        ],
    },
    {
        key: 'verified', label: '🏢 Empresa verificada',
        desc: 'Se envía cuando una empresa es verificada (registro directo).',
        vars: ['{name}', '{businessName}', '{businessUrl}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'✅ Tu empresa ha sido verificada en {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Tu empresa {businessName} ha sido VERIFICADA exitosamente.' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver mi perfil' },
        ],
    },
    {
        key: 'newReview', label: '⭐ Nueva reseña',
        desc: 'Se envía al dueño cuando alguien deja una reseña.',
        vars: ['{ownerName}', '{authorName}', '{rating}', '{comment}', '{businessName}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'⭐ Nueva reseña en {businessName} — {rating}/5' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'{authorName} dejó una reseña de {rating} estrellas en {businessName}.' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver mi perfil público →' },
        ],
    },
    {
        key: 'likeMilestone', label: '🎉 Hito de likes',
        desc: 'Se envía al dueño cuando su empresa alcanza un hito de likes.',
        vars: ['{businessName}', '{likeCount}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🎉 ¡{businessName} alcanzó {likeCount} likes en RetoPA!' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'{businessName} acaba de alcanzar {likeCount} likes en RetoPA. ¡Tu negocio está gustando!' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver mi perfil →' },
        ],
    },
    {
        key: 'whatsappContact', label: '📱 Contacto por WhatsApp',
        desc: 'Se envía al dueño cuando alguien hace clic en WhatsApp (1 vez/día).',
        vars: ['{businessName}', '{todayCount}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'📱 Alguien quiso contactar a {businessName} por WhatsApp' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Alguien encontró {businessName} en RetoPA y hizo clic en WhatsApp para contactarte.' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver estadísticas →' },
        ],
    },
    {
        key: 'weeklySummary', label: '📊 Resumen semanal',
        desc: 'Se envía cada lunes con el resumen de la semana.',
        vars: ['{businessName}', '{views}', '{whatsappClicks}', '{likes}', '{reviews}', '{weekLabel}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'📊 Tu semana en RetoPA — {businessName}' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver mi panel →' },
        ],
    },
    {
        key: 'founderGranted', label: '🎁 Destacado Fundador — otorgado',
        desc: 'Se envía al dueño cuando le OTORGÁS el Destacado Fundador de regalo (avisa los días y la fecha de vencimiento).',
        vars: ['{ownerName}', '{businessName}', '{days}', '{expiresLabel}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🎁 ¡Tu empresa ahora está Destacada en {siteName}!' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Como cliente fundador, le regalamos a {businessName} el plan Destacado, gratis por {days} días.' },
            { key:'cta', label:'Botón', type:'text', ph:'Aprovechar mi Destacado →' },
        ],
    },
    {
        key: 'founderExpiring', label: '🏅 Destacado Fundador — vencimiento',
        desc: 'Se envía cuando vence el Destacado Fundador (email de conversión).',
        vars: ['{name}', '{businessName}', '{views}', '{whatsappClicks}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🏅 Tu Destacado Fundador terminó — {businessName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'El período en que {businessName} estuvo Destacado en {siteName} acaba de terminar. Volviste al plan básico, pero mirá lo que lograste:' },
            { key:'upsell', label:'Texto de upsell (recuadro)', type:'area', ph:'¿Querés seguir apareciendo primero y recibiendo estos contactos? Pasá a Destacado o Premium y mantené la visibilidad.' },
            { key:'cta', label:'Botón', type:'text', ph:'Seguir Destacado →' },
        ],
    },
    {
        key: 'planRequested', label: '💳 Solicitud de plan (Tpago)',
        desc: 'Se envía al cliente cuando solicita un plan pago con Tpago (recibo + link de pago).',
        vars: ['{name}', '{businessName}', '{planLabel}', '{amount}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'💳 Completá tu pago — plan {planLabel} · {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Recibimos tu solicitud del plan {planLabel} para {businessName}. Para activarlo, completá el pago con Tpago. Apenas confirmemos el pago, tu plan queda activo.' },
            { key:'cta', label:'Botón', type:'text', ph:'Pagar con Tpago' },
        ],
    },
    {
        key: 'planActivated', label: '✅ Plan activado (pago confirmado)',
        desc: 'Se envía al cliente cuando el admin confirma el pago y activa su plan.',
        vars: ['{name}', '{businessName}', '{planLabel}', '{expires}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'✅ ¡{planLabel} activado! — {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Confirmamos tu pago. El plan {planLabel} de {businessName} ya está activo hasta el {expires}. ¡A aprovecharlo!' },
            { key:'cta', label:'Botón', type:'text', ph:'Ir a mi panel' },
        ],
    },
    {
        key: 'planRejected', label: '🚫 Solicitud de plan rechazada',
        desc: 'Se envía al cliente si el admin cancela/rechaza su solicitud de plan.',
        vars: ['{name}', '{businessName}', '{planLabel}', '{reason}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'Sobre tu solicitud del plan {planLabel} — {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'No pudimos confirmar el pago de tu solicitud del plan {planLabel} para {businessName}, así que la cancelamos por ahora. Tu ficha sigue activa en el plan gratuito — podés volver a intentarlo cuando quieras.' },
            { key:'cta', label:'Botón', type:'text', ph:'Reintentar desde mi panel' },
        ],
    },
    {
        key: 'signalDigest', label: '🎯 Oportunidades del embajador (resumen)',
        desc: 'Resumen diario agrupado que recibe el embajador con sus oportunidades nuevas.',
        vars: ['{name}', '{count}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🎯 Tenés {count} oportunidades nuevas — {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Tenés {count} oportunidades para trabajar hoy. Cada una trae el motivo y un mensaje listo para enviar.' },
            { key:'cta', label:'Botón', type:'text', ph:'Ver mis oportunidades' },
        ],
    },
    {
        key: 'planRenewalReminder', label: '⏰ Recordatorio de renovación',
        desc: 'Se envía al dueño cuando su plan pago está por vencer (7/3/0 días).',
        vars: ['{name}', '{businessName}', '{planLabel}', '{whenText}', '{amount}', '{expires}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'⏰ Tu plan {planLabel} {whenText} — {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Tu plan {planLabel} de {businessName} {whenText}. Renoválo para no perder el destaque, la prioridad en búsquedas ni tus estadísticas.' },
            { key:'cta', label:'Botón', type:'text', ph:'Renovar ahora' },
        ],
    },
    {
        key: 'planExpired', label: '🔔 Plan vencido (reactivación)',
        desc: 'Se envía al dueño cuando el plan venció y la ficha volvió a básica (nada se borra).',
        vars: ['{name}', '{businessName}', '{planLabel}', '{views}', '{whatsappClicks}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'Tu plan {planLabel} venció — {businessName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'El plan {planLabel} de {businessName} venció y tu ficha volvió al plan gratuito. No borramos nada: tus categorías, galería y datos quedan guardados y vuelven al reactivar.' },
            { key:'cta', label:'Botón', type:'text', ph:'Reactivar mi plan' },
        ],
    },
    {
        key: 'claimReceived', label: '⏳ Reclamo recibido',
        desc: 'Se envía al solicitante cuando completa el formulario de reclamo.',
        vars: ['{name}', '{businessName}', '{email}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'⏳ Recibimos tu solicitud — {businessName} en {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Recibimos tu solicitud para reclamar el perfil de {businessName} en RetoPA. Nuestro equipo verificará tu identidad y te avisará a la brevedad.' },
        ],
    },
    {
        key: 'claimApproved', label: '✅ Reclamo aprobado',
        desc: 'Se envía al dueño cuando el admin aprueba su reclamo.',
        vars: ['{name}', '{businessName}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🎉 ¡Tu perfil fue verificado! — {businessName} en {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'El perfil de {businessName} fue verificado exitosamente. Ya podés ingresar al panel y empezar a gestionar tu empresa.' },
            { key:'cta', label:'Botón', type:'text', ph:'Ir a mi panel →' },
        ],
    },
    {
        key: 'passwordReset', label: '🔐 Restablecer contraseña',
        desc: 'Se envía cuando el usuario solicita restablecer su contraseña.',
        vars: ['{name}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🔐 Restablecer contraseña — {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Recibimos una solicitud para restablecer tu contraseña. Hacé clic en el botón de abajo:' },
            { key:'cta', label:'Botón', type:'text', ph:'Restablecer contraseña' },
        ],
    },
    {
        key: 'tipsFicha', label: '💡 Consejos para aprovechar la ficha',
        desc: 'Tips accionables para que el dueño le saque el jugo a su ficha. Ideal para dormidos o recién verificados.',
        vars: ['{name}', '{businessName}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'💡 5 consejos para que {businessName} destaque en {siteName}' },
            { key:'intro', label:'Intro (antes de los consejos)', type:'area', ph:'Tenés tu ficha de {businessName} en {siteName}, y con unos pocos ajustes podés recibir muchas más visitas y contactos. Te dejamos 5 consejos rápidos:' },
            { key:'cta', label:'Botón', type:'text', ph:'Actualizar mi ficha →' },
        ],
    },
    {
        key: 'reactivation', label: '👋 Reactivación (te extrañamos)',
        desc: 'Invita a volver al panel a usuarios "sin acceso" hace tiempo. Combina con el filtro de inactividad de Usuarios.',
        vars: ['{name}', '{businessName}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'👋 Te extrañamos en {siteName}' },
            { key:'message', label:'Mensaje principal', type:'area', ph:'Notamos que hace un tiempo no entrás a tu panel de {businessName}. Mientras no estuviste, la gente sigue buscando negocios como el tuyo en {siteName} — no dejes pasar esos contactos.' },
            { key:'cta', label:'Botón', type:'text', ph:'Volver a mi panel →' },
        ],
    },
    {
        key: 'firstSteps', label: '🚀 Primeros pasos (onboarding)',
        desc: 'Checklist de 3 pasos para que el usuario nuevo active su ficha y empiece a usar el sistema.',
        vars: ['{name}', '{businessName}', '{siteName}'],
        fields: [
            { key:'subject', label:'Asunto', type:'text', ph:'🚀 Primeros pasos con {businessName} en {siteName}' },
            { key:'intro', label:'Intro (antes de los pasos)', type:'area', ph:'Ya tenés tu cuenta lista. Con estos 3 pasos, {businessName} queda visible y lista para recibir clientes en {siteName}:' },
            { key:'cta', label:'Botón', type:'text', ph:'Empezar ahora →' },
        ],
    },
];

let _activeTestTemplate = null;
let _tplFocusField = null; // id del último campo enfocado (para insertar variables)

// Agrupación de plantillas en pestañas (ya son 20+). Cada grupo lista las keys
// que le corresponden; las que no estén en ningún grupo caen en "Otras".
const TPL_GROUPS = [
    { id: 'uso',       label: '🚀 Usuarios & uso', keys: ['welcome', 'firstSteps', 'tipsFicha', 'reactivation', 'weeklySummary', 'verified'] },
    { id: 'actividad', label: '⭐ Actividad',       keys: ['newReview', 'likeMilestone', 'whatsappContact'] },
    { id: 'planes',    label: '💳 Planes & pagos',  keys: ['planRequested', 'planActivated', 'planRejected', 'planRenewalReminder', 'planExpired', 'founderGranted', 'founderExpiring'] },
    { id: 'reclamos',  label: '🏢 Reclamos',        keys: ['claimReceived', 'claimApproved', 'claimActivate'] },
    { id: 'captacion', label: '📣 Captación',       keys: ['notifyBiz', 'signalDigest', 'ambassadorOutreach'] },
    { id: 'cuenta',    label: '🔐 Cuenta',          keys: ['passwordReset'] },
];
let _tplSaved = {}, _tplSiteCfg = {}, _tplGroup = null;

async function initTemplatesSection() {
    const container = document.getElementById('templatesContainer');
    if (!container) return;

    const data = await apiAdminGet('/notify/templates');
    const saved = data.success ? (data.data || {}) : {};
    // Config del sitio (para las plantillas "especiales" como notifyBiz, que guardan en notify_*)
    let siteCfg = {};
    try { const sc = await apiAdminGet('/site-config'); if (sc && sc.success) siteCfg = sc.data || {}; } catch (e) {}

    // Buscador de fichas (reemplaza al viejo <select> que solo cargaba 200 verificadas):
    // por defecto, el destinatario arranca con el email del propio admin.
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        const toEl = document.getElementById('testEmailTo2');
        if (toEl && !toEl.value && u.email) toEl.value = u.email;
    } catch (e) {}

    // Buzón de prueba: usa el guardado (tpl_test_email) o el email del admin.
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const toEl = document.getElementById('testEmailTo2');
    if (toEl) toEl.value = saved['tpl_test_email'] || user.email || '';

    _tplSaved = saved; _tplSiteCfg = siteCfg;
    renderTemplatesUI();
}

// Render con PESTAÑAS por grupo. Solo muestra las tarjetas del grupo activo.
function renderTemplatesUI() {
    const container = document.getElementById('templatesContainer');
    if (!container) return;

    // Grupos con al menos una plantilla presente (en orden) + "Otras" al final.
    const present = TPL_GROUPS.filter(g => TEMPLATE_DEFS.some(t => g.keys.includes(t.key)));
    const otras = TEMPLATE_DEFS.filter(t => !TPL_GROUPS.some(g => g.keys.includes(t.key)));
    const groups = [...present];
    if (otras.length) groups.push({ id: 'otras', label: '📦 Otras', keys: otras.map(t => t.key) });
    if (!groups.length) { container.innerHTML = ''; return; }
    if (!_tplGroup || !groups.some(g => g.id === _tplGroup)) _tplGroup = groups[0].id;

    const active = groups.find(g => g.id === _tplGroup) || groups[0];
    const cards = TEMPLATE_DEFS.filter(t => active.keys.includes(t.key));

    const tabs = groups.map(g => {
        const count = TEMPLATE_DEFS.filter(t => g.keys.includes(t.key)).length;
        const on = g.id === _tplGroup;
        return `<button onclick="switchTplGroup('${g.id}')"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${on ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
            ${on ? 'style="background:#1B3A6B"' : ''}>
            ${g.label} <span class="opacity-70">${count}</span></button>`;
    }).join('');

    container.innerHTML = `
      <div class="flex flex-wrap gap-2 mb-1" id="tplTabs">${tabs}</div>
      <p class="text-[11px] text-gray-400 mb-4">${cards.length} plantilla${cards.length !== 1 ? 's' : ''} en esta categoría · el buscador de envío de abajo funciona con cualquiera.</p>
      <div class="space-y-4">${cards.map(_renderTplCard).join('')}</div>`;
}

function switchTplGroup(id) { _tplGroup = id; renderTemplatesUI(); }

// Una tarjeta de plantilla (misma UI de antes; ahora reutilizable por grupo).
function _renderTplCard(tpl) {
    const saved = _tplSaved || {}, siteCfg = _tplSiteCfg || {};
    const fieldsHtml = tpl.fields.map(f => {
        const id = `tpl_${tpl.key}_${f.key}`;
        const val = tpl.special ? (siteCfg[f.cfg] || '') : (saved[id] || '');
        const common = `id="${id}" data-field="1" onfocus="_tplFocusField='${id}'" placeholder="${escapeHtml(f.ph)}"`;
        const input = f.type === 'area'
            ? `<textarea ${common} rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y">${escapeHtml(val)}</textarea>`
            : `<input type="text" ${common} value="${escapeHtml(val)}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">`;
        return `<div><label class="block text-xs font-semibold text-gray-500 mb-1">${f.label}</label>${input}</div>`;
    }).join('');

    return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" id="tplCard_${tpl.key}">
            <div class="flex items-start justify-between mb-3 gap-3">
                <div>
                    <h4 class="font-bold text-gray-900 text-base">${tpl.label}</h4>
                    <p class="text-xs text-gray-400 mt-0.5">${tpl.desc}</p>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                    <button onclick="previewTemplate('${tpl.key}')"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1">
                        <i class="fas fa-eye"></i> Ver preview
                    </button>
                    <button onclick="setActiveTest('${tpl.key}')"
                        style="background:#1B3A6B;color:white;border:2px solid #1B3A6B"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition flex items-center gap-1">
                        <i class="fas fa-flask"></i> Prueba
                    </button>
                </div>
            </div>
            <div class="flex flex-wrap gap-1 mb-1">
                ${tpl.vars.map(v => `
                    <button type="button" onclick="insertVar('${v}')"
                        class="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-mono hover:bg-blue-100 transition cursor-pointer">
                        ${v}</button>`).join('')}
            </div>
            <p class="text-[11px] text-gray-400 mb-3">Hacé clic en un campo y luego en una variable para insertarla. Campo vacío = se usa el texto por defecto.</p>
            <div class="space-y-2">${fieldsHtml}</div>
            <div class="flex items-center justify-between mt-3">
                <div id="tplSaveResult_${tpl.key}" class="text-xs text-green-600 hidden">✅ Guardado</div>
                <button onclick="saveTemplate('${tpl.key}')"
                    class="ml-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition">
                    <i class="fas fa-save mr-1"></i> Guardar
                </button>
            </div>
        </div>`;
}

function insertVar(variable) {
    const el = _tplFocusField && document.getElementById(_tplFocusField);
    if (!el) { showToast('Hacé clic primero en un campo', 'error'); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + variable + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + variable.length;
    el.focus();
}

function collectTemplateFields(key) {
    const tpl = TEMPLATE_DEFS.find(t => t.key === key);
    const payload = {};
    tpl.fields.forEach(f => {
        const el = document.getElementById(`tpl_${key}_${f.key}`);
        payload[`tpl_${key}_${f.key}`] = el ? el.value : '';
    });
    return payload;
}

async function saveTemplate(key) {
    const resultEl = document.getElementById(`tplSaveResult_${key}`);
    const tpl = TEMPLATE_DEFS.find(t => t.key === key);
    let res;
    if (tpl && tpl.special === 'notify') {
        // Plantilla especial (notifyBiz): guarda en site_config (notify_*)
        const payload = {};
        tpl.fields.forEach(f => { const el = document.getElementById(`tpl_${key}_${f.key}`); payload[f.cfg] = el ? el.value : ''; });
        res = await apiAdminPost('/site-config', payload, 'PUT');
    } else {
        res = await apiAdminPost('/notify/templates', { templates: collectTemplateFields(key) });
    }
    if (res.success) {
        if (resultEl) { resultEl.classList.remove('hidden'); setTimeout(() => resultEl.classList.add('hidden'), 2000); }
        showToast(`Plantilla "${key}" guardada ✅`);
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
    }
}

// ── "Ver preview" — renderiza la plantilla (con datos de ejemplo) sin enviar ──
async function previewTemplate(key) {
    let res;
    try { res = await apiAdminGet('/notify/template-preview?template=' + encodeURIComponent(key)); } catch (e) { res = null; }
    if (!res || !res.success) { showToast('No se pudo generar el preview: ' + ((res && res.error) || ''), 'error'); return; }
    openTemplatePreviewModal(res.subject || '(sin asunto)', res.html || '');
}

function openTemplatePreviewModal(subject, html) {
    document.getElementById('tplPreviewModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'tplPreviewModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.background = 'rgba(0,0,0,.55)';
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:60vh;border:0;border-radius:0 0 16px 16px;background:#fff';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div class="min-w-0"><p class="text-[11px] text-gray-400 uppercase tracking-wide">Asunto</p><p class="font-bold text-gray-800 truncate">${escapeHtml(subject)}</p></div>
          <button onclick="document.getElementById('tplPreviewModal').remove()" class="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex-shrink-0"><i class="fas fa-times"></i></button>
        </div>
      </div>`;
    modal.addEventListener('click', () => modal.remove());
    modal.querySelector('.bg-white').appendChild(iframe);
    document.body.appendChild(modal);
    iframe.srcdoc = html;
}

function setActiveTest(key) {
    _activeTestTemplate = key;
    document.querySelectorAll('[id^="tplCard_"]').forEach(el => { el.style.borderColor = ''; el.style.borderWidth = ''; });
    const card = document.getElementById(`tplCard_${key}`);
    if (card) { card.style.borderColor = '#1B3A6B'; card.style.borderWidth = '2px'; }
    document.getElementById('testEmailBiz2')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`"${TEMPLATE_DEFS.find(t=>t.key===key)?.label || key}" seleccionada para prueba`);
}

async function sendTestFromTemplates() {
    if (!_activeTestTemplate) { showToast('Seleccioná una plantilla para probar', 'error'); return; }
    const to      = (document.getElementById('testEmailTo2')?.value || '').trim();
    const bizSlug = document.getElementById('testEmailBiz2')?.value || '';
    const resultEl = document.getElementById('emailTestResult2');

    if (!to || !to.includes('@')) {
        if (resultEl) { resultEl.textContent = 'Ingresá un email válido'; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; resultEl.classList.remove('hidden'); }
        return;
    }
    if (resultEl) { resultEl.textContent = 'Enviando...'; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-gray-100 text-gray-600'; resultEl.classList.remove('hidden'); }

    // Guardar los campos actuales (para que la prueba refleje lo que estás viendo) + el buzón de prueba.
    const payload = collectTemplateFields(_activeTestTemplate);
    payload['tpl_test_email'] = to;
    await apiAdminPost('/notify/templates', { templates: payload });

    const res = await apiAdminPost('/notify/test-template', { template: _activeTestTemplate, to, business_slug: bizSlug });
    if (res.success) {
        if (resultEl) { resultEl.textContent = `✅ ${res.message}`; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700'; }
        showToast(`Prueba enviada a ${to} ✅`);
        if (typeof loadEmailLogs === 'function') setTimeout(loadEmailLogs, 1500);
    } else {
        if (resultEl) { resultEl.textContent = `❌ ${res.error}`; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; }
        showToast('Error: ' + res.error, 'error');
    }
}

// ── Buscador de fichas con autocompletado (Plantillas) ───────────────────────
// Reemplaza el <select> que solo traía 200 fichas verificadas. Consulta el
// backend por nombre/RUC/email/teléfono sobre TODAS las fichas, y al elegir una
// autocompleta el email del destinatario. El slug elegido queda en el input
// oculto #testEmailBiz2 (que ya leen sendTest/sendRealFromTemplates).
let _bizPickerTimers = {};
let _bizPickerCache = {};
async function bizPickerSearch(suffix, term) {
    const results = document.getElementById('bizPickerResults' + suffix);
    if (!results) return;
    clearTimeout(_bizPickerTimers[suffix]);
    term = (term || '').trim();
    if (term.length < 2) { results.classList.add('hidden'); results.innerHTML = ''; return; }
    _bizPickerTimers[suffix] = setTimeout(async () => {
        const res = await apiAdminGet(`/businesses?q=${encodeURIComponent(term)}&limit=15`);
        const list = (res && res.success) ? (res.data || []) : [];
        _bizPickerCache[suffix] = {};
        if (!list.length) {
            results.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">Sin resultados</div>';
            results.classList.remove('hidden');
            return;
        }
        results.innerHTML = list.map(b => {
            _bizPickerCache[suffix][b.slug] = { name: b.trade_name || b.name || '', email: b.email || '' };
            const sub = [b.city || '', b.email || '', b.verified ? '✔ verificada' : ''].filter(Boolean).join(' · ');
            return `<div class="px-3 py-2 text-sm hover:bg-sky-50 cursor-pointer border-b border-gray-50" onclick="bizPickerPick('${suffix}','${b.slug}')">
                <div class="font-medium text-gray-800">${escapeHtml(b.trade_name || b.name || '(sin nombre)')}</div>
                <div class="text-[11px] text-gray-400">${escapeHtml(sub)}</div>
            </div>`;
        }).join('');
        results.classList.remove('hidden');
    }, 250);
}
function bizPickerPick(suffix, slug) {
    const item = (_bizPickerCache[suffix] || {})[slug] || { name: '', email: '' };
    const hidden = document.getElementById('testEmailBiz' + suffix); if (hidden) hidden.value = slug || '';
    const search = document.getElementById('testBizSearch' + suffix); if (search) search.value = item.name;
    const results = document.getElementById('bizPickerResults' + suffix); if (results) { results.classList.add('hidden'); results.innerHTML = ''; }
    const chosen = document.getElementById('bizPickerChosen' + suffix);
    if (chosen) { chosen.textContent = '✓ ' + (item.name || 'ficha') + (item.email ? ' · email autocompletado' : ' · (sin email en la ficha)'); chosen.classList.remove('hidden'); }
    const toEl = document.getElementById('testEmailTo' + suffix);
    if (toEl && item.email) toEl.value = item.email; // autocompletar destinatario con el email de la ficha
}
// Cerrar el desplegable al hacer click afuera.
document.addEventListener('click', (e) => {
    ['2'].forEach(sfx => {
        const wrap = document.getElementById('bizPickerResults' + sfx);
        const search = document.getElementById('testBizSearch' + sfx);
        if (wrap && !wrap.classList.contains('hidden') && !wrap.contains(e.target) && e.target !== search) wrap.classList.add('hidden');
    });
});

// Envío REAL manual (no [TEST]) — usa la ficha elegida como origen de datos.
async function sendRealFromTemplates() {
    if (!_activeTestTemplate) { showToast('Seleccioná una plantilla para enviar', 'error'); return; }
    const to      = (document.getElementById('testEmailTo2')?.value || '').trim();
    const bizSlug = document.getElementById('testEmailBiz2')?.value || '';
    const resultEl = document.getElementById('emailTestResult2');

    if (!to || !to.includes('@')) {
        if (resultEl) { resultEl.textContent = 'Ingresá un email válido'; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; resultEl.classList.remove('hidden'); }
        return;
    }
    const tplLabel = TEMPLATE_DEFS.find(t => t.key === _activeTestTemplate)?.label || _activeTestTemplate;
    if (!confirm(`Vas a enviar un correo REAL ("${tplLabel}") a:\n\n${to}\n\n¿Confirmás el envío?`)) return;

    if (resultEl) { resultEl.textContent = 'Enviando…'; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-gray-100 text-gray-600'; resultEl.classList.remove('hidden'); }

    // Guardar los textos actuales para que el correo real refleje lo que estás viendo.
    await apiAdminPost('/notify/templates', { templates: collectTemplateFields(_activeTestTemplate) });

    const res = await apiAdminPost('/notify/send-template', { template: _activeTestTemplate, to, business_slug: bizSlug });
    if (res.success) {
        if (resultEl) { resultEl.textContent = `✅ ${res.message}`; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700'; }
        showToast(`Correo enviado a ${to} ✅`);
        if (typeof loadEmailLogs === 'function') setTimeout(loadEmailLogs, 1500);
    } else {
        if (resultEl) { resultEl.textContent = `❌ ${res.error}`; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; }
        showToast('Error: ' + res.error, 'error');
    }
}
