/**
 * RetoPA — Panel Embajador · Oportunidades (D9.3)
 * Lista las señales de venta del embajador, con evidencia, mensaje sugerido
 * (copiar / WhatsApp) y acciones (contacté / descartar).
 */
function _oppEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Diferencia en DÍAS CALENDARIO (hora local) — "vence hoy/mañana/hace Xd".
function _oppCalDays(iso){
  const exp = new Date(iso); if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const a = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime())/86400000);
}
// Recalcula el vencimiento EN VIVO desde evidence.expires_at (no el snapshot
// days_left congelado al generarse). Si ya pasó → "venció hace Xd" en rojo.
function _oppVence(e){
  let d = (e && e.days_left != null) ? e.days_left : null;
  if (e && e.expires_at){ const c = _oppCalDays(e.expires_at); if (c != null) d = c; }
  if (d == null) return 'Fundador por vencer';
  if (d > 1)    return `Fundador vence en ${d} días`;
  if (d === 1)  return 'Fundador vence mañana';
  if (d === 0)  return '<span class="text-amber-600 font-semibold">Fundador vence hoy</span>';
  return `<span class="text-rose-600 font-semibold">Fundador venció hace ${Math.abs(d)} días</span>`;
}
// "generada hace Xd" a partir de created_at
function _oppAge(iso){ try { const d=Math.floor((Date.now()-new Date(iso).getTime())/86400000); return d<=0?'hoy':('hace '+d+'d'); } catch(e){ return ''; } }

const OPP_TRIG = {
  onb_bienvenida:     { label:'Bienvenida / Onboarding', cls:'bg-emerald-100 text-emerald-700', ev:e=>`Ficha recién verificada${e && e.city?' · '+_oppEsc(e.city):''} — dale la bienvenida y acompañá el onboarding` },
  t4_fundador_d75:    { label:'Fundador por vencer',     cls:'bg-blue-100 text-blue-700',   ev:e=>`${_oppVence(e)} · ${e.views_30d||0} visitas (30d)` },
  t3_boost_vencido:   { label:'Boost exitoso',           cls:'bg-blue-100 text-blue-700',   ev:e=>`Durante el boost: ${e.views_during} visitas vs ${e.views_prev} antes` },
  t2_destacado_datos: { label:'Con datos para Destacar', cls:'bg-blue-100 text-blue-700',   ev:e=>`${e.views_30d||0} visitas y ${e.wa_30d||0} contactos por WhatsApp (30d)` },
  t5_candidato_hc:    { label:'Candidato Hepta Cloud',   cls:'bg-purple-100 text-purple-700', ev:e=>`RUC ${_oppEsc(e.ruc)||'—'} · ${_oppEsc(e.rubro)||''}` },
  t1_listo_boost:     { label:'Listo para Boost',        cls:'bg-amber-100 text-amber-700', ev:e=>`Ficha ${e.completion}% completa` },
  t6_ficha_abandonada:{ label:'Ficha por completar',     cls:'bg-rose-100 text-rose-700',   ev:e=>`Faltan ${e.missing_count||0} datos para posicionar (${e.completion}% completa)` },
};
window._oppMsgs = {};  // id → mensaje sugerido (para copiar/WhatsApp sin re-escapar)
window._oppEmail = {}; // id → { to, businessName, subject, body } (para "Enviar mail")

// Email válido (mismo criterio que el backend).
function _oppIsEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').trim()); }

// Normaliza a móvil paraguayo internacional (595 9XXXXXXXX). Devuelve null si
// el número no sirve para WhatsApp (línea fija, sin código, o formato raro).
function _oppWaNormalize(num){
  let d = String(num||'').replace(/\D/g,'');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);        // prefijo internacional 00
  if (d.startsWith('595')) { const r = d.slice(3); return /^9\d{8}$/.test(r) ? '595'+r : null; }
  if (d.startsWith('0'))   { const r = d.slice(1); return /^9\d{8}$/.test(r) ? '595'+r : null; } // 0 troncal
  if (/^9\d{8}$/.test(d))  return '595'+d;        // NSN sin 0 (9 dígitos, móvil)
  return null;                                    // fijo (021…) u otro → inválido
}

// URL pública absoluta de la ficha (para "Ver ficha" y para precargar en el mensaje)
function _oppFichaUrl(slug){
  return slug ? `${window.location.origin}/empresa/${encodeURIComponent(slug)}` : null;
}

function _oppWaLink(num, msg){
  const intl = _oppWaNormalize(num);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg||'')}`;
}

async function loadOpportunities(){
  const cont = document.getElementById('oppList');
  if (!cont) return;
  cont.innerHTML = '<p class="text-gray-400 text-sm">Cargando…</p>';
  let res;
  try { res = await ambGet('/ambassador/opportunities'); } catch(e){ res = null; }
  if (!res || !res.success){ cont.innerHTML = '<p class="text-red-500 text-sm">No se pudieron cargar las oportunidades.</p>'; return; }
  const rows = res.data || [];

  // Badge de conteo (activas)
  const active = rows.filter(r => r.status !== 'contactado').length;
  ['oppBadge','oppBadgeMobile'].forEach(id => { const b=document.getElementById(id); if(b){ b.textContent=active; b.classList.toggle('hidden', active===0); } });

  if (!rows.length){
    cont.innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <div class="text-4xl mb-2">🎯</div>
        <p class="font-bold text-gray-800">Sin oportunidades por ahora</p>
        <p class="text-sm text-gray-500 mt-1">Cuando tus negocios generen señales de venta, aparecerán acá.</p>
      </div>`;
    return;
  }

  window._oppMsgs = {};
  window._oppEmail = {};
  cont.innerHTML = rows.map(r => {
    const t = OPP_TRIG[r.trigger_key] || { label:r.trigger_key, cls:'bg-gray-100 text-gray-700', ev:()=>'' };
    const msg = r.suggested_message || '';
    const fichaUrl = _oppFichaUrl(r.slug);
    // El mensaje que se copia / envía por WhatsApp incluye el link de la ficha (#4)
    const msgFull = fichaUrl ? `${msg}\n\n${fichaUrl}` : msg;
    window._oppMsgs[r.id] = msgFull;
    const wa = _oppWaLink(r.whatsapp || r.phone, msgFull);
    // "Enviar mail": disponible si la ficha tiene un email válido. El body es el
    // mensaje sugerido (sin el link, que va como botón en la plantilla).
    const email = (r.email || '').trim();
    const hasEmail = _oppIsEmail(email);
    if (hasEmail) window._oppEmail[r.id] = { to: email, businessName: r.business_name || '', subject: `Tu empresa en RetoPA — ${r.business_name || ''}`.trim(), body: msg };
    const isContacted = r.status === 'contactado';
    const isNew = r.status === 'nueva';
    return `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4" id="opp-${r.id}">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            ${isNew ? '<span class="w-2 h-2 rounded-full bg-green-500 inline-block" title="Nueva"></span>' : ''}
            <span class="font-bold text-gray-900 truncate">${_oppEsc(r.business_name)}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full font-bold ${t.cls}">${t.label}</span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5">${_oppEsc(r.category_name||'')}${r.city ? ' · '+_oppEsc(r.city) : ''}${r.created_at ? ' · generada '+_oppAge(r.created_at) : ''}</p>
        </div>
        ${isContacted ? '<span class="text-[11px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full flex-shrink-0"><i class="fas fa-check mr-1"></i>Contactado</span>' : ''}
      </div>

      <p class="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-3"><i class="fas fa-chart-simple text-gray-400 mr-1"></i>${t.ev(r.evidence||{})}</p>

      <div class="bg-brand-50/60 border border-brand-100 rounded-xl p-3 mb-3">
        <p class="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Mensaje sugerido</p>
        <p class="text-sm text-gray-700">${_oppEsc(msg)}</p>
        ${fichaUrl ? `<p class="text-xs text-brand-600 mt-2 break-all"><i class="fas fa-link mr-1"></i>${_oppEsc(fichaUrl)}</p>` : ''}
      </div>

      <div class="flex flex-wrap gap-2">
        ${fichaUrl ? `<a href="/empresa/${_oppEsc(r.slug)}" target="_blank" rel="noopener" class="text-xs bg-brand-50 text-brand-600 border border-brand-100 px-3 py-2 rounded-lg hover:bg-brand-100 font-semibold"><i class="fas fa-external-link-alt mr-1"></i> Ver ficha</a>` : ''}
        <button onclick="oppCopy(${r.id})" class="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 font-semibold"><i class="fas fa-copy mr-1"></i> Copiar</button>
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="text-xs text-white px-3 py-2 rounded-lg font-bold" style="background:#16a34a"><i class="fab fa-whatsapp mr-1"></i> WhatsApp</a>`
              : '<span class="text-xs text-gray-400 px-2 py-2" title="El número no es un móvil válido para WhatsApp"><i class="fas fa-ban mr-1"></i>Sin WhatsApp válido</span>'}
        ${hasEmail ? `<button onclick="oppEmail(${r.id})" class="text-xs text-white px-3 py-2 rounded-lg font-bold" style="background:#0ea5e9"><i class="fas fa-envelope mr-1"></i> Enviar mail</button>` : ''}
        <div class="flex-1"></div>
        ${isContacted ? '' : `<button onclick="oppContacted(${r.id})" class="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg hover:bg-green-100 font-bold"><i class="fas fa-check mr-1"></i> Contacté</button>`}
        <button onclick="oppDismiss(${r.id})" class="text-xs bg-gray-50 text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-100"><i class="fas fa-xmark mr-1"></i> Descartar</button>
      </div>
    </div>`;
  }).join('');
}

function oppCopy(id){
  const msg = window._oppMsgs[id] || '';
  const done = () => showToastAmb('Mensaje copiado ✅');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg).then(done).catch(()=>fallbackCopy(msg,done));
  else fallbackCopy(msg, done);
}
function fallbackCopy(text, cb){
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch(e){ showToastAmb('No se pudo copiar','error'); }
  document.body.removeChild(ta);
}

async function oppContacted(id){
  const res = await ambPost(`/ambassador/opportunities/${id}/contacted`, {});
  if (res && res.success){ showToastAmb('Marcado como contactado'); loadOpportunities(); }
  else showToastAmb('Error: ' + ((res&&res.error)||'no se pudo'), 'error');
}

async function oppDismiss(id){
  const note = prompt('Motivo del descarte (opcional):', '');
  if (note === null) return; // canceló
  const res = await ambPost(`/ambassador/opportunities/${id}/dismiss`, { note });
  if (res && res.success){
    const card = document.getElementById('opp-'+id); if (card) card.remove();
    showToastAmb('Oportunidad descartada');
    loadOpportunities();
  } else showToastAmb('Error: ' + ((res&&res.error)||'no se pudo'), 'error');
}

// ── "Enviar mail": compositor con vista previa editable ────────────────────
function oppEmail(id){
  const d = window._oppEmail[id];
  if (!d){ showToastAmb('Esta ficha no tiene email', 'error'); return; }
  closeOppEmail();
  const div = document.createElement('div');
  div.id = 'oppEmailModal';
  div.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.55);padding:16px';
  div.innerHTML = `
    <div style="background:#fff;border-radius:18px;max-width:480px;width:100%;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.3)">
      <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:18px 20px">
        <p style="color:#fff;font-weight:800;font-size:15px;margin:0"><i class="fas fa-envelope" style="margin-right:6px"></i> Enviar mail a la ficha</p>
        <p style="color:rgba(255,255,255,.7);font-size:12px;margin:4px 0 0">Se envía con el diseño de RetoPA. El link a la ficha va incluido como botón.</p>
      </div>
      <div style="padding:18px 20px">
        <label style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Para</label>
        <div style="font-size:14px;color:#0f172a;font-weight:600;margin:2px 0 12px;word-break:break-all">${_oppEsc(d.to)}</div>

        <label style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Asunto</label>
        <input id="oppMailSubject" type="text" value="${_oppEsc(d.subject)}"
          style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:14px;margin:4px 0 12px;box-sizing:border-box">

        <label style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Mensaje</label>
        <textarea id="oppMailBody" rows="6"
          style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.5;margin:4px 0 4px;box-sizing:border-box;resize:vertical">${_oppEsc(d.body)}</textarea>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 14px">Podés editarlo. Las respuestas del cliente te llegan a tu correo.</p>

        <div style="display:flex;gap:10px">
          <button onclick="closeOppEmail()" style="flex:0 0 auto;background:#f1f5f9;color:#475569;border:none;border-radius:10px;padding:11px 16px;font-weight:700;font-size:14px;cursor:pointer">Cancelar</button>
          <button id="oppMailSend" onclick="oppEmailSend(${id})" style="flex:1;background:#0ea5e9;color:#fff;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;cursor:pointer"><i class="fas fa-paper-plane" style="margin-right:6px"></i> Enviar</button>
        </div>
      </div>
    </div>`;
  div.addEventListener('click', e => { if (e.target === div) closeOppEmail(); });
  document.body.appendChild(div);
}

function closeOppEmail(){ document.getElementById('oppEmailModal')?.remove(); }

async function oppEmailSend(id){
  const subject = (document.getElementById('oppMailSubject')?.value || '').trim();
  const message = (document.getElementById('oppMailBody')?.value || '').trim();
  if (!message){ showToastAmb('Escribí un mensaje', 'error'); return; }
  const btn = document.getElementById('oppMailSend');
  if (btn){ btn.disabled = true; btn.style.opacity = '.6'; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i> Enviando…'; }
  const res = await ambPost(`/ambassador/opportunities/${id}/email`, { subject, message });
  if (res && res.success){
    closeOppEmail();
    showToastAmb('Mail enviado ✅ — marcado como contactado');
    loadOpportunities();
  } else {
    if (btn){ btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:6px"></i> Enviar'; }
    showToastAmb('No se pudo enviar: ' + ((res && res.error) || 'error'), 'error');
  }
}
