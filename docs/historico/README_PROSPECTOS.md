# Prospectos — despliegue

    cd /opt
    tar -xzf retopa_prospectos.tar.gz
    cd /opt/retopa
    docker exec -i retopa-db psql -U retopa -d retopa < sql/2026-09-07_prospect_outreach.sql
    python3 _deploy/aplicar_prospectos.py
    docker compose up -d --build backend frontend

Queda en el menú bajo GESTIÓN COMERCIAL → Prospectos.

## Cómo funciona

La cola trae fichas SIN reclamar, con teléfono MÓVIL válido, con al menos
20 visitas en 30 días, y fuera del cooldown de 60 días. Todo configurable
en Ajustes.

"Abrir WhatsApp" abre el chat con el mensaje ya escrito. Lo leés, lo mandás
vos, volvés y apretás "Marcar enviado". El sistema no manda nada solo.

En Historial marcás qué pasó: respondió / reclamó / no le interesa / número
malo. De ahí sale la tasa de conversión real.

## Filtro que conviene conocer

La vista exige móvil (`^0?9[0-9]{8}$`) porque WhatsApp no funciona en fijo.
De tus 158 fichas con 20+ visitas, las que tengan solo línea fija no van a
aparecer. Para verlas:

    SELECT COUNT(*) FROM businesses b
    JOIN LATERAL (SELECT COUNT(*) c FROM business_views v
                  WHERE v.business_id=b.id AND v.viewed_at >= NOW()-INTERVAL '30 days') v ON TRUE
    WHERE b.claim_status IS DISTINCT FROM 'approved' AND v.c >= 20
      AND REGEXP_REPLACE(b.phone,'\D','','g') !~ '^0?9[0-9]{8}$';

Esas son las que necesitan llamada, no WhatsApp.

## Medición

El link lleva `utm_source=wa&utm_campaign=claim`. A los 15 días:

    SELECT * FROM v_prospectos_embudo;
