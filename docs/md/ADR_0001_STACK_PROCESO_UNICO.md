# ADR 0001 — stack, versiones, licencias y proceso único

**Estado:** aceptado  
**Fecha:** 2026-09-02  
**Rama:** `feat/initial-mvp`  
**Alcance:** Fase 0 del MVP. No cambia semántica clínica ni el modelo de aislamiento.

## Decisión

MiSalud se entrega como **un solo proceso Node.js** y **una sola imagen OCI**. El mismo origen sirve HTML, REST, FHIR, MCP, metadatos OAuth y vínculos temporales. No hay SPA, ORM grande, segundo contenedor obligatorio ni servicios de pago.

## Runtime e imagen

| Pieza | Elección | Licencia | Motivo |
| --- | --- | --- | --- |
| Node.js | **24.20.0** Active LTS (Krypton) | MIT | [Calendario oficial](https://github.com/nodejs/release): 24 es Active LTS; 26 es Current hasta ~28-oct-2026. |
| `.nvmrc` / `engines` | `24.20.0` y `>=24.20.0 <25` | — | Evitar Current y rangos flotantes de major. |
| Imagen base | `node:24.20.0-bookworm-slim` | Docker Official Images | Debian 12 slim, no Alpine (glibc, menos rarezas nativas). |
| Digest de índice (multi-arch) | `sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` | — | Inspeccionado 2026-09-02 con `docker buildx imagetools inspect`. Fijar `FROM` por versión **y** digest. |

No usar `latest`, `lts`, `edge` ni `node:26`.

## Dependencias de aplicación

Versiones consultadas en npm el 2026-09-02. El lockfile es la fuente de verdad reproducible; estas cifras son el piso de incorporación.

| Paquete | Versión objetivo | Licencia | Uso |
| --- | --- | --- | --- |
| `hono` | 4.13.5 | MIT | HTTP, HTML en servidor, cabeceras. 4.13.5 sin avisos C/H/M en Snyk al consultar. |
| `@hono/node-server` | 2.1.1 | MIT | Adaptador Node. No Cloudflare Workers. |
| `zod` | 4.5.4 | MIT | Validación de configuración y entradas. Pequeña, mantenida, OSI. |
| `openid-client` | 6.8.7 | MIT | Google OIDC (Fase 1). No implementar el protocolo a mano. |
| `@modelcontextprotocol/sdk` | 1.30.0 | MIT | MCP Streamable HTTP (Fase 5). |

SQLite: **`node:sqlite`** (módulo de Node 24). Sin ORM. Sin `better-sqlite3` en Fase 0 (evita compilado nativo extra). Migraciones SQL versionadas y repositorios tipados propios.

Cifrado: **`node:crypto`** (AES-256-GCM, HKDF, HMAC, SHA-256, CSPRNG). No diseñar algoritmos.

## Herramientas de desarrollo

| Paquete | Versión objetivo | Licencia | Uso |
| --- | --- | --- | --- |
| `typescript` | 7.0.2 | Apache-2.0 | Estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). |
| `vitest` | 4.1.11 | MIT | Unitarias, integración y smoke. |
| `@biomejs/biome` | 2.5.11 | MIT OR Apache-2.0 | Lint y formato en un solo binario OSI. |

Scripts obligatorios en `package.json`: `lint`, `typecheck`, `test`, `test:integration`, `test:smoke`, `build`, `check:licenses`, `check:secrets`, `check:security`, `sbom`. En Fase 0 los checks pueden ser envoltorios honestos (fallar si falta la herramienta; no declarar verde falso).

## Rechazado de forma explícita

Tomado de `AUDITORIA_ESTATICA_CANDIDATOS.md` y de la especificación:

- PostgreSQL, TimescaleDB, Redis, broker, S3, Aidbox, segundo contenedor.
- Next.js, Vite SPA, React obligatorio, CDN, Google Fonts, analítica.
- ORM grande (Prisma, Drizzle, TypeORM).
- IA/OCR/terminología en nube; `latest` en imágenes.
- Licencias source-available, comerciales o copyleft incompatibles con AGPL-3.0-or-later del proyecto.

El código propio sigue **AGPL-3.0-or-later**. Dependencias MIT/Apache-2.0/BSD/ISC son aceptables. Una licencia desconocida bloquea la incorporación.

## Modelo de proceso y datos (Fase 0)

- Un proceso, usuario no-root (`uid` 1000), escucha `127.0.0.1` en el host.
- Volúmenes de datos y objetos **fuera del checkout** (`./data` local está en `.gitignore`; en Compose usar rutas bajo un directorio de datos del operador, nunca Dropbox/OneDrive/Google Drive).
- Arranque: validar configuración; si falta `MISALUD_MASTER_KEY` (32 bytes en hex o archivo montado) o tiene formato inseguro, **salir con error**.
- Health/readiness sin secretos, rutas internas ni datos clínicos.
- Egreso de red denegado por defecto en documentación; excepción futura: OIDC de Google e ingestión de URL iniciada por la persona. Fase 0 no abre esas excepciones en código.

## Estructura de módulos (no mezclar capas)

```text
src/
  app/                 composición, configuración y servidor
  domain/              entidades y puertos; sin HTTP/SQLite
  application/         casos de uso
  infrastructure/
    sqlite/
    objects/
    jobs/
    crypto/
    oidc/
  interfaces/
    web/
    rest/
    fhir/
    mcp/
  shared/              errores, ids, reloj
tests/
  fixtures/            sólo sintéticos
  unit/
  integration/
  smoke/
```

Fase 0 implementa el esqueleto, configuración, HTTP mínimo (`/`, `/health`, `/ready`), logging con redacción y barreras. No implementa OIDC, FHIR, MCP ni clínica.

## Consecuencias

- Autoalojamiento con `docker compose up` de un servicio.
- Actualizar este ADR si una dependencia cambia de major o de licencia.
- Fijar digest de imagen de nuevo al reconstruir la entrega verificada.

## Fuentes

- https://github.com/nodejs/release (Active LTS 24, Current 26)
- https://nodejs.org (24.20.0, 2026-08-26)
- npm: `hono`, `@hono/node-server`, `zod`, `openid-client`, `@modelcontextprotocol/sdk`, `typescript`, `vitest`, `@biomejs/biome` (consultados 2026-09-02)
- `docker buildx imagetools inspect node:24.20.0-bookworm-slim` → índice `sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e`
- `docs/md/ESPECIFICACION_MISALUD.md`, `docs/md/AUDITORIA_ESTATICA_CANDIDATOS.md`, `docs/md/PLAN_IMPLEMENTACION_GROK_M.md`
