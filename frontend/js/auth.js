/**
 * RetoPA — js/auth.js
 * login, registro usuario, MFA, forgot/reset password, navbar
 */

function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Si viene con ?reset=token, mostrar formulario de reset
    const resetToken = new URLSearchParams(window.location.search).get('reset');
    if (resetToken) { showLoginStep('resetForm'); }
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.body.style.overflow = '';
}

function switchToRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
}

function switchToLogin() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

// ── Helpers ─────────────────────────────────────────────────────────
function togglePwdPublic(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

let _mfaUserId = null; // guardamos el user_id entre pasos del login

function showLoginStep(step) {
    ['loginForm','mfaStep','forgotForm','resetForm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(step);
    if (target) target.classList.remove('hidden');
}

function openForgotPassword() {
    const email = document.getElementById('loginEmail')?.value;
    if (email) document.getElementById('forgotEmail').value = email;
    showLoginStep('forgotForm');
}

function backToLogin() { showLoginStep('loginForm'); }

async function submitForgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();
    const msgEl = document.getElementById('forgotMsg');
    if (!email) return;
    const res = await apiPost('/auth/forgot-password', { email });
    msgEl.classList.remove('hidden');
    if (res.success) {
        msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700';
        msgEl.textContent = '✅ ' + (res.message || 'Si el email existe, recibirás el enlace en minutos.');
    } else {
        msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600';
        msgEl.textContent = '❌ ' + (res.error || 'Error al enviar el email');
    }
}

async function submitResetPassword() {
    const pw  = document.getElementById('resetPassword').value;
    const pw2 = document.getElementById('resetPasswordConfirm').value;
    const msgEl = document.getElementById('resetMsg');
    msgEl.classList.add('hidden');
    if (pw.length < 8) { msgEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; msgEl.classList.remove('hidden'); return; }
    if (pw !== pw2)   { msgEl.textContent = 'Las contraseñas no coinciden.';                  msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600'; msgEl.classList.remove('hidden'); return; }

    // MODO ACTIVACIÓN (alta de ficha sin cuenta): confirma correo + crea contraseña + engancha.
    if (_activateToken) {
        const res = await apiPost('/auth/activate-account', { token: _activateToken, password: pw });
        if (res.success) {
            _activateToken = null;
            if (res.token) {
                localStorage.setItem('token', res.token);
                localStorage.setItem('user', JSON.stringify(res.user));
                currentUser = res.user;
                updateNavbarForUser();
                scheduleSessionExpiry();
            }
            msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700';
            msgEl.textContent = '✅ ¡Listo! Correo confirmado y cuenta activada.';
            msgEl.classList.remove('hidden');
            window.history.replaceState({}, '', '/');
            setTimeout(() => { window.location.href = '/cliente/'; }, 1200);
        } else {
            msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600';
            msgEl.textContent = '❌ ' + (res.error || 'El enlace de activación expiró o es inválido');
            msgEl.classList.remove('hidden');
        }
        return;
    }

    const token = new URLSearchParams(window.location.search).get('reset');
    const res = await apiPost('/auth/reset-password', { token, password: pw });
    if (res.success) {
        msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700';
        msgEl.textContent = '✅ Contraseña actualizada. Ya podés iniciar sesión.';
        msgEl.classList.remove('hidden');
        setTimeout(() => { backToLogin(); window.history.replaceState({}, '', '/'); }, 2000);
    } else {
        msgEl.className = 'text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600';
        msgEl.textContent = '❌ ' + (res.error || 'El enlace expiró o es inválido');
        msgEl.classList.remove('hidden');
    }
}

async function submitMFALogin() {
    const otp   = document.getElementById('mfaOtpInput').value.trim();
    const errEl = document.getElementById('mfaError');
    errEl.classList.add('hidden');
    if (!otp || otp.length !== 6) { errEl.textContent = 'Ingresá el código de 6 dígitos'; errEl.classList.remove('hidden'); return; }
    const res = await apiPost('/auth/mfa-verify', { user_id: _mfaUserId, otp });
    if (res.success) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        currentUser = res.user;
        updateNavbarForUser();
        scheduleSessionExpiry();
        closeLoginModal();
        handlePostLogin(res.user);
    } else {
        errEl.textContent = res.error || 'Código incorrecto';
        errEl.classList.remove('hidden');
    }
}

async function resendMFACode() {
    if (!_mfaUserId) return;
    const res = await apiPost('/auth/mfa-send', { user_id: _mfaUserId });
    if (res.success) showToastPublic('Código reenviado a tu email');
    else showToastPublic('Error al reenviar: ' + res.error, 'error');
}

function handlePostLogin(user) {
    // 1) Acción pendiente (ej. registrar negocio, dejar reseña) tiene prioridad.
    const pending = localStorage.getItem('pendingAction');
    if (pending) {
        const action = JSON.parse(pending);
        if (action.type === 'registerBusiness') openRegistroModal(action.plan);
        localStorage.removeItem('pendingAction');
        return; // no redirigir: el usuario está en medio de una acción
    }
    // 2) Admins/godmode: saludo, sin redirect (tienen su propio panel).
    if (user.role === 'godmode' || user.role === 'admin') {
        showToastPublic('¡Bienvenido, ' + user.name + '! 👑');
        return;
    }
    // 3) Dueño de ficha → directo a Mi Portal.
    if (user.has_business) {
        window.location.href = '/cliente/';
    }
}

function showToastPublic(msg, type = 'success') {
    const toast = document.createElement('div');
    const bg = type === 'error' ? 'bg-red-600' : 'bg-brand-600';
    toast.className = `fixed top-20 right-4 ${bg} text-white px-6 py-3 rounded-xl shadow-lg z-[80] text-sm font-medium`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ── Login submit ─────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');
    const res = await apiPost('/auth/login', {
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
    });

    if (res.success) {
        if (res.mfa_required) {
            // Backend pidió 2FA — mostrar paso de OTP
            _mfaUserId = res.user_id;
            showLoginStep('mfaStep');
            document.getElementById('mfaOtpInput').value = '';
        } else {
            localStorage.setItem('token', res.token);
            localStorage.setItem('user', JSON.stringify(res.user));
            currentUser = res.user;
            updateNavbarForUser();
            scheduleSessionExpiry();
            closeLoginModal();
            handlePostLogin(res.user);
        }
    } else {
        errEl.textContent = res.error || 'Credenciales inválidas';
        errEl.classList.remove('hidden');
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const res = await apiPost('/auth/register', {
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
    });

    if (res.success) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        currentUser = res.user;
        updateNavbarForUser();
        scheduleSessionExpiry();
        // Verificación de correo: avisamos que revise su email para confirmar.
        if (res.user && res.user.email_verified === false) {
            showToastPublic('¡Cuenta creada! Te enviamos un correo para confirmar tu cuenta. 📧');
        } else {
            showToastPublic('¡Bienvenido a RetoPA, ' + res.user.name + '! 🎉');
        }
        closeLoginModal();

        // Verificar acción pendiente
        const pending = localStorage.getItem('pendingAction');
        if (pending) {
            const action = JSON.parse(pending);
            if (action.type === 'registerBusiness') {
                openRegistroModal(action.plan);
            }
            localStorage.removeItem('pendingAction');
        }
    } else {
        const errEl = document.createElement('p');
        errEl.className = 'text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2';
        errEl.textContent = res.error || 'No se pudo crear la cuenta';
        this.appendChild(errEl);
        setTimeout(() => errEl.remove(), 4000);
    }
});

// ============================================
// SESSION MANAGEMENT — sesión "honesta": el front respeta el vencimiento del JWT
// (30m admin / 8h usuario, según lo firma el backend) y refleja el logout al instante.
// ============================================

// Decodifica el payload de un JWT (sin verificar firma) para leer 'exp'.
function _decodeJwt(token) {
    try {
        const p = token.split('.')[1];
        const json = decodeURIComponent(atob(p.replace(/-/g, '+').replace(/_/g, '/'))
            .split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(json);
    } catch (e) { return null; }
}
// ms hasta la expiración (negativo si ya venció). null si el token no trae exp.
function _tokenMsLeft(token) {
    const d = _decodeJwt(token);
    if (!d || !d.exp) return null;
    return d.exp * 1000 - Date.now();
}
function isSessionValid() {
    const token = localStorage.getItem('token');
    if (!token || !localStorage.getItem('user')) return false;
    const left = _tokenMsLeft(token);
    return left === null ? true : left > 0;   // sin exp → no romper
}

// Header en estado DESLOGUEADO (sin recargar la página).
function renderLoggedOutNavbar() {
    const c = document.getElementById('authButtons');
    if (!c) return;
    c.innerHTML = `
        <button onclick="openLoginModal()" class="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-600 transition px-3 py-2 rounded-lg hover:bg-gray-50">
            <i class="fas fa-sign-in-alt"></i> <span class="hidden md:inline">Ingresar</span>
        </button>
        <button onclick="openRegistroEmpresaCheck()" class="btn-brand text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-brand-500/25 flex items-center gap-2">
            <i class="fas fa-plus"></i> <span class="hidden sm:inline">Registrar mi empresa</span>
        </button>
        <button class="lg:hidden text-gray-700 text-xl p-2 hover:bg-gray-100 rounded-lg transition" onclick="toggleMobileMenu()">
            <i class="fas fa-bars"></i>
        </button>`;
}

// Cierra la sesión en el front cuando el token venció. notify=true → aviso.
function expireSessionUI(notify) {
    const wasLogged = !!localStorage.getItem('token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('pendingAction');
    currentUser = null;
    if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
    renderLoggedOutNavbar();
    if (notify && wasLogged && typeof showToastPublic === 'function') {
        showToastPublic('Tu sesión expiró. Ingresá de nuevo.', 'error');
    }
}

// Agenda el auto-logout exacto al vencimiento del token.
let _sessionTimer = null;
function scheduleSessionExpiry() {
    if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
    const token = localStorage.getItem('token');
    if (!token) return;
    const left = _tokenMsLeft(token);
    if (left === null) return;
    if (left <= 0) { expireSessionUI(true); return; }
    _sessionTimer = setTimeout(() => expireSessionUI(true), left + 500);
}

function checkSession() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
        if (!isSessionValid()) {
            expireSessionUI(false);       // token vencido → limpiar y mostrar deslogueado (silencioso al cargar)
        } else {
            currentUser = JSON.parse(userStr);
            updateNavbarForUser();
            scheduleSessionExpiry();
        }
    }
    // Auto-abrir modal si hay token de reset en la URL
    const resetToken = new URLSearchParams(window.location.search).get('reset');
    if (resetToken) { openLoginModal(); }

    // Link mágico de verificación de correo: ?verify=TOKEN
    const verifyToken = new URLSearchParams(window.location.search).get('verify');
    if (verifyToken) { handleEmailVerification(verifyToken); }

    // Link mágico de ACTIVACIÓN de cuenta (alta de ficha sin cuenta): ?activar=TOKEN
    const activarToken = new URLSearchParams(window.location.search).get('activar');
    if (activarToken) { openActivateScreen(activarToken); }
}

// Muestra el paso "creá tu contraseña" en modo activación de cuenta.
let _activateToken = null;
function openActivateScreen(token) {
    _activateToken = token;
    openLoginModal();
    showLoginStep('resetForm');
    const t = document.getElementById('resetTitle'); if (t) t.textContent = 'Creá tu contraseña';
    const st = document.getElementById('resetSubtitle');
    if (st) { st.textContent = 'Confirmás tu correo y activás tu cuenta para gestionar tu negocio.'; st.classList.remove('hidden'); }
    const ic = document.getElementById('resetIcon'); if (ic) ic.className = 'fas fa-circle-check text-3xl text-green-500 mb-2';
    const b = document.getElementById('resetSubmitBtn'); if (b) b.textContent = 'Confirmar y entrar';
}

// Confirma el correo con el token del link mágico, deja al usuario logueado y
// avisa cuántas fichas quedaron enganchadas.
async function handleEmailVerification(token) {
    // Limpiar el token de la URL para que un refresh no reintente.
    try { const u = new URL(window.location.href); u.searchParams.delete('verify'); history.replaceState(null, '', u.toString()); } catch (e) {}
    let res;
    try { res = await apiPost('/auth/verify-email', { token }); }
    catch (e) { res = { success: false, error: 'No pudimos verificar el correo. Probá de nuevo.' }; }

    if (res && res.success) {
        if (res.token) {
            localStorage.setItem('token', res.token);
            localStorage.setItem('user', JSON.stringify(res.user));
            currentUser = res.user;
            updateNavbarForUser();
            scheduleSessionExpiry();
        }
        const n = res.linked || 0;
        const msg = n > 0
            ? `¡Correo confirmado! Tenés ${n} ${n === 1 ? 'ficha lista' : 'fichas listas'} para gestionar. ✅`
            : '¡Correo confirmado! Ya podés gestionar tu negocio. ✅';
        showToastPublic(msg);
        // Si tiene fichas, llevarlo al panel; si no, se queda en el home logueado.
        if (res.user && res.user.has_business) {
            setTimeout(() => { window.location.href = '/cliente/'; }, 1400);
        }
    } else {
        showToastPublic((res && res.error) || 'El enlace de verificación es inválido o venció.', 'error');
    }
}

// Revalidar al volver a la pestaña/foco (los timers se ralentizan en segundo plano)
// y un chequeo periódico de respaldo.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && localStorage.getItem('token') && !isSessionValid()) expireSessionUI(true);
});
window.addEventListener('focus', () => {
    if (localStorage.getItem('token') && !isSessionValid()) expireSessionUI(true);
});
setInterval(() => {
    if (localStorage.getItem('token') && !isSessionValid()) expireSessionUI(true);
}, 60000);

function updateNavbarForUser() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const authContainer = document.getElementById('authButtons');
    if (!authContainer) return;

    // Sesión vencida → mostrar deslogueado (no confiar solo en la presencia del token).
    if (token && userStr && !isSessionValid()) { renderLoggedOutNavbar(); return; }

    if (token && userStr) {
        const user = JSON.parse(userStr);
        authContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <!-- Siempre visible: Registrar empresa -->
                <button onclick="openRegistroEmpresaCheck()" class="btn-brand text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-brand-500/25 hidden sm:flex items-center gap-2">
                    <i class="fas fa-plus"></i> <span class="hidden md:inline">Registrar mi empresa</span>
                </button>
                <!-- Avatar + menú -->
                <div class="relative group">
                    <button class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition">
                        <div class="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-sm">${user.name.charAt(0).toUpperCase()}</div>
                        <span class="hidden md:block text-sm font-medium text-gray-700 max-w-[120px] truncate">${user.name}</span>
                        ${user.role === 'godmode' ? '<span class="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold hidden md:block">GOD</span>' : ''}
                        ${user.role === 'admin' ? '<span class="text-[10px] bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded font-bold hidden md:block">ADMIN</span>' : ''}
                        <i class="fas fa-chevron-down text-xs text-gray-400"></i>
                    </button>
                    <div class="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 hidden group-hover:block z-50 overflow-hidden">
                        <div class="px-4 py-3 border-b border-gray-100 bg-gray-50">
                            <p class="text-xs font-bold text-gray-900 truncate">${user.name}</p>
                            <p class="text-xs text-gray-500 truncate">${user.email}</p>
                        </div>
                        ${user.role === 'godmode' || user.role === 'admin' ? `
                        <a href="/admin" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 font-medium">
                            <i class="fas fa-crown text-amber-500 w-4"></i> Panel Admin
                        </a>` : ''}
                        ${user.role === 'ambassador' || user.role === 'godmode' || user.is_ambassador ? `
                        <a href="/embajador" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 font-medium">
                            <i class="fas fa-user-tie text-amber-600 w-4"></i> Panel Embajador
                        </a>` : ''}
                        <a href="/cliente" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 font-medium">
                            <i class="fas fa-store text-brand-500 w-4"></i> Mi Portal
                        </a>
                        <div class="border-t border-gray-100"></div>
                        <a href="#" onclick="openRegistroEmpresaCheck()" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700">
                            <i class="fas fa-plus-circle text-green-500 w-4"></i> Registrar empresa
                        </a>
                        <a href="#" onclick="openProfileSettings()" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700">
                            <i class="fas fa-cog text-gray-400 w-4"></i> Configuración
                        </a>
                        <div class="border-t border-gray-100"></div>
                        <a href="#" onclick="logout()" class="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium">
                            <i class="fas fa-sign-out-alt w-4"></i> Cerrar sesión
                        </a>
                    </div>
                </div>
                <button class="lg:hidden text-gray-700 text-xl p-2 hover:bg-gray-100 rounded-lg transition" onclick="toggleMobileMenu()">
                    <i class="fas fa-bars"></i>
                </button>
            </div>
        `;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('pendingAction');
    currentUser = null;
    window.location.reload();
}

// Actualiza el placeholder del input según el prefijo seleccionado
function updatePhonePlaceholder(inputId, selectId) {
    const sel = document.getElementById(selectId);
    const opt = sel.options[sel.selectedIndex];
    const ph  = opt.getAttribute('data-placeholder') || '';
    document.getElementById(inputId).placeholder = ph;
}

// Armar número completo para WhatsApp: prefijo + número sin espacios ni guiones
function buildWhatsAppNumber(prefix, rawNumber) {
    const digits = rawNumber.replace(/\D/g, '');
    return prefix + digits;
}

// ============================================
// PLANES — carga dinámica desde API
// ============================================
let _publicPlans = [];
