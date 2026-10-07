const nodemailer = require('nodemailer');

// Configuración SMTP desde variables de entorno
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false // Para desarrollo/self-signed certs
    }
});

// Verificar conexión al iniciar
async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('✅ SMTP conectado correctamente');
        return true;
    } catch (err) {
        console.error('❌ SMTP error:', err.message);
        return false;
    }
}

// ── Overrides editables desde el Admin (campos seguros) ──────────────────────
// subst: reemplaza {token} por data[token] en los textos editados desde el panel.
function subst(str, data) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (_, k) => (data && data[k] != null ? String(data[k]) : ''));
}
// makeT: resolvedor t(field, default). Usa el override de site_config
// (tpl_<template>_<field>) si existe y no está vacío; si no, el default. Siempre pasa
// por subst (resuelve {tokens} de los overrides). Sin override, la salida es idéntica
// al default original.
function makeT(templateName, overrides, data) {
    return (field, def) => {
        const ov = overrides ? overrides[`tpl_${templateName}_${field}`] : undefined;
        const val = (ov != null && String(ov).trim() !== '') ? ov : def;
        return subst(val, data);
    };
}

// Templates de email
const templates = {
    welcome: (data, t) => ({
        subject: t('subject', `Bienvenido a ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #0ea5e9; font-size: 28px;">🚀 ${data.siteName || 'RetoPA'}</h1>
            </div>
            <div style="background: #f8fafc; border-radius: 16px; padding: 30px;">
                <h2 style="color: #1e293b; margin-top: 0;">¡Hola ${data.name}!</h2>
                <p style="color: #64748b; line-height: 1.6;">
                    ${t('message', `Tu empresa <strong>${data.businessName}</strong> ha sido registrada exitosamente en nuestro directorio.`)}
                </p>
                <div style="background: #fff; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
                    <p style="margin: 5px 0;"><strong>Estado:</strong> <span style="color: #f59e0b;">⏳ En revisión</span></p>
                    <p style="margin: 5px 0;"><strong>Plan:</strong> ${data.planType || 'Básico'}</p>
                    <p style="margin: 5px 0;"><strong>Email:</strong> ${data.email}</p>
                </div>
                <p style="color: #64748b; line-height: 1.6;">
                    Nuestro equipo revisará tu información y te contactará para verificar tu empresa. 
                    Una vez verificada, aparecerás con el badge ✅ <strong>Verificado</strong>.
                </p>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${data.siteUrl || 'https://retopa.com.py'}" 
                       style="background: linear-gradient(135deg, #0284c7, #0ea5e9); color: white; padding: 14px 32px; 
                              border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block;">
                        ${t('cta', 'Ver directorio')}
                    </a>
                </div>
            </div>
            <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;">
                © ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} — Un producto HEPTA GROUP
            </p>
        </div>
        `
    }),

    verified: (data, t) => ({
        subject: t('subject', `✅ Tu empresa ha sido verificada en ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #0ea5e9; font-size: 28px;">🎉 ${data.siteName || 'RetoPA'}</h1>
            </div>
            <div style="background: #f0fdf4; border-radius: 16px; padding: 30px; border: 1px solid #bbf7d0;">
                <h2 style="color: #166534; margin-top: 0;">¡Felicidades ${data.name}!</h2>
                <p style="color: #166534; line-height: 1.6;">
                    ${t('message', `Tu empresa <strong>${data.businessName}</strong> ha sido <strong style="color: #22c55e;">VERIFICADA</strong> exitosamente.`)}
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="background: #22c55e; color: white; padding: 10px 24px; border-radius: 20px; font-weight: bold;">
                        ✅ EMPRESA VERIFICADA
                    </span>
                </div>
                <p style="color: #166534; line-height: 1.6;">
                    Ahora apareces con el badge de verificación en el directorio y tienes mayor visibilidad en las búsquedas.
                </p>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${data.businessUrl || '#'}" 
                       style="background: #22c55e; color: white; padding: 14px 32px; 
                              border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block;">
                        ${t('cta', 'Ver mi perfil')}
                    </a>
                </div>
            </div>
        </div>
        `
    }),

    newLead: (data) => ({
        subject: `📬 Nuevo lead: ${data.contactName} — ${data.serviceType}`,
        html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:620px;margin:0 auto;padding:20px;background:#f8fafc;">
            <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
                <!-- Header -->
                <div style="background:linear-gradient(135deg,#1B3A6B,#2a5298);padding:28px 32px;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;font-weight:800;letter-spacing:-.5px;">
                        Reto<span style="color:#E8B84B">PA</span>
                        <span style="color:#7EC8E3;font-size:13px;font-weight:400;display:block;margin-top:4px;letter-spacing:2px;">NUEVO LEAD ENTRANTE</span>
                    </h1>
                </div>
                <!-- Body -->
                <div style="padding:28px 32px;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
                        <p style="margin:0;color:#166534;font-size:13px;font-weight:600;">
                            📣 Un nuevo lead acaba de entrar al sistema
                        </p>
                    </div>

                    <!-- Datos del contacto -->
                    <h3 style="color:#1B3A6B;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:.5px;">
                        👤 Datos del contacto
                    </h3>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
                        <tr><td style="padding:8px 0;color:#64748b;width:140px;">Nombre</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${data.contactName || '—'}</td></tr>
                        <tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;"><a href="mailto:${data.contactEmail}" style="color:#0ea5e9;">${data.contactEmail || '—'}</a></td></tr>
                        <tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Teléfono</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${data.contactPhone || '—'}</td></tr>
                        ${data.notes ? `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;vertical-align:top;">Mensaje</td><td style="padding:8px 0;color:#1e293b;">${data.notes}</td></tr>` : ''}
                    </table>

                    <!-- Datos de la empresa -->
                    <h3 style="color:#1B3A6B;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:.5px;">
                        🏢 Empresa interesada
                    </h3>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
                        <tr><td style="padding:8px 0;color:#64748b;width:140px;">Empresa</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${data.businessName || '—'}</td></tr>
                        <tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Teléfono empresa</td><td style="padding:8px 0;color:#1e293b;">${data.businessPhone || '—'}</td></tr>
                        <tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Plan solicitado</td>
                            <td style="padding:8px 0;">
                                <span style="background:${data.serviceType==='premium'?'#0ea5e9':data.serviceType==='featured'?'#f59e0b':'#64748b'};color:white;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;text-transform:uppercase;">
                                    ${data.serviceType || 'básico'}
                                </span>
                            </td>
                        </tr>
                        ${data.businessUrl ? `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Perfil</td><td style="padding:8px 0;"><a href="${data.businessUrl}" style="color:#0ea5e9;">${data.businessUrl}</a></td></tr>` : ''}
                    </table>

                    <div style="text-align:center;">
                        <a href="https://retopa.com.py/admin" style="background:linear-gradient(135deg,#1B3A6B,#2a5298);color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
                            Ver en Panel Admin →
                        </a>
                    </div>
                </div>
                <div style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
                    <p style="margin:0;color:#94a3b8;font-size:12px;">
                        ${new Date().toLocaleString('es-PY',{dateStyle:'long',timeStyle:'short'})} · RetoPA — Un producto HEPTA GROUP
                    </p>
                </div>
            </div>
        </div>`
    }),

    // ── Notificaciones al dueño de empresa ──────────────────────────────────

    newReview: (data, t) => ({
        subject: t('subject', `⭐ Nueva reseña en ${data.businessName} — ${data.rating}/5`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:28px 40px;text-align:center">
            <div style="font-size:36px;margin-bottom:6px">${'⭐'.repeat(Math.min(data.rating,5))}</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">Nueva reseña recibida</h1>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0 0 4px">Hola${data.ownerName ? ' ' + data.ownerName : ''}! 👋</p>
            <p style="color:#475569;font-size:14px;margin:0 0 24px">
              ${t('message', `<strong>${data.authorName}</strong> dejó una reseña de <strong>${data.rating} estrellas</strong> en <strong>${data.businessName}</strong>.`)}
            </p>
            <div style="background:#fffbeb;border-left:4px solid #E8B84B;border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0 0 6px;font-size:13px;color:#92400e;font-weight:600">${'★'.repeat(data.rating)}${'☆'.repeat(5-data.rating)} ${data.rating}/5</p>
              <p style="margin:0;font-size:14px;color:#1e293b;font-style:italic">"${data.comment || 'Sin comentario'}"</p>
              <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">— ${data.authorName}</p>
            </div>
            ${data.canReply ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin-bottom:24px">
              <p style="margin:0;font-size:13px;color:#166534">💬 Tenés acceso para <strong>responder reseñas</strong> desde tu panel.</p>
            </div>` : ''}
            <div style="text-align:center;margin:24px 0 8px">
              <a href="${data.businessUrl}" target="_blank"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #1B3A6B">
                ${t('cta', 'Ver mi perfil público →')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.panelUrl}" style="color:#1B3A6B;text-decoration:none">Ir a mi panel</a></p>
          </div>
        </div>`
    }),

    likeMilestone: (data, t) => ({
        subject: t('subject', `🎉 ¡${data.businessName} alcanzó ${data.likeCount} likes en RetoPA!`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:28px 40px;text-align:center">
            <div style="font-size:48px;margin-bottom:6px">🎉</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">¡Nuevo hito de likes!</h1>
          </div>
          <div style="padding:32px 40px;text-align:center">
            <div style="display:inline-block;background:linear-gradient(135deg,#E8B84B,#c89a35);border-radius:20px;padding:20px 40px;margin-bottom:24px">
              <p style="margin:0;font-size:48px;font-weight:900;color:white;line-height:1">${data.likeCount}</p>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.9);font-weight:600">❤️ likes</p>
            </div>
            <p style="color:#475569;font-size:14px;margin:0 0 24px">
              ${t('message', `<strong>${data.businessName}</strong> acaba de alcanzar <strong>${data.likeCount} likes</strong> en RetoPA. ¡Tu negocio está gustando!`)}
            </p>
            <a href="${data.businessUrl}"
               style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #1B3A6B">
              ${t('cta', 'Ver mi perfil →')}
            </a>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.panelUrl}" style="color:#1B3A6B;text-decoration:none">Ir a mi panel</a></p>
          </div>
        </div>`
    }),

    whatsappContact: (data, t) => ({
        subject: t('subject', `📱 Alguien quiso contactar a ${data.businessName} por WhatsApp`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:28px 40px;text-align:center">
            <div style="font-size:36px;margin-bottom:6px">📱</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">Nuevo contacto por WhatsApp</h1>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `Alguien encontró <strong>${data.businessName}</strong> en RetoPA y hizo clic en WhatsApp para contactarte.`)}
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0;font-size:13px;color:#166534">
                💡 <strong>Tip:</strong> Si no recibiste el mensaje, revisá que tu número de WhatsApp esté actualizado en tu perfil.
              </p>
            </div>
            <div style="background:#f8fafc;border-radius:12px;padding:16px 20px;margin-bottom:24px;display:flex;gap:16px">
              <div style="flex:1">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Empresa</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a">${data.businessName}</p>
              </div>
              <div style="flex:1">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Contactos hoy</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#1B3A6B">${data.todayCount || 1} contacto${(data.todayCount||1)>1?'s':''}</p>
              </div>
            </div>
            <div style="text-align:center">
              <a href="${data.panelUrl}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #1B3A6B">
                ${t('cta', 'Ver estadísticas →')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.businessUrl}" style="color:#1B3A6B;text-decoration:none">Ver perfil</a></p>
          </div>
        </div>`
    }),

    weeklySummary: (data, t) => ({
        subject: t('subject', `📊 Tu semana en RetoPA — ${data.businessName}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:28px 40px;text-align:center">
            <div style="font-size:36px;margin-bottom:6px">📊</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">Tu resumen semanal</h1>
            <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">${data.weekLabel || 'Esta semana'}</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0 0 20px">${data.businessName}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
              <div style="background:#eff6ff;border-radius:14px;padding:16px;text-align:center">
                <p style="margin:0;font-size:28px;font-weight:900;color:#1B3A6B">${data.views || 0}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">👁 Visitas</p>
              </div>
              <div style="background:#fef3c7;border-radius:14px;padding:16px;text-align:center">
                <p style="margin:0;font-size:28px;font-weight:900;color:#d97706">${data.whatsappClicks || 0}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">📱 WhatsApp</p>
              </div>
              <div style="background:#fdf2f8;border-radius:14px;padding:16px;text-align:center">
                <p style="margin:0;font-size:28px;font-weight:900;color:#db2777">${data.likes || 0}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">❤️ Likes</p>
              </div>
              <div style="background:#f0fdf4;border-radius:14px;padding:16px;text-align:center">
                <p style="margin:0;font-size:28px;font-weight:900;color:#16a34a">${data.reviews || 0}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;font-weight:600">⭐ Reseñas</p>
              </div>
            </div>
            ${data.qualityScore < 80 ? `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;margin-bottom:20px">
              <p style="margin:0;font-size:13px;color:#92400e">
                💡 Tu perfil está al <strong>${data.qualityScore}%</strong>. Completalo para aparecer más arriba en los resultados.
              </p>
            </div>` : ''}
            <div style="text-align:center">
              <a href="${data.panelUrl}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #1B3A6B">
                ${t('cta', 'Ver mi panel →')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.panelUrl}" style="color:#1B3A6B;text-decoration:none">Gestionar notificaciones</a></p>
          </div>
        </div>`
    }),

    // Aviso al dueño cuando se le OTORGA el Destacado Fundador (regalo).
    founderGranted: (data, t) => ({
        subject: t('subject', `🎁 ¡Tu empresa ahora está Destacada en ${data.siteName || 'RetoPA'}!`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#E8B84B,#c89a35);padding:36px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:8px">🎁</div>
            <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px">Te regalamos el plan Destacado</p>
          </div>
          <div style="padding:36px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola ${data.ownerName || data.name || ''}! 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `Como cliente fundador, le regalamos a <strong>${data.businessName}</strong> el plan
              <strong style="color:#b45309">Destacado</strong> en ${data.siteName || 'RetoPA'}, <strong>gratis por ${data.days} días</strong>.
              Desde ya aparecés primero en tu categoría y con el sello Destacado.`)}
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;margin-bottom:22px;text-align:center">
              <p style="margin:0;font-size:13px;color:#92400e">Tu Destacado está activo hasta el</p>
              <p style="margin:4px 0 0;font-size:20px;font-weight:900;color:#b45309">${data.expiresLabel || ''}</p>
            </div>
            <p style="color:#0f172a;font-size:14px;font-weight:700;margin:0 0 8px">Lo que ganás mientras estás Destacado:</p>
            <ul style="margin:0 0 24px;padding-left:20px;color:#334155;font-size:14px;line-height:1.9">
              <li>Aparecés <strong>primero</strong> en las búsquedas de tu rubro</li>
              <li>El <strong>sello Destacado</strong> que genera más confianza</li>
              <li>Cargá tu <strong>catálogo de productos y servicios</strong></li>
              <li>Más fotos y redes en tu ficha</li>
            </ul>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.panelUrl || (data.siteUrl + '/cliente')}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Aprovechar mi Destacado →')}
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">
                Ver tu ficha: <a href="${data.businessUrl}" style="color:#1B3A6B">${data.businessUrl}</a>
              </p>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    }),

    founderExpiring: (data, t) => ({
        subject: t('subject', `🏅 Tu Destacado Fundador terminó — ${data.businessName}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#E8B84B,#c89a35);padding:36px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:8px">🏅</div>
            <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px">Tu período Destacado Fundador terminó</p>
          </div>
          <div style="padding:36px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">Hola ${data.name || ''} 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `El período en que <strong>${data.businessName}</strong> estuvo <strong style="color:#b45309">Destacado</strong> en ${data.siteName || 'RetoPA'} acaba de terminar.
              Volviste al plan básico, pero mirá lo que lograste mientras estuviste Destacado:`)}
            </p>
            <div style="display:flex;gap:12px;margin-bottom:24px">
              <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:26px;font-weight:900;color:#0ea5e9">${data.views != null ? data.views : 0}</div>
                <div style="font-size:12px;color:#64748b;font-weight:600">visitas</div>
              </div>
              <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:26px;font-weight:900;color:#16a34a">${data.whatsappClicks != null ? data.whatsappClicks : 0}</div>
                <div style="font-size:12px;color:#166534;font-weight:600">contactos por WhatsApp</div>
              </div>
            </div>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:18px 20px;margin-bottom:24px">
              <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6">
                ${t('upsell', `¿Querés seguir apareciendo primero y recibiendo estos contactos? Pasá a <strong>Destacado</strong> o <strong>Premium</strong> y mantené la visibilidad.`)}
              </p>
            </div>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.plansUrl || data.panelUrl || (data.siteUrl + '/cliente')}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Seguir Destacado →')}
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">
                Ver tu perfil: <a href="${data.businessUrl}" style="color:#1B3A6B">${data.businessUrl}</a>
              </p>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    }),

    planRequested: (data, t) => ({
        subject: t('subject', `💳 Completá tu pago — plan ${data.planLabel} · ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <div style="font-size:36px;margin-bottom:6px">💳</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Solicitud de plan recibida</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola ${data.name || ''}! 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `Recibimos tu solicitud del plan <strong>${data.planLabel}</strong> para <strong>${data.businessName}</strong>. Para activarlo, completá el pago con Tpago. Apenas confirmemos el pago, tu plan queda activo.`)}
            </p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Total a pagar</p>
              <p style="margin:4px 0 0;font-size:26px;font-weight:900;color:#1B3A6B">Gs. ${data.amount}</p>
            </div>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.tpagoLink || '#'}" target="_blank"
                 style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Pagar con Tpago')}
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">Tu solicitud queda <strong>en revisión</strong> hasta confirmar el pago.</p>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.panelUrl || (data.siteUrl + '/cliente')}" style="color:#1B3A6B;text-decoration:none">Ir a mi panel</a></p>
          </div>
        </div>`
    }),

    planActivated: (data, t) => ({
        subject: t('subject', `✅ ¡${data.planLabel} activado! — ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:6px">🎉</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Tu plan está activo</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Gracias ${data.name || ''}! 🚀</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `Confirmamos tu pago. El plan <strong>${data.planLabel}</strong> de <strong>${data.businessName}</strong> ya está activo hasta el <strong>${data.expires}</strong>. ¡A aprovecharlo!`)}
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
              <p style="margin:0;font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:.5px">Plan activo hasta</p>
              <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#166534">${data.expires || ''}</p>
            </div>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.panelUrl || (data.siteUrl + '/cliente')}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Ir a mi panel')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'}</p>
          </div>
        </div>`
    }),

    planRejected: (data, t) => ({
        subject: t('subject', `Sobre tu solicitud del plan ${data.planLabel} — ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Sobre tu solicitud de plan</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">Hola ${data.name || ''} 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px">
              ${t('message', `No pudimos confirmar el pago de tu solicitud del plan <strong>${data.planLabel}</strong> para <strong>${data.businessName}</strong>, así que la cancelamos por ahora. Tu ficha sigue activa en el plan gratuito — podés volver a intentarlo cuando quieras.`)}
            </p>
            ${data.reason ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin-bottom:16px"><p style="margin:0;font-size:13px;color:#64748b">Nota: ${data.reason}</p></div>` : ''}
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.panelUrl || (data.siteUrl + '/cliente')}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Reintentar desde mi panel')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'}</p>
          </div>
        </div>`
    }),

    planRenewalReminder: (data, t) => ({
        subject: t('subject', `⏰ Tu plan ${data.planLabel} ${data.whenText} — ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <div style="font-size:38px;margin-bottom:6px">⏰</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Recordatorio de renovación</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">Hola ${data.name || ''} 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `Tu plan <strong>${data.planLabel}</strong> de <strong>${data.businessName}</strong> <strong style="color:#b45309">${data.whenText}</strong>. Renoválo para no perder el destaque, la prioridad en búsquedas ni tus estadísticas.`)}
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
              <p style="margin:0;font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:.5px">Renovación</p>
              <p style="margin:4px 0 0;font-size:22px;font-weight:900;color:#92400e">Gs. ${data.amount}</p>
              <p style="margin:6px 0 0;font-size:12px;color:#a16207">Vence el ${data.expires || ''}</p>
            </div>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.tpagoLink || data.panelUrl || (data.siteUrl + '/cliente')}" target="_blank"
                 style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Renovar ahora')}
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">También podés renovar desde <a href="${data.panelUrl || (data.siteUrl + '/cliente')}" style="color:#1B3A6B">tu panel</a>.</p>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'}</p>
          </div>
        </div>`
    }),

    planExpired: (data, t) => ({
        subject: t('subject', `Tu plan ${data.planLabel} venció — ${data.businessName}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#64748b,#475569);padding:32px 40px;text-align:center">
            <div style="font-size:38px;margin-bottom:6px">🔔</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Tu plan volvió al gratuito</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">Hola ${data.name || ''} 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
              ${t('message', `El plan <strong>${data.planLabel}</strong> de <strong>${data.businessName}</strong> venció y tu ficha volvió al plan gratuito. Tranquilo: <strong>no borramos nada</strong> — tus categorías, tu galería y tus datos quedan guardados y vuelven al instante apenas reactives el plan.`)}
            </p>
            <div style="display:flex;gap:12px;margin-bottom:24px">
              <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:26px;font-weight:900;color:#0ea5e9">${data.views != null ? data.views : 0}</div>
                <div style="font-size:12px;color:#64748b;font-weight:600">visitas (últimos 30 días)</div>
              </div>
              <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:26px;font-weight:900;color:#16a34a">${data.whatsappClicks != null ? data.whatsappClicks : 0}</div>
                <div style="font-size:12px;color:#166534;font-weight:600">contactos por WhatsApp</div>
              </div>
            </div>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.panelUrl || (data.siteUrl + '/cliente')}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Reactivar mi plan')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'}</p>
          </div>
        </div>`
    }),

    signalDigest: (data, t) => ({
        subject: t('subject', `🎯 Tenés ${data.count} oportunidad${data.count === 1 ? '' : 'es'} nueva${data.count === 1 ? '' : 's'} — ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <div style="font-size:38px;margin-bottom:6px">🎯</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Oportunidades de venta</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola ${data.name || ''}! 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px">
              ${t('message', `Tenés <strong>${data.count} oportunidad${data.count === 1 ? '' : 'es'}</strong> para trabajar hoy en ${data.siteName || 'RetoPA'}. Cada una trae el motivo y un mensaje listo para enviar.`)}
            </p>
            ${(data.items && data.items.length) ? `<ul style="margin:0 0 20px;padding-left:18px;color:#334155;font-size:14px;line-height:1.9">${data.items.map(x => `<li>${x}</li>`).join('')}${data.count > data.items.length ? `<li style="color:#94a3b8;list-style:none;margin-left:-18px">…y ${data.count - data.items.length} más</li>` : ''}</ul>` : ''}
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.panelUrl || (data.siteUrl + '/embajador')}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Ver mis oportunidades')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'}</p>
          </div>
        </div>`
    }),

    // Outreach del embajador a una ficha (D9.3 anexo). El cuerpo (data.bodyHtml)
    // es el "mensaje sugerido" — ya escapado y con saltos → <br> — más el link a
    // la ficha. Va con el formato lindo de RetoPA. Reply-To = email del embajador.
    ambassadorOutreach: (data, t) => ({
        subject: t('subject', data.subject || `Tu empresa en ${data.siteName || 'RetoPA'}${data.businessName ? ` — ${data.businessName}` : ''}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <div style="font-size:34px;margin-bottom:6px">📣</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">El ecosistema comercial de Paraguay</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 12px">Hola${data.businessName ? ` ${data.businessName}` : ''} 👋</p>
            <div style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">${data.bodyHtml || ''}</div>
            ${data.fichaUrl ? `
            <div style="text-align:center;margin:8px 0 6px">
              <a href="${data.fichaUrl}" style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Ver tu ficha en RetoPA')}
              </a>
            </div>
            <p style="text-align:center;margin:10px 0 0"><a href="${data.fichaUrl}" style="color:#1B3A6B;font-size:12px;word-break:break-all;text-decoration:none">${data.fichaLabel || data.fichaUrl}</a></p>` : ''}
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            ${data.ambassadorName ? `<p style="margin:0 0 4px;font-size:12px;color:#64748b">Te escribe <strong>${data.ambassadorName}</strong>${data.ambassadorEmail ? ` · <a href="mailto:${data.ambassadorEmail}" style="color:#1B3A6B;text-decoration:none">${data.ambassadorEmail}</a>` : ''}</p>` : ''}
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    }),

    claimReceived: (data, t) => ({
        subject: t('subject', `⏳ Recibimos tu solicitud — ${data.businessName} en ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:36px 40px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">📍</div>
            <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">El ecosistema comercial de Paraguay</p>
          </div>
          <div style="padding:36px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola ${data.name}! 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">
              ${t('message', `Recibimos tu solicitud para reclamar el perfil de <strong>${data.businessName}</strong> en RetoPA.
              Nuestro equipo verificará tu identidad y te avisará a la brevedad.`)}
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:13px;color:#92400e;font-weight:600">⏳ Próximos pasos</p>
              <ul style="margin:8px 0 0;padding:0 0 0 20px;color:#92400e;font-size:13px;line-height:1.8">
                <li>Revisamos tu solicitud en <strong>24-48 horas hábiles</strong></li>
                <li>Si todo está en orden, activamos tu cuenta</li>
                <li>Recibirás otro email de confirmación</li>
              </ul>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Tu solicitud</p>
              <p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#0f172a">${data.businessName}</p>
              <p style="margin:0;font-size:13px;color:#64748b">Email registrado: <strong>${data.email}</strong></p>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">
              Si no fuiste vos quien realizó esta solicitud, ignorá este email.
            </p>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    }),

    // Reclamo aprobado + cuenta NUEVA (formulario público): activar cuenta.
    claimActivate: (data, t) => ({
        subject: t('subject', `✅ ¡Tu reclamo de ${data.businessName} fue aprobado! Activá tu cuenta`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:36px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:8px">🎉</div>
            <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">El ecosistema comercial de Paraguay</p>
          </div>
          <div style="padding:36px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola ${data.name || ''}! 🚀</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">
              ${t('message', `Aprobamos tu reclamo de <strong>${data.businessName}</strong> y la ficha ya está <strong style="color:#22c55e">verificada</strong>.
              Solo falta un paso: <strong>creá tu contraseña</strong> para activar tu cuenta y empezar a gestionar tu empresa.`)}
            </p>
            <div style="text-align:center;margin:32px 0">
              <a href="${data.activateUrl}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:800;font-size:16px;border:3px solid #1B3A6B">
                ${t('cta', 'Crear mi contraseña y entrar →')}
              </a>
              <p style="margin:14px 0 0;font-size:12px;color:#94a3b8">Este enlace vence en 7 días. Si no reconocés este reclamo, ignorá este correo.</p>
              <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Tu perfil público: <a href="${data.businessUrl}" style="color:#1B3A6B">${data.businessUrl}</a></p>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    }),

    claimApproved: (data, t) => ({
        subject: t('subject', `🎉 ¡Tu perfil fue verificado! — ${data.businessName} en ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:36px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:8px">🎉</div>
            <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">El ecosistema comercial de Paraguay</p>
          </div>
          <div style="padding:36px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Felicitaciones ${data.name}! 🚀</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">
              ${t('message', `El perfil de <strong>${data.businessName}</strong> fue <strong style="color:#22c55e">verificado exitosamente</strong>.
              Ya podés ingresar al panel y empezar a gestionar tu empresa.`)}
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:24px">
              <p style="margin:0 0 12px;font-size:13px;color:#166534;font-weight:700">✅ ¿Qué podés hacer ahora?</p>
              <ul style="margin:0;padding:0 0 0 20px;color:#166534;font-size:13px;line-height:2">
                <li>Completar descripción, fotos y horarios</li>
                <li>Ver estadísticas de visitas y contactos</li>
                <li>Responder reseñas de clientes</li>
                <li>Gestionar tus categorías y servicios</li>
              </ul>
            </div>
            <div style="text-align:center;margin:32px 0">
              <a href="${data.panelUrl || data.siteUrl + '/cliente'}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:800;font-size:16px;border:3px solid #1B3A6B">
                ${t('cta', 'Ir a mi panel →')}
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">
                También podés ver tu perfil público:
                <a href="${data.businessUrl}" style="color:#1B3A6B">${data.businessUrl}</a>
              </p>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    }),

    claimAdminAlert: (data) => ({
        subject: `🔔 Nuevo claim — ${data.businessName} (${data.userName})`,
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#E8B84B,#c89a35);padding:28px 40px;text-align:center">
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">🔔 Nuevo Claim Pendiente</h1>
            <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">RetoPA · Panel Admin</p>
          </div>
          <div style="padding:28px 40px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px 0;color:#64748b;width:140px">Empresa</td><td style="padding:8px 0;font-weight:700;color:#0f172a">${data.businessName}</td></tr>
              <tr style="border-top:1px solid #f1f5f9"><td style="padding:8px 0;color:#64748b">Reclamante</td><td style="padding:8px 0;color:#0f172a">${data.userName}</td></tr>
              <tr style="border-top:1px solid #f1f5f9"><td style="padding:8px 0;color:#64748b">Email</td><td style="padding:8px 0"><a href="mailto:${data.userEmail}" style="color:#1B3A6B">${data.userEmail}</a></td></tr>
              <tr style="border-top:1px solid #f1f5f9"><td style="padding:8px 0;color:#64748b">Teléfono</td><td style="padding:8px 0;color:#0f172a">${data.userPhone || '—'}</td></tr>
              <tr style="border-top:1px solid #f1f5f9"><td style="padding:8px 0;color:#64748b">Ciudad</td><td style="padding:8px 0;color:#0f172a">${data.city || '—'}</td></tr>
            </table>
            <div style="text-align:center;margin:28px 0 8px">
              <a href="${data.adminUrl || 'https://retopa.com.py/admin'}"
                 style="display:inline-block;background:#1B3A6B;color:white;text-decoration:none;padding:13px 32px;border-radius:10px;font-weight:700;font-size:14px">
                Ver en Panel Admin →
              </a>
            </div>
          </div>
        </div>`
    }),

    passwordReset: (data, t) => ({
        subject: t('subject', `🔐 Restablecer contraseña — ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e293b;">🔐 Restablecer contraseña</h2>
            <p style="color: #64748b;">Hola ${data.name},</p>
            <p style="color: #64748b;">${t('message', 'Recibimos una solicitud para restablecer tu contraseña. Hacé clic en el botón de abajo:')}</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${data.resetUrl}" 
                   style="background: #0ea5e9; color: white; padding: 14px 32px; 
                          border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block;">
                    ${t('cta', 'Restablecer contraseña')}
                </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px;">Si no solicitaste esto, ignorá este email. El link expira en 1 hora.</p>
        </div>
        `
    }),

    // ── Engagement: inducir al usuario a USAR el sistema ──────────────────────
    // Consejos / tips para sacarle el jugo a la ficha. Pensada para mandar a
    // dueños que ya tienen ficha pero no la están aprovechando.
    tipsFicha: (data, t) => ({
        subject: t('subject', `💡 5 consejos para que ${data.businessName || 'tu empresa'} destaque en ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:30px 40px;text-align:center">
            <div style="font-size:38px;margin-bottom:6px">💡</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">Aprovechá tu ficha al máximo</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">${data.siteName || 'RetoPA'}</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 6px">¡Hola${data.name ? ' ' + data.name : ''}! 👋</p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 22px">
              ${t('intro', `Tenés tu ficha de <strong>${data.businessName || 'tu empresa'}</strong> en ${data.siteName || 'RetoPA'}, y con unos pocos ajustes podés recibir muchas más visitas y contactos. Te dejamos 5 consejos rápidos:`)}
            </p>
            ${[
              ['📸','Subí buenas fotos','Las fichas con galería reciben muchas más visitas. Sumá tu local, tus productos y tu logo.'],
              ['📱','Confirmá tu WhatsApp','Es el botón que más usan tus clientes para contactarte. Revisá que el número esté bien.'],
              ['📝','Completá tu descripción y categorías','Cuanto más completa tu ficha, más arriba aparecés en las búsquedas.'],
              ['⭐','Respondé tus reseñas','Contestar las opiniones genera confianza y te ayuda a fidelizar clientes.'],
              ['🕐','Cargá tus horarios','Que te encuentren abiertos cuando te buscan es clave para no perder contactos.'],
            ].map(([ic,ti,tx]) => `
              <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px">
                <div style="font-size:20px;line-height:1.2;flex-shrink:0">${ic}</div>
                <div>
                  <p style="margin:0;font-size:14px;font-weight:700;color:#1B3A6B">${ti}</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#64748b;line-height:1.5">${tx}</p>
                </div>
              </div>`).join('')}
            <div style="text-align:center;margin-top:26px">
              <a href="${data.panelUrl || data.siteUrl || '#'}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #1B3A6B">
                ${t('cta', 'Actualizar mi ficha →')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} — Un producto HEPTA GROUP</p>
          </div>
        </div>`
    }),

    // Reactivación: para el segmento "sin acceso" (usuarios dormidos). Los invita
    // a volver al panel. Enganchada con el filtro de inactividad del panel Usuarios.
    reactivation: (data, t) => ({
        subject: t('subject', `👋 Te extrañamos en ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);padding:34px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:8px">👋</div>
            <h1 style="color:white;margin:0;font-size:21px;font-weight:800">¡Hace rato no te vemos!</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px">${data.siteName || 'RetoPA'}</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola${data.name ? ' ' + data.name : ''}!</p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 18px">
              ${t('message', `Notamos que hace un tiempo no entrás a tu panel de <strong>${data.businessName || 'tu empresa'}</strong>. Mientras no estuviste, la gente sigue buscando negocios como el tuyo en ${data.siteName || 'RetoPA'} — no dejes pasar esos contactos.`)}
            </p>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 18px;margin-bottom:22px">
              <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6">
                Volvé y en 2 minutos podés: revisar quién te contactó, actualizar tus datos y volver a aparecer entre los primeros resultados.
              </p>
            </div>
            <div style="text-align:center">
              <a href="${data.panelUrl || data.siteUrl || '#'}"
                 style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:13px 34px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #0ea5e9">
                ${t('cta', 'Volver a mi panel →')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} — Un producto HEPTA GROUP</p>
          </div>
        </div>`
    }),

    // Primeros pasos: onboarding accionable para que el usuario nuevo EMPIECE a
    // usar el sistema (checklist para activar la ficha).
    firstSteps: (data, t) => ({
        subject: t('subject', `🚀 Primeros pasos con ${data.businessName || 'tu empresa'} en ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:30px 40px;text-align:center">
            <div style="font-size:38px;margin-bottom:6px">🚀</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">Poné en marcha tu ficha</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">${data.siteName || 'RetoPA'}</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 6px">¡Bienvenido${data.name ? ', ' + data.name : ''}! 🎉</p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 22px">
              ${t('intro', `Ya tenés tu cuenta lista. Con estos 3 pasos, <strong>${data.businessName || 'tu empresa'}</strong> queda visible y lista para recibir clientes en ${data.siteName || 'RetoPA'}:`)}
            </p>
            ${[
              ['1','Completá tu ficha','Datos de contacto, dirección, descripción y categorías. Así te encuentran.'],
              ['2','Subí tus fotos','Una buena galería multiplica las visitas a tu perfil.'],
              ['3','Compartí tu enlace','Pasá el link de tu ficha por WhatsApp y redes para sumar reseñas y likes.'],
            ].map(([n,ti,tx]) => `
              <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
                <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#dcfce7;color:#15803d;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">${n}</div>
                <div>
                  <p style="margin:0;font-size:14px;font-weight:700;color:#15803d">${ti}</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#64748b;line-height:1.5">${tx}</p>
                </div>
              </div>`).join('')}
            <div style="text-align:center;margin-top:26px">
              <a href="${data.panelUrl || data.siteUrl || '#'}"
                 style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:13px 34px;border-radius:12px;font-weight:700;font-size:14px;border:3px solid #16a34a">
                ${t('cta', 'Empezar ahora →')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} — Un producto HEPTA GROUP</p>
          </div>
        </div>`
    }),

    // Alta de ficha SIN sesión: confirmá tu correo creando tu contraseña.
    activateAccount: (data, t) => ({
        subject: t('activate_subject', `Confirmá tu correo y gestioná ${data.businessName || 'tu negocio'} — ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:36px 40px;text-align:center">
            <div style="font-size:40px;margin-bottom:8px">✅</div>
            <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">El ecosistema comercial de Paraguay</p>
          </div>
          <div style="padding:36px 40px">
            <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Tu negocio ya está publicado! 🎉</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">
              ${t('activate_message', `<strong>${data.businessName || 'Tu negocio'}</strong> ya aparece en ${data.siteName || 'RetoPA'}.
              Para gestionarlo (editar datos, subir fotos, ver tus contactos) confirmá que este correo es tuyo
              creando una <strong>contraseña</strong>. Con ella vas a entrar siempre.`)}
            </p>
            <div style="text-align:center;margin:32px 0">
              <a href="${data.activateUrl}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:800;font-size:16px;border:3px solid #1B3A6B">
                ${t('activate_cta', 'Confirmar y crear mi contraseña →')}
              </a>
              <p style="margin:14px 0 0;font-size:12px;color:#94a3b8">Este enlace vence en 7 días. Si no registraste ningún negocio, ignorá este correo.</p>
              ${data.businessUrl ? `<p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Tu perfil público: <a href="${data.businessUrl}" style="color:#1B3A6B">${data.businessUrl}</a></p>` : ''}
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">© ${new Date().getFullYear()} ${data.siteName || 'RetoPA'} · <a href="${data.siteUrl || 'https://retopa.com.py'}" style="color:#1B3A6B;text-decoration:none">${(data.siteUrl || 'https://retopa.com.py').replace('https://','')}</a></p>
          </div>
        </div>`
    })
};

// Función principal de envío
// Lee configuración SMTP desde site_config (Panel Admin) con fallback a variables de entorno
// opts: { skipLog?:bool, logType?:string } — logging centralizado en email_log.
async function sendEmail(to, templateName, data, opts = {}) {
    let subject = '';
    // Registrar TODOS los envíos (éxito/fallo) en email_log, salvo skipLog.
    const _logEmail = (status, errMsg) => {
        if (opts && opts.skipLog) return;
        try {
            const p = require('../db');
            p.query(
                'INSERT INTO email_log (to_email, subject, type, status, error) VALUES ($1,$2,$3,$4,$5)',
                [to, subject || `(${templateName})`, (opts && opts.logType) || templateName, status, errMsg || null]
            ).catch(() => {});
        } catch (e) { /* nunca romper el envío por el log */ }
    };
    try {
        const templateFn = templates[templateName];
        if (!templateFn) throw new Error(`Template '${templateName}' no encontrado`);

        // Cargar overrides de plantillas (tpl_*) + config SMTP desde site_config (1 query).
        let overrides = {};
        const cfg = {};
        try {
            const pool = require('../db');
            const result = await pool.query(
                "SELECT key, value FROM site_config WHERE key LIKE 'tpl_%' OR key LIKE 'smtp_%'"
            );
            result.rows.forEach(r => { overrides[r.key] = r.value; if (r.key.indexOf('smtp_') === 0) cfg[r.key] = r.value; });
        } catch (cfgErr) {
            console.warn('[mail] site_config no disponible: uso textos por defecto + SMTP de .env');
        }

        // Renderizar con los campos editables resueltos (override o default).
        const t = makeT(templateName, overrides, data);
        const rendered = templateFn(data, t);
        subject = rendered.subject;
        const html = rendered.html;

        // Transporter: SMTP de site_config si está configurado; si no, el de .env.
        let activeTransporter = transporter; // fallback al transporter de .env
        let fromName = process.env.SMTP_FROM_NAME || 'RetoPA';
        let fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@retopa.com.py';

        if (cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass && cfg.smtp_pass !== '••••••••') {
            const nodemailer = require('nodemailer');
            activeTransporter = nodemailer.createTransport({
                host: cfg.smtp_host,
                port: parseInt(cfg.smtp_port || '587'),
                secure: cfg.smtp_secure === 'true',
                auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
                tls: { rejectUnauthorized: false }
            });
            fromName = cfg.smtp_from_name || fromName;
            fromAddr = cfg.smtp_from || cfg.smtp_user || fromAddr;
        }

        const info = await activeTransporter.sendMail({
            from: `"${fromName}" <${fromAddr}>`,
            to,
            subject,
            html,
            // Reply-To opcional (p.ej. el embajador que hace el outreach) — retrocompatible.
            ...(data && data.replyTo ? { replyTo: data.replyTo } : {}),
        });

        console.log(`📧 Email enviado a ${to}: ${info.messageId}`);
        _logEmail('sent', null);
        return { success: true, messageId: info.messageId, subject };
    } catch (err) {
        console.error('❌ Error enviando email:', err.message);
        _logEmail('failed', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    sendEmail,
    // D9-anexo — Render-only (para previews): devuelve {subject, html} aplicando
    // los overrides editables de site_config, SIN enviar nada.
    async renderTemplate(templateName, data) {
        const templateFn = templates[templateName];
        if (!templateFn) throw new Error(`Template '${templateName}' no encontrado`);
        let overrides = {};
        try {
            const pool = require('../db');
            const result = await pool.query("SELECT key, value FROM site_config WHERE key LIKE 'tpl_%'");
            result.rows.forEach(r => { overrides[r.key] = r.value; });
        } catch (e) {}
        const t = makeT(templateName, overrides, data);
        return templateFn(data || {}, t);
    },
    // Para emails sin template — HTML directo
    async sendRawEmail(to, subject, html) {
        const cfg = await getSMTPConfig();
        if (!cfg.smtp_host) { console.warn('[sendRawEmail] SMTP no configurado'); return; }
        const transport = buildTransport(cfg);
        await transport.sendMail({
            from:    `"${cfg.smtp_from_name||'RetoPA'}" <${cfg.smtp_from||cfg.smtp_user}>`,
            to, subject, html,
        });
    },
    verifyConnection,
    transporter
};
