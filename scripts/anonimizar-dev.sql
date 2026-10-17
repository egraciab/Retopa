-- RetoPA — Anonimiza una copia de producción para retopa-dev. v2 (2026-10-17)
-- Lo llama scripts/anonimizar-dev.sh (que tiene la guarda de hostname). Idempotente.
--
-- Dos capas:
--   1) EXPLÍCITA, tabla por tabla (determinista por id, como la v1).
--   2) GENÉRICA: recorre TODAS las columnas de texto/json de TODAS las tablas y borra
--      correos, celulares paraguayos, tokens/hashes e IPs que hayan quedado. Así una
--      tabla nueva que nadie agregó acá no se escapa.
-- Al final, la verificación vuelve a recorrer todo: cualquier número distinto de 0 es una
-- fuga y el script termina con ERROR (no se sigue con el cambio de base).
--
-- Se conserva a propósito (dato público de la ficha o de configuración):
--   businesses: nombre, descripción, dirección, horarios, web, redes, RUC, tags…
--   site_config, categories, cities, plans, services, promotions, business_gallery,
--   reviews (nombre y comentario, que ya son públicos). users.name se conserva (igual que la v1).
\set ON_ERROR_STOP 1
BEGIN;

-- Patrones (POSIX ARE de Postgres)
CREATE TEMP TABLE _anon_rx ON COMMIT DROP AS SELECT
  '[A-Za-z0-9._%+-]+@(?!dev\.invalid\M)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'::text AS email,
  -- celular PY con prefijo (+595 / 595 / 0); el 900 de los anonimizados no cuenta
  '(\+?595|\m0)[ .-]?9(?!00)[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{3}'::text AS phone;

-- ── 1) Explícita ──────────────────────────────────────────────────────────────
UPDATE businesses SET
  phone          = CASE WHEN phone     IS NOT NULL THEN '+595 900 ' || lpad(id::text,6,'0') END,
  whatsapp       = CASE WHEN whatsapp  IS NOT NULL THEN '+595 900 ' || lpad(id::text,6,'0') END,
  phone_raw      = CASE WHEN phone_raw IS NOT NULL THEN '0900'      || lpad(id::text,6,'0') END,
  phone_extra    = NULL,
  email          = CASE WHEN email     IS NOT NULL THEN 'ficha' || id || '@dev.invalid' END,
  claim_token    = NULL,
  claim_token_at = NULL;

-- Usuarios: correo solo si tenía (las cuentas "solo WhatsApp" siguen sin correo).
-- Contraseña de todos: RetoPA-Dev-2026.
UPDATE users SET
  email                = CASE WHEN email IS NOT NULL THEN 'user' || id || '@dev.invalid' END,
  phone                = CASE WHEN phone IS NOT NULL THEN '+595 900 ' || lpad(id::text,6,'0') END,
  password_hash        = '$2b$10$oCtsUdsl40hx4Hs9j2vnQ.I5Df88RS5p7AajVHW10.atfkTj9/kAO',
  reset_token          = NULL, reset_token_expires  = NULL,
  verify_token         = NULL, verify_token_expires = NULL;
DO $$ BEGIN  -- columnas que no existen en todas las versiones
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='access_token_hash') THEN
    EXECUTE 'UPDATE users SET access_token_hash = NULL, access_token_expires = NULL'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mfa_otp') THEN
    EXECUTE 'UPDATE users SET mfa_otp = NULL'; END IF;
END $$;

UPDATE admin_users SET
  email         = 'admin' || id || '@dev.invalid',
  password_hash = '$2b$10$oCtsUdsl40hx4Hs9j2vnQ.I5Df88RS5p7AajVHW10.atfkTj9/kAO';

UPDATE reviews r SET author_email = 'review' || s.n || '@dev.invalid'
  FROM (SELECT ctid, row_number() OVER () n FROM reviews) s
 WHERE r.ctid = s.ctid AND r.author_email IS NOT NULL AND r.author_email NOT LIKE '%@dev.invalid';

-- Leads (nombre incluido: son personas reales). notes es JSON con nombre/teléfono/correo.
UPDATE service_leads l SET
  contact_name  = CASE WHEN l.contact_name  IS NOT NULL THEN 'Contacto ' || l.id END,
  contact_email = CASE WHEN l.contact_email IS NOT NULL THEN 'lead' || l.id || '@dev.invalid' END,
  contact_phone = CASE WHEN l.contact_phone IS NOT NULL THEN '+595 900 ' || lpad(l.id::text,6,'0') END;
UPDATE service_leads SET notes = (notes::jsonb
    || CASE WHEN notes::jsonb ? 'name'         THEN jsonb_build_object('name',         'Contacto ' || id) ELSE '{}' END
    || CASE WHEN notes::jsonb ? 'contact_name' THEN jsonb_build_object('contact_name', 'Contacto ' || id) ELSE '{}' END
    || CASE WHEN notes::jsonb ? 'nombre'       THEN jsonb_build_object('nombre',       'Contacto ' || id) ELSE '{}' END
    || CASE WHEN notes::jsonb ? 'userName'     THEN jsonb_build_object('userName',     'Contacto ' || id) ELSE '{}' END)::text
 WHERE notes IS JSON OBJECT;

UPDATE prospect_outreach p SET telefono = '+595 900 ' || lpad(s.n::text,6,'0')
  FROM (SELECT ctid, row_number() OVER () n FROM prospect_outreach) s WHERE p.ctid = s.ctid;
UPDATE prospect_wa_outreach p SET whatsapp = '+595 900 ' || lpad(s.n::text,6,'0')
  FROM (SELECT ctid, row_number() OVER () n FROM prospect_wa_outreach) s WHERE p.ctid = s.ctid;

TRUNCATE email_log;

-- Los links que arma el backend (reclamo, acceso, correos) tienen que apuntar a dev, no a prod.
UPDATE site_config SET value = 'https://dev.retopa.com.py' WHERE key = 'site_url';

-- Tablas de los paquetes del 12 al 17-oct (si existen)
DO $$ BEGIN
  IF to_regclass('access_requests') IS NOT NULL THEN
    EXECUTE $q$UPDATE access_requests SET phone = '+595900' || lpad(id::text,6,'0')$q$; END IF;
  IF to_regclass('claim_requests') IS NOT NULL THEN
    EXECUTE $q$UPDATE claim_requests SET phone = '595900' || lpad(id::text,6,'0'),
      name = CASE WHEN name IS NOT NULL THEN 'Contacto ' || id END,
      email = CASE WHEN email IS NOT NULL THEN 'cr' || id || '@dev.invalid' END,
      message = CASE WHEN message IS NOT NULL THEN '(mensaje anonimizado)' END,
      ip = NULL$q$; END IF;
  IF to_regclass('owner_change_requests') IS NOT NULL THEN
    EXECUTE $q$UPDATE owner_change_requests SET
      old_value = CASE WHEN old_value IS NULL THEN NULL WHEN field = 'email' THEN 'ocr' || id || '-old@dev.invalid' ELSE '+595 900 ' || lpad(id::text,6,'0') END,
      new_value = CASE WHEN new_value IS NULL THEN NULL WHEN field = 'email' THEN 'ocr' || id || '-new@dev.invalid' ELSE '+595 900 ' || lpad(id::text,6,'0') END
      WHERE field IN ('phone','whatsapp','email')$q$; END IF;
  -- Fotos previas de fichas: sin token de reclamo (los contactos los limpia la capa genérica)
  IF to_regclass('claim_snapshots') IS NOT NULL THEN
    EXECUTE $q$UPDATE claim_snapshots SET snapshot = snapshot - 'claim_token' - 'claim_token_at' - 'phone_extra'$q$; END IF;
  IF to_regclass('business_merges') IS NOT NULL THEN
    EXECUTE $q$UPDATE business_merges SET
      survivor_before  = survivor_before  - 'claim_token' - 'claim_token_at' - 'phone_extra',
      duplicate_before = duplicate_before - 'claim_token' - 'claim_token_at' - 'phone_extra'$q$; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_requests' AND column_name='tpago_link') THEN
    EXECUTE 'UPDATE plan_requests SET tpago_link = NULL'; END IF;
END $$;

-- ── 2) Genérica: todas las columnas de texto/json de todas las tablas ─────────
-- Lista blanca: datos públicos o de configuración (se reportan, no se tocan).
CREATE TEMP TABLE _anon_keep (t text, c text) ON COMMIT DROP;
INSERT INTO _anon_keep VALUES
  ('businesses','name'),('businesses','trade_name'),('businesses','description'),('businesses','address'),
  ('businesses','hours'),('businesses','hours_json'),('businesses','website'),('businesses','ruc'),('businesses','ruc_parent'),
  ('businesses','social_facebook'),('businesses','social_instagram'),('businesses','social_linkedin'),
  ('businesses','social_tiktok'),('businesses','social_twitter'),('businesses','social_youtube'),
  ('reviews','author_name'),('reviews','comment'),('reviews','owner_reply'),
  ('site_config','*'),('categories','*'),('cities','*'),('plans','*'),('services','*'),('promotions','*'),
  ('business_gallery','*'),('spatial_ref_sys','*'),
  ('business_embedding','*');   -- vectores + content_hash (si se tocan, el backfill re-embebe todo contra ai-embed de prod)

CREATE TEMP TABLE _anon_cols ON COMMIT DROP AS
SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS c, c.data_type AS dt, (c.is_nullable = 'YES') AS nullable,
       CASE
         WHEN c.column_name ~* '(^|_)ip_hash$'                                             THEN 'iphash'
         WHEN c.column_name ~* '(token|secret|otp|password|(^|_)hash$)'
              AND c.column_name !~* 'content_hash'                                          THEN 'token'
         WHEN c.data_type = 'inet' OR c.column_name ~* '^(ip|ip_address|client_ip|remote_ip|ip_addr)$' THEN 'ip'
         ELSE 'text' END AS kind,
       EXISTS (SELECT 1 FROM _anon_keep k WHERE k.t = c.table_name AND k.c IN (c.column_name, '*')) AS keep
  FROM information_schema.columns c
  JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
 WHERE c.table_schema NOT IN ('pg_catalog','information_schema','tiger','tiger_data','topology')
   AND c.data_type IN ('text','character varying','json','jsonb','inet')
   AND c.table_name NOT LIKE '\_anon\_%';

DO $$
DECLARE r record; rx record; q text; n bigint;
BEGIN
  SELECT * INTO rx FROM _anon_rx;
  FOR r IN SELECT * FROM _anon_cols WHERE NOT keep ORDER BY s, t, c LOOP
    IF r.kind = 'iphash' THEN
      -- se re-hashea con sal: sigue sirviendo para contar únicos, pero ya no se puede revertir a la IP
      q := format('UPDATE %I.%I SET %I = md5(%I || ''|retopa-dev'') WHERE %I IS NOT NULL', r.s, r.t, r.c, r.c, r.c);
    ELSIF r.kind = 'token' THEN
      IF r.t IN ('users','admin_users') AND r.c = 'password_hash' THEN CONTINUE; END IF;   -- ya es la de dev
      IF r.nullable THEN q := format('UPDATE %I.%I SET %I = NULL WHERE %I IS NOT NULL', r.s, r.t, r.c, r.c);
      ELSE q := format('UPDATE %I.%I SET %I = ''dev-'' || md5(random()::text) WHERE %I NOT LIKE ''dev-%%''', r.s, r.t, r.c, r.c); END IF;
    ELSIF r.kind = 'ip' THEN
      IF NOT r.nullable THEN CONTINUE; END IF;
      q := format('UPDATE %I.%I SET %I = NULL WHERE %I IS NOT NULL', r.s, r.t, r.c, r.c);
    ELSE
      q := format('UPDATE %I.%I SET %I = regexp_replace(regexp_replace(%I::text, %L, %L, ''g''), %L, %L, ''g'')::%s WHERE %I::text ~ %L OR %I::text ~ %L',
                  r.s, r.t, r.c, r.c, rx.email, 'anon@dev.invalid', rx.phone, '0900000000',
                  CASE r.dt WHEN 'character varying' THEN 'varchar' ELSE r.dt END,
                  r.c, rx.email, r.c, rx.phone);
    END IF;
    EXECUTE q;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'genérica: %.% (%) → % filas', r.t, r.c, r.kind, n; END IF;
  END LOOP;
END $$;

-- ── Verificación (sobre TODO): fugas = 0, si no, ERROR ────────────────────────
CREATE TEMP TABLE _anon_report (k text, v bigint, keep boolean) ON COMMIT DROP;
DO $$
DECLARE r record; rx record; n bigint;
BEGIN
  SELECT * INTO rx FROM _anon_rx;
  FOR r IN SELECT * FROM _anon_cols ORDER BY s, t, c LOOP
    IF r.kind = 'text' THEN
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I::text ~ %L OR %I::text ~ %L', r.s, r.t, r.c, rx.email, r.c, rx.phone) INTO n;
    ELSIF r.kind = 'token' AND NOT (r.t IN ('users','admin_users') AND r.c = 'password_hash') THEN
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I IS NOT NULL AND %I::text NOT LIKE ''dev-%%''', r.s, r.t, r.c, r.c) INTO n;
    ELSIF r.kind = 'ip' AND r.nullable THEN
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I IS NOT NULL', r.s, r.t, r.c) INTO n;
    ELSE n := 0; END IF;
    IF n > 0 THEN INSERT INTO _anon_report VALUES (r.t || '.' || r.c || ' [' || r.kind || ']', n, r.keep); END IF;
  END LOOP;
  -- contraseñas: todas la de dev
  INSERT INTO _anon_report SELECT 'users.password_hash ≠ dev', count(*), false FROM users
    WHERE password_hash <> '$2b$10$oCtsUdsl40hx4Hs9j2vnQ.I5Df88RS5p7AajVHW10.atfkTj9/kAO' HAVING count(*) > 0;
  INSERT INTO _anon_report SELECT 'admin_users.password_hash ≠ dev', count(*), false FROM admin_users
    WHERE password_hash <> '$2b$10$oCtsUdsl40hx4Hs9j2vnQ.I5Df88RS5p7AajVHW10.atfkTj9/kAO' HAVING count(*) > 0;
  INSERT INTO _anon_report SELECT 'email_log (filas)', count(*), false FROM email_log HAVING count(*) > 0;
END $$;

\echo '── Datos públicos que se conservan a propósito (informativo) ──'
SELECT k AS columna, v AS filas_con_correo_o_celular FROM _anon_report WHERE keep ORDER BY k;
\echo '── FUGAS (tiene que salir vacío) ──'
SELECT k AS columna, v AS filas FROM _anon_report WHERE NOT keep ORDER BY k;
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM _anon_report WHERE NOT keep;
  IF n > 0 THEN RAISE EXCEPTION 'ANONIMIZACIÓN INCOMPLETA: % columnas con datos reales (ver arriba). No se aplicó nada.', n; END IF;
  RAISE NOTICE 'Verificación OK: 0 fugas.';
END $$;

COMMIT;
