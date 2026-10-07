# Fix prospectos — link de reclamo + fichas con dueño

    cd /opt && tar -xzf retopa_prospectos_fix.tar.gz && cd /opt/retopa
    docker exec -i retopa-db psql -U retopa -d retopa < sql/2026-09-07b_prospect_fix.sql
    docker compose up -d --build backend

Solo backend: el frontend no cambió.

## Qué se arregló

**1. El link de reclamo.** Ahora es `/reclamar/?token=<claim_token>`, que es
lo que la página espera. Antes iba `?b=slug`, inválido siempre.
El token se genera al armar la cola y dura 30 días. Si la ficha ya tiene uno
vigente se reutiliza, así un mensaje ya enviado no se invalida al recargar.

**2. La detección de dueño.** El chequeo autoritativo es `user_businesses`
(`is_owner`), no `claim_status`/`claimed_by`: esos dos solo se llenan si la
ficha pasó por el flujo de reclamo. Las creadas con dueño de origen — como
HEPTA — los tienen NULL y por eso se colaban.

Ahora se excluye por cuatro vías: vínculo en `user_businesses`, claim en
cualquier estado, plan distinto de `basic`, y `verified`.

## Sobre el filtro `verified`

Puede estar marcando *calidad de dato verificada por vos* y no *tiene dueño*.
Si es así, te está sacando prospectos legítimos. El diagnóstico está comentado
al final del .sql: si `verificadas` es mucho mayor que `con_dueno_vinculado`,
comentá la condición 4 y recreá la vista.

## Verificar

    SELECT COUNT(*) FROM v_prospectos_claim;
    SELECT COUNT(*) FROM v_prospectos_claim WHERE negocio ILIKE '%hepta%';   -- debe dar 0
