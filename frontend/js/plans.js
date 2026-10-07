/**
 * RetoPA — js/plans.js
 * loadPlans(), renderPublicPlans(), renderPlanSelector(), escHtml()
 */

async function loadPlans() {
    try {
        const data = await apiGet('/plans');
        if (!data.success || !data.data?.length) return;
        _publicPlans = data.data;
        renderPublicPlans(data.data);
        renderPlanSelector(data.data);
    } catch(e) {
        console.warn('No se pudieron cargar los planes:', e);
    }
}

function renderPublicPlans(plans) {
    const grid = document.getElementById('plansPublicGrid');
    const carousel = document.getElementById('plansCarousel');
    const dots = document.getElementById('plansDots');
    if (!grid && !carousel) return;

    const cardHtml = (p, forCarousel = false) => {
        const isFeatured = p.is_featured;
        const wrapClass = forCarousel
            ? `flex-shrink-0 w-[85vw] max-w-sm snap-center`
            : '';
        return `
        <div class="plan-card ${wrapClass} ${isFeatured ? 'featured' : ''} bg-white rounded-3xl p-8 ${isFeatured ? 'shadow-lg' : 'shadow-sm'}" style="position:relative;overflow:hidden;display:flex;flex-direction:column">
            ${p.ribbon ? `<div class="plan-ribbon-public">${escHtml(p.ribbon)}</div>` : ''}
            ${isFeatured ? '<div style="display:inline-block;align-self:flex-start;background:#d97706;color:white;font-size:10px;font-weight:700;padding:4px 14px;border-radius:999px;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">★ Más popular</div>' : ''}
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-900">${escHtml(p.name)}</h4>
                ${p.subtitle ? `<p class="text-sm text-gray-500 mt-1">${escHtml(p.subtitle)}</p>` : ''}
            </div>
            <div class="mb-6">
                <span class="text-4xl font-black text-gray-900">Gs. ${parseInt(p.price||0).toLocaleString()}</span>
                <span class="text-gray-500 text-sm">/mes</span>
            </div>
            <ul class="space-y-3 mb-8">
                ${(Array.isArray(p.features) ? p.features : []).map(f => {
                    const isCrossed = f.startsWith('-');
                    const text = isCrossed ? f.slice(1).trim() : f;
                    return `<li class="flex items-center gap-3 text-sm ${isCrossed ? 'text-gray-400' : isFeatured ? 'text-gray-700' : 'text-gray-600'}">
                        <i class="fas ${isCrossed ? 'fa-times text-gray-300' : 'fa-check text-green-500'}"></i>
                        ${isCrossed ? text : (isFeatured ? `<strong>${text}</strong>` : text)}
                    </li>`;
                }).join('')}
            </ul>
            <button onclick="openRegistroEmpresaCheck('${p.id}')"
                style="margin-top:auto"
                class="${p.id === 'featured' ? 'btn-gold w-full py-3 rounded-xl text-white font-bold shadow-lg' : p.id === 'premium' ? 'btn-brand w-full py-3 rounded-xl text-white font-bold shadow-lg' : 'w-full py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition'}">
                ${escHtml(p.button_label || 'Registrar')}
            </button>
        </div>`;
    };

    // Desktop grid
    if (grid) grid.innerHTML = plans.map(p => cardHtml(p)).join('');

    // Mobile carrusel
    if (carousel) {
        carousel.innerHTML = plans.map(p => cardHtml(p, true)).join('');

        // Dots
        if (dots) {
            dots.innerHTML = plans.map((p, i) =>
                `<button onclick="scrollPlanTo(${i})" class="plan-dot w-2 h-2 rounded-full transition-all ${p.is_featured ? 'bg-brand-500 w-4' : 'bg-gray-300'}" data-idx="${i}"></button>`
            ).join('');
        }

        // Centrar en el "más popular" al cargar
        const featuredIdx = plans.findIndex(p => p.is_featured);
        if (featuredIdx > 0) {
            setTimeout(() => scrollPlanTo(featuredIdx), 100);
        }

        // Actualizar dot activo al hacer scroll
        carousel.addEventListener('scroll', () => {
            const cardW = carousel.firstElementChild?.offsetWidth || 0;
            const gap = 16;
            const idx = Math.round(carousel.scrollLeft / (cardW + gap));
            document.querySelectorAll('.plan-dot').forEach((d, i) => {
                d.classList.toggle('bg-brand-500', i === idx);
                d.classList.toggle('w-4', i === idx);
                d.classList.toggle('bg-gray-300', i !== idx);
                d.classList.toggle('w-2', i !== idx);
            });
        }, { passive: true });
    }
}

function scrollPlanTo(idx) {
    const carousel = document.getElementById('plansCarousel');
    if (!carousel) return;
    const card = carousel.children[idx];
    if (!card) return;
    // Scroll horizontal dentro del carousel — NO usar scrollIntoView porque
    // arrastra la página entera hacia la sección de Planes en mobile (bug v2.5)
    const gap = 16;
    carousel.scrollTo({ left: card.offsetLeft - gap, behavior: 'smooth' });
}

function renderPlanSelector(plans) {
    const grid = document.getElementById('planSelectGrid');
    if (!grid) return;
    const icons = { basic: '📋', featured: '⭐', premium: '💎' };
    grid.innerHTML = plans.map(p => `
        <div onclick="selectPlan('${p.id}')"
            class="plan-select cursor-pointer border-2 border-gray-200 rounded-xl p-5 hover:border-brand-400 transition text-center relative"
            data-plan="${p.id}">
            ${p.is_featured ? '<div class="absolute -top-2 left-1/2 -translate-x-1/2 bg-gold-400 text-white text-[10px] font-bold px-3 py-0.5 rounded-full">POPULAR</div>' : ''}
            <div class="text-3xl mb-2">${icons[p.id] || '📋'}</div>
            <h4 class="font-bold text-gray-900 text-sm">${escHtml(p.name)}</h4>
            <div class="text-xl font-black text-gray-900 my-1">Gs. ${parseInt(p.price||0).toLocaleString()}</div>
            ${p.subtitle ? `<p class="text-xs text-gray-500">${escHtml(p.subtitle)}</p>` : ''}
        </div>
    `).join('');
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Actualizar el label del plan seleccionado usando datos dinámicos
function getPlanLabel(planId) {
    const p = _publicPlans.find(x => x.id === planId);
    return p ? p.name : { basic: 'Ficha Básica', featured: 'Negocio Digital', premium: 'Empresa Pro' }[planId] || planId;
}

function openMyBusinesses() {
    window.location.href = '/cliente/';
}
function openProfileSettings() {
    window.location.href = '/cliente/#settings';
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('hidden');
}

// ============================================
// INIT
// ============================================
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (window.scrollY > 50) nav.classList.add('shadow-md');
    else nav.classList.remove('shadow-md');
});
