/**
 * RetoPA — admin/js/claim-funnel.js
 * Bloque "Embudo de reclamo" arriba de la sección Claims (2026-10-13).
 *
 * Lee GET /admin/claims/funnel?days=7|30|90 (solo lectura) y muestra:
 *  1) Activación de cuentas de dueños (90 días): ¿entraron alguna vez?
 *  2) Embudo del período: vieron su ficha → formulario → enviaron → aprobados → entró.
 *     Total arriba; detalle por origen (wa / notify / botón de la ficha) desplegable.
 *  3) Motivos que frenaron el formulario.
 *  4) "Abrieron y no terminaron": a quién recontactar, con botón de WhatsApp.
 * Mobile-first (390px): sin scroll horizontal de página; la tabla por origen
 * scrollea dentro de su propia caja.
 */

let _cfDays = 30;

const _CF_ORIGEN = {
    wa: 'WhatsApp (prospectos)',
    wa_seguimiento: 'WhatsApp (seguimiento)',
    notify: 'Correo (Notificar)',
    email: 'Correo',
    boton_ficha: 'Botón en la ficha',
    '(sin origen)': 'Sin origen',
};
const _CF_MOTIVO = {
    name_missing: 'Falta el nombre', email_invalid: 'Correo inválido', password_short: 'Contraseña corta',
    missing_fields: 'Faltan datos', token_invalid: 'Link inválido', expired: 'Link vencido',
    already_claimed: 'Ya estaba reclamada', server: 'Error del servidor', network: 'Sin conexión',
};
const _CF_PASO = {
    link_opened: 'Vio su ficha', form_started: 'Empezó el formulario', form_error: 'Lo frenó la validación',
    submit_error: 'Falló el envío', link_expired: 'Link vencido', link_invalid: 'Link inválido',
    link_claimed: 'Ya reclamada', rejected: 'Rechazado', not_mine: 'Dijo que no es suyo',
};

function _cfEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function _cfOrigen(o) { return _CF_ORIGEN[o] || o || 'Sin origen'; }
function _cfPct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }
function _cfAgo(ts) {
    const d = new Date(ts); if (isNaN(d)) return '—';
    const min = (Date.now() - d.getTime()) / 60000;
    if (min < 60) return `hace ${Math.max(1, Math.round(min))} min`;
    if (min < 1440) return `hace ${Math.round(min / 60)} h`;
    const days = Math.round(min / 1440);
    return days === 1 ? 'ayer' : `hace ${days} días`;
}

function _cfWaHref(a) {
    if (!a.wa) return null;
    const msg = a.claim_url
        ? `¡Hola! Te escribo de RetoPA. Vi que entraste a reclamar *${a.nombre}* y no llegaste a terminar. ¿Te doy una mano? Es gratis y lleva un minuto: ${a.claim_url}`
        : `¡Hola! Te escribo de RetoPA. Vi que entraste a reclamar *${a.nombre}* y no llegaste a terminar. ¿Te doy una mano? Te paso un enlace nuevo para completarlo.`;
    return `https://wa.me/${a.wa}?text=${encodeURIComponent(msg)}`;
}

function setClaimFunnelDays(d) { _cfDays = d; loadClaimFunnel(); }

async function loadClaimFunnel() {
    const box = document.getElementById('claimFunnel');
    if (!box) return;
    box.innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 p-4 text-center text-gray-400 text-sm"><i class="fas fa-spinner fa-spin"></i> Cargando embudo…</div>`;
    const data = await apiAdminGet(`/claims/funnel?days=${_cfDays}`);
    if (!data || !data.success) {
        box.innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 p-4 text-center text-gray-400 text-sm">No se pudo cargar el embudo.</div>`;
        return;
    }
    box.innerHTML = renderClaimFunnel(data);
}

function renderClaimFunnel(data) {
    const seg = [7, 30, 90].map(d => `
        <button type="button" onclick="setClaimFunnelDays(${d})" data-days="${d}"
            class="px-3 py-1.5 text-xs font-bold rounded-lg ${d === _cfDays ? 'bg-[#1B3A6B] text-white' : 'text-gray-500 hover:bg-gray-100'}">${d} d</button>`).join('');
    const head = `
      <div class="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div class="min-w-0">
          <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2"><i class="fas fa-filter text-[#0ea5e9]"></i> Embudo de reclamo</h3>
          <p class="text-xs text-gray-500">Dónde se cae el dueño, paso a paso. Medido desde el 12-oct-2026.</p>
        </div>
        <div class="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-1">${seg}
          <button type="button" onclick="loadClaimFunnel()" title="Actualizar" class="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-700"><i class="fas fa-sync-alt"></i></button>
        </div>
      </div>`;

    if (!data.ready) {
        return `<div id="cfCard" class="bg-white rounded-2xl border border-amber-200 p-4">${head}
          <p class="text-sm text-amber-700">Falta correr la migración <code>sql/2026-10-12_claim_events.sql</code>.</p></div>`;
    }

    // 1) Activación (90 días)
    const a = data.activacion || {};
    const tot = +a.total || 0, ent = +a.entraron_alguna_vez || 0;
    const tile = (num, label, sub, tone) => `
        <div class="rounded-xl p-3 ${tone}">
          <div class="text-2xl font-black leading-tight">${num}</div>
          <div class="text-xs font-semibold">${label}</div>
          ${sub ? `<div class="text-[11px] opacity-75 mt-0.5">${sub}</div>` : ''}
        </div>`;
    const tiles = `
      <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Cuentas de dueños · últimos 90 días</p>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5" id="cfTiles">
        ${tile(tot.toLocaleString('es-PY'), 'Cuentas nuevas', `${(+a.con_ficha || 0)} con ficha`, 'bg-slate-50 text-slate-700')}
        ${tile(ent.toLocaleString('es-PY'), 'Entraron alguna vez', `${_cfPct(ent, tot)}% del total`, 'bg-emerald-50 text-emerald-700')}
        ${tile((tot - ent).toLocaleString('es-PY'), 'Nunca entraron', `${_cfPct(tot - ent, tot)}% del total`, 'bg-rose-50 text-rose-700')}
        ${tile((+a.link_activacion_vencido || 0).toLocaleString('es-PY'), 'Link de activación vencido', 'no pueden entrar', 'bg-amber-50 text-amber-700')}
      </div>`;

    // 2) Embudo del período
    const t = data.total || {};
    const base = +t.fichas_vistas || 0;
    const steps = [
        ['Vieron su ficha', +t.fichas_vistas || 0, 'bg-sky-500'],
        ['Empezaron el formulario', +t.iniciaron_form || 0, 'bg-sky-400'],
        ['Los frenó la validación', +t.frenados_validacion || 0, 'bg-amber-400'],
        ['Enviaron el reclamo', +t.enviaron || 0, 'bg-indigo-500'],
        ['Aprobados', +t.aprobados || 0, 'bg-emerald-500'],
        ['El dueño entró a su panel', +t.dueno_entro || 0, 'bg-emerald-600'],
    ];
    const bars = steps.map(([label, n, color]) => `
        <div class="mb-2" data-step="${_cfEsc(label)}">
          <div class="flex items-baseline justify-between gap-2 text-xs">
            <span class="text-gray-700 font-semibold truncate">${label}</span>
            <span class="text-gray-900 font-bold whitespace-nowrap">${n.toLocaleString('es-PY')}${base ? ` <span class="text-gray-400 font-medium">· ${_cfPct(n, base)}%</span>` : ''}</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden mt-1"><div class="h-2 ${color} rounded-full" style="width:${base ? Math.max(2, _cfPct(n, base)) : 0}%"></div></div>
        </div>`).join('');
    const muertos = +t.links_muertos || 0;
    const noEs = +t.no_es_suyo || 0;

    const rows = (data.embudo || []).map(r => `
        <tr class="border-t border-gray-100">
          <td class="py-2 pr-3 font-semibold text-gray-700 whitespace-nowrap">${_cfEsc(_cfOrigen(r.origen))}</td>
          <td class="py-2 px-2 text-right">${r.fichas_vistas}</td>
          <td class="py-2 px-2 text-right">${r.iniciaron_form}</td>
          <td class="py-2 px-2 text-right">${r.enviaron}</td>
          <td class="py-2 px-2 text-right">${r.aprobados}</td>
          <td class="py-2 px-2 text-right">${r.dueno_entro}</td>
          <td class="py-2 pl-2 text-right text-gray-400">${r.links_muertos}</td>
        </tr>`).join('');
    const porOrigen = rows ? `
      <details class="mt-3">
        <summary class="text-xs font-bold text-[#1B3A6B] cursor-pointer select-none">Ver por origen</summary>
        <div class="overflow-x-auto mt-2" id="cfOrigenWrap">
          <table class="w-full text-xs text-gray-600">
            <thead><tr class="text-[10px] uppercase tracking-wide text-gray-400">
              <th class="text-left py-1 pr-3">Origen</th><th class="text-right px-2">Vieron</th><th class="text-right px-2">Form</th>
              <th class="text-right px-2">Enviaron</th><th class="text-right px-2">Aprob.</th><th class="text-right px-2">Entró</th><th class="text-right pl-2">Links muertos</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>` : '';

    const sinDatos = !base && !muertos && !(data.abandonos || []).length;
    const embudo = `
      <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Reclamos · últimos ${data.days} días</p>
      ${sinDatos ? `<p class="text-sm text-gray-400 mb-2" id="cfEmpty">Todavía no hay movimientos en este período.</p>` : bars}
      ${muertos ? `<p class="text-xs text-gray-500 mt-1"><i class="fas fa-unlink text-gray-300 mr-1"></i>${muertos} ${muertos === 1 ? 'intento con link vencido o inválido' : 'intentos con link vencido o inválido'}</p>` : ''}
      ${noEs ? `<p class="text-xs text-gray-500 mt-1" id="cfNoEs"><i class="fas fa-user-xmark text-gray-300 mr-1"></i>${noEs} ${noEs === 1 ? 'dijo que el negocio no es suyo' : 'dijeron que el negocio no es suyo'} (número a corregir)</p>` : ''}
      ${porOrigen}`;

    // 3) Motivos
    const motivos = (data.motivos || []).length ? `
      <div class="mt-4" id="cfMotivos">
        <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Qué los frenó</p>
        <div class="flex flex-wrap gap-2">${data.motivos.map(m => `
          <span class="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-3 py-1">${_cfEsc(_CF_MOTIVO[m.reason] || m.reason)} <b>×${m.n}</b></span>`).join('')}
        </div>
      </div>` : '';

    // 4) Abrieron y no terminaron
    const ab = data.abandonos || [];
    const card = x => {
        const href = _cfWaHref(x);
        const btn = href
            ? `<a href="${_cfEsc(href)}" target="_blank" rel="noopener" class="cf-wa shrink-0 inline-flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-lg"><i class="fab fa-whatsapp"></i> Escribir</a>`
            : `<span class="cf-nowa shrink-0 text-[11px] text-gray-400 px-2 py-2">Sin celular</span>`;
        return `
        <div class="cf-ab flex items-center gap-3 border border-gray-100 rounded-xl p-3">
          <div class="min-w-0 flex-1">
            <a href="/negocio/${encodeURIComponent(x.slug || '')}" target="_blank" class="block font-semibold text-sm text-gray-900 truncate hover:text-[#0ea5e9]">${_cfEsc(x.nombre)}</a>
            <div class="text-[11px] text-gray-500 truncate">${_cfEsc(_CF_PASO[x.ultimo_paso] || x.ultimo_paso)} · ${_cfAgo(x.ultima)}${x.ciudad ? ' · ' + _cfEsc(x.ciudad) : ''}</div>
            <div class="text-[11px] text-gray-400">${_cfEsc(_cfOrigen(x.origen))} · ${x.visitas} ${x.visitas === 1 ? 'visita' : 'visitas'}${x.claim_url ? '' : ' · <span class="text-amber-600">link vencido</span>'}</div>
          </div>
          ${btn}
        </div>`;
    };
    const abandonos = `
      <div class="mt-5" id="cfAbandonos">
        <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Abrieron y no terminaron · ${ab.length}</p>
        ${ab.length ? `<div class="space-y-2">${ab.slice(0, 5).map(card).join('')}</div>
          ${ab.length > 5 ? `<details class="mt-2"><summary class="text-xs font-bold text-[#1B3A6B] cursor-pointer select-none">Ver ${ab.length - 5} más</summary>
            <div class="space-y-2 mt-2">${ab.slice(5).map(card).join('')}</div></details>` : ''}`
          : `<p class="text-sm text-gray-400">Nadie quedó a mitad de camino en este período.</p>`}
      </div>`;

    return `<div id="cfCard" class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-6">${head}${tiles}${embudo}${motivos}${abandonos}</div>`;
}
