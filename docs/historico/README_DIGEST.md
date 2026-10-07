# Digest diario de prospectos

    cd /opt && tar -xzf retopa_digest_prospectos.tar.gz && cd /opt/retopa
    docker exec -i retopa-db psql -U retopa -d retopa < sql/2026-09-07c_prospect_total.sql
    python3 _deploy/aplicar_digest_prospectos.py
    docker compose up -d --build backend

## Configurar destinatario

    docker exec -i retopa-db psql -U retopa -d retopa -c "
    INSERT INTO site_config (key,value) VALUES
      ('prospect_digest_to','egracia@hepta.com.py'),
      ('prospect_digest_min','5')
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;"

`prospect_digest_to` admite varios separados por coma.
`prospect_digest_min` es el piso: si la cola tiene menos, no manda correo.
Sirve para que el digest no se vuelva ruido de fondo.

## Probar ahora

    docker exec retopa-backend node src/jobs/prospectDigest.js

## Agendar (cron del host, igual que salesSignals)

    crontab -e

    # 07:30 — resumen de prospectos
    30 7 * * 1-5 docker exec retopa-backend node src/jobs/prospectDigest.js >> /var/log/retopa-prospect.log 2>&1

Lunes a viernes. El fin de semana no vas a contactar a nadie, así que un
correo que no se acciona solo te entrena a ignorarlo.

Si ya tenés `salesSignals` agendado, dejalo antes: primero se generan las
señales de fichas reclamadas, después el resumen de las no reclamadas.

## Qué cambió en la vista

Elegibilidad por visitas **totales** (nadie se escurre de la cola por el paso
del tiempo), prioridad por visitas de **30 días** (contactás primero al que
está caliente ahora).

La plantilla del mensaje quedó con los dos números: `{visitas}` es el total
y `{visitas_30d}` el del mes. Editable en Prospectos → Ajustes.

El piso ahora es `prospect_min_visitas_total` (20). El viejo
`prospect_min_visitas` ya no se usa.
