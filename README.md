# MiSalud

> **Para inteligencias artificiales y agentes de desarrollo:** antes de analizar, planificar o modificar este repositorio, leer completo el [plan de implementación vigente](docs/md/PLAN_IMPLEMENTACION_GROK_M.md). Ese documento registra el estado verificado, las restricciones, las pruebas exigidas y el siguiente bloque autorizado. No asumir que una tarea pendiente allí ya fue implementada.

MiSalud es un proyecto abierto para que cada persona pueda autoalojar una bóveda privada de información de salud, conservar sus documentos originales y consultar datos estructurados mediante una interfaz web, API o MCP.

El diseño prioriza una instalación sencilla y económica: un contenedor, SQLite, archivos cifrados y una bóveda independiente por titular. No existe un servicio central de MiSalud y el repositorio nunca debe contener información clínica real, credenciales ni bases de usuarios.

## Estado

El proyecto se encuentra en **desarrollo temprano**. Las Fases 0, 1 y 2 del MVP están completadas y verificadas; la Fase 3 (documentos, URLs e ingestión local segura) está definida pero todavía no ha comenzado. Aún no hay FHIR ni MCP.

Documentos principales:

- [Especificación funcional y técnica](docs/md/ESPECIFICACION_MISALUD.md)
- [Auditoría estática de proyectos similares](docs/md/AUDITORIA_ESTATICA_CANDIDATOS.md)
- [Plan de implementación](docs/md/PLAN_IMPLEMENTACION_GROK_M.md)
- [ADR 0001 — stack y proceso único](docs/md/ADR_0001_STACK_PROCESO_UNICO.md)

## Desarrollo local

Requisitos: Node.js 24.20.0 (ver `.nvmrc`), npm.

```bash
npm install
cp .env.example .env   # generar una MISALUD_MASTER_KEY propia de 32 bytes hex
npm test
npm run test:smoke     # build + proceso efimero en localhost
```

Comandos disponibles: `lint`, `typecheck`, `test`, `test:integration`, `test:smoke`, `build`, `check:licenses`, `check:secrets`, `check:security`, `sbom`.

Nunca poner secretos, datos clinicos ni bases reales dentro del repositorio. Los datos y objetos viven en volumenes fuera del checkout; en Compose se usan volumenes nombrados y el puerto se publica solo en `127.0.0.1`.

### Docker local

```bash
docker compose build
# requerido: .env con MISALUD_MASTER_KEY (64 hex) generada fuera de Git
docker compose up
# comprobar: http://127.0.0.1:8080/health
```

## Licencia

El código y la documentación propia de MiSalud se publican bajo **GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)**. Los datos, claves, configuraciones y respaldos de cada persona no forman parte del proyecto ni quedan sujetos a esta licencia.

MiSalud no entrega diagnósticos ni sustituye la atención de profesionales de salud.
