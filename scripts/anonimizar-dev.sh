#!/usr/bin/env bash
# Anonimiza los canales de contacto de una copia de produccion.
# Determinista e idempotente. SOLO corre en retopa-dev.
set -euo pipefail

H=$(hostname)
if [ "$H" != "retopa-dev" ]; then
  echo "ABORTADO: solo corre en retopa-dev (hostname actual: $H)" >&2
  exit 1
fi

docker exec -i "${DB_CONT:-retopa-db}" \
  psql -v ON_ERROR_STOP=1 -U "${DB_USER:-retopa}" -d "${DB_NAME:-retopa}" <<'SQL'
BEGIN;

-- Fichas: telefonos, correos y el token de reclamo
UPDATE businesses SET
  phone          = CASE WHEN phone     IS NOT NULL THEN '+595 900 ' || lpad(id::text,6,'0') END,
  whatsapp       = CASE WHEN whatsapp  IS NOT NULL THEN '+595 900 ' || lpad(id::text,6,'0') END,
  phone_raw      = CASE WHEN phone_raw IS NOT NULL THEN '0900'      || lpad(id::text,6,'0') END,
  phone_extra    = NULL,
  email          = CASE WHEN email     IS NOT NULL THEN 'ficha' || id || '@dev.invalid' END,
  claim_token    = NULL,
  claim_token_at = NULL;

-- Usuarios finales
UPDATE users SET
  email                = 'user' || id || '@dev.invalid',
  phone                = CASE WHEN phone IS NOT NULL THEN '+595 900 ' || lpad(id::text,6,'0') END,
  password_hash        = '$2b$10$oCtsUdsl40hx4Hs9j2vnQ.I5Df88RS5p7AajVHW10.atfkTj9/kAO',
  reset_token          = NULL, reset_token_expires  = NULL,
  verify_token         = NULL, verify_token_expires = NULL;

-- Administradores
UPDATE admin_users SET
  email         = 'admin' || id || '@dev.invalid',
  password_hash = '$2b$10$oCtsUdsl40hx4Hs9j2vnQ.I5Df88RS5p7AajVHW10.atfkTj9/kAO';

-- Resenas
UPDATE reviews r SET author_email = 'review' || s.n || '@dev.invalid'
  FROM (SELECT ctid, row_number() OVER () n FROM reviews) s WHERE r.ctid = s.ctid;

-- Leads de servicios (nombre incluido: son personas reales)
UPDATE service_leads l SET
  contact_name  = 'Contacto ' || s.n,
  contact_email = 'lead' || s.n || '@dev.invalid',
  contact_phone = CASE WHEN l.contact_phone IS NOT NULL
                       THEN '+595 900 ' || lpad(s.n::text,6,'0') END
  FROM (SELECT ctid, row_number() OVER () n FROM service_leads) s WHERE l.ctid = s.ctid;

-- Prospeccion
UPDATE prospect_outreach p SET telefono = '+595 900 ' || lpad(s.n::text,6,'0')
  FROM (SELECT ctid, row_number() OVER () n FROM prospect_outreach) s WHERE p.ctid = s.ctid;

UPDATE prospect_wa_outreach p SET whatsapp = '+595 900 ' || lpad(s.n::text,6,'0')
  FROM (SELECT ctid, row_number() OVER () n FROM prospect_wa_outreach) s WHERE p.ctid = s.ctid;

-- Log de correos: es puro dato personal y dev no necesita el historial
TRUNCATE email_log;

COMMIT;

-- Verificacion: cualquier numero distinto de 0 es una fuga
SELECT 'businesses.email  sin anonimizar' k, count(*) v FROM businesses
  WHERE email IS NOT NULL AND email NOT LIKE '%@dev.invalid'
UNION ALL SELECT 'businesses.phone', count(*) FROM businesses
  WHERE phone IS NOT NULL AND phone NOT LIKE '+595 900 %'
UNION ALL SELECT 'businesses.whatsapp', count(*) FROM businesses
  WHERE whatsapp IS NOT NULL AND whatsapp NOT LIKE '+595 900 %'
UNION ALL SELECT 'claim_token vivos', count(*) FROM businesses WHERE claim_token IS NOT NULL
UNION ALL SELECT 'users.email', count(*) FROM users WHERE email NOT LIKE '%@dev.invalid'
UNION ALL SELECT 'admin_users.email', count(*) FROM admin_users WHERE email NOT LIKE '%@dev.invalid'
UNION ALL SELECT 'reviews.author_email', count(*) FROM reviews
  WHERE author_email IS NOT NULL AND author_email NOT LIKE '%@dev.invalid'
UNION ALL SELECT 'service_leads.contact_email', count(*) FROM service_leads
  WHERE contact_email IS NOT NULL AND contact_email NOT LIKE '%@dev.invalid'
UNION ALL SELECT 'email_log', count(*) FROM email_log;
SQL
