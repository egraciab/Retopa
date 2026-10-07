#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_digest_prospectos.py
Agrega la plantilla de correo `prospectDigest` a config/mail.js. Idempotente.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_digest_prospectos.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
p = os.path.join(RAIZ, 'backend/src/config/mail.js')

PLANTILLA = r"""
    prospectDigest: (data, t) => ({
        subject: t('subject', `\u{1F4CB} ${data.count} prospecto${data.count === 1 ? '' : 's'} para contactar \u2014 ${data.siteName || 'RetoPA'}`),
        html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:32px 40px;text-align:center">
            <div style="font-size:38px;margin-bottom:6px">\u{1F4CB}</div>
            <h1 style="color:white;margin:0;font-size:20px;font-weight:800">${data.siteName || 'RetoPA'}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Prospectos del d\u00eda</p>
          </div>
          <div style="padding:32px 40px">
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px">
              Hay <strong>${data.count} ficha${data.count === 1 ? '' : 's'} sin due\u00f1o</strong> con tr\u00e1fico real esperando contacto.
              Entre todas suman ${data.visitasMes} visitas este mes.
            </p>
            ${(data.items && data.items.length) ? `<p style="color:#0f172a;font-size:13px;font-weight:700;margin:0 0 6px">Los mejores de hoy</p>
            <ul style="margin:0 0 20px;padding-left:18px;color:#334155;font-size:13px;line-height:1.9">${data.items.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
            <div style="background:#f8fafc;border-radius:12px;padding:14px 18px;margin:0 0 20px">
              <p style="margin:0;font-size:12px;color:#64748b">
                \u00daltimos 7 d\u00edas: <strong>${data.enviados7d}</strong> enviados \u00b7
                <strong>${data.reclamaron}</strong> reclamaron \u00b7
                <strong>${data.tasaClaim}%</strong> de conversi\u00f3n
              </p>
            </div>
            <div style="text-align:center;margin:8px 0 4px">
              <a href="${data.panelUrl}"
                 style="display:inline-block;background:#1B3A6B;color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:800;font-size:15px">
                ${t('cta', 'Abrir la cola')}
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">\u00a9 ${new Date().getFullYear()} ${data.siteName || 'RetoPA'}</p>
          </div>
        </div>`
    }),
"""

if not os.path.exists(p):
    print(f'⚠ no existe {p}'); sys.exit(1)

s = open(p, encoding='utf-8').read()
if 'prospectDigest:' in s:
    print('✔ plantilla prospectDigest ya presente'); sys.exit(0)

ancla = '    signalDigest: (data, t) => ({'
if ancla not in s:
    print('⚠ no encontré el ancla `signalDigest` en mail.js — agregar la plantilla a mano')
    sys.exit(1)

shutil.copy2(p, f'{p}.bak-{SELLO}')
open(p, 'w', encoding='utf-8').write(s.replace(ancla, PLANTILLA.strip('\n') + '\n\n' + ancla, 1))
print(f'✔ plantilla prospectDigest agregada (backup .bak-{SELLO})')
print('Siguiente:  docker compose up -d --build backend')
