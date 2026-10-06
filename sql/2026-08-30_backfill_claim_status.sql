-- Backfill de reclamos por FORMULARIO público que quedaron solo como lead
-- (service_leads.service_type='claim') sin marcar la ficha → no aparecían en el
-- panel Claims. Les setea claim_status='pending' para que se gestionen ahí.
-- Seguro / idempotente: solo toca fichas NO verificadas y sin claim_status, que
-- tengan al menos un lead de reclamo activo.
UPDATE businesses b
SET claim_status = 'pending',
    claimed_at   = COALESCE(b.claimed_at, NOW()),
    updated_at   = NOW()
WHERE b.claim_status IS NULL
  AND b.verified = FALSE
  AND EXISTS (
    SELECT 1 FROM service_leads sl
    WHERE sl.business_id = b.id
      AND sl.service_type = 'claim'
      AND sl.status IN ('pending', 'new')
  );
