/**
 * RetoPA — js/registro.js
 * openRegistroEmpresaCheck(), registro empresa, upload imágenes
 */

// ── Modal de ALTA / RECLAMO (2026-10-17) ─────────────────────────────────────
// La misma pantalla de /registrar y /reclamar, pero DENTRO del sitio, como modal
// (iframe ?embed=1: una sola implementación, probada). Se cierra con la X, Esc,
// tocando afuera o con el "atrás" del celular. Al terminar, la pantalla lleva a
// Mi Portal (navega la página entera, no el modal).
function rpOpenFlowModal(url, title) {
    rpCloseFlowModal(true);
    const desk = window.matchMedia('(min-width: 641px)').matches;
    const wrap = document.createElement('div');
    wrap.id = 'rpFlowModal';
    wrap.style.cssText = `position:fixed;inset:0;z-index:10001;display:flex;justify-content:center;align-items:${desk ? 'center' : 'flex-end'}`;
    const src = url + (url.includes('?') ? '&' : '?') + 'embed=1';
    wrap.innerHTML = `
      <div data-rpbg style="position:absolute;inset:0;background:rgba(15,23,42,.55)"></div>
      <div data-rppanel role="dialog" aria-modal="true" aria-label="${title}"
           style="position:relative;width:100%;max-width:${desk ? '480px' : '100%'};background:#f8fafc;display:flex;flex-direction:column;overflow:hidden;
                  border-radius:${desk ? '20px' : '20px 20px 0 0'};box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px 10px 18px;background:#fff;border-bottom:1px solid #e2e8f0">
          <b data-rptitle style="font-size:15px;color:#0f172a;font-family:inherit">${title}</b>
          <button type="button" data-rpclose aria-label="Cerrar"
                  style="width:36px;height:36px;flex-shrink:0;border-radius:50%;border:none;background:#f1f5f9;color:#475569;font-size:20px;line-height:1;cursor:pointer">×</button>
        </div>
        <iframe src="${src}" title="${title}" style="flex:1;width:100%;border:0;background:transparent"></iframe>
      </div>`;
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    const panel = wrap.querySelector('[data-rppanel]');
    const fit = () => {
        const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight;
        panel.style.height = Math.round(Math.min(h * (desk ? 0.9 : 0.94), desk ? 860 : 99999)) + 'px';
    };
    fit();
    wrap._fit = fit; (window.visualViewport || window).addEventListener('resize', fit);
    wrap.querySelector('[data-rpbg]').onclick = () => rpCloseFlowModal();
    wrap.querySelector('[data-rpclose]').onclick = () => rpCloseFlowModal();
    wrap._key = e => { if (e.key === 'Escape') rpCloseFlowModal(); };
    document.addEventListener('keydown', wrap._key);
    wrap._msg = e => {
        if (e.origin !== location.origin || !e.data) return;
        if (e.data.rp === 'close') rpCloseFlowModal();
        else if (e.data.rp === 'title' && e.data.t) wrap.querySelector('[data-rptitle]').textContent = String(e.data.t).slice(0, 80);
    };
    window.addEventListener('message', wrap._msg);
    // "Atrás" cierra el modal (entrada de historial propia, misma URL).
    try { history.pushState(Object.assign({}, history.state || {}, { rpFlow: 1 }), '', location.href); } catch (e) {}
}
function rpCloseFlowModal(fromHistory) {
    const wrap = document.getElementById('rpFlowModal');
    if (!wrap) return;
    if (!fromHistory) { try { if (history.state && history.state.rpFlow) { history.back(); return; } } catch (e) {} }
    (window.visualViewport || window).removeEventListener('resize', wrap._fit);
    document.removeEventListener('keydown', wrap._key);
    window.removeEventListener('message', wrap._msg);
    wrap.remove();
    if (!document.querySelector('#profileModal:not(.hidden)')) document.body.style.overflow = '';
}
window.addEventListener('popstate', () => { if (document.getElementById('rpFlowModal')) rpCloseFlowModal(true); });

function openRegistroEmpresaCheck(preselectedPlan = null) {
    // 2026-10-14: alta en UNA pantalla (/registrar): nombre, rubro de lista, ciudad,
    // WhatsApp y listo → directo a Mi Portal. Antes de crear, si ese WhatsApp ya está
    // en una ficha, pregunta "¿Es esta tu ficha?". 2026-10-17: como modal.
    const plan = ['featured', 'premium'].includes(preselectedPlan) ? preselectedPlan : '';
    rpOpenFlowModal('/registrar' + (plan ? '?plan=' + plan : ''), 'Registrá tu negocio gratis');
    return;
    // eslint-disable-next-line no-unreachable
    // SIN login forzado: la puerta de entrada abre directo al formulario corto.
    // Si hay sesión activa, la aprovechamos para enganchar la ficha al usuario y
    // pre-cargar su correo; si no, pedimos un correo en el propio formulario.
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
        try { currentUser = JSON.parse(userStr); } catch (e) { currentUser = null; }
    } else {
        currentUser = null;
    }
    openRegistroModal(preselectedPlan);
}

function openRegistroModal(preselectedPlan = null) {
    // 2026-10-17: el formulario viejo ya no se usa (dejaba la ficha sin dueño).
    // Cualquier camino que lo abra (p. ej. la acción pendiente tras el login) va a /registrar.
    if (typeof openRegistroEmpresaCheck === 'function') return openRegistroEmpresaCheck(preselectedPlan);
    const modal = document.getElementById('registroModal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Se ELIMINÓ el paso de selección de plan: abrimos directo al formulario.
    // El plan por defecto es 'basic'; un plan preseleccionado (desde /planes) se
    // guarda como intención del lead, pero no bloquea la publicación.
    const stepPlan = document.getElementById('stepPlan');
    if (stepPlan) stepPlan.classList.add('hidden');
    document.getElementById('registroForm').classList.remove('hidden');
    document.getElementById('registroSuccess').classList.add('hidden');

    selectedPlan = ['basic', 'featured', 'premium'].includes(preselectedPlan) ? preselectedPlan : 'basic';
    const sp = document.getElementById('selectedPlan');
    if (sp) sp.value = selectedPlan;

    // Pre-cargar datos si hay sesión (opcional). Sin sesión, el correo se pide.
    if (currentUser) {
        const cn = document.getElementById('contactName');  if (cn) cn.value = currentUser.name  || '';
        const ce = document.getElementById('contactEmail'); if (ce) ce.value = currentUser.email || '';
        // Con sesión, el correo de gestión es el de la cuenta: se prellena siempre.
        const re = document.getElementById('bizRegEmail');
        if (re && currentUser.email) re.value = currentUser.email;
    }

    initRegistroCombo(); // cargar comboboxes de categoría y ciudad (antes vivía en selectPlan)
}

function closeRegistroModal() {
    document.getElementById('registroModal').classList.add('hidden');
    document.body.style.overflow = '';
    clearImageUpload();
}

// El paso de selección de plan se ELIMINÓ del flujo (abre directo al form).
// Se mantiene selectPlan() null-safe por si alguna ruta legada la invoca:
// solo registra el plan como intención y muestra el formulario.
function selectPlan(plan) {
    selectedPlan = ['basic', 'featured', 'premium'].includes(plan) ? plan : 'basic';
    const sp = document.getElementById('selectedPlan'); if (sp) sp.value = selectedPlan;
    const pl = document.getElementById('planLabel');
    if (pl) pl.textContent = (typeof getPlanLabel === 'function' ? getPlanLabel(selectedPlan) : selectedPlan);
    const stepPlan = document.getElementById('stepPlan'); if (stepPlan) stepPlan.classList.add('hidden');
    const form = document.getElementById('registroForm'); if (form) form.classList.remove('hidden');
    initRegistroCombo();
}

// Legado: ya no hay paso previo al form. Se conserva null-safe.
function backToPlan() {
    closeRegistroModal();
}

// ============================================
// UPLOAD DE IMAGEN (Base64 comprimido)
// ============================================
async function handleImageUpload(input) {
    const file = input.files[0];
    if (file) await uploadPublicImage(file);
}

function handlePublicImageDrop(event) {
    event.preventDefault();
    const zone = document.getElementById('imageUploadZone');
    if (zone) { zone.style.borderColor = '#d1d5db'; zone.style.background = '#fafafa'; }
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadPublicImage(file);
}

async function uploadPublicImage(file) {
    const ACCEPTED = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
    if (!ACCEPTED.includes(file.type)) {
        alert('Formato no soportado. Usá JPG, PNG o WebP.');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert('La imagen es muy grande (máx 10MB).');
        return;
    }

    // Mostrar spinner
    document.getElementById('uploadPlaceholder').classList.add('hidden');
    document.getElementById('uploadPreview').classList.add('hidden');
    document.getElementById('uploadProgress').classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('logo', file);

        const res = await fetch(`${API_BASE}/upload/public`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (!data.success) {
            alert('Error al subir imagen: ' + (data.error || 'Intentá de nuevo'));
            document.getElementById('uploadProgress').classList.add('hidden');
            document.getElementById('uploadPlaceholder').classList.remove('hidden');
            return;
        }

        uploadedImageBase64 = data.data.image_url; // ahora es una URL real
        document.getElementById('bizImageUrl').value = data.data.image_url;

        document.getElementById('uploadProgress').classList.add('hidden');
        document.getElementById('uploadPlaceholder').classList.add('hidden');
        document.getElementById('uploadPreview').classList.remove('hidden');
        document.getElementById('previewImg').src = data.data.image_url;

    } catch (err) {
        alert('Error de conexión al subir la imagen.');
        document.getElementById('uploadProgress').classList.add('hidden');
        document.getElementById('uploadPlaceholder').classList.remove('hidden');
    }
}

function clearImageUpload() {
    // Null-safe: el registro corto ya no tiene la zona de subida de imagen.
    // Los campos de imagen se completan desde el panel del cliente.
    uploadedImageBase64 = null;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const show = id => { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); };
    const hide = id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); };
    set('bizImageFile', '');
    set('bizImageUrl', '');
    show('uploadPlaceholder');
    hide('uploadPreview');
    hide('uploadProgress');
    const zone = document.getElementById('imageUploadZone');
    if (zone) { zone.style.borderColor = '#d1d5db'; zone.style.background = '#fafafa'; }
}

// ============================================
// ENVÍO DE FORMULARIO (con usuario vinculado)
// ============================================
document.getElementById('registroForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    // Registro CORTO SIN login forzado (puerta de entrada): nombre, categoría,
    // ciudad, WhatsApp y un CORREO de gestión. El resto (RUC, descripción,
    // dirección, web, fotos) se completa después desde el panel. Si hay sesión
    // activa, se vincula la ficha al usuario (user_id); si no, la ficha nace sin
    // dueño y se engancha luego con ese correo.
    const g = id => (document.getElementById(id)?.value || '').trim();
    const waPrefix = g('bizWaPrefix') || '595';
    const waNum    = g('bizWhatsapp').replace(/\D/g, '');
    const whatsapp = waNum ? waPrefix + waNum : '';
    const nombre   = g('bizTradeName') || g('bizName');
    const uEmail   = (currentUser && currentUser.email) || '';
    const uName    = (currentUser && currentUser.name)  || '';
    // Correo de gestión: el que escribe el usuario, o el de la sesión si la hay.
    const email    = (g('bizRegEmail') || uEmail).toLowerCase();

    // Validación mínima en el front (backend igual valida).
    if (!nombre)   { alert('Poné el nombre de tu negocio'); return; }
    if (!whatsapp) { alert('Poné tu número de WhatsApp'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Poné un correo válido — con él vas a gestionar tu ficha.');
        const re = document.getElementById('bizRegEmail'); if (re) re.focus();
        return;
    }

    const formData = {
        plan_type:  selectedPlan || 'basic',
        name:       nombre,
        trade_name: nombre,
        whatsapp:   whatsapp,
        category_id: g('bizCategory') || null,
        city:        g('bizCity') || null,
        // El backend exige phone/email/contact_*; los derivamos del WhatsApp y el correo.
        phone:         whatsapp,
        email:         email,
        image_url:     g('bizImageUrl') || (typeof uploadedImageBase64 !== 'undefined' ? uploadedImageBase64 : null) || null,
        contact_name:  uName || nombre,
        contact_email: email,
        contact_phone: whatsapp
    };
    // Solo vinculamos al usuario si realmente hay sesión.
    if (currentUser && currentUser.id) formData.user_id = currentUser.id;

    const res = await apiPost('/leads', formData);

    if (res.success) {
        // S29 — marcar para mostrar el wizard de bienvenida en el portal
        try { localStorage.setItem('retopa_welcome', '1'); } catch (e) {}
        const se = document.getElementById('successEmail'); if (se) se.textContent = email;
        document.getElementById('registroForm').classList.add('hidden');
        document.getElementById('registroSuccess').classList.remove('hidden');
    } else if (res.code === 'FREE_LIMIT') {
        // Límite de empresas para plan gratuito — mensaje claro con foco en upgrade
        alert(res.error);
    } else {
        alert('Error: ' + (res.error || 'Intentalo de nuevo'));
    }
});

// ============================================
// LOGIN MODAL

// ============================================
// COMBOBOX — Categoría y Ciudad en Registro
// Convierte los <select> en comboboxes con búsqueda
// sin modificar el HTML del formulario
// ============================================
let _regComboReady = false;
const _regData = { cat: [], city: [] };

function _rNorm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,''); }

async function initRegistroCombo() {
    if (_regComboReady) { _rebuildComboUI(); return; }

    // Cargar datos en paralelo
    await Promise.all([
        fetch('/api/v2/categories').then(r=>r.json()).then(d => {
            const parents = (d.data||[]).filter(c=>!c.parentId);
            const kids    = (d.data||[]).filter(c=> c.parentId);
            parents.forEach(p => {
                _regData.cat.push({ label: p.name, value: p.id, search: _rNorm(p.name), group: true });
                kids.filter(k=>k.parentId===p.id).forEach(k =>
                    _regData.cat.push({ label: '  › '+k.name, value: k.id, search: _rNorm(k.name+' '+p.name) })
                );
            });
        }).catch(()=>{}),
        fetch('/api/v2/cities').then(r=>r.json()).then(d => {
            (d.data||[]).forEach(c => _regData.city.push({
                label: c.department ? `${c.name} — ${c.department}` : c.name,
                value: c.name,
                search: _rNorm(c.name + ' ' + (c.department||''))
            }));
        }).catch(()=>{})
    ]);

    _regComboReady = true;
    _rebuildComboUI();
}

function _rebuildComboUI() {
    ['cat','city'].forEach(type => {
        const selectId = type === 'cat' ? 'bizCategory' : 'bizCity';
        const sel = document.getElementById(selectId);
        if (!sel || sel.dataset.comboInit) return;
        sel.dataset.comboInit = '1';

        // Ocultar el select original
        sel.style.display = 'none';

        // Crear el combobox
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative';
        wrap.id = `_regComboWrap_${type}`;

        const icon = type === 'cat' ? 'fa-tag' : 'fa-map-marker-alt';
        const placeholder = type === 'cat' ? 'Buscá un rubro...' : 'Buscá una ciudad...';

        wrap.innerHTML = `
            <i class="fas ${icon}" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none;z-index:1"></i>
            <input type="text" id="_regComboInput_${type}" placeholder="${placeholder}" autocomplete="off"
                style="width:100%;padding:12px 36px 12px 44px;border-radius:12px;border:1px solid #e5e7eb;font-size:14px;color:#374151;outline:none;"
                onfocus="this.style.borderColor='#3b82f6';_regOpenList('${type}')"
                onblur="this.style.borderColor='#e5e7eb';setTimeout(()=>_regCloseList('${type}'),200)"
                oninput="_regFilter('${type}')">
            <i class="fas fa-chevron-down" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none;font-size:11px"></i>
            <div id="_regComboList_${type}" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:white;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.12);border:1px solid #f3f4f6;z-index:9999;max-height:220px;overflow-y:auto"></div>
        `;

        sel.parentNode.insertBefore(wrap, sel.nextSibling);
    });
}

function _regOpenList(type) {
    _regRenderList(type, '');
    document.getElementById(`_regComboList_${type}`).style.display = 'block';
}

function _regCloseList(type) {
    const list = document.getElementById(`_regComboList_${type}`);
    if (list) list.style.display = 'none';
}

function _regFilter(type) {
    const q = _rNorm(document.getElementById(`_regComboInput_${type}`)?.value || '');
    _regRenderList(type, q);
    document.getElementById(`_regComboList_${type}`).style.display = 'block';
    if (!q) document.getElementById(type === 'cat' ? 'bizCategory' : 'bizCity').value = '';
}

function _regRenderList(type, q) {
    const list = document.getElementById(`_regComboList_${type}`);
    if (!list) return;
    const items = q ? _regData[type].filter(d => d.search.includes(q)) : _regData[type];
    if (!items.length) { list.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:#9ca3af">Sin resultados</div>'; return; }
    const shown = items.slice(0, 80);
    // Guardar en array global para acceso por índice (evita problemas de escape en onclick)
    window._regComboItems = window._regComboItems || {};
    window._regComboItems[type] = shown;
    list.innerHTML = shown.map((d, i) =>
        `<div style="padding:10px 16px;font-size:13px;cursor:pointer;${d.group?'font-weight:600;color:#374151':'color:#4b5563'}"
            onmouseover="this.style.background='#eff6ff';this.style.color='#2563eb'"
            onmouseout="this.style.background='';this.style.color='${d.group?'#374151':'#4b5563'}'"
            onmousedown="_regSelectIdx('${type}',${i})">${d.label}</div>`
    ).join('');
}

function _regSelectIdx(type, idx) {
    const item = (window._regComboItems?.[type] || [])[idx];
    if (!item) return;
    const hiddenId = type === 'cat' ? 'bizCategory' : 'bizCity';
    document.getElementById(`_regComboInput_${type}`).value = item.label.trim();
    document.getElementById(hiddenId).value = item.value;
    _regCloseList(type);
}
