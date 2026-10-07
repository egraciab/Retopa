/**
 * RetoPA — Panel Embajador
 * app.js: init, navegación entre secciones
 */

const SECTIONS_AMB = ['dashboard', 'oportunidades', 'businesses', 'explorar', 'nueva'];
let _currentSection = 'dashboard';

function showSection(name) {
    _currentSection = name;
    SECTIONS_AMB.forEach(s => {
        document.getElementById(`section-${s}`)?.classList.toggle('hidden', s !== name);
        const navBtn = document.getElementById(`nav-${s}`);
        if (navBtn) {
            navBtn.classList.toggle('active', s === name);
            navBtn.querySelector('i')?.classList.toggle('text-brand-500', s === name);
            navBtn.querySelector('i')?.classList.toggle('text-gray-400', s !== name);
        }
        const bnavBtn = document.getElementById(`bnav-${s}`);
        if (bnavBtn) bnavBtn.classList.toggle('active', s === name);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (name === 'dashboard') loadAmbDashboard();
    if (name === 'oportunidades') { if (typeof loadOpportunities === 'function') loadOpportunities(); }
    if (name === 'businesses') loadMyFichas(1);
    if (name === 'explorar')  { if (typeof resetFichaSearch === 'function') resetFichaSearch(); loadAvailable(1); }
    if (name === 'nueva')     openNuevaFichaModal();

    if (history.replaceState) history.replaceState(null, '', '#' + name);
}

async function init() {
    // Poblar nombre en navbar
    const name = currentUser?.name || currentUser?.email || 'Embajador';
    const nameEl   = document.getElementById('navName');
    const avatarEl = document.getElementById('navAvatar');
    if (nameEl)   nameEl.textContent   = name.split(' ')[0];
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

    // Cargar Google Maps en background (igual que panel cliente)
    ambGet('/ambassador/maps-key').then(r => {
        const apiKey = r?.key;
        if (apiKey && typeof google === 'undefined') {
            const s = document.createElement('script');
            s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
            document.head.appendChild(s);
        }
    }).catch(() => {});

    // Cargar rubros y ciudades en background
    await loadSupportData();

    // Sección inicial
    const hash = window.location.hash.replace('#', '');
    if (SECTIONS_AMB.includes(hash)) {
        showSection(hash);
    } else {
        showSection('dashboard');
    }
}

window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#', '');
    if (SECTIONS_AMB.includes(hash)) showSection(hash);
});

document.addEventListener('DOMContentLoaded', init);
