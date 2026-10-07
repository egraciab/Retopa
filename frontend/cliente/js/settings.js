/**
 * RetoPA — Panel del Cliente
 * settings.js: configuración de cuenta, ciudad, 2FA
 */

let _settingCities = [];
let _mfaIntent = null; // 'enable' | 'disable'

async function loadSettings() {
    const data = await clientGet('/client/me');
    if (!data.success) return;
    const u = data.data;
    document.getElementById('settingName').value  = u.name  || '';
    document.getElementById('settingEmail').value = u.email || '';
    document.getElementById('settingPhone').value = u.phone || '';

    // Ciudad
    const cityInput = document.getElementById('settingCityInput');
    const cityVal   = document.getElementById('settingCityValue');
    if (cityInput && u.city) { cityInput.value = u.city; }
    if (cityVal  && u.city) { cityVal.value   = u.city; }

    // Precargar cities para el combobox
    if (!_settingCities.length) {
        const cd = await clientGet('/cities');
        _settingCities = (cd.cities || cd.data || []).map(c => typeof c === 'string' ? c : (c.name || c.label || ''));
    }

    // MFA status
    renderMfaStatus(!!u.mfa_enabled);
}

async function saveSettings() {
    const name  = document.getElementById('settingName').value.trim();
    const phone = document.getElementById('settingPhone').value.trim();
    const city  = document.getElementById('settingCityValue')?.value.trim()
               || document.getElementById('settingCityInput')?.value.trim()
               || '';
    if (!name) { showToastClient('El nombre es requerido', 'error'); return; }

    const res = await clientPut('/client/me', { name, phone, city });
    if (res.success) {
        showToastClient('Perfil actualizado ✅');
        document.getElementById('navName').textContent = name;
        document.getElementById('navAvatar').textContent = name.charAt(0).toUpperCase();
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        user.name = name; localStorage.setItem('user', JSON.stringify(user));
    } else {
        showToastClient(res.error || 'Error al guardar', 'error');
    }
}

async function changePassword() {
    const errEl = document.getElementById('passError');
    errEl.classList.add('hidden');
    const current = document.getElementById('currentPass').value;
    const newP    = document.getElementById('newPass').value;
    const confirm = document.getElementById('confirmPass').value;
    if (!current || !newP || !confirm) { errEl.textContent = 'Completá todos los campos'; errEl.classList.remove('hidden'); return; }
    if (newP !== confirm) { errEl.textContent = 'Las contraseñas no coinciden'; errEl.classList.remove('hidden'); return; }
    if (newP.length < 8) { errEl.textContent = 'Mínimo 8 caracteres'; errEl.classList.remove('hidden'); return; }
    const res = await clientPut('/client/me', { currentPassword: current, password: newP });
    if (res.success) {
        ['currentPass','newPass','confirmPass'].forEach(id => document.getElementById(id).value = '');
        showToastClient('Contraseña actualizada ✅');
    } else {
        errEl.textContent = res.error || 'Error al cambiar contraseña';
        errEl.classList.remove('hidden');
    }
}

// ── Ciudad combobox en settings ───────────────────────────────────────────
function filterSettingCity() {
    const q = document.getElementById('settingCityInput').value.toLowerCase();
    const list = document.getElementById('settingCityList');
    const filtered = _settingCities.filter(c => c.toLowerCase().includes(q)).slice(0, 10);
    renderSettingCityList(filtered);
    list.classList.remove('hidden');
}
function openSettingCity() {
    const q = document.getElementById('settingCityInput').value.toLowerCase();
    const filtered = _settingCities.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 10);
    renderSettingCityList(filtered);
    document.getElementById('settingCityList').classList.remove('hidden');
}
function closeSettingCity() {
    document.getElementById('settingCityList')?.classList.add('hidden');
}
function renderSettingCityList(cities) {
    const list = document.getElementById('settingCityList');
    if (!cities.length) { list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Sin resultados</div>'; return; }
    list.innerHTML = cities.map(c =>
        `<div onclick="selectSettingCity('${escHtml(c)}')"
            class="px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer flex items-center gap-2">
            <i class="fas fa-map-marker-alt text-gray-300 text-xs"></i>${escHtml(c)}
        </div>`
    ).join('');
}
function selectSettingCity(name) {
    document.getElementById('settingCityInput').value = name;
    document.getElementById('settingCityValue').value = name;
    document.getElementById('settingCityList').classList.add('hidden');
}

// ── 2FA ───────────────────────────────────────────────────────────────────
function renderMfaStatus(enabled) {
    const icon    = document.getElementById('mfaStatusIcon');
    const text    = document.getElementById('mfaStatusText');
    const sub     = document.getElementById('mfaStatusSub');
    const btn     = document.getElementById('mfaToggleBtn');
    if (!text) return;
    if (enabled) {
        icon.className  = 'w-10 h-10 rounded-full bg-green-100 flex items-center justify-center';
        icon.innerHTML  = '<i class="fas fa-shield-alt text-green-500"></i>';
        text.textContent = '2FA activado';
        sub.textContent  = 'Tu cuenta tiene verificación en dos pasos activa.';
        btn.textContent  = 'Desactivar';
        btn.className    = 'touch-btn text-sm font-bold px-4 py-2 rounded-xl transition bg-red-50 text-red-600 hover:bg-red-100';
    } else {
        icon.className  = 'w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center';
        icon.innerHTML  = '<i class="fas fa-shield-alt text-gray-400"></i>';
        text.textContent = '2FA desactivado';
        sub.textContent  = 'Activalo para mayor seguridad en tu cuenta.';
        btn.textContent  = 'Activar 2FA';
        btn.className    = 'touch-btn text-sm font-bold px-4 py-2 rounded-xl transition bg-brand-50 text-brand-600 hover:bg-brand-100';
    }
    btn.classList.remove('hidden');
    btn.dataset.mfaEnabled = enabled ? '1' : '0';
}

async function initMfaFlow() {
    const btn = document.getElementById('mfaToggleBtn');
    const currentlyEnabled = btn.dataset.mfaEnabled === '1';
    _mfaIntent = currentlyEnabled ? 'disable' : 'enable';

    if (_mfaIntent === 'disable') {
        // Desactivar no requiere código
        const res = await clientPost('/client/mfa/toggle', { enabled: false }, 'PUT');
        if (res.success) { showToastClient('2FA desactivado'); renderMfaStatus(false); }
        else showToastClient(res.error || 'Error', 'error');
        return;
    }

    // Para activar: enviar OTP primero
    const res = await clientPost('/client/mfa/send', {});
    if (!res.success) { showToastClient(res.error || 'Error al enviar código', 'error'); return; }

    document.getElementById('mfaFlowMsg').textContent = res.message || 'Enviamos un código a tu email. Ingresalo para activar el 2FA.';
    document.getElementById('mfaOtpInput').value = '';
    document.getElementById('mfaVerifyFlow').classList.remove('hidden');
    showToastClient('📧 Código enviado a tu email');
}

async function confirmMfaFlow() {
    const otp = document.getElementById('mfaOtpInput').value.trim();
    if (!otp || otp.length < 6) { showToastClient('Ingresá el código de 6 dígitos', 'error'); return; }

    const res = await clientPost('/client/mfa/toggle', { enabled: true, otp }, 'PUT');
    if (res.success) {
        showToastClient('✅ 2FA activado correctamente');
        renderMfaStatus(true);
        cancelMfaFlow();
    } else {
        showToastClient(res.error || 'Código incorrecto', 'error');
    }
}

function cancelMfaFlow() {
    document.getElementById('mfaVerifyFlow').classList.add('hidden');
    document.getElementById('mfaOtpInput').value = '';
    _mfaIntent = null;
}
