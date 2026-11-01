# RetoPA — guía para Claude Code

RetoPA (retopa.com.py) es el directorio nacional de negocios de Paraguay: un "mapa vivo" donde se registran empresas, comercios, freelancers y oficios. Foco comercial: Gran Asunción, con estrategia de dominio vertical por rubro (talleres, cerrajerías, veterinarias, etc.).

Este archivo es el punto de contacto entre Steve, Claude en la app (chat/móvil) y Claude Code en los hosts. **Leelo completo antes de tocar código.** La sección "Pendientes e instrucciones" al final es la cola de trabajo compartida.

## Stack

- Node.js 22 / Express 4, CommonJS (`require`), sin TypeScript.
- PostgreSQL 16 con PostGIS y pgvector (imagen `retopa-pg:16-vec-gis`), SQL crudo vía `pg` Pool en `backend/src/db.js`. **No hay ORM.**
- Redis 7 (rate limits, cache, sesiones).
- Frontend: HTML + Vanilla JS + Tailwind. Sin framework, sin bundler.
- Docker Compose + Nginx 1.27. HTTPS lo termina un nginx externo con Certbot (fuera de este repo).
- Geocoding: Nominatim (no hay Google Geocoding).

## Entornos y hosts

Son **dos VMs separadas**, cada una con su propio Claude Code:

| VM | Qué es | Ruta del proyecto |
|---|---|---|
| `retopa-core` | **Producción.** Corre el stack real. Nada se prueba acá. | `/opt/retopa` |
| `retopa-dev` | **Desarrollo.** Se sincroniza desde prod con datos anonimizados (`scripts/`). Acá se desarrolla y prueba todo antes de pasar a prod. | `/opt/retopa` (clon de core, misma ruta) |

Antes de cualquier acción, Claude Code debe saber en qué VM está (`hostname`) y actuar en consecuencia: en `retopa-core` solo deploy y hotfix aprobados; el trabajo normal va en `retopa-dev`.

- Paquetes para aplicar: Steve deja los `tar.gz` en `/home/hepta/claude/` (en cada VM).
- La base en Docker es el contenedor `retopa-db`; usuario y base: `retopa`. La configuración del sitio vive en la tabla `site_config` (key/value).
- `scripts/git-commit-prod.sh` commitea lo que está vivo en prod; corre **solo** en `retopa-core` desde `/opt/retopa`, nunca hace push y bloquea `.env`, dumps, CSV y secretos.
- Deploy por paquete (dev primero, después prod), según su `_deploy/DEPLOY_<nombre>.txt`:
  `retopa_<nombre>.tar.gz` con rutas `opt/retopa/...` + `_deploy/base_<nombre>.sha256` (huella de los archivos de prod que reemplaza).
  1. Chequeo de base (`sha256sum -c`); cualquier FAILED → parar.
  2. Backup: `pg_dump -Fc` a `/opt/retopa/backups/` y copia de los archivos a reemplazar en `/home/hepta/claude/bak_<nombre>_<fecha>/`.
  3. Migración en seco (`COMMIT` → `ROLLBACK`).
  4. `tar xzf … -C /` y migración de verdad.
  5. `docker compose up -d --build backend frontend` (sin `down`: la base y redis siguen arriba).
- Dev se pone igual a prod con `scripts/sync-dev-desde-prod.sh plan|apply`, desde un nodo del clúster. Borra lo que solo exista en dev: el trabajo en curso va en una rama de GitHub, no sin commitear en dev.

## Estructura del repo

```
backend/
  server.js          # arranque: Redis, /health, PORT (3000). Exige JWT_SECRET.
  src/app.js         # rate limits y montaje de rutas bajo /api/v2/... (EL ORDEN IMPORTA)
  src/db.js          # pg Pool
  src/routes/        # admin.js, client.js, directory.js, *.routes.js (16 archivos)
  src/config/        # jwt.js, mail.js, redis.js
  src/helpers/, src/utils/   # response.js ({success,error,code}), plan-limits.js
  src/jobs/          # scripts que corren por cron, directo con node
frontend/
  server.js          # SSR liviano para SEO (~2k líneas), puerto 3001
  index.html, js/    # SPA pública (app.js, config.js, search.js...)
  admin/ cliente/ embajador/ reclamar/   # sub-apps
  sw.js              # service worker, VERSION se bumpea A MANO
  css/tailwind-main.css → public/css/main.css (build en Dockerfile)
  scripts/cachebust.js   # agrega ?v=hash a JS/CSS
nginx/default.conf   # sirve /uploads/, proxy /api/ → backend, resto → frontend
sql/                 # migraciones fechadas YYYY-MM-DD_nombre.sql (se aplican a mano), schema.sql, seed.sql
scripts/             # backups, sync dev←prod, importers (import_*.js), enriquecedores (enrich_*.js)
tests/harnesses/     # harness_*.js standalone (levantan un Postgres efímero; UI con Playwright)
docs/                # CHANGELOG-legal.md, informes, historico/ (DEPLOY_*, README_*)
```

## Puntos que suelen morder

- **Auth admin es JWT Bearer** (`getAdminToken` en el front, `requireRole` en `routes/admin.js` con jerarquía godmode > admin > client > user). **No** usar `x-admin-key`. Varias rutas tienen su propia copia de `requireAdmin` (claim, notify, legal, ambassador): si cambiás una, revisá las otras.
- `internal.routes.js` autentica con header `x-internal-key` = `INTERNAL_API_KEY`.
- **Nginx:** directivas solo dentro del bloque `server{}`.
- **SEO por user-agent** en `frontend/server.js`: los crawlers reciben `buildBusinessHTML()` (página autónoma con H1, BreadcrumbList, meta); los humanos reciben la SPA con meta inyectada y `openProfile()`. Cualquier cambio de ficha tiene que respetar ambos caminos.
- Errores raros en admin (`initUncategorizedSection`, sandbox) casi siempre son **cache vieja del service worker**, no bugs. Bumpear `VERSION` en `sw.js` y anotar en su changelog.
- El techo de indexación es de **datos, no de código**: ~65% de fichas quedan bajo `seo_min_quality_score=15` por teléfono vacío. Enriquecer teléfono > tocar SEO.
- Migraciones SQL: crear archivo fechado en `sql/`, nunca editar una ya aplicada en prod.
- `frontend/package.json` `build:css` referencia `tailwind-admin.css` y `tailwind-cliente.css` que no existen; solo `tailwind-main.css` se compila en el Dockerfile.

## Convenciones

- Idioma: comentarios, mensajes al usuario y docs en **español rioplatense con voseo** ("Intentá", "Registrá"). Identificadores en inglés salvo dominio local (ficha, rubro, reclamo).
- Respuestas de API: `{ success, data? , error?, code? }` vía `src/utils/response.js`.
- Separadores de sección en código: `// ── Sección ──`.
- Rutas nuevas: `nombre.routes.js`, montadas en `src/app.js` respetando el orden existente.
- Sin ESLint ni Prettier: mantener el estilo del archivo que estás tocando (2 espacios, comillas simples, punto y coma).
- No hay runner de tests. Para cambios de backend o UI, escribir/actualizar un `tests/harnesses/harness_*.js` cuando aplique y correrlo con `node harness_X.js <repo root>`. Ojo: varios harnesses tienen paths hardcodeados (`/root/work/opt/retopa`).
- Nunca commitear `.env`, dumps, CSV con datos de negocios ni credenciales.
- Marca: azul profundo `#1B3A6B`, celeste `#7EC8E3`, dorado `#E8B84B`. Wordmark "RetoPA" con "PA" en dorado.

## Cómo trabajar acá

1. Leer este archivo y, si la tarea está en "Pendientes", seguir esa nota como fuente de verdad.
2. Cambios chicos: directo en `main` con commit descriptivo en español. Cambios grandes o riesgosos: rama `feat/...` o `fix/...` y PR.
3. Antes de dar por terminado: levantar con `docker compose up --build` (o `npm start` en backend) y probar el flujo tocado, incluyendo el camino crawler si es SEO.
4. Al cerrar una tarea de "Pendientes", moverla a "Hecho" con fecha y commit.

## Pendientes e instrucciones

> Steve o Claude (chat) agregan ítems acá. Claude Code en los hosts los ejecuta y los mueve a "Hecho".

- [ ] 2026-10-30 — Separar claramente los flujos de `retopa-core` (prod) y `retopa-dev` (dev): documentar en este archivo cómo se crea/sincroniza `retopa-dev`, y asegurar que `scripts/` distinga ambos sin tocar prod por accidente. (Pedido por Steve; se detalla mañana.)

## Hecho

- 2026-10-30 — Creado `CLAUDE.md` inicial (Claude desde chat, sesión móvil).
