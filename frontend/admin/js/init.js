/**
 * RetoPA Admin — js/init.js
 * Init: poblar datos del usuario logueado, loadDashboard
 */

// Poblar nombre y rol desde el JWT
(function populateAdminUser() {
    const user = window.ADMIN_USER;
    if (!user) return;
    const nameEl   = document.getElementById('adminName');
    const roleEl   = document.getElementById('adminRole');
    const avatarEl = document.getElementById('adminAvatar');
    if (nameEl)   nameEl.textContent   = user.name || user.email || 'Admin';
    if (roleEl)   roleEl.textContent   = user.role === 'godmode' ? 'GodMode' : 'Administrador';
    if (avatarEl) avatarEl.textContent = (user.name || user.email || 'A').charAt(0).toUpperCase();

    // Header dropdown
    const headerName   = document.getElementById('adminNameHeader');
    const headerAvatar = document.getElementById('adminAvatarHeader');
    const headerSub    = document.getElementById('adminNameHeaderSub');
    const headerRole   = document.getElementById('adminRoleHeaderSub');
    const label = user.name || user.email || 'Admin';
    if (headerName)   headerName.textContent   = label.split(' ')[0];
    if (headerAvatar) headerAvatar.textContent = label.charAt(0).toUpperCase();
    if (headerSub)    headerSub.textContent    = label;
    if (headerRole)   headerRole.textContent   = user.role === 'godmode' ? 'GodMode' : 'Administrador';
})();

// Sobrescribir logout para usar JWT
function logout() {
    adminLogout(); // definido en config.js
}

loadDashboard();

// Restaurar estado de grupos colapsables del menú
if (typeof restoreNavGroups === 'function') restoreNavGroups();

// Cargar badge de boosts pendientes en el menú
(async function loadBoostBadge() {
    try {
        const data = await apiAdminGet('/promotions/dashboard');
        if (data.success) {
            const count = parseInt(data.boosts?.pendientes || 0);
            const badge = document.getElementById('promosPendingBadge');
            if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
        }
    } catch(e) {}
})();

