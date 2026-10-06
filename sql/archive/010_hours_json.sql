-- RetoPA v2.6 S3.1 — Migration: hours_json
-- Agrega columna JSONB hours_json manteniendo hours TEXT intacto (backward compat)
-- Estructura por día: { "open":"HH:MM", "close":"HH:MM", "h24":bool, "closed":bool }

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS hours_json JSONB;

-- 11345 | Canchita Ña Mercedes | Lun-Sáb 18:00-23:00 | Dom 18:00-22:00
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"18:00","close":"23:00","h24":false,"closed":false},
  "Mar": {"open":"18:00","close":"23:00","h24":false,"closed":false},
  "Mié": {"open":"18:00","close":"23:00","h24":false,"closed":false},
  "Jue": {"open":"18:00","close":"23:00","h24":false,"closed":false},
  "Vie": {"open":"18:00","close":"23:00","h24":false,"closed":false},
  "Sáb": {"open":"18:00","close":"23:00","h24":false,"closed":false},
  "Dom": {"open":"18:00","close":"22:00","h24":false,"closed":false}
}'::jsonb WHERE id = 11345;

-- 11342 | Che Lucero | Lunes a lunes (= todos los días, sin horario especificado → abierto sin cierre fijo)
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Mar": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Mié": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Jue": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Vie": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Sáb": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Dom": {"open":"00:00","close":"23:59","h24":true,"closed":false}
}'::jsonb WHERE id = 11342;

-- 11347 | Esteban Gracia | Lun-Dom 24h
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Mar": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Mié": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Jue": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Vie": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Sáb": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Dom": {"open":"00:00","close":"23:59","h24":true,"closed":false}
}'::jsonb WHERE id = 11347;

-- 11341 | HEPTA E.A.S. | Lun 08:00-17:00
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"08:00","close":"17:00","h24":false,"closed":false},
  "Mar": {"open":"08:00","close":"17:00","h24":false,"closed":true},
  "Mié": {"open":"08:00","close":"17:00","h24":false,"closed":true},
  "Jue": {"open":"08:00","close":"17:00","h24":false,"closed":true},
  "Vie": {"open":"08:00","close":"17:00","h24":false,"closed":true},
  "Sáb": {"closed":true},
  "Dom": {"closed":true}
}'::jsonb WHERE id = 11341;

-- 11346 | JC Entrenamiento Funcional | Lun-Vie 06:00-21:00 | Sáb 06:00-12:00
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"06:00","close":"21:00","h24":false,"closed":false},
  "Mar": {"open":"06:00","close":"21:00","h24":false,"closed":false},
  "Mié": {"open":"06:00","close":"21:00","h24":false,"closed":false},
  "Jue": {"open":"06:00","close":"21:00","h24":false,"closed":false},
  "Vie": {"open":"06:00","close":"21:00","h24":false,"closed":false},
  "Sáb": {"open":"06:00","close":"12:00","h24":false,"closed":false},
  "Dom": {"closed":true}
}'::jsonb WHERE id = 11346;

-- 7840 | Parasoft S.R.L. | Lun-Vie: 08:00 - 18:00
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"08:00","close":"18:00","h24":false,"closed":false},
  "Mar": {"open":"08:00","close":"18:00","h24":false,"closed":false},
  "Mié": {"open":"08:00","close":"18:00","h24":false,"closed":false},
  "Jue": {"open":"08:00","close":"18:00","h24":false,"closed":false},
  "Vie": {"open":"08:00","close":"18:00","h24":false,"closed":false},
  "Sáb": {"closed":true},
  "Dom": {"closed":true}
}'::jsonb WHERE id = 7840;

-- 8734 | Sanatorio Britanico S.A. | Lun-Dom 24h
UPDATE businesses SET hours_json = '{
  "Lun": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Mar": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Mié": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Jue": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Vie": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Sáb": {"open":"00:00","close":"23:59","h24":true,"closed":false},
  "Dom": {"open":"00:00","close":"23:59","h24":true,"closed":false}
}'::jsonb WHERE id = 8734;

COMMIT;
