/**
 * RetoPA Admin — js/settings.js
 * Site config, SMTP, MFA, email log
 */

// ================================================================
// SITE CONFIG
// ================================================================
function updatePhonePlaceholderAdmin(inputId, selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const opts = { '595':'981 620 195', '54':'11 1234 5678', '55':'11 91234 5678', '1':'212 555 0100' };
    const el = document.getElementById(inputId);
    if (el) el.placeholder = opts[sel.value] || '';
}

async function loadSiteConfig() {
    const data = await apiAdminGet('/site-config');
    if (!data.success) return;
    const s = data.data;

    if (document.getElementById('siteTitle'))   document.getElementById('siteTitle').value   = s.site_title   || '';
    if (document.getElementById('siteTagline')) document.getElementById('siteTagline').value = s.site_tagline || '';
    document.getElementById('siteName').value  = s.site_name  || '';
    document.getElementById('siteUrl').value   = s.site_url   || '';
    document.getElementById('siteEmail').value = s.contact_email || '';
    document.getElementById('socialFacebook').value  = s.social_facebook  || '';
    document.getElementById('socialInstagram').value = s.social_instagram || '';
    document.getElementById('socialLinkedin').value  = s.social_linkedin  || '';
    document.getElementById('socialWhatsapp').value  = s.social_whatsapp  || '';
    // Nuevos campos
    if (document.getElementById('whatsappUrl'))     document.getElementById('whatsappUrl').value     = s.whatsapp_url     || '';
    if (document.getElementById('whatsappMessage')) document.getElementById('whatsappMessage').value = s.whatsapp_message || '¡Hola! Te contacto desde RetoPA ({url}) por tu empresa *{empresa}*.\n\nMe gustaría obtener más información.';
    if (document.getElementById('googleMapsKey'))   document.getElementById('googleMapsKey').value   = s.google_maps_key  || '';
    document.getElementById('socialTwitter').value   = s.social_twitter   || '';
    document.getElementById('socialYoutube').value   = s.social_youtube   || '';
    document.getElementById('socialTiktok').value    = s.social_tiktok    || '';

    // Teléfono: separar prefijo del número
    const rawPhone = s.contact_phone || '';
    const prefixes = ['595','54','55','1'];
    let prefix = '595', phoneNum = rawPhone.replace(/\D/g,'');
    for (const p of prefixes) {
        if (phoneNum.startsWith(p)) { prefix = p; phoneNum = phoneNum.slice(p.length); break; }
    }
    const prefSel = document.getElementById('sitePhonePrefix');
    if (prefSel) prefSel.value = prefix;
    document.getElementById('sitePhone').value = phoneNum;

    // Vista previa
    document.getElementById('previewSiteName').textContent = s.site_name || 'RetoPA';
    document.getElementById('previewSiteUrl').textContent  = (s.site_url || '').replace('https://','').replace('http://','');
    document.getElementById('previewPhone').textContent  = s.contact_phone || 'Sin teléfono';
    document.getElementById('previewEmail').textContent  = s.contact_email || 'Sin email';

    // Leads — buzones de notificación
    if (document.getElementById('leadsEmailsInput'))
        document.getElementById('leadsEmailsInput').value = s.leads_emails || '';

    // Sesión / seguridad — cierre por inactividad (D7.6)
    if (document.getElementById('idleTimeoutInput'))
        document.getElementById('idleTimeoutInput').value = s.admin_idle_timeout_min || '30';
    if (document.getElementById('idleWarningInput'))
        document.getElementById('idleWarningInput').value = (s.admin_idle_warning_min != null && s.admin_idle_warning_min !== '') ? s.admin_idle_warning_min : '5';

    // SMTP
    document.getElementById('smtpHost').value     = s.smtp_host      || '';
    document.getElementById('smtpPort').value     = s.smtp_port      || '587';
    document.getElementById('smtpSecure').value   = s.smtp_secure    || 'false';
    document.getElementById('smtpUser').value     = s.smtp_user      || '';
    document.getElementById('smtpFrom').value     = s.smtp_from      || '';
    document.getElementById('smtpFromName').value = s.smtp_from_name || '';

    // Hero
    const heroFields = ['hero_title','hero_subtitle','hero_description','hero_cta_text','hero_cta_link','hero_bg_from','hero_bg_to'];
    heroFields.forEach(k => {
        const el = document.getElementById(k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Input') ||
                   document.getElementById(k + 'Input');
        if (el) el.value = s[k] || '';
    });
    // Planes header
    if (document.getElementById('plansLabelInput')) document.getElementById('plansLabelInput').value = s.plans_label || '';
    if (document.getElementById('plansTitleInput')) document.getElementById('plansTitleInput').value = s.plans_title || '';
    if (document.getElementById('plansDescInput'))  document.getElementById('plansDescInput').value  = s.plans_desc  || '';
    // Footer
    if (document.getElementById('footerTaglineInput'))    document.getElementById('footerTaglineInput').value    = s.footer_tagline    || '';
    if (document.getElementById('footerCopyrightInput'))  document.getElementById('footerCopyrightInput').value  = s.footer_copyright  || '';
    if (document.getElementById('footerCol2TitleInput'))  document.getElementById('footerCol2TitleInput').value  = s.footer_col2_title || '';
    if (document.getElementById('footerCol3TitleInput'))  document.getElementById('footerCol3TitleInput').value  = s.footer_col3_title || '';
    if (document.getElementById('footerCol4TitleInput'))  document.getElementById('footerCol4TitleInput').value  = s.footer_col4_title || '';
    // Links del footer como texto editable (JSON pretty)
    ['footer_col2_links','footer_col3_links','footer_col4_links'].forEach(k => {
        const inputId = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Input';
        const el = document.getElementById(inputId) || document.getElementById(k + 'Input');
        if (el && s[k]) {
            try { el.value = JSON.parse(s[k]).map(l => `${l.label}|${l.url}`).join('\n'); } catch(e) {}
        }
    });
        document.getElementById('servicesLabelInput').value = s.services_label || '';
    if (document.getElementById('servicesTitleInput'))
        document.getElementById('servicesTitleInput').value = s.services_title || '';
    if (document.getElementById('servicesDescInput')) {
        document.getElementById('servicesDescInput').value = s.services_desc || '';
        updateServicesDescPreview();
    }

    // Secciones activables del sitio público
    const toggleIds = {
        'toggleSectionPlanes':    'section_planes_enabled',
        'toggleSectionServicios': 'section_servicios_enabled',
        'toggleSectionPromos':    'section_promos_enabled',
    };
    Object.entries(toggleIds).forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        if (el) el.checked = s[key] !== '0' && s[key] !== 'false';
    });

    // Imagotipo / Logo del sitio
    const logoUrl = s.logo_url || '';
    const logoPreview = document.getElementById('siteLogoPreview');
    const logoInput   = document.getElementById('siteLogoUrl');
    if (logoInput)   logoInput.value = logoUrl;
    if (logoPreview) {
        logoPreview.innerHTML = logoUrl
            ? `<img src="${logoUrl}" class="h-14 object-contain rounded-xl border border-gray-200 bg-white px-2">`
            : `<div class="h-14 w-14 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,#1B3A6B,#2a5298)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" stroke="#7EC8E3" stroke-width="2.2"/><line x1="14.8" y1="14.8" x2="20" y2="20" stroke="#7EC8E3" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="10" r="2" fill="#E8B84B"/><line x1="10" y1="12" x2="10" y2="15" stroke="#E8B84B" stroke-width="1.8" stroke-linecap="round"/></svg></div>`;
    }
    // smtpPass: never pre-fill

    // Plantilla de notificación
    if (document.getElementById('notifySubjectInput'))
        document.getElementById('notifySubjectInput').value = s.notify_subject || '{{nombre}} ya está en {{sitio}} — reclamá tu perfil';
    if (document.getElementById('notifyCcInput'))
        document.getElementById('notifyCcInput').value = s.notify_cc || '';
    if (document.getElementById('notifyBodyInput'))
        document.getElementById('notifyBodyInput').value = s.notify_body || '';

    const smtpOk = !!s.smtp_host;
    const smtpEl = document.getElementById('smtpStatus');
    if (smtpEl) {
        smtpEl.textContent  = smtpOk ? 'Configurado' : 'Pendiente config';
        smtpEl.className    = smtpOk ? 'text-xs text-green-600' : 'text-xs text-amber-600';
    }
}

async function saveSiteConfig() {
    const prefix = document.getElementById('sitePhonePrefix')?.value || '595';
    const phoneNum = document.getElementById('sitePhone')?.value.replace(/\D/g,'') || '';
    const fullPhone = phoneNum ? prefix + phoneNum : '';

    const payload = {
        site_name:       document.getElementById('siteName')?.value || '',
        site_url:        document.getElementById('siteUrl')?.value  || '',
        site_title:      document.getElementById('siteTitle')?.value    || '',
        site_tagline:    document.getElementById('siteTagline')?.value  || '',
        contact_phone:   fullPhone,
        contact_email:   document.getElementById('siteEmail')?.value  || '',
        social_facebook: document.getElementById('socialFacebook')?.value  || '',
        social_instagram:document.getElementById('socialInstagram')?.value || '',
        social_linkedin: document.getElementById('socialLinkedin')?.value  || '',
        social_whatsapp: document.getElementById('socialWhatsapp')?.value  || '',
        whatsapp_url:     document.getElementById('whatsappUrl')?.value     || '',
        whatsapp_message: document.getElementById('whatsappMessage')?.value  || '',
        google_maps_key:  document.getElementById('googleMapsKey')?.value    || '',
        social_twitter:  document.getElementById('socialTwitter')?.value   || '',
        social_youtube:  document.getElementById('socialYoutube')?.value   || '',
        social_tiktok:   document.getElementById('socialTiktok')?.value    || '',
        section_planes_enabled:    document.getElementById('toggleSectionPlanes')?.checked    ? '1' : '0',
        section_servicios_enabled: document.getElementById('toggleSectionServicios')?.checked ? '1' : '0',
        section_promos_enabled:    document.getElementById('toggleSectionPromos')?.checked    ? '1' : '0',
    };

    const statusEl = document.getElementById('siteSaveStatus');
    if (statusEl) statusEl.textContent = 'Guardando...';

    const res = await apiAdminPost('/site-config', payload, 'PUT');
    if (res.success) {
        showToast('Configuración guardada y publicada ✅');
        if (statusEl) statusEl.textContent = 'Guardado — ' + new Date().toLocaleTimeString();
    } else {
        showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
        if (statusEl) statusEl.textContent = '';
    }
}

async function saveSmtpConfig() {
    const payload = {
        smtp_host:      document.getElementById('smtpHost')?.value || '',
        smtp_port:      document.getElementById('smtpPort')?.value || '587',
        smtp_secure:    document.getElementById('smtpSecure')?.value || 'false',
        smtp_user:      document.getElementById('smtpUser')?.value || '',
        smtp_pass:      document.getElementById('smtpPass')?.value || '',
        smtp_from:      document.getElementById('smtpFrom')?.value || '',
        smtp_from_name: document.getElementById('smtpFromName')?.value || '',
    };
    const res = await apiAdminPost('/site-config', payload, 'PUT');
    if (res.success) {
        showToast('Configuración SMTP guardada');
        document.getElementById('smtpPass').value = '';
    } else {
        showToast('Error: ' + res.error, 'error');
    }
}

async function verifySmtp() {
    const btn = event.target;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Verificando...';
    btn.disabled = true;
    const res = await apiAdminPost('/email/verify', {});
    btn.innerHTML = '<i class="fas fa-plug mr-1"></i> Verificar conexión';
    btn.disabled = false;
    const el = document.getElementById('smtpStatus');
    if (res.success) {
        showToast('✅ Conexión SMTP exitosa');
        if (el) { el.textContent = 'Verificado ✅'; el.className = 'text-xs text-green-600'; }
    } else {
        showToast('❌ Error SMTP: ' + res.error, 'error');
        if (el) { el.textContent = 'Error de conexión'; el.className = 'text-xs text-red-600'; }
    }
}

function openEmailTest() {
    document.getElementById('emailTestPanel').classList.toggle('hidden');
    const input = document.getElementById('testEmailTo');
    // Pre-fill con el email del admin actual
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (input && !input.value && user.email) input.value = user.email;
}

async function sendTestEmail() {
    const to = document.getElementById('testEmailTo')?.value?.trim();
    if (!to) { showToast('Ingresá un email de destino', 'error'); return; }
    const btn = event.target;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    const res = await apiAdminPost('/email/test', { to });
    btn.innerHTML = 'Enviar';
    btn.disabled = false;
    const resultEl = document.getElementById('emailTestResult');
    if (res.success) {
        showToast(res.message);
        resultEl.textContent = '✅ ' + res.message;
        resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700';
        resultEl.classList.remove('hidden');
    } else {
        showToast('Error: ' + res.error, 'error');
        resultEl.textContent = '❌ ' + res.error;
        resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600';
        resultEl.classList.remove('hidden');
    }
}

async function loadSettings() {
    await loadSiteConfig();
    loadEmailLog(); // no await — carga en paralelo
    // Cargar estado MFA del usuario actual
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.id) {
        const data = await apiAdminGet(`/users`);
        if (data.success) {
            const me = data.data.find(u => u.id === user.id || u.email === user.email);
            if (me) {
                document.getElementById('mfaToggle').checked = me.mfa_enabled || false;
                updateMFAStatus(me.mfa_enabled);
            }
        }
    }
}

async function loadEmailLog() {
    const data = await apiAdminGet('/email-log?limit=50');
    if (!data.success) return;

    // Stats
    const s = data.stats || {};
    const statsEl = document.getElementById('emailLogStats');
    if (statsEl) {
        statsEl.innerHTML = [
            s.sent   ? `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">${s.sent} enviados</span>` : '',
            s.failed ? `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded font-medium">${s.failed} fallidos</span>` : '',
        ].filter(Boolean).join('');
    }

    const typeLabels = {
        welcome: '🎉 Bienvenida', mfa_login: '🔐 2FA Login', mfa_resend: '🔐 2FA Reenvío',
        reset: '🔑 Reset pwd', test: '🧪 Test', general: '📧 General',
    };

    const tbody = document.getElementById('emailLogTable');
    if (!tbody) return;
    if (!data.data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-6 text-center text-gray-400 text-xs">No hay emails registrados aún. Se registran automáticamente al enviarse.</td></tr>';
        return;
    }
    tbody.innerHTML = data.data.map(r => `
        <tr class="table-row transition hover:bg-gray-50">
            <td class="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">${formatDateShort(r.created_at)}</td>
            <td class="px-5 py-3 text-xs text-gray-700 font-mono">${escapeHtml(r.to_email)}</td>
            <td class="px-5 py-3 text-xs text-gray-600 max-w-xs truncate" title="${escapeHtml(r.subject)}">${escapeHtml(r.subject)}</td>
            <td class="px-5 py-3 text-xs">${typeLabels[r.type] || r.type}</td>
            <td class="px-5 py-3">
                ${r.status === 'sent'
                    ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">✓ Enviado</span>'
                    : `<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-medium" title="${escapeHtml(r.error||'')}">✗ Error</span>`
                }
            </td>
        </tr>
    `).join('');
}

function updateMFAStatus(enabled) {
    const statusEl = document.getElementById('mfaStatus');
    const badgeEl  = document.getElementById('mfaStatusBadge');
    const testPanel = document.getElementById('mfaTestPanel');
    if (enabled) {
        statusEl.className   = 'mb-6 p-4 rounded-xl border text-sm bg-green-50 border-green-200 text-green-800';
        statusEl.innerHTML   = '<i class="fas fa-shield-check mr-2 text-green-600"></i><strong>2FA activado</strong> — Se requerirá un código al iniciar sesión.';
        badgeEl.textContent  = 'Activo ✅';
        badgeEl.className    = 'text-xs text-green-600';
        testPanel.classList.remove('hidden');
    } else {
        statusEl.className   = 'mb-6 p-4 rounded-xl border text-sm bg-amber-50 border-amber-200 text-amber-800';
        statusEl.innerHTML   = '<i class="fas fa-exclamation-triangle mr-2 text-amber-600"></i><strong>2FA desactivado</strong> — El acceso solo requiere email y contraseña.';
        badgeEl.textContent  = 'Inactivo';
        badgeEl.className    = 'text-xs text-amber-600';
        testPanel.classList.add('hidden');
    }
}

async function toggleMFA(enabled) {
    const user = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || '{}');
    if (!user.id && !user.email) { showToast('Sesión no encontrada. Volvé a iniciar sesión.', 'error'); return; }
    const res = await apiAdminPost('/mfa/toggle', { user_id: user.id || undefined, email: user.email || undefined, enabled }, 'PUT');
    if (res.success) {
        showToast(enabled ? '2FA activado' : '2FA desactivado');
        updateMFAStatus(enabled);
    } else {
        document.getElementById('mfaToggle').checked = !enabled;
        showToast('Error: ' + res.error, 'error');
    }
}

async function sendMFATest() {
    const user = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || '{}');
    if (!user.id && !user.email) return;
    const res = await apiAdminPost('/mfa/send', { user_id: user.id || undefined, email: user.email || undefined });
    if (res.success) showToast(res.message);
    else showToast('Error: ' + res.error, 'error');
}

async function verifyMFATest() {
    const user = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || '{}');
    const otp  = document.getElementById('mfaTestCode')?.value?.trim();
    if (!otp) { showToast('Ingresá el código', 'error'); return; }
    const res = await apiAdminPost('/mfa/verify', { user_id: user.id, otp });
    if (res.success) {
        showToast('✅ Código verificado correctamente — 2FA funcionando!');
        document.getElementById('mfaTestCode').value = '';
    } else {
        showToast('❌ ' + res.error, 'error');
    }
}

function toggleAdminKey() {
    const input = document.getElementById('adminKeyInput');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

// ── Campanita de notificaciones ───────────────────────────────────────────
async function showNotifications() {
    let panel = document.getElementById('notifDropdown');
    // Toggle: si ya está abierto, cerrarlo
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div');
    panel.id = 'notifDropdown';
    panel.className = 'absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden';
    panel.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando...</div>';

    // Anclar al contenedor de la campanita
    const bell = document.querySelector('[onclick="showNotifications()"]');
    if (bell) { bell.parentElement.style.position = 'relative'; bell.parentElement.appendChild(panel); }

    // Cerrar al hacer click afuera
    setTimeout(() => {
        document.addEventListener('click', function closeNotif(e) {
            const p = document.getElementById('notifDropdown');
            if (p && !p.contains(e.target) && !e.target.closest('[onclick="showNotifications()"]')) {
                p.remove(); document.removeEventListener('click', closeNotif);
            }
        });
    }, 100);

    // Traer datos reales del dashboard
    const data = await apiAdminGet('/dashboard');
    if (!data || !data.success) {
        panel.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">No se pudo cargar</div>';
        return;
    }
    const s = data.stats || {};
    const items = [];
    if (parseInt(s.pending_leads) > 0)
        items.push({ icon: 'fa-envelope', color: 'text-red-500 bg-red-50', text: `${s.pending_leads} leads pendientes`, section: 'leads' });
    if (parseInt(s.pending_verification) > 0)
        items.push({ icon: 'fa-clock', color: 'text-amber-500 bg-amber-50', text: `${parseInt(s.pending_verification).toLocaleString('es-PY')} empresas sin verificar`, section: 'businesses' });
    if (parseInt(s.new_biz_week) > 0)
        items.push({ icon: 'fa-building', color: 'text-sky-500 bg-sky-50', text: `${s.new_biz_week} empresas nuevas esta semana`, section: 'businesses' });
    if (parseInt(s.new_users_week) > 0)
        items.push({ icon: 'fa-user-plus', color: 'text-purple-500 bg-purple-50', text: `${s.new_users_week} usuarios nuevos esta semana`, section: 'users' });

    const header = '<div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between"><span class="font-bold text-gray-900 text-sm">Notificaciones</span>' +
        (items.length ? `<span class="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full">${items.length}</span>` : '') + '</div>';

    if (!items.length) {
        panel.innerHTML = header + '<div class="p-6 text-center text-gray-400 text-sm"><i class="fas fa-check-circle text-2xl mb-2 block text-green-400"></i>Todo al día</div>';
        return;
    }

    panel.innerHTML = header + '<div class="max-h-80 overflow-y-auto">' + items.map(it => `
        <div onclick="showSection('${it.section}');document.getElementById('notifDropdown')?.remove()"
             class="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center ${it.color} flex-shrink-0">
                <i class="fas ${it.icon} text-sm"></i>
            </div>
            <span class="text-sm text-gray-700 flex-1">${it.text}</span>
            <i class="fas fa-chevron-right text-gray-300 text-xs"></i>
        </div>`).join('') + '</div>';
}

function syncWhatsappPreview(url) {
    // Actualizar el preview del FAB de WhatsApp en la vista previa del footer
    const previewWa = document.getElementById('previewWhatsapp');
    if (previewWa) previewWa.href = url || '#';
}

    // ================================================================

// ================================================================
// HEADER DE SERVICIOS (Sprint 7)
// ================================================================
function updateServicesDescPreview() {
    const input = document.getElementById('servicesDescInput');
    const preview = document.getElementById('servicesDescPreview');
    if (!input || !preview) return;
    const html = input.value.replace(/\*\*(.+?)\*\*/g, '<span style="color:#0ea5e9;font-weight:600">$1</span>');
    preview.innerHTML = html || '<span style="color:#ccc">Vista previa...</span>';
}

// Listener en tiempo real para el preview
document.getElementById('servicesDescInput')?.addEventListener('input', updateServicesDescPreview);

async function saveServicesHeader() {
    const label = document.getElementById('servicesLabelInput')?.value || '';
    const title = document.getElementById('servicesTitleInput')?.value || '';
    const desc  = document.getElementById('servicesDescInput')?.value  || '';
    const res = await apiAdminPost('/site-config', {
        services_label: label,
        services_title: title,
        services_desc:  desc,
    }, 'PUT');
    if (res.success) showToast('Encabezado de Servicios guardado ✅');
    else showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
}

// ================================================================
// LOGO / IMAGOTIPO del sitio
// ================================================================
async function uploadSiteLogo(file) {
    if (!file) return;
    const ACCEPTED = ['image/jpeg','image/png','image/webp','image/svg+xml'];
    if (!ACCEPTED.includes(file.type)) { showToast('Usá JPG, PNG, WebP o SVG', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Máximo 5MB', 'error'); return; }

    const btn = document.getElementById('siteLogoBtnLabel');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Subiendo...'; }

    const fd = new FormData();
    fd.append('logo', file);

    try {
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAdminToken()}` },
            body: fd
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Error al subir');

        const url = data.data?.logo_url || data.data?.url || data.url || '';
        document.getElementById('siteLogoUrl').value = url;

        // Guardar en site_config
        const saveRes = await apiAdminPost('/site-config', { logo_url: url }, 'PUT');
        if (saveRes.success) {
            showToast('Logo guardado ✅');
            // Actualizar preview
            const preview = document.getElementById('siteLogoPreview');
            if (preview) preview.innerHTML = `<img src="${url}" class="h-14 object-contain rounded-xl border border-gray-200 bg-white px-2">`;
        } else {
            showToast('Error al guardar: ' + saveRes.error, 'error');
        }
    } catch(e) {
        showToast('Error al subir el logo: ' + e.message, 'error');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-upload mr-1"></i> Subir imagen'; }
    }
}

async function clearSiteLogo() {
    if (!confirm('¿Eliminar el logo personalizado? Se mostrará el imagotipo SVG por defecto.')) return;
    const res = await apiAdminPost('/site-config', { logo_url: '' }, 'PUT');
    if (res.success) {
        document.getElementById('siteLogoUrl').value = '';
        const preview = document.getElementById('siteLogoPreview');
        if (preview) preview.innerHTML = `<div class="h-14 w-14 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,#1B3A6B,#2a5298)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" stroke="#7EC8E3" stroke-width="2.2"/><line x1="14.8" y1="14.8" x2="20" y2="20" stroke="#7EC8E3" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="10" r="2" fill="#E8B84B"/><line x1="10" y1="12" x2="10" y2="15" stroke="#E8B84B" stroke-width="1.8" stroke-linecap="round"/></svg></div>`;
        showToast('Logo eliminado, usando imagotipo por defecto');
    }
}

// ================================================================
// HERO — guardar
// ================================================================
async function saveHeroConfig() {
    const payload = {
        hero_title:       document.getElementById('heroTitleInput')?.value       || '',
        hero_subtitle:    document.getElementById('heroSubtitleInput')?.value    || '',
        hero_description: document.getElementById('heroDescriptionInput')?.value || '',
        hero_cta_text:    document.getElementById('heroCtaTextInput')?.value     || '',
        hero_cta_link:    document.getElementById('heroCtaLinkInput')?.value     || '',
        hero_bg_from:     document.getElementById('heroBgFromInput')?.value      || '',
        hero_bg_to:       document.getElementById('heroBgToInput')?.value        || '',
    };
    const res = await apiAdminPost('/site-config', payload, 'PUT');
    if (res.success) showToast('Hero guardado ✅');
    else showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
}

// ================================================================
// PLANES HEADER — guardar
// ================================================================
async function savePlansHeader() {
    const payload = {
        plans_label: document.getElementById('plansLabelInput')?.value || '',
        plans_title: document.getElementById('plansTitleInput')?.value || '',
        plans_desc:  document.getElementById('plansDescInput')?.value  || '',
    };
    const res = await apiAdminPost('/site-config', payload, 'PUT');
    if (res.success) showToast('Encabezado de Planes guardado ✅');
    else showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
}

// ================================================================
// FOOTER — guardar
// ================================================================
function parseLinksInput(text) {
    return (text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [label, url] = l.split('|');
        return { label: (label || '').trim(), url: (url || '#').trim() };
    });
}

async function saveFooterConfig() {
    const payload = {
        footer_tagline:    document.getElementById('footerTaglineInput')?.value    || '',
        footer_copyright:  document.getElementById('footerCopyrightInput')?.value  || '',
        footer_col2_title: document.getElementById('footerCol2TitleInput')?.value  || '',
        footer_col3_title: document.getElementById('footerCol3TitleInput')?.value  || '',
        footer_col4_title: document.getElementById('footerCol4TitleInput')?.value  || '',
        footer_col2_links: JSON.stringify(parseLinksInput(document.getElementById('footerCol2LinksInput')?.value)),
        footer_col3_links: JSON.stringify(parseLinksInput(document.getElementById('footerCol3LinksInput')?.value)),
        footer_col4_links: JSON.stringify(parseLinksInput(document.getElementById('footerCol4LinksInput')?.value)),
    };
    const res = await apiAdminPost('/site-config', payload, 'PUT');
    if (res.success) showToast('Footer guardado ✅');
    else showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
}

// ================================================================
// LEADS — buzones de notificación
// ================================================================
async function saveLeadsEmails() {
    const raw = document.getElementById('leadsEmailsInput')?.value || '';
    const emails = raw.split(',').map(e => e.trim()).filter(Boolean);
    const invalid = emails.filter(e => !e.includes('@'));
    if (invalid.length) { showToast('Email inválido: ' + invalid.join(', '), 'error'); return; }
    const res = await apiAdminPost('/site-config', { leads_emails: emails.join(',') }, 'PUT');
    if (res.success) showToast('Buzones de leads guardados ✅');
    else showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
}

async function saveSessionTimeout() {
    const total = parseInt(document.getElementById('idleTimeoutInput')?.value);
    const warn  = parseInt(document.getElementById('idleWarningInput')?.value);
    if (!Number.isFinite(total) || total < 1) { showToast('El tiempo de inactividad debe ser al menos 1 minuto', 'error'); return; }
    if (!Number.isFinite(warn) || warn < 0)   { showToast('El aviso debe ser 0 o más minutos', 'error'); return; }
    if (warn >= total) { showToast('El aviso debe ser menor al tiempo total de inactividad', 'error'); return; }
    const res = await apiAdminPost('/site-config', {
        admin_idle_timeout_min: String(total),
        admin_idle_warning_min: String(warn),
    }, 'PUT');
    if (res.success) showToast('Tiempo de sesión guardado ✅ (aplica al recargar el panel)');
    else showToast('Error: ' + (res.error || 'No se pudo guardar'), 'error');
}

async function saveNotifyTemplate() {
    const payload = {
        notify_subject: document.getElementById('notifySubjectInput')?.value || '',
        notify_cc:      document.getElementById('notifyCcInput')?.value      || '',
        notify_body:    document.getElementById('notifyBodyInput')?.value    || '',
    };
    const res = await apiAdminPost('/site-config', payload, 'PUT');
    if (res.success) {
        showToast('Plantilla guardada correctamente');
    } else {
        showToast('Error al guardar: ' + (res.error || ''), 'error');
    }
}

// ── Test de templates de email ─────────────────────────────────────────────
async function loadTestBizOptions(selId = 'testEmailBiz') {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const data = await apiAdminGet('/businesses?limit=200&verified=true');
    if (!data.success) return;
    const bizList = data.data || data.businesses || [];
    sel.innerHTML = '<option value="">— Cualquier empresa —</option>' +
        bizList.map(b => `<option value="${b.slug}">${b.trade_name || b.name} (${b.city || ''})</option>`).join('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const toEl = document.getElementById(selId === 'testEmailBiz2' ? 'testEmailTo2' : 'testEmailTo');
    if (toEl && !toEl.value && user.email) toEl.value = user.email;
}

async function sendTestTemplate() {
    const template    = document.getElementById('testEmailTemplate')?.value;
    const to          = document.getElementById('testEmailTo')?.value.trim();
    const bizSlug     = document.getElementById('testEmailBiz')?.value || '';
    const resultEl    = document.getElementById('emailTestResult');

    if (!to || !to.includes('@')) {
        if (resultEl) { resultEl.textContent = 'Ingresá un email válido'; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; resultEl.classList.remove('hidden'); }
        return;
    }

    if (resultEl) { resultEl.textContent = 'Enviando...'; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-gray-100 text-gray-600'; resultEl.classList.remove('hidden'); }

    const res = await apiAdminPost('/notify/test-template', { template, to, business_slug: bizSlug });

    if (res.success) {
        if (resultEl) { resultEl.textContent = `✅ ${res.message}`; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700'; }
        showToast(`Email de prueba enviado a ${to} ✅`);
        setTimeout(loadEmailLogs, 1500);
    } else {
        if (resultEl) { resultEl.textContent = `❌ Error: ${res.error}`; resultEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; }
        showToast('Error: ' + (res.error || 'No se pudo enviar'), 'error');
    }
}

// ── Log de emails (paginado) ───────────────────────────────────────────────
const EMAIL_LOG_PAGE_SIZE = 25;
window._emailLogPage = 1;

async function loadEmailLogs(page) {
    if (page) window._emailLogPage = page;
    const p = window._emailLogPage || 1;
    const type   = document.getElementById('logFilterType')?.value   || '';
    const status = document.getElementById('logFilterStatus')?.value || '';
    const offset = (p - 1) * EMAIL_LOG_PAGE_SIZE;
    const params = new URLSearchParams({ limit: EMAIL_LOG_PAGE_SIZE, offset, ...(type && {type}), ...(status && {status}) });

    const data = await apiAdminGet(`/notify/logs?${params}`);
    if (!data.success) return;

    // Stats
    const s = data.stats || {};
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = parseInt(val||0).toLocaleString(); };
    setEl('logStatTotal',  s.total);
    setEl('logStatSent',   s.sent);
    setEl('logStatFailed', s.failed);

    // Paginado: actualizar controles
    const filteredTotal = parseInt(data.filteredTotal || 0);
    const totalPages = Math.max(1, Math.ceil(filteredTotal / EMAIL_LOG_PAGE_SIZE));
    const pag = document.getElementById('emailLogPagination');
    if (pag) {
        if (filteredTotal > EMAIL_LOG_PAGE_SIZE) {
            pag.classList.remove('hidden');
            const info = document.getElementById('logPageInfo');
            if (info) info.textContent = `Página ${p} de ${totalPages} · ${filteredTotal.toLocaleString()} correos`;
            const prev = document.getElementById('logPrevBtn');
            const next = document.getElementById('logNextBtn');
            if (prev) prev.disabled = (p <= 1);
            if (next) next.disabled = (p >= totalPages);
        } else {
            pag.classList.add('hidden');
        }
    }

    // Tabla
    const table = document.getElementById('emailLogTable');
    if (!table) return;

    if (!data.data.length) {
        table.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">No hay registros</div>';
        return;
    }

    const typeColors = {
        test:    'bg-blue-100 text-blue-700',
        notify:  'bg-amber-100 text-amber-700',
        claim:   'bg-purple-100 text-purple-700',
        review:  'bg-green-100 text-green-700',
        general: 'bg-gray-100 text-gray-600',
    };

    table.innerHTML = `
    <table class="w-full text-sm">
        <thead><tr class="border-b border-gray-100 text-xs text-gray-400 uppercase">
            <th class="px-4 py-2 text-left font-semibold">Destinatario</th>
            <th class="px-4 py-2 text-left font-semibold">Asunto</th>
            <th class="px-4 py-2 text-left font-semibold">Tipo</th>
            <th class="px-4 py-2 text-left font-semibold">Estado</th>
            <th class="px-4 py-2 text-left font-semibold">Fecha</th>
        </tr></thead>
        <tbody>
        ${data.data.map(log => `
            <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
                <td class="px-4 py-2.5 text-gray-700 font-medium truncate max-w-[180px]">${log.to_email}</td>
                <td class="px-4 py-2.5 text-gray-500 truncate max-w-[200px]">${log.subject}</td>
                <td class="px-4 py-2.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${typeColors[log.type] || typeColors.general}">${log.type}</span>
                </td>
                <td class="px-4 py-2.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">
                        ${log.status === 'sent' ? '✓ enviado' : '✗ error'}
                    </span>
                    ${log.error ? `<span class="block text-[10px] text-red-400 mt-0.5 truncate max-w-[120px]" title="${log.error}">${log.error}</span>` : ''}
                </td>
                <td class="px-4 py-2.5 text-gray-400 whitespace-nowrap text-xs">
                    ${new Date(log.created_at).toLocaleString('es-PY', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                </td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

// Cambiar de página en el log de correos (delta = -1 anterior, +1 siguiente)
function changeEmailLogPage(delta) {
    const next = (window._emailLogPage || 1) + delta;
    if (next < 1) return;
    loadEmailLogs(next);
}

// ── Precios de Boosts de Promociones ──────────────────────────────────────────
// Abre el modal de precios de boosts (desde la sección Promociones) y carga valores
function openBoostPricesModal() {
    const modal = document.getElementById('boostPricesModal');
    if (modal) modal.classList.remove('hidden');
    loadBoostPrices();
}

async function loadBoostPrices() {
    const data = await apiAdminGet('/promotions/prices').catch(()=>null);
    if (!data?.success) return;
    const p = data.prices || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    set('promoBoost7d',     p.boost_7d?.price);
    set('promoBoost7dDays', p.boost_7d?.days);
    set('promoBoost7dUrl',  p.boost_7d?.url);
    set('promoBoost7dDesc', p.boost_7d?.desc);
    set('promoBoost15d',    p.boost_15d?.price);
    set('promoBoost15dDays',p.boost_15d?.days);
    set('promoBoost15dUrl', p.boost_15d?.url);
    set('promoBoost15dDesc',p.boost_15d?.desc);
    set('promoBoostHome',   p.boost_home_30d?.price);
    set('promoBoostHomeDays',p.boost_home_30d?.days);
    set('promoBoostHomeUrl',p.boost_home_30d?.url);
    set('promoBoostHomeDesc',p.boost_home_30d?.desc);
}

async function saveBoostPrices() {
    const res = await apiAdminPost('/promotions/prices', {
        boost_7d_price:    document.getElementById('promoBoost7d')?.value,
        boost_7d_days:     document.getElementById('promoBoost7dDays')?.value,
        boost_7d_url:      document.getElementById('promoBoost7dUrl')?.value||'',
        boost_7d_desc:     document.getElementById('promoBoost7dDesc')?.value||'',
        boost_15d_price:   document.getElementById('promoBoost15d')?.value,
        boost_15d_days:    document.getElementById('promoBoost15dDays')?.value,
        boost_15d_url:     document.getElementById('promoBoost15dUrl')?.value||'',
        boost_15d_desc:    document.getElementById('promoBoost15dDesc')?.value||'',
        boost_home_30d:    document.getElementById('promoBoostHome')?.value,
        boost_home_days:   document.getElementById('promoBoostHomeDays')?.value,
        boost_home_url:    document.getElementById('promoBoostHomeUrl')?.value||'',
        boost_home_desc:   document.getElementById('promoBoostHomeDesc')?.value||'',
    }, 'PUT');
    if (res.success) {
        showToast('Configuración de boosts guardada ✅');
        const modal = document.getElementById('boostPricesModal');
        if (modal) modal.classList.add('hidden');
    }
    else showToast('Error: ' + (res.error||''), 'error');
}
