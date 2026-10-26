# RetoPA — Resultado real de las tandas de prospección por WhatsApp (sep–oct 2026)

**Fecha de corte:** 26/10/2026 · **Fuente:** base de producción, consultada **solo con SELECT** (sesión `default_transaction_read_only=on`) + dump del 08/10/2026 (`backups/retopa-pre-taxonomia-20261008_0938.dump`) como foto del "antes" de cada ficha.
**Consultas:** `sql/consultas/2026-10-26_tandas_wa_solo_lectura.sql`

---

## 0. Resumen en 6 líneas

1. **Tanda 1 (fichas `prospeccion_agente`, 105 fichas, contacto 21/09–12/10): 103 fichas contactadas → 18 reclamos (17,5 %) → 18 aprobados → 10 entraron al portal → 4 completaron la ficha → 0 compras.**
2. Atribución fuerte: en 10 de los 14 reclamos con fecha de contacto confiable, el reclamo fue **el mismo día** del mensaje (el resto: 1 a 8 días).
3. **Tanda 2 (`prospeccion_agente_t2`, 86 fichas): solo se enviaron 5** (13/10, 18/10, 22/10), con 0 reclamos. Las otras 81 están **pendientes de envío**, así que la T2 todavía no se puede evaluar.
4. En el mismo período, **el reclamo orgánico de fichas existentes fue de 2 en todo el directorio** (~14.700 fichas activas). La tanda 1 explica **18 de cada 20** reclamos de fichas existentes.
5. El cuello de botella ya no es el reclamo sino la **activación**: 8 de los 18 dueños de la tanda 1 nunca entraron al portal, y 13 de 18 fichas siguen igual que como las cargamos (20 % de completitud).
6. "Respondió" **no se registró nunca**: las 103 filas de seguimiento siguen en `enviado`.

---

## 1. Diagnóstico del esquema

### 1.1 `prospect_wa_outreach` (panel de prospectos, el que se usó en T1/T2)

| Columna | Qué guarda |
|---|---|
| `whatsapp` (UNIQUE) | Clave del contacto: el **número**, no la ficha (`595XXXXXXXXX`). Varias fichas con el mismo número = un solo contacto. |
| `estado` | `pendiente / enviado / respondio / reclamo / rechazo / no_es` |
| `fecha_contacto` | Se pisa con `NOW()` **cada vez** que se marca `enviado` → es la *última* marca, no el primer envío. |
| `notas`, `created_at`, `updated_at` | Sin uso real (0 notas). |

- **No tiene `business_id` ni campo de tanda/lote.** La ficha se obtiene cruzando el número con `businesses.whatsapp`; la tanda, por `businesses.source` (`prospeccion_agente` = T1, cargadas 18/09; `prospeccion_agente_t2` = T2, cargadas 13/10).
- **Bug confirmado (fichas que "vuelven solas" a Pendiente):** el panel lee el estado con `prospect_wa_outreach.whatsapp = businesses.whatsapp` (texto exacto), pero guarda el número solo con dígitos (`595…`). Cuando el dueño guarda su ficha, el portal normaliza el WhatsApp a `+595…` (`utils/phone.js`). Desde ese momento el cruce no coincide y la ficha aparece como Pendiente aunque ya se le haya enviado el mensaje. Cada nueva marca manual actualiza la fila de `595…` (y pisa `fecha_contacto`), pero el panel nunca la vuelve a encontrar. Hoy afecta a las 4 fichas de T1 con dueño que editaron su WhatsApp (Cerrajería Capiatá, JC Gómez, S.C.U., Servi Central); en todo el directorio hay 27 fichas con el WhatsApp en formato `+595…`. En este informe el cruce se hizo por **los últimos 9 dígitos** (de `whatsapp` o `phone`) para recuperarlas.
- Estado actual: **103 filas, las 103 en `enviado`.** Nadie pasó a `respondio`, `reclamo`, `rechazo` ni `no_es`.
- Envíos por día (fecha de la última marca, hora PY): 21/09: 20 · 25/09: 34 · 01/10: 15 · 05/10: 12 · 12/10: 13 · 13/10: 3 · 18/10: 4 (re-marcas) · 22/10: 2.
- 1 número (contactado 25/09) ya no coincide con ninguna ficha.

### 1.2 `prospect_outreach` (tabla vieja, 62 filas) — "Tanda 0"

- Una fila por **ficha** (`business_id` + `telefono`), con `mensaje` (texto enviado), `enviado_at`, `enviado_por`, `estado` (`enviado/respondio/reclamo/no_interesa/invalido`), `cerrado_at`.
- 62 envíos del 09/09 al 15/09 (40 + 3 + 19), fichas DNCP-SIPE (35), manual (13), import_hilagro (13), import_nil (1).
- **Los 62 siguen en `enviado` y `cerrado_at` vacío**: tampoco se registró ninguna respuesta. Por eso `v_prospectos_embudo` muestra "62 contactados / 0 reclamaron", lo cual no es cierto (ver §2).
- No tiene relación con T1/T2 (ninguna ficha en común).

### 1.3 Cómo se vincula un reclamo a la ficha y al dueño

| Pieza | Qué aporta | Límite |
|---|---|---|
| `businesses.claim_status / claimed_at / claimed_by / claim_method` | Reclamo y aprobación (`approved`). | `claim_method` vacío en los reclamos anteriores al 13/10. |
| `user_businesses` (`is_owner`, `created_at`, `delegated_by`) | Fuente de verdad de la propiedad. Fecha de alta del dueño. `delegated_by` = un admin lo asignó a mano. | — |
| `users.last_seen_at` | Último ingreso al portal (≠ NULL ⇒ entró alguna vez). | **Se pisa**: solo da la última vez. |
| `users.first_seen_at` | Primer ingreso real. | Existe desde el 12/10; queda NULL para quien entró antes. |
| `claim_events` | Embudo paso a paso (link abierto, formulario, envío, aprobado) con `source` (utm). | **Arranca el 13/10** (41 eventos). Ningún evento con `source='wa'`: no hay ningún clic del link de WhatsApp registrado. |
| `claim_requests` | Pedidos desde el botón "Reclamar" de la ficha (código por WhatsApp o revisión manual). | 6 pedidos, todos desde el 18/10. `sent` = el admin mandó el enlace; no dice si se usó. |
| `claim_snapshots` | Foto de la ficha al reclamar (para revertir). | 1 sola fila (desde el 22/10). |
| `email_log` | Correos del flujo (recibido, aprobado/activá tu cuenta, primeros pasos, avisos de contacto por WhatsApp). | Útil para fechar la aprobación. |
| `plan_requests`, `promotion_boosts`, `plan_grants` | Compras de plan / boost; regalos de plan (`reason='founder'`). | — |
| `businesses.boost_until` | **No es compra**: es el boost gratis de 7 días que se otorga solo al llegar al 100 % de completitud (`routes/client.js`). Sirve como prueba de que el dueño completó la ficha. | — |

### 1.4 Vistas

- **`v_claim_embudo`**: últimos 30 días, por origen (utm del primer link abierto). Hoy: 17 fichas vistas desde el botón de la ficha, 6 envíos, 2 aprobados, 1 dueño entró. **No aparece ningún origen `wa`** y no cubre la T1 (anterior a la instrumentación).
- **`v_duenos_activacion`**: cuentas de los últimos 90 días: 41 cuentas, 36 con ficha, 22 entraron alguna vez, 4 con correo verificado, 3 altas sin activar, 20 con link de activación vencido.
- **`v_prospectos_embudo`**: solo lee la tabla vieja; da 0 % de reclamo porque nunca se actualizó el estado. **No sirve como medición.**
- **`v_prospectos_claim`**: cola de candidatos (hoy 68 fichas). No mide resultados.

### 1.5 Qué se puede medir y qué no

| Paso | ¿Medible? | Cómo |
|---|---|---|
| Contactado | Sí (T0, T1). T2: 5 enviadas, 81 pendientes. | Tablas de outreach. |
| Respondió | **No.** | Nunca se cargó. |
| Abrió el link | **No** para T1; **sin datos** para T2. | `claim_events` arranca el 13/10 y no registró ningún `wa`. |
| Reclamó (fecha) | Sí. | `claimed_at` / `user_businesses.created_at`. |
| Aprobado | Sí. | `claim_status='approved'` + correo `claimActivate`. |
| Entró al portal | Sí/no (al menos una vez) y último ingreso. | `last_seen_at`. No se puede contar cuántas veces. |
| Completó | Sí, comparando con el dump del 08/10 o con el perfil de importación de la tanda. | No hay registro de cambios por usuario; se atribuye al dueño (validado: toda ficha con datos agregados tiene dueño, salvo 1 caso, ver §5). |
| Compró | Sí. | Plan/boost pagos. **No hubo ninguno.** |

---

## 2. Tabla resumen por tanda

Base de los % = fichas contactadas; entre paréntesis, % sobre el paso anterior.

| Tanda | Fichas en la tanda | Contactadas | Respondieron | Reclamaron | Aprobados | Entraron al portal | Completaron | Compraron |
|---|---|---|---|---|---|---|---|---|
| **T0** (tabla vieja, 09–15/09) | 62 | 62 | s/d | 1 (1,6 %)¹ | 1 (1,6 %) | 1 (1,6 %) | 0 | 0 |
| **T1** (`prospeccion_agente`, 21/09–12/10) | 105 | **103** (97 números)² | s/d | **18 (17,5 %)** | **18 (17,5 %)** (100 %) | **10 (9,7 %)** (56 %) | **4 (3,9 %)** (22 % de aprobados)³ | **0** |
| **T2** (`prospeccion_agente_t2`, desde 13/10) | 86 | **5** (81 pendientes de envío)⁴ | s/d | 0 | 0 | 0 | 0 | 0 |
| **Total tandas** | 253 | 170 | s/d | 19 (11,2 %) | 19 (11,2 %) | 11 (6,5 %) | 4 (2,4 %) | 0 |

¹ COMERCIAL SAN JOSE ABASTO NORTE: reclamó el 22/10, **37 días** después del mensaje y por el botón de la ficha. Más probable orgánico que efecto de la tanda.
² Las 2 no contactadas no tienen WhatsApp cargado (Veterinaria Super Mascota, Agroveterinaria San Pedro).
³ Completaron = agregaron descripción/horarios/logo/portada respecto de cómo se cargó la ficha. Más 1 parcial (Maxi Refrigeración: logo + correo). Los otros 13 siguen en 20 % de completitud, idénticos a la importación.
⁴ Confirmado: solo se enviaron 5; las otras 81 siguen pendientes. Una de ellas (Gomería J.G) pidió reclamar por su cuenta desde el botón de la ficha (ver §3.3).

**Detalle "entraron al portal" en T1:** de los 10, 5 tienen su último ingreso el mismo día del alta (es decir, no volvieron), 4 volvieron otro día (los 4 el 13/10) y 1 (Maxi Refrigeración) editó su ficha pero su ingreso no quedó registrado (ver ⁶).

**Velocidad del reclamo en T1** (14 casos con fecha de contacto confiable): 10 el mismo día, 2 al día siguiente, 1 a los 4, 6 y 8 días. Aprobación: entre minutos y ~4 h después del envío del formulario.

---

## 3. Lista nominal

### 3.1 Tanda 1 — las 18 fichas reclamadas (para trabajar una por una)

Completitud = `fn_profile_completion` hoy. La importación de T1 deja las fichas en 20 %.

| # | Ficha (id) | Ciudad | Rubro | Contacto WA | Reclamo | Último ingreso portal | Completitud | Qué cambió vs. carga | Compra | Estado / próximo paso |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cerrajería Capiatá (15257) | Capiatá | Cerrajería | ≤21/09⁵ | 21/09 | 24/09 | 80 % | desc., horarios, logo, portada | No (Destacada **regalo** founder hasta 23/12) | Activa. Asignada a mano por admin. Vence regalo 23/12 → candidata a venta. |
| 2 | Cerrajería GB 24 Horas (15250) | San Lorenzo | Cerrajería | 21/09 | 21/09 | nunca | 20 % | nada | No | Aprobado, nunca entró. |
| 3 | Cerrajería 24 Horas Asunción (15253) | Asunción | Cerrajería | 21/09 | 22/09 | nunca | 20 % | nada | No | Aprobado, nunca entró. |
| 4 | Electricista Domiciliario (Luque) (15309) | Luque | Electricidad | 25/09 | 25/09 | nunca | 20 % | nada | No | **Cuenta sin activar** (sin contraseña). |
| 5 | Electro Car's (15231) | Lambaré | Talleres mecánicos | 25/09 | 25/09 | nunca | 20 % | nada | No | Aprobado, nunca entró. Recibió contactos por WA. |
| 6 | JC Gómez Electricidad y Plomería (15308) | Fernando de la Mora | Electricidad | ≤25/09⁵ | 25/09 | 25/09 | 60 % | horarios, logo, portada | No | Entró solo el día del alta. Falta descripción. |
| 7 | Cerrajería Jack 4 (15252) | Ñemby | Cerrajería | 25/09 | 25/09 | nunca | 20 % | nada | No | Aprobado, nunca entró. |
| 8 | Hospital de Especialidades Veterinaria (15287) | Mariano Roque Alonso | Veterinarias | 25/09 | 25/09 | nunca | 20 % | nada | No | Aprobado, nunca entró. |
| 9 | JH Multiservice Climatización (15226) | Luque | Aire acondicionado | 25/09 | 29/09 | 13/10 | 20 % | nada | No | Volvió al portal pero no editó. |
| 10 | Los Skipper Técnico de A/A (15215) | Luque | Aire acondicionado | 01/10 | 01/10 | nunca | 20 % | nada | No | Aprobado, nunca entró. |
| 11 | Cerrajería Paraguaya 24 Horas (15239) | Asunción | Cerrajería | 25/09 | 01/10 | 13/10 | 20 % | nada | No | Volvió al portal pero no editó. |
| 12 | Maxi Refrigeración, Electricidad y Lavarropas (15223) | Asunción | Aire acondicionado | 01/10 | 02/10 | sí, sin registro⁶ | 45 % | logo, correo | No | Parcial. |
| 13 | S.C.U. Servicio de Cerrajería de Urgencias (15248) | Lambaré | Cerrajería | ≤05/10⁵ | 05/10 | 13/10 | 65 % | descripción, horarios | No | Completó parcialmente. Falta logo/portada. |
| 14 | Técnico en Electricidad, Refrigeración y Plomería a Domicilio (15305) | Fernando de la Mora | Electricidad | 05/10 | 05/10 | 05/10 | 20 % | nada | No | Entró solo el día del alta. |
| 15 | Plomero YA (15310) | Asunción | Plomería | 01/10 | 09/10 | 13/10 | 20 % | nada | No | Volvió al portal pero no editó. |
| 16 | Veterinaria Samper Urgencias 24hs (15279) | Fernando de la Mora | Veterinarias | 12/10 | 12/10 | 12/10 | 20 % | nada | No | Entró solo el día del alta. |
| 17 | Veterinaria Capiatá (15275) | Capiatá | Veterinarias | 12/10 | 12/10 | nunca | 20 % | nada | No | Aprobado, nunca entró. |
| 18 | Servi Central Refrigeración (15208) | Lambaré | Aire acondicionado | ≤12/10⁵ | 12/10 | 12/10 | **100 %** | todo (desc., horarios, logo, portada, web, correo) | No (boost gratis por 100 %, vencido 19/10) | **Mejor caso.** Candidato natural a plan/boost pago. |

⁵ Fecha de contacto real desconocida: la marca de envío se pisó el 18/10 (cambio de formato del número, ver §1.1). El contacto fue anterior al reclamo.
⁶ El dueño editó la ficha (logo y correo, 13/10), así que entró al portal, pero `last_seen_at` quedó vacío: hay algún camino de ingreso que no registra presencia (a revisar). Por eso "entraron al portal" puede estar algo subestimado.

**Resumen operativo T1:** 8 nunca entraron (1 con la cuenta sin activar) · 2 entraron solo el día del alta sin editar · 3 volvieron otro día sin editar · 2 completaron bien (Servi Central, Cerrajería Capiatá) · 3 parciales (JC Gómez, S.C.U. y Maxi Refrigeración, esta última sin registro de ingreso).

### 3.2 Tanda 0 — reclamada

| Ficha (id) | Ciudad | Rubro | Contacto | Reclamo | Portal | Completitud | Estado |
|---|---|---|---|---|---|---|---|
| COMERCIAL SAN JOSE ABASTO NORTE (11623) | (sin ciudad) | Adiestramiento (rubro dudoso) | 15/09 | 22/10 (botón de la ficha, auto-aprobado) | 22/10 | 30 % | Sin cambios. Revisar el rubro. |

### 3.3 Pedidos de reclamo sin terminar (botón de la ficha, desde 18/10)

El admin les mandó el enlace (`claim_requests.status='sent'`), pero **ninguno lo usó todavía**: siguen sin dueño.

| Ficha (id) | Ciudad | Rubro | Origen | Pedido |
|---|---|---|---|---|
| Gomería J.G (15332) | Capiatá | Gomerías | **T2** (todavía no contactada) | 18/10 (código WA + revisión) |
| ECO RECICLADOS S.A. (ECORESA) (13411) | San Lorenzo | Tiendas y Comercios | DNCP-SIPE | 19/10 (revisión) |
| MINIMERCADO MIJOLI (11781) | (sin ciudad) | Supermercados | import_hilagro | 19/10 (código WA) |
| FAMILY ELECTRONIC (13211) | Ñemby | Tiendas y Comercios | DNCP-SIPE | 21/10 (revisión) |

### 3.4 Orgánicos del período (21/09–26/10, fuera de las tandas)

| Ficha (id) | Ciudad | Rubro | Tipo | Fecha | Portal | Completitud | Estado |
|---|---|---|---|---|---|---|---|
| Supermercado Guarani S.R.L. (12552) | (sin ciudad) | Supermercados | Reclamo de ficha existente | 23/09 | nunca | 30 % | Sin cambios. |
| San Nicolas srl (5864) | Asunción | Servicios Profesionales | Reclamo de ficha existente | 07/10 | nunca | 0 % | Sin cambios; ficha casi vacía. |
| DieBen Agencia Creativa (15402) | Luque | Marketing digital | Alta nueva | 13/10 | 15/10 | 45 % | Parcial. |
| Hotel Ramonita (15403) | Ayolas | Hoteles | Alta nueva (aprobada por admin) | 14/10 | nunca | 40 % | Cuenta sin contraseña. |
| Metal Project Metalúrgica Industrial (15404) | Limpio | Herrería y metalurgia | Alta nueva | 15/10 | 15/10 | 90 % | Casi completa. |
| El Empanadero (15405) | San Antonio | Despensas y minimercados | Alta nueva (asignada por admin) | 17/10 | 17/10 | 45 % | Cuenta sin activar. |
| QTech / Quantum Tech S.A (15406) | Asunción | Telecomunicaciones | Alta nueva (registro web) | 22/10 | 22/10 | **100 %** | Boost gratis activo hasta 29/10. |

Antes del período (referencia): SM Ingeniería (03/09), MF – Marcos Frutos (12/09), Cerrajería San Miguel (alta 18/09).

---

## 4. Tanda vs. orgánico (mismo período, 21/09–26/10)

| | Universo | Reclamos de fichas existentes | Aprobados | Entraron al portal | Completaron (≥ 60 %) | Compraron |
|---|---|---|---|---|---|---|
| **T1 (con mensaje)** | 103 contactadas | **18** (17,5 %) | 18 | 10 (56 %) | 4 (22 %) | 0 |
| **Orgánico — reclamos** | ~14.700 fichas activas sin contactar | **2** (+1 ambiguo de T0) | 2 | 0 | 0 | 0 |
| **Orgánico — altas nuevas** | — | 5 fichas creadas por el dueño | 5 | 4 (80 %) | 2 (40 %) | 0 |
| **Orgánico — pedidos sin terminar** | — | 4 | 0 | — | — | — |

Lectura:
- **Para conseguir reclamos, la tanda funciona y el orgánico casi no existe.** 18 de cada 20 reclamos de fichas existentes del período vinieron del mensaje de WhatsApp, y casi todos el mismo día del envío.
- **Para conseguir dueños activos, el orgánico rinde más por persona.** Quien se registra solo entra (4/5) y completa (2/5) más que quien reclama porque le escribimos (10/18 entran, 4/18 completan). El dueño que reclama por la tanda dice "sí" en el momento y después no vuelve.
- **Nadie compró nada en el período**, ni de las tandas ni del orgánico. Los únicos "beneficios" son gratis: el plan Destacado de regalo (Cerrajería Capiatá) y el boost por completar al 100 % (Servi Central, QTech). La última compra registrada de plan es del 10/08 y la de boost, del 16/09.

---

## 5. Qué quedó sin poder medirse y por qué

1. **Respondió / rechazó / "no es mío" — no medible.** El panel permite marcarlo, pero nunca se usó: las 103 filas de `prospect_wa_outreach` y las 62 de `prospect_outreach` siguen en `enviado`. Tampoco se marcó `reclamo` en las 18 de T1: la actualización automática solo existe en el flujo nuevo (desde 13/10) y depende de que el número coincida exactamente.
2. **Tanda 2 — no evaluable todavía.** Confirmado: solo se enviaron 5 de 86 (0 reclamos); las otras 81 siguen pendientes.
3. **Fecha exacta de contacto — aproximada.** `fecha_contacto` guarda la *última* vez que se marcó `enviado`. En las 4 fichas afectadas por el bug del formato del número (§1.1) se pisó varias veces, la última el 18/10, después de su reclamo. Tampoco hay campo de lote.
4. **Apertura del enlace (clic en el link de WhatsApp) — no medible.** `claim_events` empezó el 13/10 (después de casi toda la T1) y desde entonces no registró **ningún** evento con origen `wa`. `site_visits` no guarda visitas a `/reclamar`.
5. **Cuántas veces entró el dueño — no medible.** `last_seen_at` se pisa (solo da el último ingreso) y `first_seen_at` existe recién desde el 12/10. Además hay al menos un dueño que editó su ficha sin que se registrara su ingreso (Maxi Refrigeración). Llama la atención que los 4 dueños de T1 que "volvieron" lo hicieron todos el 13/10 (un día después de instalar el registro de presencia nuevo); no hay forma de saber si fueron accesos reales del dueño o un efecto de pruebas/despliegue de ese día.
6. **Quién editó la ficha — se atribuye al dueño.** No hay registro de cambios por usuario, pero se validó contra la base: todas las fichas de T0/T1/T2 con datos agregados respecto de la carga tienen dueño, **con 1 excepción**: Veterinaria Urgencia 24hs Capiatá (15270, T1, Capiatá) tiene logo y correo agregados el 13/10 y **no tiene dueño ni reclamo**. Hay que revisar quién la editó.
7. **"Antes" exacto de cada ficha — aproximado.** Para reclamos posteriores al 08/10 se usó el dump de esa fecha; para los anteriores, el perfil de importación de la tanda (las 87 fichas de T1 no reclamadas: 0 con descripción, 0 con portada, 6 con horarios, 7 con logo). `claim_snapshots` existe recién desde el 22/10.
8. **1 número contactado el 25/09 (T1) ya no corresponde a ninguna ficha.** Quedó fuera del cruce.

---

## Anexo — método

- Universo: fichas con `source` `prospeccion_agente` (T1) o `prospeccion_agente_t2` (T2), fichas de `prospect_outreach` (T0), y toda ficha con reclamo o dueño asignado desde el 01/09.
- Contacto WA: cruce de `prospect_wa_outreach.whatsapp` con `businesses.whatsapp` **o** `businesses.phone` por los últimos 9 dígitos.
- Reclamó: `claim_status` no nulo o fila en `user_businesses`. Aprobado: `claim_status='approved'` o dueño vinculado.
- Entró al portal: `users.last_seen_at` no nulo. Completitud: `fn_profile_completion`. Completó: subió de 20 % a ≥ 60 % con descripción u horarios u portada agregados respecto del "antes".
- Compró: `plan_requests` confirmados, `promotion_boosts` pagados. Los `plan_grants` (regalo) y `boost_until` (premio por completar) **no** se cuentan como compra.
- Fechas en hora de Paraguay.

---

## Actualización 26/10/2026 (después del informe) — aplicado en producción

- **Bug del panel corregido** (paquete `retopa_prospects_wa_key`): las fichas con WhatsApp `+595…` ya no vuelven solas a Pendiente.
- **Reclamos reales marcados** (`sql/2026-10-26_prospectos_reclamos_reales.sql`): 18 números de T1 y 1 ficha de T0 pasaron a `reclamo`, con nota de trazabilidad. `fecha_contacto` no se tocó.
- **Marca automática a futuro:** cuando una ficha contactada recibe dueño, por cualquier camino, su contacto pasa solo a `reclamo`.
- **Índices reales:**
  - `v_prospectos_embudo`: usada por el digest diario y por Admin → resumen. Ahora cubre los dos canales: 165 contactos, 19 reclamos, 11,5 %.
  - `v_prospectos_tandas`: nueva vista con el embudo por tanda. T1: respuesta 17,5 % · reclamo 17,5 % · activación 50 %. La vista cuenta 9 dueños que entraron al portal porque usa el registro de ingresos; este informe cuenta 10, al sumar el caso de Maxi Refrigeración (ver ⁶).
- **"Respondió" sin reclamar sigue dependiendo de que se marque a mano en el panel.**
