/**
 * RetoPA — cliente/js/promotions.js  S6.1
 */

let _promosData     = [];
let _boostPrices    = {};
let _boostConfig    = {};
let _editingPromoId = null;
let _promoImgBlob   = null;
let _currentBoostId = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function boostLabel(type) {
    var days7  = _boostConfig && _boostConfig.boost_7d       ? _boostConfig.boost_7d.days       : 7;
    var days15 = _boostConfig && _boostConfig.boost_15d      ? _boostConfig.boost_15d.days      : 15;
    var days30 = _boostConfig && _boostConfig.boost_home_30d ? _boostConfig.boost_home_30d.days : 30;
    var map = { plan: 'Plan Pro', boost_7d: days7+' dias (boost)', boost_15d: days15+' dias (boost)', boost_home_30d: days30+' dias + Home' };
    return map[type] || type;
}

function renderBoostCard(type, label, price) {
    var desc = (_boostConfig && _boostConfig[type] && _boostConfig[type].desc) ? _boostConfig[type].desc : '';
    var isHome = type === 'boost_home_30d';
    return '<div' + (isHome ? ' data-tour="boost-home"' : '') + ' style="background:white;border:1.5px solid ' + (isHome ? '#fb923c' : '#fed7aa') + ';border-radius:12px;padding:12px;display:flex;flex-direction:column;text-align:center">' +
        (isHome ? '<div style="font-size:9px;font-weight:800;color:#c2410c;background:#ffedd5;border-radius:6px;padding:2px 0;margin:0 0 6px;text-transform:uppercase;letter-spacing:.5px">⭐ Más vendido</div>' : '') +
        '<p style="font-size:13px;font-weight:800;color:#ea580c;margin:0 0 4px">' + label + '</p>' +
        '<p style="font-size:12px;font-weight:700;color:#374151;margin:0 0 6px">Gs. ' + Number(price||0).toLocaleString('es-PY') + '</p>' +
        (desc ? '<p style="font-size:11px;line-height:1.4;color:#78716c;margin:0 0 10px;flex:1">' + escHtml(desc) + '</p>' : '') +
        '<button onclick="requestNewBoost(\'' + type + '\')"' + (isHome ? ' data-tour="boost-cta"' : '') + ' style="width:100%;padding:6px;background:#ea580c;color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;margin-top:auto">Solicitar</button>' +
        '</div>';
}

function renderPromoCard(p, isHistorial) {
    // Una promo es "historial" solo si expiró — no si está pausada
    var isExpired = new Date(p.expires_at) <= new Date();
    var isActive  = p.is_active && !isExpired;
    var isPaused  = !p.is_active && !isExpired;
    // isHistorial se fuerza false para pausadas — siempre muestran controles
    isHistorial = isHistorial && isExpired;
    var daysLeft  = Math.max(0, Math.ceil((new Date(p.expires_at) - Date.now()) / 86400000));

    var bizName = p.trade_name || p.business_name || '';

    var statusText  = isExpired ? 'Expirada' : isActive ? 'Activa' : 'Pausada';
    var statusColor = isExpired ? '#dc2626'  : isActive ? '#16a34a' : '#d97706';
    var statusBg    = isExpired ? '#fef2f2'  : isActive ? '#f0fdf4' : '#fefce8';

    var boostText = p.boost_type !== 'plan' ? boostLabel(p.boost_type) : 'Plan Pro';
    var homeText  = p.show_in_home ? ' | Home' : '';

    var imgHtml = p.image_url
        ? '<img src="'+p.image_url+'" style="width:64px;height:64px;border-radius:10px;object-fit:cover" onerror="imgFallback(this)">'
        : '<div style="width:64px;height:64px;border-radius:10px;background:#fff7ed;display:flex;align-items:center;justify-content:center;font-size:20px">🔥</div>';

    var priceHtml = '';
    if (p.promo_price) priceHtml += '<span style="font-size:14px;font-weight:900;color:#1B3A6B">' + Number(p.promo_price).toLocaleString('es-PY') + ' ' + (p.price_label||'Gs.') + '</span> ';
    if (p.original_price) priceHtml += '<span style="font-size:12px;color:#9ca3af;text-decoration:line-through">' + Number(p.original_price).toLocaleString('es-PY') + '</span> ';
    if (p.discount_pct) priceHtml += '<span style="font-size:12px;font-weight:700;color:#16a34a">-'+p.discount_pct+'%</span>';

    var actionsHtml = isHistorial
        ? '<div style="border-top:1px solid #f1f5f9;padding:8px 16px;font-size:11px;color:#9ca3af">Expiró ' + new Date(p.expires_at).toLocaleDateString('es-PY') + ' · ' + (p.clicks||0) + (p.clicks===1?' visita':' visitas') + '</div>'
        : '<div style="border-top:1px solid #f8fafc;padding:10px 16px;display:flex;gap:12px;flex-wrap:wrap">' +
          '<button onclick="editPromo('+p.id+')" style="background:none;border:none;color:#0284c7;font-size:12px;font-weight:700;cursor:pointer;padding:0">Editar</button>' +
          '<button onclick="togglePromo('+p.id+','+ (!p.is_active) +')" style="background:none;border:none;color:#6b7280;font-size:12px;font-weight:700;cursor:pointer;padding:0">' + (p.is_active ? 'Pausar' : 'Activar') + '</button>' +
          '<button onclick="deletePromo('+p.id+')" style="background:none;border:none;color:#dc2626;font-size:12px;font-weight:700;cursor:pointer;padding:0;margin-left:auto">Eliminar</button>' +
          '</div>';

    return '<div style="background:white;border-radius:16px;border:1.5px solid #f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;margin-bottom:10px;opacity:' + (isHistorial?'0.75':'1') + '">' +
        '<div style="display:flex;gap:14px;padding:14px">' +
        imgHtml +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px">' +
        '<h4 style="font-size:14px;font-weight:700;color:#0f172a;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(p.title) + '</h4>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap">' +
        '<span style="font-size:10px;font-weight:700;background:'+statusBg+';color:'+statusColor+';padding:2px 8px;border-radius:20px">'+statusText+'</span>' +
        '<span style="font-size:10px;font-weight:700;background:#fff7ed;color:#c2410c;padding:2px 8px;border-radius:20px">'+boostText+homeText+'</span>' +
        '</div></div>' +
        (p.description ? '<p style="font-size:12px;color:#64748b;margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(p.description)+'</p>' : '') +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + priceHtml +
        (!isExpired ? '<span style="font-size:11px;color:#9ca3af">'+daysLeft+'d restantes</span>' : '') +
        '<span title="Veces que tu promoción fue abierta por un visitante" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#c2410c;background:#fff7ed;border:1px solid #fed7aa;padding:2px 8px;border-radius:20px"><i class="fas fa-chart-line" style="font-size:9px"></i>'+(p.clicks||0)+(p.clicks===1?' visita':' visitas')+'</span>' +
        '</div>' +
        (bizName ? '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0">'+escHtml(bizName)+'</p>' : '') +
        '</div></div>' + actionsHtml + '</div>';
}

// ── Cargar sección de promociones ─────────────────────────────────────────────
async function loadPromotions() {
    var list = document.getElementById('promosList');
    if (!list) return;

    var data = await clientGet('/client/promotions');
    if (!data.success) { list.innerHTML = '<p style="color:#f87171;text-align:center;padding:32px">Error al cargar</p>'; return; }

    _promosData  = data.data || [];
    _boostPrices = data.boost_prices || {};
    _boostConfig = data.boost_config || {};
    var myBoosts = data.boosts || [];
    window._lastBoosts = myBoosts;

    var currentBiz   = myBusinesses && activeDashBiz ? myBusinesses.find(function(b){ return b.slug===activeDashBiz; }) : (myBusinesses && myBusinesses[0]);
    var isPro        = currentBiz && currentBiz.plan_type === 'premium';
    var activeBizSlug = currentBiz ? currentBiz.slug : null;

    // Filtrar promos y boosts por empresa activa — usar slug que es más confiable
    var allPromos    = data.data || [];
    var allBoosts    = data.boosts || [];
    _promosData  = activeBizSlug
        ? allPromos.filter(function(p){ return p.business_slug === activeBizSlug; })
        : allPromos;
    var myBoosts = activeBizSlug
        ? allBoosts.filter(function(b){ return b.business_slug === activeBizSlug; })
        : allBoosts;

    // canCreateFromPlan: Pro + no usó promo del plan este mes para esta empresa
    var planPromoUsedMap = data.plan_promo_used || {};
    var planPromoUsed    = activeBizSlug ? (planPromoUsedMap[activeBizSlug] || false) : true;
    var canCreateFromPlan = isPro && !planPromoUsed;

    var newPromoBtn = document.getElementById('newPromoBtn');
    if (newPromoBtn) newPromoBtn.classList.toggle('hidden', !canCreateFromPlan);

    var pendingBoosts = myBoosts.filter(function(b){ return b.status==='pending'; });
    // Solo mostrar boosts paid que aún NO tienen promo creada (promotion_id es null)
    var paidBoosts    = myBoosts.filter(function(b){ return b.status==='paid' && !b.promotion_id; });
    var activePromos  = _promosData.filter(function(p){ return p.is_active  && new Date(p.expires_at) > new Date(); });
    var pausedPromos  = _promosData.filter(function(p){ return !p.is_active && new Date(p.expires_at) > new Date(); });
    var expiredPromos = _promosData.filter(function(p){ return new Date(p.expires_at) <= new Date(); });

    var html = '';

    // Boosts pendientes
    if (pendingBoosts.length) {
        var pendingItems = pendingBoosts.map(function(b) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;background:white;border-radius:10px;padding:12px 16px;margin-bottom:8px;border:1.5px solid #fde68a">' +
                '<div><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0">'+boostLabel(b.boost_type)+'</p>' +
                '<p style="font-size:11px;color:#6b7280;margin:2px 0">'+escHtml(b.trade_name||b.business_name)+' · Gs. '+Number(b.price_gs).toLocaleString('es-PY')+'</p>' +
                '<p style="font-size:11px;color:#d97706;font-weight:600;margin:0">Esperando confirmacion de pago</p></div>' +
                '<span style="font-size:10px;background:#fef3c7;color:#92400e;font-weight:700;padding:4px 10px;border-radius:20px">Pendiente</span>' +
                '</div>';
        }).join('');
        html += '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:16px;padding:16px;margin-bottom:12px">' +
            '<h4 style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 10px;display:flex;align-items:center;gap:6px">Solicitudes pendientes de aprobacion</h4>' +
            pendingItems + '</div>';
    }

    // Boosts aprobados
    if (paidBoosts.length) {
        var paidItems = paidBoosts.map(function(b) {
            var daysLeft = b.expires_at ? Math.max(0, Math.ceil((new Date(b.expires_at)-Date.now())/86400000)) : null;
            var daysText = daysLeft !== null ? 'Aprobado - vence en '+daysLeft+' dias' : 'Aprobado';
            return '<div style="display:flex;align-items:center;justify-content:space-between;background:white;border-radius:10px;padding:12px 16px;margin-bottom:8px;border:1.5px solid #bbf7d0">' +
                '<div><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0">'+boostLabel(b.boost_type)+'</p>' +
                '<p style="font-size:11px;color:#6b7280;margin:2px 0">'+escHtml(b.trade_name||b.business_name)+'</p>' +
                '<p style="font-size:11px;color:#16a34a;font-weight:600;margin:0">'+daysText+'</p></div>' +
                '<button onclick="openNewPromoModal(null,'+b.id+')" style="background:#1B3A6B;color:white;border:none;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Crear promo</button>' +
                '</div>';
        }).join('');
        html += '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:16px;padding:16px;margin-bottom:12px">' +
            '<h4 style="font-size:13px;font-weight:700;color:#166534;margin:0 0 10px">Boosts aprobados - Crea tu promocion!</h4>' +
            paidItems + '</div>';
    }

    // Promos activas
    if (activePromos.length) {
        html += '<h4 style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin:4px 0 8px">Activas</h4>';
        activePromos.forEach(function(p){ html += renderPromoCard(p, false); });
    }

    // Promos pausadas — con controles, NO en historial
    if (pausedPromos.length) {
        html += '<h4 style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px">Pausadas</h4>';
        pausedPromos.forEach(function(p){ html += renderPromoCard(p, false); });
    }

    // Historial — solo expiradas
    if (expiredPromos.length) {
        html += '<h4 style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px">Historial</h4>';
        expiredPromos.forEach(function(p){ html += renderPromoCard(p, true); });
    }

    // Estado vacío
    if (!activePromos.length && !pausedPromos.length && !expiredPromos.length && !pendingBoosts.length && !paidBoosts.length) {
        html = '<div style="background:white;border-radius:16px;border:1.5px solid #f1f5f9;padding:40px;text-align:center">' +
            '<div style="font-size:48px;margin-bottom:12px">🔥</div>' +
            '<h3 style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 8px">Todavia no tenes promociones</h3>' +
            '<p style="font-size:13px;color:#64748b;margin:0 0 20px">' + (isPro ? 'Crea tu primera promo incluida en tu Plan Pro' : 'Compra un boost para publicar tu primera promocion') + '</p>' +
            (canCreateFromPlan ? '<button onclick="openNewPromoModal()" style="background:#1B3A6B;color:white;border:none;padding:10px 24px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">Crear primera promocion</button>' : '') +
            '</div>';
    }

    list.innerHTML = html;

    // Sección de boosts para comprar
    var buyUrl = data.buy_url || '';
    list.insertAdjacentHTML('beforeend',
        '<div data-tour="boosts" style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:16px;padding:16px;margin-top:12px">' +
        '<h4 style="font-size:13px;font-weight:700;color:#c2410c;margin:0 0 12px;display:flex;align-items:center;gap:6px">Boosts de pago</h4>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">' +
        renderBoostCard('boost_7d',       boostLabel('boost_7d'),       _boostPrices.boost_7d) +
        renderBoostCard('boost_15d',      boostLabel('boost_15d'),      _boostPrices.boost_15d) +
        renderBoostCard('boost_home_30d', boostLabel('boost_home_30d'), _boostPrices.boost_home_30d) +
        '</div></div>'
    );

    // Onboarding: primera vez en "Promociones", ofrecer su guía (ya hay anclajes).
    if (typeof maybeAutoStartTour === 'function') setTimeout(function(){ maybeAutoStartTour('promotions'); }, 500);
}

// ── Modal nueva/editar promo ──────────────────────────────────────────────────
function openNewPromoModal(editId, boostId) {
    editId  = editId  || null;
    boostId = boostId || null;
    _editingPromoId = editId;
    _currentBoostId = boostId;

    var p = editId ? _promosData.find(function(x){ return x.id===editId; }) : null;
    var biz = myBusinesses && activeDashBiz
        ? (myBusinesses.find(function(b){ return b.slug===(p ? p.business_slug : activeDashBiz); }) || myBusinesses[0])
        : (myBusinesses && myBusinesses[0]);

    var boost = boostId ? (window._lastBoosts||[]).find(function(b){ return b.id===boostId; }) : null;
    var isPromoPro = biz && biz.plan_type === 'premium';
    var fixedDays = boost && boost.expires_at
        ? Math.max(1, Math.ceil((new Date(boost.expires_at)-Date.now())/86400000))
        : null;

    var defaultExpiry = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    _promoImgBlob = null;

    var existing = document.getElementById('promoModal');
    if (existing) existing.remove();

    // Duración: fija si viene de boost (nuevo o edición), selector solo para plan Pro
    var isBoostPromo = p && p.boost_type && p.boost_type !== 'plan';
    var durationHtml;
    if (fixedDays !== null || isBoostPromo) {
        // Fecha de vencimiento real de la promo o del boost
        var fixedDate = p && p.expires_at ? new Date(p.expires_at)
                      : new Date(Date.now() + (fixedDays||7)*86400000);
        var fixedExpiry = fixedDate.toISOString().split('T')[0];
        durationHtml = '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;color:#166534">' +
            'Vence ' + fixedDate.toLocaleDateString('es-PY') + '</div>' +
            '<input type="hidden" id="promoExpiry" value="'+fixedExpiry+'T23:59:59Z">';
    } else {
        // Plan Pro: siempre 7 días fijos, sin selector
        var planDays   = 7;
        var planExpiry = p && p.expires_at
            ? new Date(p.expires_at).toISOString().split('T')[0]
            : new Date(Date.now() + planDays*86400000).toISOString().split('T')[0];
        var planVence  = p && p.expires_at
            ? new Date(p.expires_at).toLocaleDateString('es-PY')
            : new Date(Date.now() + planDays*86400000).toLocaleDateString('es-PY');
        durationHtml = '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;color:#1d4ed8">' +
            '7 días incluidos en tu Plan Pro · Vence ' + planVence + '</div>' +
            '<input type="hidden" id="promoExpiry" value="'+planExpiry+'T23:59:59Z">';
    }

    var bizOptions = (myBusinesses||[]).map(function(b){
        return '<option value="'+b.slug+'"'+(b.slug===(p?p.business_slug:(biz?biz.slug:''))?'selected':'')+'>'+escHtml(b.trade_name||b.name)+'</option>';
    }).join('');

    var imgPreviewStyle = p && p.image_url ? '' : 'display:none';
    var imgPromptStyle  = p && p.image_url ? 'display:none' : '';

    var modalHtml = '<div id="promoModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:flex-end;justify-content:center">' +
        '<div style="background:white;border-radius:20px 20px 0 0;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;padding:24px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<h3 style="font-size:16px;font-weight:800;color:#0f172a;margin:0">'+(editId?'Editar promocion':'Nueva promocion')+'</h3>' +
        '<button onclick="document.getElementById(\'promoModal\').remove()" style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:16px">x</button>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
        // Título
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Titulo *</label>' +
        '<input id="promoTitle" type="text" value="'+(p?escHtml(p.title):'')+'" placeholder="Ej: iPhone 17 con AirPods de regalo" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px"></div>' +
        // Descripción
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Descripcion</label>' +
        '<textarea id="promoDesc" rows="2" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;resize:none" placeholder="Detalles de la oferta...">'+(p?escHtml(p.description||''):'')+'</textarea></div>' +
        // Imagen
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Imagen</label>' +
        '<div id="promoImgZone" onclick="document.getElementById(\'promoImgInput\').click()" style="border:2px dashed #cbd5e1;border-radius:12px;padding:16px;text-align:center;cursor:pointer;background:white">' +
        '<img id="promoImgPreview" style="'+imgPreviewStyle+';max-height:80px;margin:0 auto 8px;border-radius:8px;object-fit:cover" src="'+(p&&p.image_url?p.image_url:'')+'" onerror="this.style.display=\'none\'">' +
        '<div id="promoImgPrompt" style="'+imgPromptStyle+'"><i class="fas fa-cloud-upload-alt" style="font-size:20px;color:#94a3b8;display:block;margin-bottom:4px"></i><p style="font-size:12px;color:#64748b;margin:0">Subir imagen</p></div>' +
        '</div>' +
        '<input type="file" id="promoImgInput" accept="image/*" style="display:none" onchange="previewPromoImg(this)">' +
        '<input type="hidden" id="promoImage" value="'+(p&&p.image_url?p.image_url:'')+'"></div>' +
        // Precios
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Precio original</label>' +
        '<input id="promoOrigPrice" type="number" min="0" value="'+(p&&p.original_price?p.original_price:'')+'" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px" placeholder="200000"></div>' +
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Precio promo</label>' +
        '<input id="promoPrice" type="number" min="0" value="'+(p&&p.promo_price?p.promo_price:'')+'" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px" placeholder="150000"></div>' +
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">% descuento</label>' +
        '<input id="promoDiscount" type="number" min="1" max="99" value="'+(p&&p.discount_pct?p.discount_pct:'')+'" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px" placeholder="25"></div>' +
        '</div>' +
        // Moneda y duración
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Moneda</label>' +
        '<select id="promoLabel" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px;background:white">' +
        '<option value="Gs."'+((!p||p.price_label==='Gs.')?'selected':'')+'>Gs.</option>' +
        '<option value="USD"'+(p&&p.price_label==='USD'?'selected':'')+'>USD</option>' +
        '<option value="Consultar"'+(p&&p.price_label==='Consultar'?'selected':'')+'>Consultar</option>' +
        '</select></div>' +
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Duracion</label>' +
        durationHtml + '</div>' +
        '</div>' +
        // Empresa
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Empresa</label>' +
        '<select id="promoBusinessSlug" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;background:white">' +
        bizOptions + '</select></div>' +
        // CTA personalizado — solo plan Pro
        (isPromoPro ?
            '<div style="border-top:1px dashed #e2e8f0;margin-top:6px;padding-top:14px">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#1B3A6B;margin-bottom:8px"><i class="fas fa-arrow-up-right-from-square" style="font-size:11px"></i> Botón de acción (opcional)</label>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<input id="promoCtaLabel" type="text" maxlength="40" value="'+(p&&p.cta_label?escHtml(p.cta_label):'')+'" placeholder="Ej: Comprar ahora" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px">' +
            '<input id="promoCtaUrl" type="url" value="'+(p&&p.cta_url?escHtml(p.cta_url):'')+'" placeholder="https://tutienda.com/oferta" style="width:100%;box-sizing:border-box;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px">' +
            '</div>' +
            '<p style="font-size:11px;color:#94a3b8;margin:6px 0 0">Aparece como botón extra en la promo, además del WhatsApp.</p>' +
            '</div>'
        : '') +
        '</div>' +
        '<div id="promoModalError" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:13px;border-radius:10px;padding:10px 14px;margin-top:12px"></div>' +
        '<button onclick="savePromo()" style="width:100%;margin-top:16px;background:#1B3A6B;color:white;border:none;padding:14px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">' +
        (editId?'Guardar cambios':'Crear promocion') + '</button>' +
        '</div></div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('promoModal').addEventListener('click', function(e) {
        if (e.target.id === 'promoModal') e.target.remove();
    });
}

function setPromoDuration(days) {
    [7,15,30].forEach(function(d) {
        var btn = document.getElementById('promoDur_'+d);
        if (!btn) return;
        if (d===days) { btn.style.background='#1B3A6B'; btn.style.color='white'; btn.style.borderColor='#1B3A6B'; }
        else          { btn.style.background='white'; btn.style.color='#475569'; btn.style.borderColor='#e2e8f0'; }
    });
    var expiry = new Date(Date.now()+days*86400000).toISOString().split('T')[0];
    var hidden = document.getElementById('promoExpiry');
    var label  = document.getElementById('promoExpiryLabel');
    if (hidden) hidden.value = expiry+'T23:59:59Z';
    if (label)  label.textContent = 'Vence: '+new Date(Date.now()+days*86400000).toLocaleDateString('es-PY');
}

function previewPromoImg(input) {
    var file = input.files[0];
    if (!file) return;
    _promoImgBlob = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var preview = document.getElementById('promoImgPreview');
        var prompt  = document.getElementById('promoImgPrompt');
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (prompt)  prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function savePromo() {
    var errEl  = document.getElementById('promoModalError');
    var title  = document.getElementById('promoTitle').value.trim();
    var expiry = document.getElementById('promoExpiry').value;
    var slug   = document.getElementById('promoBusinessSlug').value;

    if (!title) { errEl.textContent='El titulo es requerido'; errEl.style.display='block'; return; }
    if (!expiry){ errEl.textContent='Selecciona una duracion'; errEl.style.display='block'; return; }

    // Subir imagen si hay archivo nuevo
    if (_promoImgBlob && slug) {
        var formData = new FormData();
        formData.append('gallery', _promoImgBlob, 'promo.jpg');
        formData.append('business_slug', slug);
        try {
            var upRes  = await fetch('/api/v2/client/upload', { method:'POST', headers:{'Authorization':'Bearer '+getToken()}, body:formData });
            var upData = await upRes.json();
            if (upData.success) {
                var imgInput = document.getElementById('promoImage');
                if (imgInput) imgInput.value = upData.data.gallery_url || upData.data.url || '';
                _promoImgBlob = null;
            }
        } catch(e) {}
    }

    var payload = {
        title:          title,
        description:    document.getElementById('promoDesc').value.trim() || null,
        image_url:      document.getElementById('promoImage').value.trim() || null,
        original_price: document.getElementById('promoOrigPrice').value || null,
        promo_price:    document.getElementById('promoPrice').value || null,
        discount_pct:   document.getElementById('promoDiscount').value || null,
        price_label:    document.getElementById('promoLabel').value,
        expires_at:     expiry.includes('T') ? expiry : expiry+'T23:59:59Z',
        business_slug:  slug,
    };
    // CTA personalizado (solo Pro — los inputs solo existen si el plan lo permite)
    var ctaLabelEl = document.getElementById('promoCtaLabel');
    var ctaUrlEl   = document.getElementById('promoCtaUrl');
    if (ctaLabelEl && ctaUrlEl) {
        payload.cta_label = ctaLabelEl.value.trim() || null;
        payload.cta_url   = ctaUrlEl.value.trim() || null;
    }
    if (_currentBoostId) payload.boost_id = _currentBoostId;

    var res;
    if (_editingPromoId) {
        res = await clientPut('/client/promotions/'+_editingPromoId, payload);
    } else {
        res = await clientPost('/client/promotions', payload);
    }

    if (res.success) {
        document.getElementById('promoModal').remove();
        showToastClient('Promocion ' + (_editingPromoId?'actualizada':'creada') + ' correctamente');
        loadPromotions();
    } else {
        errEl.textContent = res.error || 'Error al guardar';
        errEl.style.display = 'block';
    }
}

function editPromo(id) { openNewPromoModal(id, null); }

async function togglePromo(id, active) {
    var p = _promosData.find(function(x){ return x.id===id; });
    var res = await clientPut('/client/promotions/'+id, { is_active:active, title:p?p.title:'', expires_at:p?p.expires_at:'' });
    if (res.success) { showToastClient(active?'Promocion activada':'Promocion pausada'); loadPromotions(); }
    else showToastClient('Error: '+res.error, 'error');
}

async function deletePromo(id) {
    if (!confirm('Eliminar esta promocion?')) return;
    var res = await clientPost('/client/promotions/'+id, {}, 'DELETE');
    if (res.success) { showToastClient('Promocion eliminada'); loadPromotions(); }
    else showToastClient('Error: '+res.error, 'error');
}

async function requestNewBoost(boostType) {
    if (window._boostRequesting) return; // guard doble submit
    var biz = await selectBoostBiz();
    if (!biz) return;
    var cfg   = _boostConfig && _boostConfig[boostType] ? _boostConfig[boostType] : {};
    var price = cfg.price || _boostPrices[boostType] || 0;
    var url   = cfg.url || '';
    var days  = cfg.days || 7;
    if (!confirm('Solicitar boost '+boostType+' para '+escHtml(biz.trade_name||biz.name)+'?\n\nPrecio: Gs. '+Number(price).toLocaleString('es-PY')+'\nDuracion: '+days+' dias')) return;

    window._boostRequesting = true;
    var res = await clientPost('/client/promotions/boost-request', { business_slug:biz.slug, boost_type:boostType });
    window._boostRequesting = false;

    if (res.success) {
        showToastClient('Solicitud creada. Completa el pago para activar tu boost.');
        if (url) window.open(url, '_blank', 'noopener');
        loadPromotions();
    } else {
        showToastClient('Error: '+(res.error||'No se pudo registrar'), 'error');
    }
}

function selectBoostBiz() {
    return new Promise(function(resolve) {
        if (!myBusinesses || myBusinesses.length === 1) { resolve(myBusinesses ? myBusinesses[0] : null); return; }
        var existing = document.getElementById('boostBizModal');
        if (existing) existing.remove();
        window._boostBizResolve = function(idx) {
            delete window._boostBizResolve;
            var m = document.getElementById('boostBizModal');
            if (m) m.remove();
            resolve(idx !== null ? myBusinesses[idx] : null);
        };
        var items = myBusinesses.map(function(b, i) {
            var logoHtml = b.image_url
                ? '<img src="'+b.image_url+'" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
                  '<div style="display:none;width:36px;height:36px;border-radius:8px;background:#e2e8f0;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex-shrink:0">'+(b.trade_name||b.name||'?').charAt(0)+'</div>'
                : '<div style="width:36px;height:36px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex-shrink:0">'+(b.trade_name||b.name||'?').charAt(0)+'</div>';
            return '<button onclick="window._boostBizResolve('+i+')" style="width:100%;text-align:left;padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;margin-bottom:8px;cursor:pointer;background:white;font-size:14px;font-weight:600;color:#0f172a;display:flex;align-items:center;gap:10px">'+
                logoHtml +
                '<div><p style="margin:0;font-weight:700">'+escHtml(b.trade_name||b.name)+'</p><p style="margin:0;font-size:11px;color:#64748b">'+escHtml(b.city||'')+' - '+b.plan_type+'</p></div></button>';
        }).join('');
        document.body.insertAdjacentHTML('beforeend',
            '<div id="boostBizModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target.id===\'boostBizModal\')window._boostBizResolve(null)">'+
            '<div style="background:white;border-radius:20px;width:100%;max-width:400px;padding:24px;max-height:88vh;max-height:88dvh;overflow-y:auto">'+
            '<h3 style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 16px">Para que empresa?</h3>'+
            items +
            '<button onclick="window._boostBizResolve(null)" style="width:100%;padding:10px;border:none;background:none;color:#94a3b8;font-size:13px;cursor:pointer;margin-top:4px">Cancelar</button>'+
            '</div></div>');
    });
}
