-- ============================================
-- RetoPA — Migración 022: Redes Sociales
-- Sprint 3: Social links por plan
-- Aplicar: docker exec -i retopa-db psql -U retopa -d retopa < sql/022_social_networks.sql
-- ============================================

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS social_instagram VARCHAR(255),
    ADD COLUMN IF NOT EXISTS social_facebook  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS social_tiktok    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS social_linkedin  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS social_twitter   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS social_youtube   VARCHAR(255);

-- Verificar
SELECT column_name FROM information_schema.columns
WHERE table_name = 'businesses'
  AND column_name LIKE 'social_%'
ORDER BY column_name;
