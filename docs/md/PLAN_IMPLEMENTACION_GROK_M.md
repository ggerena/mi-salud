# MiSalud — encargo ejecutable del MVP para Grok-M

**Estado:** autorizado para implementación
**Fecha:** 2026-09-02
**Repositorio:** `ggerena/mi-salud`
**Rama de trabajo preparada:** `feat/initial-mvp`
**Coordinador solicitado:** Grok-M mediante Buzz
**Regla principal:** implementar y verificar; no desplegar, no usar datos reales y no fusionar el PR

## 1. Objetivo del encargo

Construir el primer MVP funcional de **MiSalud**: una bóveda personal de salud, autoalojable en un PC mediante un único contenedor Docker, con Google OpenID Connect, API REST, recursos FHIR R4, servidor MCP HTTP y una interfaz web humana mínima.

El resultado debe permitir, usando exclusivamente datos sintéticos:

1. entrar con Google;
2. crear una bóveda personal aislada;
3. cargar un informe o registrar una URL y conservar una copia durable cuando sea seguro hacerlo;
4. revisar y corregir resultados estructurados;
5. registrar citas e indicaciones de repetición;
6. contestar de forma explicable si corresponde un control, sin inventar consejo médico;
7. consultar lo mismo por REST, FHIR y MCP con autorización de alcance mínimo;
8. crear un vínculo temporal y revocable para compartir un documento concreto;
9. exportar los documentos y datos en formatos abiertos;
10. ejecutar todo localmente sin servicios de pago ni transferencias clínicas externas.

Este archivo convierte la especificación en trabajo ejecutable. No sustituye los documentos fuente:

- [`ESPECIFICACION_MISALUD.md`](./ESPECIFICACION_MISALUD.md) es la autoridad funcional, clínica, legal y de seguridad.
- [`AUDITORIA_ESTATICA_CANDIDATOS.md`](./AUDITORIA_ESTATICA_CANDIDATOS.md) contiene las dependencias, salidas de red y licencias que no deben reaparecer por accidente.
- `README.md`, `LICENSE` y `.gitignore` también son obligatorios.

Ante una contradicción, prevalece la opción que minimice exposición de datos y dependencia externa. Si una decisión cambia el alcance, una garantía clínica, el modelo de aislamiento o una restricción legal, detener sólo esa parte, registrar un ADR y pedir decisión; continuar con lo independiente.

## 2. Resultado esperado de esta ejecución

La ejecución se considera terminada únicamente cuando existe un PR borrador desde `feat/initial-mvp`, con el MVP implementado, documentado y probado. Grok-M no debe hacer merge ni marcarlo listo para revisión mientras haya pruebas pendientes, riesgos altos/medios válidos o controles `NO PROBADO` sin explicar.

Si el MVP completo no cabe responsablemente en una sola ejecución, cerrar una fase vertical utilizable y dejar:

- pruebas verdes para lo construido;
- el PR todavía en borrador;
- una lista exacta de requisitos terminados y pendientes;
- ningún stub que aparente seguridad, cifrado, antivirus, OAuth, FHIR u OCR que en realidad no exista;
- el siguiente paso preparado sin declarar el MVP completo.

## 3. Límites no negociables

### 3.1 Datos y privacidad

- Nunca introducir nombres, correos, identificadores, exámenes, documentos, rutas privadas ni secretos reales de ninguna persona.
- Fixtures, capturas, ejemplos y pruebas deben ser evidentemente sintéticos.
- No enviar contenido clínico a Google, OpenAI, Anthropic, Gemini, relays, servicios de terminología, telemetría, CDN, fuentes remotas ni otro tercero.
- Google se usa sólo para autenticación OIDC y recibe únicamente los datos mínimos de ese flujo.
- OCR o IA externos permanecen fuera del MVP y desactivados por diseño; no debe existir fallback silencioso a nube.
- No cargar fuentes, scripts, analítica, píxeles o assets desde terceros en páginas autenticadas.
- El egreso de red de producción debe ser denegado por defecto y documentar como excepción el endpoint OIDC de Google y una URL de ingestión iniciada expresamente por la persona.

### 3.2 Operación

- No desplegar en Cloudflare ni en otro hosting.
- No usar cuentas, buckets, bases ni credenciales reales.
- No levantar un servidor persistente de desarrollo. Las pruebas efímeras automatizadas y el arranque acotado del contenedor para smoke test sí están dentro del encargo.
- No abrir puertos públicos ni Cloudflare Tunnel. El perfil local escucha sólo en `127.0.0.1` por defecto.
- No agregar PostgreSQL, TimescaleDB, Redis, broker, S3, microservicios ni un segundo contenedor obligatorio.
- La base SQLite activa jamás debe ubicarse en Dropbox, OneDrive, Google Drive, una unidad de red o una carpeta sincronizada.

### 3.3 Git y publicación

- Trabajar sólo en `feat/initial-mvp`; nunca hacer push directo a `main`, `master` o `develop`.
- Crear o actualizar un único PR borrador hacia `main` y respaldar avances comprobables allí.
- Antes de cada commit revisar diff, destino y archivos incluidos.
- No hacer merge, no activar auto-merge y no reescribir historia compartida.
- No firmar ni identificar commits, comentarios o PR como producidos por un modelo.

### 3.4 Licencias

- Todo código del proyecto sigue `AGPL-3.0-or-later`.
- Sólo incorporar dependencias compatibles con distribución abierta y autoalojamiento sin licencia comercial obligatoria.
- No incorporar Aidbox, módulos Timescale License, servicios SaaS obligatorios ni terminologías redistribuidas sin permiso.
- Generar inventario de dependencias y licencias. Una dependencia con licencia desconocida, source-available o copyleft incompatible bloquea su incorporación.
- Fijar versiones reproducibles; las imágenes OCI deben fijarse por versión y, para la entrega verificada, por digest. No usar `latest`, `edge` ni rangos flotantes en artefactos de despliegue.

## 4. Reparto del trabajo para ahorrar uso de Grok-M

Grok-M es coordinador, integrador y responsable de la decisión final. Debe conservar para sí:

- arquitectura y límites de módulos;
- modelo de amenazas;
- autenticación Google OIDC;
- autorización OAuth 2.1 para API/MCP;
- aislamiento entre bóvedas;
- cifrado y gestión de claves;
- ingestión segura de URLs y archivos;
- semántica clínica, FHIR y cálculo de seguimientos;
- revisión de seguridad, privacidad y licencias;
- revisión final del diff completo.

Puede delegar a agentes más económicos tareas independientes y acotadas como:

- inventariar archivos y dependencias;
- crear scaffolding mecánico siguiendo una estructura ya decidida;
- escribir CSS/HTML accesible a partir de pantallas y contratos definidos;
- generar fixtures sintéticos;
- implementar repositorios CRUD después de fijar esquema e interfaces;
- escribir tests deterministas desde criterios de aceptación ya definidos;
- ejecutar lint, typecheck, tests, build, escaneo y recopilar resultados;
- completar documentación operativa basada en comandos ya verificados.

Reglas de coordinación:

1. Un solo agente escritor a la vez sobre este repositorio y rama.
2. No delegar decisiones de seguridad, datos, permisos o medicina a agentes de bajo costo.
3. Qwen-Local sólo puede hacer lectura, inventario, pruebas deterministas o cambios mecánicos de alcance exacto; nunca arquitectura, seguridad, diagnóstico profundo ni revisión final.
4. Cada subencargo debe indicar archivos permitidos, criterios de aceptación y comandos de verificación.
5. Grok-M revisa todo diff delegado antes de conservarlo.
6. Si un agente falla un intento verificable, Grok-M corrige o escala; no abre escritores paralelos sobre los mismos archivos.
7. Ningún agente puede relajar una prueba o eliminar un control para obtener verde.

## 5. Arquitectura a implementar

### 5.1 Forma del sistema

Implementar un monolito modular TypeScript en un solo proceso de aplicación y una sola imagen OCI. El mismo origen sirve:

- `/` y las vistas humanas;
- `/api/v1/*` para la API REST;
- `/fhir/r4/*` para la frontera FHIR;
- `/mcp` para MCP Streamable HTTP;
- `/.well-known/*` para metadatos OAuth/protected resource cuando corresponda;
- `/share/*` para accesos temporales a recursos compartidos.

No crear una SPA. Preferir HTML renderizado en servidor y JavaScript progresivo mínimo. La lógica clínica y de autorización vive exclusivamente en aplicación/dominio.

### 5.2 Selección tecnológica

Antes de escribir la base, Grok-M debe crear un ADR breve que fije versiones y justifique las dependencias. La opción por defecto, salvo incompatibilidad demostrada, es:

- Node.js Active LTS vigente, fijado en `.nvmrc`, `package.json` y Docker;
- TypeScript estricto;
- Hono sobre Node para HTTP y HTML renderizado en servidor;
- SQL SQLite explícito con migraciones versionadas y repositorios tipados; evitar un ORM grande;
- validación de entradas con una biblioteca pequeña, mantenida y de licencia compatible;
- `openid-client` o equivalente estándar y mantenido para Google OIDC; no implementar criptografía de protocolo manualmente;
- SDK oficial de Model Context Protocol para MCP;
- primitivas de `node:crypto` para AES-256-GCM, HKDF/HMAC y aleatoriedad; no diseñar algoritmos propios;
- Vitest o el runner nativo elegido, con pruebas unitarias, integración y smoke;
- HTML/CSS propios y sin CDN.

Las versiones concretas se eligen después de consultar fuentes oficiales, licencias y avisos de seguridad vigentes. Toda desviación debe quedar en el ADR con costo, licencia y efecto sobre autoalojamiento.

### 5.3 Módulos obligatorios

Mantener dependencias hacia adentro:

```text
src/
  app/                 composición, configuración y servidor
  domain/              entidades, reglas clínicas y puertos; sin HTTP/SQLite
  application/         casos de uso y autorización por recurso
  infrastructure/
    sqlite/            migraciones y repositorios
    objects/           objetos cifrados locales
    jobs/              outbox y ejecutor interno
    crypto/            envoltura de claves y cifrado versionado
    oidc/              Google OIDC
  interfaces/
    web/               vistas humanas
    rest/              REST/OpenAPI
    fhir/              mapeadores FHIR R4
    mcp/               herramientas y recursos MCP
  shared/              errores, ids, reloj y utilidades realmente comunes
tests/
  fixtures/            sólo información sintética
  unit/
  integration/
  smoke/
```

Puede ajustarse el árbol si el ADR demuestra una forma más simple, pero no mezclar reglas clínicas con handlers, SQL o vistas.

### 5.4 Persistencia e aislamiento

- Cada bóveda personal usa su propio archivo SQLite, directorio de objetos y clave de datos.
- Un catálogo global mínimo puede guardar identidad externa, bóveda asignada y estado, pero nunca contenido clínico.
- Resolver la bóveda sólo desde la sesión/autorización validada; nunca aceptar un `vault_id` arbitrario del cliente.
- Activar WAL, claves foráneas, `busy_timeout` y migraciones transaccionales.
- Los nombres de archivos físicos son IDs aleatorios, no nombres clínicos.
- Ningún valor sensible debe aparecer en logs, errores, métricas o nombres de ruta.
- Los campos clínicos sensibles se cifran a nivel de aplicación. Si se conservan índices de búsqueda, usar datos mínimos normalizados o índices ciegos con HMAC y documentar qué metadatos permanecen visibles.
- Las búsquedas longitudinales pueden descifrar el conjunto pequeño de una bóveda personal; no sacrificar confidencialidad por optimización prematura.

### 5.5 Cifrado

- Una clave maestra de 32 bytes llega por secreto de entorno o archivo montado fuera de Git; rechazar inicio si falta o tiene formato inseguro.
- Derivar o envolver una clave distinta por bóveda y registrar versión de clave, nunca la clave en claro.
- Cifrar cada objeto y payload sensible con AES-256-GCM, nonce aleatorio único y datos autenticados que incluyan versión, bóveda, tipo e ID.
- Guardar `version`, `key_id`, `nonce`, `ciphertext` y `auth_tag`; nunca reutilizar nonce con la misma clave.
- Calcular SHA-256 del original antes de cifrar para integridad/procedencia, pero no exponerlo públicamente si puede facilitar correlación.
- Probar alteración de ciphertext/tag/AAD, clave equivocada, separación entre bóvedas y rotación versionada.
- Nunca imprimir material de claves en pruebas o errores.

## 6. Fases de implementación

Cada fase debe cerrar con pruebas verdes, diff revisado y commit acotado. Respaldar temprano el PR borrador, pero no confundir respaldo con término.

### Fase 0 — base reproducible y barreras

Entregables:

- ADR de stack, versiones, licencias y modelo de proceso único;
- `package.json`, lockfile, TypeScript estricto, lint y formato;
- estructura modular mínima;
- configuración tipada con validación al inicio;
- `.env.example` con nombres ficticios y comentarios, sin valores utilizables;
- Dockerfile multi-stage no-root, imagen base fijada y `compose.yaml` de un servicio;
- volúmenes fuera del checkout para datos y objetos;
- health/readiness sin información sensible;
- cabeceras de seguridad, límite de cuerpo y manejo uniforme de errores;
- logging estructurado con redacción;
- CI para lint, typecheck, tests, build, auditoría de dependencias, Gitleaks y SBOM;
- documentación para desarrollo sin datos reales.

Criterios:

- instalación reproducible desde lockfile;
- el proceso falla de forma segura si faltan secretos;
- el contenedor corre como usuario no-root y escucha `127.0.0.1` en el host;
- no existe contacto de red en un smoke sin login ni ingestión explícita;
- repositorio y artefactos no contienen secretos ni datos personales.

### Fase 1 — bóvedas, cifrado, identidad y sesiones

Entregables:

- catálogo mínimo de cuentas e identidades externas por `iss` + `sub`;
- Google OIDC Authorization Code + PKCE, `state`, `nonce` y callback exacto;
- cookies de sesión `HttpOnly`, `Secure` cuando corresponda, `SameSite=Lax`, rotación y expiración;
- protección CSRF en toda mutación web;
- alta controlada: modo de primer propietario y allowlist/invitación posterior; un Google válido no abre acceso automáticamente;
- consentimiento versionado antes de crear la bóveda clínica;
- archivo SQLite, directorio y clave independientes por persona;
- cierre de sesión y revocación de sesiones;
- página de cuenta con identidad mínima, consentimiento, sesiones y auditoría.

Criterios:

- rechazo de `state`, `nonce`, issuer, audience o redirect inválidos;
- fijación y robo de sesión cubiertos por pruebas razonables;
- una cuenta no puede resolver ni abrir la bóveda de otra alterando URL, cookie o ID;
- sólo se persiste de Google lo mínimo justificado;
- pruebas no llaman Google: usar un proveedor OIDC falso local o mocks criptográficamente coherentes.

### Fase 2 — registro clínico manual y seguimiento explicable

Entregables:

- migraciones y repositorios para perfil, organización/profesional, citas, documentos, informes, observaciones, planes de seguimiento, recordatorios, procedencia y auditoría;
- CRUD mínimo mediante casos de uso, no acceso directo desde handlers;
- estados de observación: `extraido`, `requiere_confirmacion`, `confirmado`, `corregido`;
- conservación de nombre/unidad/rango/marca originales y fuente exacta;
- comparación histórica sin convertir unidades salvo conversión explícita y testeada;
- reglas de seguimiento basadas sólo en indicación profesional o regla versionada habilitada;
- endpoint y herramienta que respondan “¿me toca hacerme exámenes?” con fecha, razón, valor relevante, evidencia y advertencia no diagnóstica;
- resultado `sin_evidencia` cuando no exista intervalo autorizado;
- vistas mínimas de línea temporal, citas, informe, observaciones y seguimientos.

Criterios clínicos obligatorios:

- nunca inferir periodicidad sólo porque un valor esté bajo/alto;
- nunca reemplazar el rango del laboratorio por uno genérico;
- diferenciar fecha de toma, fecha de informe y fecha calculada;
- impedir que un dato extraído no confirmado sea presentado como confirmado;
- toda respuesta calculada incluye IDs de fuente y una explicación humana;
- reloj y zona horaria son inyectables para pruebas.

Usar el ejemplo de vitamina D de la especificación como prueba de aceptación sintética, junto con el caso sin indicación y un caso de indicación revocada.

### Fase 3 — documentos, URLs e ingestión local segura

Entregables:

- carga por streaming de PDF, PNG/JPEG, CSV y XLSX con límites configurables;
- detección por contenido además de extensión;
- cuarentena, estado antivirus y promoción sólo después de validación;
- almacenamiento cifrado e inmutable del original;
- hash, tamaño, MIME detectado, procedencia y auditoría;
- importación determinista de CSV/XLSX con vista previa y confirmación humana;
- registro de URL y descarga explícita en trabajo outbox idempotente;
- defensas SSRF: sólo HTTP(S), resolución DNS comprobada, bloqueo de loopback/redes privadas/link-local/metadatos, límites de redirección/tamaño/tiempo y revalidación en cada salto;
- nunca guardar cookies o contraseñas de clínicas;
- si una URL requiere autenticación o prohíbe copia, registrar sólo la referencia y explicar que no hay respaldo durable;
- revisión campo por campo junto al original.

El antivirus y OCR deben ser locales, abiertos y opcionales por capacidad explícita. Si no pueden incluirse responsablemente en el único contenedor, el estado debe quedar `no_disponible` o `requiere_revision`; nunca `limpio` o `extraido` ficticio. No ejecutar documentos activos, macros ni contenido embebido.

Criterios:

- un archivo alterado falla autenticación/hash;
- un original nunca se sobrescribe con un derivado;
- ZIP bombs, path traversal, MIME falso, archivo excesivo y URL interna son rechazados;
- reintentar un trabajo no duplica documentos ni auditorías clínicas;
- ningún parser recibe acceso de red.

### Fase 4 — REST, OpenAPI y FHIR R4

Entregables:

- API REST versionada con contratos, paginación, errores y control de concurrencia;
- OpenAPI generado o validado en CI;
- recursos FHIR R4 mínimos: `Patient`, `Practitioner`, `Organization`, `Appointment`, `DocumentReference`, `DiagnosticReport`, `Observation`, `ServiceRequest`, `CarePlan`/`Task`, `Consent`, `Provenance` y `AuditEvent` según existan datos;
- `CapabilityStatement` honesto: declarar sólo interacciones realmente implementadas;
- bundle de exportación FHIR R4 JSON con referencias internas válidas;
- validación estructural de ejemplos contra recursos R4;
- provenance y extensiones documentadas cuando el modelo interno no tenga equivalencia directa.

Criterios:

- REST y FHIR llaman los mismos casos de uso y políticas;
- una IDOR entre bóvedas falla en todos los adaptadores;
- no declarar conformidad SMART on FHIR ni búsquedas no implementadas;
- exportar y reimportar el conjunto sintético conserva fuentes, valores y estados esenciales.

### Fase 5 — OAuth para clientes y MCP

Google OIDC autentica a la persona, pero no reemplaza la autorización de aplicaciones. Implementar una capa OAuth 2.1 mantenida y basada en estándares para clientes REST/MCP:

- Authorization Code + PKCE;
- consentimiento humano por cliente y scopes;
- access tokens breves, refresh token rotatorio/revocable cuando sea necesario;
- metadatos de servidor de autorización y recurso protegido;
- audiencia y resource indicators cuando el estándar elegido lo requiera;
- almacenamiento sólo del hash de tokens opacos, o validación robusta de tokens firmados con rotación documentada;
- listado y revocación de clientes conectados desde la web;
- sin client secrets para clientes públicos;
- registro de clientes estático/configurado para el MVP si el registro dinámico aumenta riesgo; documentar el alta.

Scopes mínimos y separados:

- `profile:read`
- `documents:read`
- `documents:write`
- `observations:read`
- `observations:write`
- `appointments:read`
- `appointments:write`
- `followups:read`
- `followups:write`
- `shares:manage`
- `audit:read`
- `export:read`

MCP Streamable HTTP debe exponer sólo herramientas estrechas, con entradas validadas y respuestas trazables:

- `list_documents`
- `get_document_metadata`
- `list_observations`
- `get_observation_history`
- `list_appointments`
- `create_appointment`
- `list_followups`
- `answer_followup_status`
- `create_share_link` con confirmación humana previa o token de intención de un solo uso
- `revoke_share_link`
- `export_health_record`

No exponer SQL, rutas locales, consultas arbitrarias, lectura masiva predeterminada ni una herramienta genérica de ejecución. Cada llamada registra cliente, cuenta, scope, propósito, resultado y recursos tocados sin copiar datos clínicos al log.

Criterios:

- MCP y REST rechazan token ausente, vencido, revocado, audiencia incorrecta o scope insuficiente;
- una prompt injection dentro de un documento no puede invocar acciones ni cambiar autorización;
- las herramientas de escritura son idempotentes cuando corresponda;
- la respuesta de seguimiento es idéntica semánticamente por web, REST y MCP;
- suite de conformidad/protocolo basada en la versión estable de MCP elegida y documentada.

### Fase 6 — compartición, auditoría, exportación y backups

Entregables:

- vínculo propio con token aleatorio de alta entropía, hash almacenado, recurso exacto, finalidad, expiración, máximo de accesos y revocación;
- página compartida sin indexación, sin assets externos, con descarga sólo del objeto autorizado;
- mitigación de filtración por `Referer`, caché y logs;
- confirmación humana antes de crear el vínculo y pantalla de revocación;
- auditoría visible y filtrable por acción/fecha/cliente;
- exportación portable con JSON/FHIR, originales, manifiesto de hashes y versiones;
- backup consistente de SQLite más objetos, cifrado antes de copiar al destino;
- comando de restauración a directorio nuevo y verificación completa;
- política declarativa de retención y borrado; borrado probado en datos, objetos, derivados e índices dentro del alcance documentado.

Criterios:

- token de enlace no aparece en base en claro ni en logs;
- expiración, revocación, límite de accesos y recurso equivocado fallan cerrados;
- `Cache-Control: no-store`, política de referrer y cabeceras apropiadas en compartición;
- backup durante WAL produce una copia consistente;
- restauración automatizada reproduce el conjunto sintético y verifica hashes;
- Dropbox sólo se documenta como destino de un backup ya cifrado, nunca como ubicación de la base activa.

## 7. Interfaz humana mínima

Textos visibles usan **MiSalud**; nombres técnicos usan `mi-salud`.

Pantallas requeridas:

1. inicio y acceso con Google;
2. consentimiento y creación de bóveda;
3. resumen sin diagnóstico;
4. documentos y carga/URL;
5. revisión lado a lado de fuente y campos;
6. historial de resultados;
7. citas;
8. seguimientos;
9. vínculos compartidos;
10. aplicaciones conectadas y scopes;
11. auditoría;
12. exportación, backup y eliminación.

Requisitos:

- español neutro inicial;
- HTML semántico, teclado completo, foco visible, etiquetas y errores asociados;
- contraste suficiente y diseño responsivo;
- formularios revalidan en servidor;
- acciones irreversibles o de compartición muestran resumen y confirmación;
- no usar color como única señal clínica;
- no afirmar “normal”, “seguro”, “diagnóstico” ni “recomendado” fuera de la fuente;
- incluir siempre procedencia y estado de confirmación cerca de un resultado.

## 8. Contratos de seguridad que deben tener pruebas

Como mínimo:

- aislamiento de cuenta, bóveda, documento, observación, cita, seguimiento, share y exportación;
- CSRF, fijación de sesión, redirect abierto y callback OIDC alterado;
- IDOR en REST, FHIR, MCP y páginas web;
- inyección SQL, XSS almacenado en nombres/resultados y cabeceras;
- traversal/symlink en objetos;
- SSRF por IPv4, IPv6, DNS rebinding razonablemente simulable y redirecciones;
- límites de tamaño, timeout y concurrencia;
- manipulación criptográfica y separación de claves;
- token OAuth/share vencido, revocado, repetido o con scope incorrecto;
- logs y errores sin payloads clínicos, tokens ni secretos;
- outbox idempotente y recuperación tras interrupción;
- backup/restauración y exportación verificables;
- ausencia de llamadas externas no autorizadas en tests.

Crear un `THREAT_MODEL.md` compacto con activos, fronteras de confianza, atacantes, amenazas principales y mitigaciones probadas. No afirmar cumplimiento legal o seguridad absoluta.

## 9. Calidad, pruebas y revisión obligatorias

Comandos estables en `package.json`:

- `lint`
- `typecheck`
- `test`
- `test:integration`
- `test:smoke`
- `build`
- `check:licenses`
- `check:secrets`
- `check:security`
- `sbom`

Antes del cierre:

1. instalar desde lockfile limpio;
2. ejecutar lint y typecheck;
3. ejecutar unitarias e integración;
4. construir la imagen OCI;
5. iniciar efímeramente con secretos sintéticos y escuchar sólo localhost;
6. ejecutar smoke completo con proveedor OIDC falso y datos sintéticos;
7. revisar conexiones/DNS y confirmar sólo las esperadas;
8. ejecutar Gitleaks, análisis de dependencias, licencias, vulnerabilidades y SBOM;
9. revisar el diff completo como revisión senior de sólo lectura;
10. corregir hallazgos altos y medios válidos, agregar tests y repetir;
11. reportar los hallazgos bajos pendientes y cada punto `NO PROBADO`.

No bajar versiones para ocultar avisos ni aceptar vulnerabilidades críticas/altas aplicables. Si una herramienta externa no está disponible, registrar comando, causa y alternativa ejecutada; no declarar que pasó.

## 10. Documentación que debe quedar en el repositorio

- README actualizado con alcance real y capturas sólo sintéticas;
- ADR del stack y dependencias;
- arquitectura y diagrama textual de fronteras;
- modelo de amenazas;
- configuración y secretos;
- Google OIDC local paso a paso sin credenciales reales;
- alta de cliente OAuth/MCP;
- referencia OpenAPI y MCP;
- modelo y perfiles FHIR soportados;
- guía Docker local;
- backup, restauración y exportación;
- actualización y rotación de claves;
- lista de egresos de red;
- inventario de licencias/SBOM;
- limitaciones clínicas y legales;
- estado de cada requisito del MVP: `implementado`, `parcial`, `pendiente` o `NO PROBADO`.

La documentación pública usa placeholders (`persona@example.invalid`, IDs y resultados sintéticos). Ninguna guía debe pedir poner secretos dentro del checkout.

## 11. Definición de terminado

El MVP sólo puede declararse terminado si:

- funciona con un `docker compose up` de un solo servicio y sin pago;
- el origen local es único y el host publica sólo localhost;
- Google OIDC, sesiones y consentimiento funcionan;
- las bóvedas están aisladas y cifradas;
- se pueden cargar/revisar documentos y registrar resultados, citas y seguimientos;
- la pregunta de seguimiento produce respuesta explicable y no inventada;
- REST, FHIR y MCP usan los mismos casos de uso y autorización;
- los clientes usan OAuth con scopes y revocación;
- compartir es granular, temporal, revocable y auditable;
- exportación y restauración pasan con datos sintéticos;
- no hay servicios externos clínicos, telemetría ni egreso inesperado;
- licencias y dependencias permiten autoalojamiento abierto;
- no quedan vulnerabilidades críticas/altas aplicables ni hallazgos altos/medios válidos de revisión;
- todas las pruebas de la sección 9 pasaron sobre el commit publicado;
- el PR permanece en borrador y sin merge para revisión humana.

## 12. Formato del informe de Grok-M

Al terminar cada bloque importante y al cerrar su ejecución, informar de forma breve:

```text
Estado: completado | parcial | bloqueado
Rama y commit:
PR borrador:
Fases terminadas:
Qué puede probar una persona hoy:
Pruebas ejecutadas y resultado:
Seguridad/licencias:
Pendientes y NO PROBADO:
Decisiones que requieren a la persona responsable:
```

No responder sólo con un plan: el pedido autoriza implementación. No afirmar término basándose en código no ejecutado, mocks que omitan los límites de seguridad o un commit que no sea el publicado en el PR.

## 13. Registro de ejecución (Grok-M)

**Estado actual:** parcial — Fase 0 usable tras correcciones de revisión; CI del commit de GLM estaba en rojo y se corrigió. MVP completo sigue pendiente.

| Fecha (Santiago) | Paso | Resultado |
| --- | --- | --- |
| 2026-09-02 | Localizar encargo y repo | `C:\Users\gery_\Code\mi-salud`, rama `feat/initial-mvp`, PR borrador [#1](https://github.com/ggerena/mi-salud/pull/1) |
| 2026-09-02 | ADR 0001 | `docs/md/ADR_0001_STACK_PROCESO_UNICO.md` — Node 24.20.0, Hono 4.13.5, `node:sqlite`, imagen `node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` |
| 2026-09-02 | Coordinación | Gery pidió agentes más chicos. Andamiaje Fase 0 asignado a GLM-5.3-Flash (un solo escritor). Grok-M retiene OIDC, cifrado, aislamiento, clínica, revisión de seguridad. |
| 2026-09-02 | Fase 0 — andamiaje (GLM-5.3-Flash) | Ver sección "Registro Fase 0 (GLM-5.3-Flash)" abajo. |
| 2026-09-02 | Revisión Grok-M de `362da4e` | CI rojo: lint Biome y Gitleaks `generic-api-key` en fixture sintético. `.gitignore` `objects/` ocultaba `src/infrastructure/objects/`. Compose podía heredar `HOST=127.0.0.1` del `.env` y dejar el contenedor inalcanzable. |

## Registro Fase 0 (GLM-5.3-Flash)

**Decisiones mecánicas (sin cambiar stack del ADR):**

- `bodyLimit` de Hono responde 413 con `Response` directo (tipado de `c.json` con genéricos no resolvía; comportamiento idéntico).
- `check:secrets` requiere binario `gitleaks` local; si falta, falla con mensaje y remite al job de CI (envoltorio honesto del ADR).
- SBOM vía `@cyclonedx/cyclonedx-npm` 4.1.2; `sbom.json` queda en `.gitignore`.
- Imagen runtime usa `USER node` (uid 1000, ya existe en la imagen oficial); contenedor escucha 0.0.0.0 interno y Compose publica solo `127.0.0.1:8080:8080`. Volúmenes nombrados fuera del checkout, `read_only: true` y `no-new-privileges`.
- `.nvmrc`/engines fijan 24.20.0; la máquina local tiene 24.18.0 (solo warning de engines; CI usa `node-version-file: .nvmrc` = 24.20.0).

**Archivos creados:** `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.json`, `tsconfig.build.json`, `biome.json`, `.env.example`, `Dockerfile`, `compose.yaml`, `.github/workflows/ci.yml`, `scripts/checks.mjs`, `src/**` (app: config/logger/server/main; barrels en domain/application/infrastructure/interfaces/shared), `tests/unit/config.test.ts`, `tests/unit/logger.test.ts`, `tests/integration/http.test.ts`, `tests/smoke/process.test.ts`, `tests/fixtures/keys.ts`, README actualizado.

**Pruebas ejecutadas (locales, Node 24.18.0):** `npm run lint` OK; `npm run typecheck` OK (TS estricto, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); `npm test` 15/15 verdes; `npm run test:smoke` 2/2 (proceso real arranca con clave sintética y falla cerrado sin clave); `npm run build` OK (emite `dist/` con extensiones reescritas); `npm run check:security` OK (0 vulnerabilidades `npm audit --omit=dev --audit-level=high`); `npm run check:licenses` OK; `npm run check:secrets` OK (gitleaks: no leaks); `npm run sbom` OK (CycloneDX).

**NO PROBADO aquí:** build de imagen OCI y `docker compose up` (requiere Docker; queda para revisión de Grok-M/CI). CI completa solo en push.

**Bloqueos:** ninguno.

**Pendiente inmediato:** revisión del diff por Grok-M; imagen OCI en entorno con Docker.

## Registro revisión Fase 0 (Grok-M)

**Hallazgos corregidos (alta/media):**

- Lint CI: formato, `useLiteralKeys` y orden de exports; `biome.json` migrado a `rules.preset`.
- Gitleaks: allowlist de `tests/fixtures/` (clave sintética, no secreta).
- `.gitignore`: `/objects/` y datos personales solo en la raíz; se versiona `src/infrastructure/objects/index.ts`.
- `compose.yaml` fuerza `HOST=0.0.0.0` dentro del contenedor (el host sigue en `127.0.0.1:8080`).
- Imagen: copia `LICENSE` (AGPL).
- `scripts/checks.mjs`: sin `require` ESM; `npm`/`npx` en Windows.

**Pruebas de esta revisión (HEAD local, luego el commit de corrección):** lint OK; typecheck OK; unit+integration 15/15; smoke 2/2; `npm audit --omit=dev --audit-level=high` 0; imagen `mi-salud:local` construida; `docker compose up` efímero: `/health` y `/ready` en `127.0.0.1:8080`, uid 1000, incluso con `HOST=127.0.0.1` en `.env`.

**Pendientes / NO PROBADO:** Gitleaks de CI sobre el commit nuevo; volumenes nombrados siguen root (sin escritura en Fase 0); logs no redactan strings sueltos sin nombre de campo sensible; OIDC/bóvedas/clínica/FHIR/MCP no implementados.
