Contexto: necesitamos el resultado real de las tandas de prospección por WhatsApp ya realizadas (~109 + ~86 contactos, sep-oct 2026). Es el dato #1 que pide el diagnóstico de Etapa 1. Nada de escribir en la base: solo SELECT.

Paso 1 — Diagnóstico del esquema (antes de cualquier cruce):

Describí prospect_wa_outreach y la tabla vieja prospect_outreach (62 filas): columnas, cómo se identifica la ficha (business_id / teléfono), qué estados/fechas guarda cada una (enviado, respondió, etc.), y si las tandas son distinguibles (campo lote/fecha).
Confirmá cómo se vincula un reclamo a la ficha: claim_events + claim_requests + dueño en businesses/users (first_seen_at), y qué dan las vistas v_claim_embudo, v_duenos_activacion y las v_prospectos_*.
Reportame qué se puede medir y qué no (ej.: si “respondió” no se registra, decilo).

Paso 2 — El cruce (por tanda, y total):
Para cada ficha contactada en cada tanda: ¿reclamó? (fecha) → ¿se aprobó? → ¿el dueño entró alguna vez al portal? → ¿completó la ficha? (teléfono/descripción/horarios/fotos vs. antes) → ¿compró algo? (plan/boost). Incluir también reclamos del período que NO venían de las tandas (orgánicos), para separar efecto-tanda de efecto-orgánico.

Paso 3 — Entregable: un informe en Markdown con:

Tabla resumen por tanda: contactados → (respondieron, si existe el dato) → reclamaron → aprobados → entraron al portal → completaron → compraron, con %.
Lista nominal de las fichas que reclamaron/gestionaron (nombre, ciudad, rubro, fecha, estado actual) — las vamos a trabajar una por una.
Comparación tanda vs. orgánico en el mismo período.
Qué quedó sin poder medirse y por qué.

Guardá el informe como archivo y pasámelo para subirlo al Project.
