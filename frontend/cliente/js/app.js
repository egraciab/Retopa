/**
 * RetoPA — Panel del Cliente
 * app.js: init, navegación entre secciones
 */

const SECTIONS = ['dashboard', 'businesses', 'promotions', 'reviews', 'settings', 'hepta'];
let _currentSection = 'dashboard';

function showSection(name) {
    _currentSection = name;

    SECTIONS.forEach(s => {
        document.getElementById(`section-${s}`)?.classList.toggle('hidden', s !== name);
        // Desktop sidebar
        const navBtn = document.getElementById(`nav-${s}`);
        if (navBtn) {
            navBtn.classList.toggle('active', s === name);
            navBtn.querySelector('i')?.classList.toggle('text-brand-500', s === name);
            navBtn.querySelector('i')?.classList.toggle('text-gray-400', s !== name);
        }
        // Bottom nav
        const bnavBtn = document.getElementById(`bnav-${s}`);
        if (bnavBtn) bnavBtn.classList.toggle('active', s === name);
    });

    // Scroll to top on section change (mobile UX)
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Cargar datos según sección
    if (name === 'dashboard')   loadDashboard();
    if (name === 'businesses')  renderBusinessList();
    if (name === 'promotions')  loadPromotions();
    if (name === 'reviews')     loadReviews();
    if (name === 'settings')    loadSettings();

    // Onboarding: primera vez que se entra a "Mis empresas", ofrecer su guía.
    // (renderBusinessList ya corrió → los anclajes data-tour existen.)
    if (name === 'businesses' && typeof maybeAutoStartTour === 'function') {
        setTimeout(() => maybeAutoStartTour('businesses'), 700);
    }

    // Update hash for back button support
    if (history.replaceState) history.replaceState(null, '', '#' + name);
}

async function init() {
    // Poblar navbar
    const name = currentUser?.name
        || (localStorage.getItem('user') && JSON.parse(localStorage.getItem('user')).name)
        || 'Usuario';
    const nameEl   = document.getElementById('navName');
    const avatarEl = document.getElementById('navAvatar');
    if (nameEl)   nameEl.textContent   = name;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

    // site-config: se usa para Google Maps Y para los Logros configurables
    // (achievements_config). Lo guardamos en un global ANTES de renderizar el
    // dashboard para que renderAchievements lea la config del Admin.
    try {
        const config = await clientGet('/site-config');
        window._retopaSiteConfig = (config && config.data) || {};
        const apiKey = window._retopaSiteConfig.google_maps_key;
        if (apiKey && typeof google === 'undefined') {
            const s = document.createElement('script');
            s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
            document.head.appendChild(s);
        }
    } catch (e) { window._retopaSiteConfig = window._retopaSiteConfig || {}; }

    // Cargar mis empresas
    const data = await clientGet('/client/businesses');
    myBusinesses = data.success ? data.data : [];

    // Inicializar empresa activa — la Pro/Featured primero, si no la primera
    if (myBusinesses.length > 0) {
        const topPlan = myBusinesses.find(b => b.plan_type === 'premium')
            || myBusinesses.find(b => b.plan_type === 'featured')
            || myBusinesses[0];

        // Solo setear activeDashBiz si no está ya seteado
        if (!activeDashBiz) activeDashBiz = topPlan.slug;

        // Actualizar display del selector
        const activeBiz = myBusinesses.find(b => b.slug === activeDashBiz) || topPlan;
        updateNavBizDisplay(activeBiz);

        // Plan badge en sidebar (desktop)
        const planEl = document.getElementById('planBadge');
        if (planEl) {
            planEl.innerHTML = `<div class="text-xs ${getPlanColor(topPlan.plan_type)} px-3 py-1.5 rounded-full font-bold">${getPlanLabel(topPlan.plan_type)}</div>`;
        }
    }

    // ── Onboarding S29: wizard post-registro (una vez) o nudge de completitud ──
    if (myBusinesses.length > 0) {
        const byLow = myBusinesses.slice().sort((a, b) =>
            (Number(a.completion?.completion) || 0) - (Number(b.completion?.completion) || 0));
        let welcome = false;
        try { welcome = localStorage.getItem('retopa_welcome') === '1'; } catch (e) {}
        if (welcome) {
            try { localStorage.removeItem('retopa_welcome'); } catch (e) {}
            const target = byLow[0];
            if (target && (Number(target.completion?.completion) || 0) < 100) {
                setTimeout(() => openWelcomeWizard(target), 400);
            }
        } else {
            const active = myBusinesses.find(b => b.slug === activeDashBiz) || myBusinesses[0];
            setTimeout(() => showOnboardingNudge(active), 300);
        }
    }

    // ── Onboarding 3/3: tour guiado la primera vez (reproducible) ──
    // Se muestra una sola vez (flag localStorage). No se apila con el wizard.
    if (myBusinesses.length > 0) {
        setTimeout(() => { if (typeof maybeAutoStartTour === 'function') maybeAutoStartTour(); }, 1100);
    }

    // Review badge en bottom nav si hay reseñas pendientes
    updateReviewsBadge();

    // Check URL hash para navegación directa
    const hash = window.location.hash.replace('#', '');
    if (SECTIONS.includes(hash)) {
        showSection(hash); // incluye loadDashboard si hash === 'dashboard'
    } else {
        loadDashboard();
    }
}

async function updateReviewsBadge() {
    try {
        const data = await clientGet('/client/reviews');
        if (data.success) {
            const unanswered = data.data.filter(r => !r.owner_reply && r.is_approved).length;
            const badge = document.getElementById('bnavReviewsBadge');
            if (badge) {
                if (unanswered > 0) {
                    badge.textContent = unanswered;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }
    } catch(e) {}
}

// Navegación por hash (back button)
window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#', '');
    if (SECTIONS.includes(hash)) showSection(hash);
});

document.addEventListener('DOMContentLoaded', init);
