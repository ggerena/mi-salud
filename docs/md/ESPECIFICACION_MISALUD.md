# MiSalud — especificación funcional y técnica del backend

**Estado:** propuesta inicial para revisión
**Fecha:** 2026-09-02
**Alcance:** backend personal de salud, API, servidor MCP y una interfaz web mínima de revisión humana
**Modelo:** proyecto personal, autoalojable y de código fuente abierto; no se plantea como servicio comercial
**Uso inicial asumido:** Chile, una bóveda autoalojada e independiente por persona, vinculada a su propia cuenta Google. Varias personas pueden usar el mismo software, pero no necesitan compartir instancia, base de datos, claves ni administrador

## 1. Resumen ejecutivo

MiSalud será una bóveda clínica personal y, a la vez, un registro de salud estructurado. Su propósito es conservar información médica independientemente del portal de una clínica y permitir que una inteligencia artificial autorizada responda preguntas útiles usando evidencia trazable.

El producto será **backend-first**, pero incluirá un sitio web deliberadamente liviano. La cuenta se crea e inicia exclusivamente con Google OpenID Connect en el MVP. Después de entrar, la misma identidad permite usar el sitio o autorizar un cliente compatible para acceder mediante MCP o API.

No basta con guardar archivos. Por cada examen, MiSalud debe conservar:

1. el original exacto recibido o una captura verificable del contenido accesible;
2. su procedencia, fecha, emisor y huella criptográfica;
3. los resultados clínicos estructurados, con unidad, rango de referencia y contexto;
4. las indicaciones de control emitidas por un profesional o una regla clínica identificable;
5. el historial de correcciones, accesos y comparticiones.

Ejemplo de respuesta esperada:

> Sí, corresponde revisar el control. Tu última vitamina D fue tomada el 2 de junio de 2026 y el informe indicó repetirla en 3 meses; la fecha calculada es el 2 de septiembre de 2026. El último valor registrado fue 18 ng/mL, marcado bajo por ese laboratorio. Fuente: informe X, página 2. Esto es un recordatorio basado en tus registros, no una indicación médica nueva.

Si no existe una indicación explícita o una regla clínica aprobada y vigente, el sistema no debe inventar un intervalo:

> No encontré una fecha de repetición indicada. Tu último resultado fue el 2 de junio de 2026. Puedo mostrarte el informe para que lo consultes con tu profesional.

## 2. Problema que resuelve

- Los portales de clínicas pueden caducar, cambiar o retirar documentos.
- Un PDF aislado no permite comparar resultados ni calcular seguimientos de forma confiable.
- Los nombres, unidades y rangos de un mismo examen varían entre laboratorios.
- Dar acceso total a una IA es innecesario y riesgoso; cada cliente debe recibir sólo el mínimo dato autorizado.
- Compartir la URL original de una clínica no garantiza acceso futuro ni protege adecuadamente la privacidad.
- Una IA puede confundir una extracción automática con un dato confirmado o convertir una sugerencia en diagnóstico.

## 3. Objetivos

### 3.1 Objetivos del producto

- Reunir exámenes, citas, indicaciones, documentos y datos básicos de salud en una cuenta personal.
- Ingerir archivos y vínculos, conservar una copia durable cuando sea técnica y legalmente posible y comprobar su integridad.
- Estructurar resultados para búsquedas longitudinales y recordatorios explicables.
- Entregar una API REST estable y un servidor MCP HTTP para clientes de IA.
- Entregar una interfaz humana simple para revisar extracciones, permisos y acciones que no deben quedar sólo en manos de una IA.
- Compartir temporalmente un examen con un médico mediante un vínculo propio, revocable y auditable.
- Mantener siempre la fuente, el nivel de confianza y las correcciones humanas.
- Permitir exportar toda la información en formatos abiertos.
- Publicar el código bajo una licencia de software libre y mantener un despliegue autoalojable documentado.

### 3.2 No objetivos iniciales

- Diagnosticar, prescribir, cambiar tratamientos o sustituir a un profesional.
- Decidir por cuenta propia cada cuánto debe repetirse un examen.
- Ser una ficha clínica oficial de un prestador de salud sin evaluación legal y certificaciones adicionales.
- Integrarse en el MVP con todos los portales de clínicas ni eludir autenticación, CAPTCHA o medidas de acceso.
- Guardar contraseñas de clínicas o entregar documentos privados mediante vínculos permanentes y públicos.
- Interpretar imágenes diagnósticas DICOM; inicialmente se conserva el estudio o informe y sus metadatos.
- Crear una aplicación móvil nativa o un portal web clínico completo en esta fase.
- Cobrar, vender cuentas o construir una plataforma SaaS comercial.

## 4. Principios obligatorios

1. **La fuente manda.** Un dato extraído siempre enlaza al documento y ubicación de origen.
2. **Nada clínico se inventa.** Ausencia de evidencia se expresa como ausencia, no como una conclusión.
3. **Original inmutable, derivados versionados.** OCR, miniaturas y datos corregidos nunca reemplazan el original.
4. **Acceso mínimo.** Cada persona, aplicación e IA recibe permisos por propósito, recurso y duración.
5. **La IA no entra a la base de datos.** Usa servicios autorizados que filtran, registran y explican cada respuesta.
6. **Una URL no es un respaldo.** Un vínculo sólo se considera preservado después de copiar, verificar y registrar el objeto.
7. **Todo acceso sensible deja rastro.** Lectura, descarga, extracción, edición, exportación y compartición son auditables.
8. **Borrado y revocación reales.** Revocar un enlace corta nuevos accesos; eliminar sigue un proceso comprobable, sujeto a obligaciones de conservación aplicables.
9. **Diseño portable.** Datos estructurados en FHIR R4 o mapeables a FHIR R4; documentos exportables sin depender de MiSalud.
10. **Seguridad clínica.** Resultados críticos no se ocultan, suavizan ni convierten en consejo automático.
11. **El repositorio nunca contiene datos reales.** Código, documentación, fixtures y capturas usan sólo identidades y resultados sintéticos.

## 5. Usuarios y actores

- **Titular:** dueño de la cuenta y de sus datos.
- **Grupo doméstico:** conjunto pequeño de cuentas independientes que pueden compartir recursos concretos entre sí; pertenecer al grupo no concede acceso automático.
- **Cuidador o representante:** acceso delegado, acotado y revocable.
- **Profesional invitado:** accede sólo al conjunto compartido, por tiempo y propósito definidos.
- **Aplicación cliente:** app o servicio autorizado mediante OAuth.
- **Cliente de IA/MCP:** agente que consulta recursos o ejecuta herramientas dentro de sus scopes.
- **Sitio web humano:** cliente oficial mínimo para revisar extracciones, autorizar acciones sensibles y administrar la cuenta.
- **Operador técnico:** administra infraestructura sin acceso clínico ordinario; todo acceso excepcional queda justificado y auditado.
- **Servicio de ingestión:** descarga, valida, analiza y archiva documentos.
- **Motor de seguimiento:** calcula vencimientos a partir de indicaciones y reglas versionadas; no practica medicina.

## 6. Alcance del MVP

### 6.1 Incluido

- Alta e inicio de sesión exclusivamente con Google mediante OpenID Connect; sin contraseñas propias de MiSalud.
- Hasta tres perfiles personales independientes en la primera instalación doméstica, sin codificar ese límite en el dominio.
- Invitación por correo y aceptación autenticada para ingresar al grupo doméstico; ninguna cuenta ve datos ajenos por defecto.
- Sitio web responsivo mínimo para carga, revisión, corrección, permisos y compartición.
- Perfil de paciente mínimo.
- Carga de PDF, imagen, CSV/XLSX y vínculo HTTP(S).
- Copia durable, hash SHA-256, antivirus, metadatos y estado de ingestión.
- OCR y extracción asistida de informes de laboratorio.
- Confirmación/corrección humana de datos extraídos de baja confianza.
- Registro de paneles de laboratorio y resultados individuales.
- Citas médicas y recordatorios básicos.
- Indicaciones explícitas de repetición y tareas de seguimiento.
- Línea temporal y búsqueda por código, nombre, fecha o institución.
- Comparación histórica de un analito conservando unidades y rangos originales.
- API REST documentada con OpenAPI.
- MCP remoto por HTTP sobre HTTPS, protegido con OAuth y conforme a la revisión estable elegida.
- Vínculos propios de compartición, con expiración, revocación y registro de acceso.
- Exportación de documentos originales y paquete FHIR R4/JSON.
- Auditoría visible para el titular.

### 6.2 Fuera del MVP, pero previsto

- Importadores específicos para clínicas, laboratorios y aseguradoras.
- Recepción por correo dedicado.
- Exportación manual de citas a calendarios: desde MCP o el sitio, MiSalud entrega un vínculo propio para que la persona autenticada confirme y descargue un archivo `.ics` o abra el formulario de Google Calendar. No requiere permisos de Calendar ni sincronización automática.
- Integración SMART on FHIR con prestadores.
- Recetas, vacunas, alergias, condiciones, medicamentos y dispositivos.
- Soporte DICOM progresivo: conservación del archivo original y metadatos, seguido por un visor web básico y, sólo si resulta necesario, integración PACS. Debe poder implementarse con bibliotecas abiertas y autoalojables, sin exigir servicios o licencias pagadas.
- Reglas clínicas publicadas por una organización responsable y revisadas por profesionales.
- Organizaciones, prestadores con muchos pacientes y representación legal compleja.
- Firma electrónica avanzada y flujos formales de derivación.

## 7. Decisiones de arquitectura

### 7.1 Forma inicial

Construir un **monolito modular en un solo contenedor y un solo proceso de aplicación**. El mismo proceso sirve el sitio, REST, FHIR, MCP y consume una cola persistida en SQLite. No se introducen microservicios, Redis, broker, TimescaleDB, PostgreSQL ni un segundo contenedor en el MVP.

Componentes lógicos:

- Sitio web mínimo, servido de forma estática o desde el mismo backend.
- API de aplicación y API FHIR.
- Servidor MCP como adaptador de la misma capa de aplicación.
- Autorización y consentimiento.
- Registro clínico.
- Ingestión y extracción.
- Planes, recordatorios y motor de seguimiento.
- Compartición.
- Auditoría y procedencia.
- Ejecutor interno de trabajos para descargas, antivirus, OCR y normalización; podrá separarse sólo si una medición real lo exige.
- Almacenamiento relacional y almacenamiento de objetos.

### 7.2 Persistencia portable

El dominio usa interfaces internas para SQL, objetos y trabajos. Ninguna regla clínica conoce D1, R2, el sistema de archivos ni una API de proveedor.

- **SQL:** un archivo SQLite independiente por bóveda personal en el perfil Docker y una base o namespace aislado por persona en el perfil Cloudflare. Ambos comparten semántica SQLite y migraciones compatibles. PostgreSQL puede añadirse después mediante otro adaptador, no es requisito inicial.
- **Objetos:** directorio cifrado fuera del repositorio en Docker y bucket privado R2 en Cloudflare. Nunca se entregan URLs directas del bucket.
- **Trabajos:** tabla outbox consumida por el mismo proceso local, con reintentos e idempotencia. Cloudflare Queues será un adaptador posterior, no una dependencia del núcleo.
- **Búsqueda:** índices SQL y texto completo al inicio. La búsqueda vectorial queda fuera del camino clínico crítico.
- **Backups:** exportación cifrada de la base y objetos, manifestada por hashes, independiente del proveedor.
- **Carpetas sincronizadas:** la base SQLite activa nunca vive dentro de Dropbox, OneDrive, Google Drive, una unidad de red o una carpeta sincronizada. Esos destinos sólo reciben snapshots consistentes y cifrados creados por la aplicación.

### 7.3 Perfil principal — Docker en el PC

Éste es el camino de desarrollo y el primer despliegue real:

- Un `docker compose up` inicia un único servicio de aplicación; no requiere base, cola, almacenamiento ni servicio pagado externo.
- El sitio, REST y MCP se exponen por el mismo origen HTTP(S).
- SQLite usa un volumen persistente externo al checkout, modo WAL y backups consistentes.
- Los originales usan otro volumen persistente externo al checkout, cifrado por la aplicación.
- Las claves y el secreto OAuth viven en `.env` local o Docker secrets, nunca en Git.
- Para desarrollo individual, Google OIDC puede volver a una URL `localhost` registrada.
- Para que otras personas entren desde sus equipos se necesita un origen HTTPS estable. Se recomienda Cloudflare Tunnel hacia el contenedor, sin abrir puertos del router, o migrar al perfil Cloudflare.
- Si el PC se apaga, el sitio y MCP dejan de estar disponibles; los recordatorios pendientes se procesan al reiniciar.
- Debe existir una copia de seguridad cifrada fuera de ese PC y una prueba de restauración.
- Dropbox puede seleccionarse como destino de backup sin convertirse en dependencia: MiSalud crea primero un snapshot consistente mediante la API de backup de SQLite o `VACUUM INTO`, lo empaqueta con los objetos y el manifiesto, lo cifra localmente y recién entonces lo copia a la carpeta sincronizada.
- Los archivos `-wal` y `-shm` no se sincronizan ni se copian manualmente. La aplicación verifica el hash y realiza una restauración de prueba antes de declarar válido un backup.

### 7.4 Perfil alternativo — Cloudflare económico

Para mantener MiSalud disponible sin dejar el PC encendido:

- **Workers + Static Assets:** sitio liviano, API REST, OAuth y MCP en un solo proyecto.
- **D1:** datos relacionales y auditoría; usar sesiones/consultas compatibles cuando se necesite lectura después de escritura.
- **R2 Standard:** documentos y derivados privados, con cifrado de aplicación, hashes y versionado lógico.
- **Queues:** ingestión asíncrona con entrega al menos una vez; cada trabajo debe ser idempotente y tener dead-letter queue.
- **Workers AI o proveedor externo:** opcional para extracción. El OCR pesado no debe ejecutarse dentro de una petición corta de Worker.
- **Secrets Store/secret bindings:** credenciales y claves, nunca variables públicas.

Para tres personas y poco tráfico, la asignación gratuita vigente de Workers, D1, R2 y Queues puede ser suficiente, pero no es una garantía contractual. La aplicación debe medir uso y avisar antes de acercarse a límites. En particular, R2 ofrece actualmente 10 GB-mes gratuitos en la clase Standard y Workers Free limita CPU por invocación, por lo que documentos grandes y OCR requieren diseño asíncrono.

### 7.5 Portabilidad y ausencia de bloqueo

- Publicar una imagen OCI y `compose.yaml` que funcionen sin Cloudflare.
- Implementar primero sólo `sqlite-local`, `filesystem` y `local-jobs`. Añadir `d1`, `r2` y `cloudflare-queues` cuando se construya el perfil Cloudflare, detrás de los mismos contratos mínimos.
- No usar KV, Durable Objects, Workers AI ni servicios propietarios como fuente única de verdad.
- Probar en integración tanto el perfil Docker como el perfil Cloudflare.
- Exportar SQLite/JSON FHIR, documentos originales y un manifiesto de hashes.
- Documentar restauración desde Cloudflare hacia Docker y desde Docker hacia Cloudflare.

La base razonable es TypeScript, APIs web estándar y SQL compatible con SQLite. El MVP debe caber en una imagen OCI pequeña y funcionar sin Cloudflare. La compatibilidad con Workers se comprobará mediante adaptadores posteriores y no justificará complejidad anticipada en el perfil local.

### 7.6 Sitio web mínimo

La interfaz inicial debe priorizar claridad, poco mantenimiento y seguridad:

- HTML renderizado en servidor o una capa pequeña de JavaScript progresivo; no crear una SPA compleja sin una necesidad demostrada.
- Diseño responsivo para teléfono y escritorio.
- Sin lógica clínica duplicada: cálculos, permisos y validaciones viven en el backend.
- Sin acceso directo al almacenamiento de objetos ni a la base de datos.
- Pantallas iniciales: acceso con Google, bandeja de documentos, carga/URL, revisión campo por campo, línea temporal, citas, seguimientos, vínculos compartidos, clientes conectados y auditoría.
- Comparación lado a lado entre la página original y cada valor extraído.
- Acciones sensibles con resumen previo y confirmación explícita.
- Estados comprensibles de ingestión, errores recuperables y accesibilidad por teclado y lector de pantalla.
- Sin analítica, píxeles, fuentes remotas ni scripts de terceros en vistas autenticadas que puedan revelar navegación clínica.

## 8. Modelo de información

El modelo interno puede optimizarse para MiSalud, pero su frontera clínica debe mapearse a **FHIR R4**, alineado con la adopción publicada por MINSAL Chile.

### 8.1 Entidades principales

| Entidad | Propósito | Correspondencia FHIR aproximada |
| --- | --- | --- |
| `Account` | identidad de acceso, estado, recuperación | fuera de FHIR |
| `ExternalIdentity` | vínculo Google por `iss` + `sub` | fuera de FHIR |
| `Household` / `HouseholdMembership` | invitación y pertenencia sin acceso clínico implícito | `RelatedPerson` sólo cuando exista una relación clínica explícita |
| `PatientProfile` | identidad clínica del titular | `Patient` |
| `Provider` / `Organization` | médico, laboratorio o clínica | `Practitioner`, `PractitionerRole`, `Organization` |
| `Appointment` | cita agendada o histórica | `Appointment` |
| `ClinicalDocument` | metadatos de un archivo o representación | `DocumentReference` |
| `StoredObject` | original/derivado, hash, tamaño, cifrado | `Binary`/`Attachment` o infraestructura |
| `DiagnosticReport` | conjunto de resultados de un examen | `DiagnosticReport` |
| `Observation` | resultado atómico medido | `Observation` |
| `ServiceRequest` | examen solicitado | `ServiceRequest` |
| `FollowUpPlan` | indicación o plan de repetición | `CarePlan`, `Task` o extensión perfilada |
| `Reminder` | ejecución programada del seguimiento | `Task`/infraestructura |
| `ConsentGrant` | autorización y restricciones | `Consent` + política interna |
| `ShareGrant` | enlace temporal para un conjunto concreto | política interna, relacionado con `Consent` |
| `ProvenanceRecord` | quién originó o transformó un dato | `Provenance` |
| `AuditEntry` | quién accedió, cuándo y para qué | `AuditEvent` |

### 8.2 Campos clínicos mínimos de una observación

- `id`, `patient_id`, `diagnostic_report_id`.
- código normalizado, idealmente LOINC cuando exista y haya sido validado.
- nombre original exactamente como aparece en la fuente.
- valor: cantidad, texto, código, booleano o ausencia justificada.
- unidad original y unidad normalizada UCUM cuando la conversión sea válida.
- rango de referencia original, sexo/edad/contexto si el informe los condiciona.
- marca original: bajo, normal, alto, crítico o no informado.
- fecha/hora efectiva, fecha del informe y zona horaria.
- método, muestra y estado cuando estén disponibles.
- fuente exacta: documento, página/celda/sección y fragmento acotado.
- método de captura: importado estructurado, extraído por OCR/LLM o ingresado manualmente.
- confianza por campo y estado: `extraído`, `requiere_confirmación`, `confirmado`, `corregido`.
- versión y procedencia de cada corrección.

Nunca se debe reinterpretar una marca usando un rango genérico si el informe trae su propio rango. Las conversiones de unidades deben ser explícitas, testeadas y reversibles.

### 8.3 Documentos y objetos

`ClinicalDocument` no contiene sólo una URL. Debe apuntar a uno o más `StoredObject`:

- `original`: bytes exactos obtenidos;
- `normalized`: por ejemplo PDF/A generado, sin reemplazar el original;
- `ocr_text`: texto extraído y su mapa a páginas;
- `thumbnail` o vista previa;
- `structured_extraction`: salida versionada de extracción.

Cada objeto registra MIME detectado, tamaño, hash, fecha de captura, origen, versión, clave de cifrado, estado antivirus y relación con el original.

### 8.4 Indicaciones y reglas de seguimiento

Un `FollowUpPlan` debe separar claramente:

- **qué** se debe revisar (`LOINC`, grupo de exámenes o texto original);
- **por qué** (indicación profesional, protocolo identificado o decisión manual del titular);
- **desde cuándo** se calcula;
- intervalo o fecha exacta;
- tolerancia para estados `próximo`, `corresponde` y `atrasado`;
- condiciones de activación o cierre;
- fuente y cita;
- autor responsable;
- versión, jurisdicción, fecha de vigencia y fecha de revisión si proviene de una regla;
- estado: borrador, confirmado, activo, cumplido, cancelado o reemplazado.

Orden de autoridad para calcular una respuesta:

1. indicación explícita del profesional vinculada al paciente;
2. plan confirmado manualmente por el titular;
3. regla clínica aprobada, vigente y aplicable, presentada como recomendación general;
4. sin regla: informar sólo la fecha y resultado previos, sin inventar periodicidad.

Un resultado anormal no autoriza por sí solo a crear un plazo. Puede elevar la visibilidad de una indicación ya existente o sugerir consultar a un profesional.

## 9. Ingestión de archivos y vínculos

### 9.1 Flujo común

1. Crear una solicitud de ingestión y devolver un identificador idempotente.
2. Validar permiso, tipo, tamaño y cuota.
3. Poner el contenido en cuarentena.
4. Detectar MIME por bytes, escanear malware y calcular hash.
5. Guardar el original cifrado e inmutable.
6. Registrar procedencia y comprobar que el objeto puede volver a leerse.
7. Extraer texto/tablas; conservar coordenadas de origen.
8. Proponer estructura clínica y códigos, sin declararlos confirmados automáticamente.
9. Validar esquema, unidades, fechas, identidad del paciente y duplicados.
10. Confirmar automáticamente sólo campos que superen umbrales definidos y reglas deterministas; enviar el resto a revisión.
11. Publicar el informe y sus observaciones de forma transaccional.
12. Ejecutar reglas de seguimiento y registrar qué versión produjo cada recordatorio.

### 9.2 Ingestión por URL

Estados explícitos: `recibida`, `descargando`, `capturada`, `requiere_interacción`, `fallida_temporal`, `fallida_permanente`, `bloqueada`, `procesada`.

Reglas:

- Aceptar sólo HTTP(S).
- Bloquear IP privadas, localhost, metadatos de nube, redirecciones peligrosas y DNS rebinding para evitar SSRF.
- Aplicar límites de redirecciones, tiempo y bytes; validar cada salto.
- No ejecutar JavaScript arbitrario en el proceso de la API.
- Si el vínculo requiere sesión, no pedir ni almacenar la contraseña del portal en el MVP. Ofrecer carga manual del archivo; más adelante, un importador aislado con consentimiento puede capturar una sesión temporal.
- Guardar la URL original redactada cuando contenga tokens; nunca registrar tokens en logs.
- Capturar encabezados útiles, fecha, nombre sugerido y comprobante de descarga.
- No marcar como respaldado hasta verificar hash, almacenamiento y lectura.
- Respetar permisos y condiciones de acceso; no eludir controles técnicos.

### 9.3 Duplicados y nuevas versiones

- Mismo hash: reutilizar el objeto físico y crear sólo las relaciones necesarias.
- Distinto hash con mismo emisor/fecha/identificador: conservar ambas versiones y pedir reconciliación.
- Una corrección del laboratorio reemplaza clínicamente a la versión previa, pero no la borra.

## 10. Respuestas clínicas seguras y explicables

### 10.1 Contrato de respuesta

Las herramientas de consulta deben devolver datos estructurados antes de producir lenguaje natural:

```json
{
  "question": "¿Me toca hacerme exámenes?",
  "as_of": "2026-09-02T12:00:00-04:00",
  "items": [
    {
      "test": "25-OH vitamina D",
      "status": "due",
      "due_date": "2026-09-01",
      "basis": "clinician_instruction",
      "basis_text": "Repetir en 3 meses",
      "last_observation": {
        "value": 18,
        "unit": "ng/mL",
        "flag": "low",
        "effective_at": "2026-06-03"
      },
      "source": {
        "document_id": "doc_...",
        "page": 2
      },
      "confidence": "confirmed"
    }
  ],
  "limitations": [],
  "safety_notice": "Recordatorio basado en registros; no es diagnóstico ni una nueva indicación médica."
}
```

### 10.2 Estados de vencimiento

- `not_due`: aún fuera de la ventana.
- `upcoming`: dentro de la ventana previa configurada.
- `due`: llegó la fecha o intervalo.
- `overdue`: superó la tolerancia.
- `completed_pending_review`: existe un resultado nuevo pendiente de vinculación/confirmación.
- `unknown`: no hay base suficiente.
- `superseded` o `cancelled`: el plan ya no aplica.

El cálculo usa tiempo del servidor en UTC y conserva la zona horaria clínica. Debe ser determinista y testeable sin LLM.

Los intervalos de calendario se conservan con su semántica original: `P3M` significa tres meses calendario, no 90 días. Las reglas deben definir qué ocurre cuando el día no existe en el mes de destino y probar años bisiestos y cambios de zona horaria.

### 10.3 Límites de la IA

- No convertir rangos de laboratorio en diagnóstico.
- No asegurar causalidad entre un síntoma y un resultado.
- No inferir embarazo, cáncer, salud mental u otra condición sensible no registrada.
- No alterar una indicación profesional.
- No ocultar discrepancias entre documentos.
- Señalar datos no confirmados y problemas de unidad.
- Ante un resultado marcado crítico por la fuente, mostrar la advertencia original y recomendar seguir las instrucciones del prestador o contactar atención profesional; no improvisar urgencias clínicas.
- En una emergencia declarada por el usuario, orientar a servicios de emergencia apropiados, sin intentar resolverla con el registro.

## 11. API REST

Base propuesta: `/v1`. JSON por defecto, OpenAPI publicado y versionado. Escrituras con `Idempotency-Key`; paginación por cursor; errores con un formato consistente y `correlation_id`.

### 11.1 Grupos de endpoints

```text
GET    /auth/google/start
GET    /auth/google/callback
POST   /auth/logout
GET    /v1/me/sessions
DELETE /v1/me/sessions/{id}

POST   /v1/uploads
POST   /v1/imports/url
GET    /v1/imports/{id}
GET    /v1/documents
GET    /v1/documents/{id}
GET    /v1/documents/{id}/content
POST   /v1/documents/{id}/confirm-extraction

GET    /v1/diagnostic-reports
GET    /v1/diagnostic-reports/{id}
GET    /v1/observations
GET    /v1/observations/{id}
GET    /v1/observations/trends?code=...

GET    /v1/appointments
POST   /v1/appointments
PATCH  /v1/appointments/{id}

GET    /v1/follow-up-plans
POST   /v1/follow-up-plans
PATCH  /v1/follow-up-plans/{id}
GET    /v1/follow-ups/due?as_of=...

POST   /v1/shares
GET    /v1/shares
DELETE /v1/shares/{id}
GET    /s/{opaque_token}

GET    /v1/audit
POST   /v1/exports
GET    /v1/exports/{id}
```

### 11.2 API FHIR

Exponer gradualmente `/fhir/r4` con `CapabilityStatement` y perfiles explícitos. El MVP puede comenzar con lectura/escritura controlada de:

- `Patient`
- `Practitioner`, `Organization`
- `Appointment`
- `ServiceRequest`
- `DiagnosticReport`
- `Observation`
- `DocumentReference`, `Binary`
- `Provenance`, `Consent` y `AuditEvent` donde corresponda

No afirmar “compatibilidad FHIR” sólo por imitar nombres; se requieren validadores, perfiles, terminologías y pruebas de conformidad.

FHIR permitirá conectar MiSalud con otras aplicaciones mediante tres caminos:

1. **Importar/exportar:** paquetes `Bundle` FHIR R4 y documentos asociados.
2. **API directa:** clientes autorizados consultan los recursos anunciados en `CapabilityStatement`.
3. **SMART on FHIR:** una app o prestador compatible autoriza acceso con OAuth y scopes FHIR.

La interoperabilidad real se prueba con suites de conformidad y al menos dos clientes externos. MiSalud publicará los perfiles que exige, extensiones propias, terminologías y operaciones no soportadas. Los perfiles chilenos de MINSAL tienen prioridad para el despliegue inicial; para otro país se selecciona otro paquete de perfiles sin cambiar el dominio central.

## 12. Servidor MCP

MCP es una interfaz de IA sobre la misma capa de autorización y negocio, no una ruta privilegiada.

### 12.1 Protocolo, transporte y autorización

- Implementar la revisión MCP estable `2026-07-28`, con núcleo sin estado y solicitudes autocontenidas; usar su transporte HTTP sobre HTTPS.
- El servidor MCP actúa como OAuth Resource Server.
- Descubrimiento mediante Protected Resource Metadata y metadatos del servidor de autorización.
- Authorization Code con PKCE para acceso interactivo.
- Tokens de corta duración, audiencia específica para MiSalud y refresh tokens rotados cuando existan.
- Nunca aceptar token passthrough de otro servicio ni tokens en la URL.
- Consentimiento incremental para scopes sensibles.

### 12.2 Cuenta e inicio de sesión con Google

Google se integra como proveedor de identidad mediante **OpenID Connect**. Es la única vía de alta e inicio de sesión del MVP, pero no es el repositorio clínico ni decide permisos internos:

- Usar el flujo de autorización del lado servidor y una biblioteca OIDC mantenida.
- Solicitar sólo `openid email profile`; omitir `profile` si la interfaz no lo necesita.
- Validar firma, `iss`, `aud`, `exp`, `nonce` y `state` del ID token.
- Identificar la cuenta externa por la pareja estable `iss` + `sub`, nunca por el correo como clave primaria.
- No guardar el access token de Google si sólo se necesita autenticación.
- No solicitar Gmail, Drive, Calendar, contactos ni otros scopes durante el acceso.
- Una integración futura con Drive o Calendar exige un consentimiento separado, incremental y revocable.
- Google no recibe resultados, nombres de exámenes ni vínculos compartidos como parte del login.
- Vincular un `sub` distinto o cambiar el correo visible nunca fusiona cuentas automáticamente.
- Las sesiones de MiSalud son propias, cortas, visibles y revocables; una sesión web no se reutiliza como token MCP.
- Configurar URIs de redirección exactas, HTTPS y credenciales distintas por ambiente.
- Como Google es la única identidad del MVP, la recuperación de acceso depende de la recuperación de la cuenta Google. La exportación completa evita que los datos queden atrapados si se decide migrar de identidad en una versión futura.

Desde el sitio, el titular registra o autoriza clientes MCP/API. MiSalud emite tokens propios, limitados por scope y audiencia; el token de Google nunca se entrega a esos clientes.

### 12.3 Scopes iniciales

```text
misalud.profile.read
misalud.documents.read
misalud.documents.write
misalud.results.read
misalud.appointments.read
misalud.appointments.write
misalud.followups.read
misalud.followups.write
misalud.shares.create
misalud.audit.read
```

Los scopes se combinan con propiedad del recurso, propósito, sensibilidad, destinatario y vigencia. `*.read` nunca implica compartir ni descargar el original.

### 12.4 Herramientas MCP propuestas

| Herramienta | Efecto | Requiere confirmación del usuario |
| --- | --- | --- |
| `health_summary` | resumen acotado con fuentes | no, si el scope ya fue concedido |
| `list_due_followups` | controles próximos, vencidos o desconocidos | no |
| `get_lab_trend` | serie de resultados comparables | no |
| `find_documents` | metadatos y coincidencias | no |
| `get_document_details` | datos estructurados y citas | no |
| `create_appointment` | crea una cita local | sí en el cliente antes de escribir |
| `create_follow_up_plan` | registra un plan, sin emitir indicación clínica | sí |
| `import_document_url` | inicia descarga de un vínculo | sí |
| `create_share_link` | concede acceso a un tercero | sí, siempre |
| `revoke_share_link` | revoca una concesión | sí |

Las herramientas que cambian estado deben declararlo, aceptar claves de idempotencia y devolver el recurso resultante más un evento de auditoría.

Como mejora posterior y no prioritaria, `create_appointment` puede devolver además un `calendar_action_url` de MiSalud. Ese vínculo abre una pantalla humana autenticada, muestra un resumen y exige confirmación antes de descargar `.ics` o abrir Google Calendar. El vínculo no contiene datos clínicos ni credenciales; identifica la cita mediante un valor opaco y queda sujeto a propiedad del recurso, expiración y auditoría. La exportación usa por defecto un título genérico como `Cita médica` y no incluye diagnóstico, resultado ni nombre de examen. Cualquier envío de ubicación, profesional o notas a Google debe mostrarse previamente y requerir una decisión explícita de la persona.

Esta exportación manual no necesita scopes de Google Calendar. Una sincronización directa futura sigue exigiendo consentimiento incremental, revocable y separado del inicio de sesión.

### 12.5 Recursos MCP

- `misalud://patient/me/summary`
- `misalud://patient/me/followups`
- `misalud://diagnostic-reports/{id}`
- `misalud://documents/{id}/metadata`

El contenido binario grande no debe volcarse por defecto al contexto del modelo. Se entrega metadata, texto acotado o un `resource_link` autorizado.

### 12.6 Resistencia a prompt injection

- Todo texto importado se trata como dato no confiable, nunca como instrucciones para la IA.
- El servidor devuelve campos separados para contenido y metadatos confiables.
- Una instrucción dentro de un PDF o una web no puede ampliar scopes, crear enlaces ni ejecutar otras herramientas.
- El cliente debe confirmar operaciones de escritura/compartición y mostrar destinatario, alcance y expiración.

## 13. Compartición con médicos

### 13.1 Diseño del vínculo

- URL propia de MiSalud con token aleatorio opaco de alta entropía.
- Token almacenado sólo como hash.
- HTTPS, expiración obligatoria y revocación inmediata.
- Alcance a documentos/resultados específicos; nunca toda la cuenta por defecto.
- Vista segura y descarga configurable.
- Encabezados `Cache-Control: no-store`, política anti-indexación y protección contra incrustación.
- Registro de creación, aperturas, descargas, IP aproximada/cliente cuando sea legal y útil, y revocación.
- Opción de segundo factor sencillo para información especialmente sensible.
- Pantalla que identifica al titular, propósito, contenido incluido y vigencia.

Para compartir formalmente con un prestador pueden requerirse identificación reforzada y reglas legales adicionales. El vínculo de MVP es una entrega controlada por el titular, no reemplaza automáticamente los mecanismos legales de ficha clínica.

### 13.2 Contenido compartido

- Informe original verificable.
- Resumen estructurado claramente marcado como extraído o confirmado.
- Emisor, fecha, hash y procedencia.
- Aviso visible si existe una versión corregida o posterior.
- Sin notas privadas ni otros datos no seleccionados.

## 14. Seguridad, privacidad y cumplimiento

Los datos de salud son datos sensibles. Antes de producción se requiere revisión jurídica aplicable al rol real de MiSalud, no sólo una lista técnica.

### 14.1 Controles mínimos

- Cifrado TLS en tránsito y cifrado de base de datos, objetos y backups en reposo.
- Cifrado por envoltura; claves separadas del contenido y rotación documentada.
- Google OIDC como única identidad del MVP; respetar el MFA y la recuperación configurados en la cuenta Google, sin almacenar la contraseña Google.
- Sesiones visibles y revocables.
- Autorización por objeto y tenant en cada consulta, no sólo en el controlador.
- Separación de tareas administrativas y acceso de emergencia excepcional con justificación.
- Secretos en un gestor; nunca en repositorio, logs ni enlaces.
- Logs redactados: sin tokens, contenido de informes ni parámetros sensibles.
- Límites de tasa, detección de abuso y protección de enumeración de IDs.
- Antivirus, validación de formato, sandbox para parsers y límites contra archivos bomba.
- Dependencias fijadas, SBOM, análisis de vulnerabilidades y actualizaciones con pruebas.
- Auditoría append-only o con integridad verificable y reloj sincronizado.
- Alertas por descargas masivas, accesos anómalos y cambios de permisos.
- Pruebas específicas para BOLA/IDOR, autorización rota, SSRF, consumo irrestricto, inventario de APIs y configuraciones inseguras.
- Backups cifrados, objetivo RPO/RTO definido y restauración probada periódicamente.
- Plan de respuesta a incidentes y notificación legal.

### 14.2 Privacidad por diseño

- Consentimiento informado por propósito y cliente.
- Minimización: una herramienta de agenda no necesita resultados de laboratorio.
- Retención configurable y documentada; bloqueo legal separado de uso ordinario.
- Exportación y portabilidad legibles por máquina.
- Corrección sin borrar procedencia.
- Eliminación verificable en primario, réplicas, índices y ciclo de backups.
- Inventario de proveedores/subencargados y transferencias internacionales.
- Prohibición contractual y técnica de usar datos del usuario para entrenar modelos sin una autorización separada, explícita y revocable.
- Analítica operativa sin contenido clínico y, cuando sea posible, agregada o seudonimizada.
- Egreso de red denegado por defecto. Cada proveedor o destino externo requiere una excepción explícita, propósito, datos enviados, país, retención, subencargados y registro visible para el titular.
- OCR e IA externos desactivados por defecto. La alternativa local nunca puede degradarse silenciosamente a un proveedor cloud.

### 14.3 Contexto chileno que debe validar asesoría legal

- La Ley 20.584 considera sensibles la ficha clínica, estudios y documentos de procedimientos o tratamientos, y exige acceso, conservación, confidencialidad, autenticidad e interoperabilidad a los prestadores.
- La Ley 21.719 modifica el régimen de protección de datos y entra en vigor el **1 de diciembre de 2026**; MiSalud debe diseñarse desde ahora para ese marco, aunque su rol y obligaciones concretas dependen del modelo de operación.
- No se debe afirmar que el plazo legal de conservación de una ficha clínica de un prestador aplica idénticamente a una bóveda personal sin dictamen jurídico.
- Desde esa fecha, el nuevo artículo 1 excluye el tratamiento realizado por personas naturales en relación con sus actividades personales. Se debe documentar si la instancia doméstica cabe en esa exclusión y reevaluarlo antes de abrirla a terceros, instituciones o usos comerciales.
- Hasta el 30 de noviembre de 2026, la Ley 19.628 vigente examinada no contiene esa misma exclusión expresa. Que el proyecto sea gratuito o abierto no basta por sí solo para resolver su régimen.
- El nuevo artículo 16 bis permite tratar datos de salud consentidos sólo para fines previstos por leyes especiales sanitarias. El encaje de una bóveda personal y su asistente debe validarse antes de incorporar datos reales.
- Cada adulto mantiene consentimiento y cuenta propios. Los proveedores cloud, de identidad, OCR o IA deben clasificarse como encargados o destinatarios, documentando residencia, contrato y fundamento de cualquier transferencia internacional.

### 14.4 Higiene estricta del repositorio público

El repositorio es público y debe permanecer completamente separado de las instancias reales:

- Prohibido subir nombres reales, correos, fotos, RUT, IDs de Google, documentos, resultados, citas, URLs privadas, tokens, cookies, claves, archivos de base de datos, backups o logs reales.
- Los volúmenes Docker deben ubicarse fuera del checkout. Las rutas por defecto dentro del repo sólo pueden contener directorios vacíos ignorados.
- `.env`, `.env.*`, secretos, SQLite (`*.db`, `*.sqlite*`), objetos, exports, backups, logs y volcados quedan cubiertos por `.gitignore` desde el primer commit.
- `.env.example` contiene únicamente marcadores falsos y dominios reservados como `example.com`.
- Tests, demos, capturas y documentación usan pacientes sintéticos claramente identificados como tales.
- Políticas aceptadas, consentimientos, inventarios de tratamiento, contratos con proveedores y evaluaciones reales viven cifrados fuera del repositorio público. Aquí sólo se publican plantillas vacías y ejemplos sintéticos.
- Los archivos de soporte se generan con redacción automática y requieren revisión antes de adjuntarse a un issue.
- CI ejecuta detección de secretos y una comprobación de artefactos prohibidos; los hooks locales son ayuda adicional, no la única barrera.
- Antes de cada commit/push se revisan archivos incluidos y diff. Si un dato real entra en la historia Git, se considera incidente: revocar secretos, retirar el dato y evaluar reescritura coordinada de historia.

## 15. Auditoría y procedencia

Registrar al menos:

- actor humano, aplicación o cliente MCP;
- acción, recurso y resultado permitido/denegado;
- propósito y scopes efectivos;
- fecha UTC, zona relevante y correlación;
- IP/datos de cliente minimizados;
- versión anterior/nueva en cambios;
- origen de una importación y transformaciones realizadas;
- modelo, prompt de sistema versionado y extractor cuando una IA intervenga, sin guardar datos innecesarios;
- regla y versión que creó o modificó un recordatorio;
- creación, uso y revocación de comparticiones.

El titular recibe una vista comprensible. Los registros técnicos de auditoría no son editables desde la API normal.

## 16. Calidad de datos

- Validación FHIR R4 donde se expongan recursos FHIR.
- Catálogos versionados de LOINC, SNOMED CT y UCUM, respetando licencias.
- No asignar un código clínico sólo por similitud textual sin umbral y revisión.
- Detección de paciente equivocado antes de publicar un documento.
- Reconciliación de fechas de toma, recepción y emisión.
- Comparar tendencias sólo entre magnitudes y métodos compatibles; si no, mostrar series separadas.
- Preservar decimales, símbolos (`<`, `>`) y texto cualitativo.
- Guardar “no informado” distinto de cero y distinto de normal.
- Suite de documentos anonimizados y sintéticos para evaluar extracción por campo.

## 17. Requisitos no funcionales iniciales

| Área | Objetivo MVP |
| --- | --- |
| Disponibilidad | Docker doméstico: mejor esfuerzo mientras el PC esté encendido; Cloudflare: objetivo 99,5 % mensual, sin convertirlo en SLA comercial |
| Integridad | hash verificado al ingresar y en controles periódicos |
| Recuperación | RPO ≤ 24 h y RTO ≤ 8 h, demostrados mediante restauración |
| Rendimiento | p95 < 500 ms en lecturas estructuradas sin trabajos de ingestión |
| Ingestión | respuesta asíncrona inmediata; estado consultable |
| Trazabilidad | 100 % de lecturas y mutaciones sensibles auditadas |
| Accesibilidad API | OpenAPI, errores estables, ejemplos y sandbox sin datos reales |
| Portabilidad | exportación completa de originales + JSON/FHIR |
| Observabilidad | métricas y trazas sin contenido clínico ni secretos |

Estos valores son objetivos operativos personales y deben revisarse después de medir el uso real.

## 18. Pruebas obligatorias

### 18.1 Funcionales

- carga válida, duplicada, corrupta, demasiado grande y con MIME falso;
- URL estable, redireccionada, caída, autenticada y host interno bloqueado;
- extracción con unidades, rangos, tablas partidas y fechas ambiguas;
- corrección humana y conservación de procedencia;
- cálculo de `upcoming/due/overdue/unknown` en límites y zonas horarias;
- cita creada, cambiada y cancelada;
- enlace compartido válido, vencido y revocado;
- exportación reimportable.

### 18.2 Seguridad

- aislamiento entre cuentas y BOLA/IDOR en todos los identificadores;
- tres bóvedas independientes vinculadas a cuentas Google distintas, sin base, claves ni visibilidad compartidas;
- repositorio, imagen y logs sin datos personales ni secretos;
- matriz de scopes API/MCP;
- PKCE, audiencia, expiración y rotación de tokens;
- SSRF incluyendo redirects, IPv6, DNS rebinding y metadatos de nube;
- archivos maliciosos y descompresión abusiva;
- prompt injection dentro de documentos;
- secretos y PHI ausentes de logs;
- revocación inmediata y concurrencia;
- restauración de backup y rotación de claves.

### 18.3 Seguridad clínica

- nunca generar plazo sin fuente o regla válida;
- citar exactamente documento y ubicación;
- marcar datos no confirmados;
- no comparar unidades incompatibles;
- no ocultar informes corregidos;
- respuestas seguras cuando faltan datos o existen contradicciones;
- conjunto de regresión para resultados críticos, símbolos y rangos particulares.

## 19. Criterios de aceptación del MVP

El MVP está listo sólo si:

1. tres personas pueden desplegar o recibir bóvedas independientes con Google, y ninguna instancia contiene datos ajenos;
2. un usuario puede cargar un PDF o URL pública y verificar que el original quedó almacenado con hash;
3. el sistema extrae un panel de laboratorio, exige revisión cuando corresponde y conserva la cita de cada campo;
4. una indicación “repetir en 3 meses” produce un vencimiento determinista y explicable;
5. sin indicación ni regla válida, la respuesta es `unknown` y no inventa periodicidad;
6. REST y MCP devuelven la misma información autorizada y registran el acceso;
7. un vínculo MiSalud permite ver sólo el examen elegido y deja de funcionar al vencer o revocarse;
8. una concesión doméstica permite compartir un recurso concreto, pero no amplía acceso a otros recursos;
9. la exportación contiene originales, metadatos, observaciones, procedencia y planes;
10. una restauración recupera un conjunto de prueba y verifica sus hashes;
11. la misma versión pasa pruebas en Docker local y en el perfil Cloudflare;
12. un escaneo confirma que repositorio, imagen y fixtures no contienen datos personales ni secretos;
13. no quedan hallazgos altos o medios de seguridad conocidos antes del primer uso real.

## 20. Fases sugeridas

### Fase -1 — comprobar antes de construir

- Clonar cada candidato en una carpeta separada y fijar la revisión exacta examinada.
- Antes de ejecutar código, hacer una auditoría estática de licencia, dependencias comerciales, secretos, vulnerabilidades, cifrado, destinos de red, telemetría, IA externa y encaje jurídico chileno.
- Excluir o corregir cualquier candidato que requiera licencia pagada, envíe datos sin consentimiento explícito, no pueda operar con egreso bloqueado o tenga vulnerabilidades críticas/altas aplicables.
- Sólo después de superar esa barrera, evaluar el candidato aceptado en Docker con identidades y documentos exclusivamente sintéticos, enlazado a `localhost` y observando todas sus conexiones.
- En la prueba, revisar autenticación, aislamiento, exportación, borrado, backup/restauración, ingestión de documentos y modelo FHIR.
- Hacer un spike acotado para comprobar si se puede añadir Google OIDC y un servidor MCP sin reescribir su núcleo.
- Registrar una matriz reproducible de funciones, seguridad, actividad, dependencias, facilidad de mantenimiento y compatibilidad Cloudflare.
- Decidir explícitamente entre adoptar, contribuir, crear un fork pequeño o construir MiSalud desde cero.
- No comenzar implementación propia mientras esta decisión no esté documentada.
- Al terminar el análisis, detenerse y solicitar autorización explícita del propietario antes de crear código ejecutable, instalar dependencias, construir imágenes o levantar contenedores.

### Fase 0 — decisiones y amenaza

- Definir operador, jurisdicción, residencia, modelo de costos y política de retención.
- Hacer modelado de amenazas y evaluación de impacto de privacidad.
- Confirmar Google OIDC, el perfil Docker/SQLite/sistema de archivos y el perfil Cloudflare/D1/R2/Queues.
- Definir perfil FHIR R4 chileno inicial y terminologías licenciadas.

### Fase 1 — bóveda verificable

- Docker Compose local para una sola bóveda y cuenta, Google OIDC, sitio mínimo, carga, URL pública, cuarentena, hash, cifrado, documentos, auditoría y exportación; repetir la prueba en tres bóvedas independientes.
- Compartición temporal de un documento sin extracción clínica.

### Fase 2 — resultados estructurados

- OCR, extracción, confirmación, `DiagnosticReport`/`Observation`, búsqueda y tendencias.
- Pruebas de calidad por tipo de laboratorio.

### Fase 3 — seguimiento explicable

- Indicaciones, planes, cálculo determinista, citas y respuestas con fuentes.
- No incorporar reglas generales hasta tener gobernanza clínica.

### Fase 4 — API/MCP para terceros

- OAuth completo, scopes incrementales, MCP remoto, portal de clientes y revisión de seguridad externa.
- Piloto con uno o dos clientes de IA, sin acceso general abierto.

### Fase 5 — interoperabilidad

- API FHIR R4 más amplia, SMART on FHIR e importadores específicos.
- Incorporar DICOM como capacidad opcional: carga y descarga del original, representación mediante recursos FHIR, visor web básico con zoom, desplazamiento, contraste y metadatos. Evaluar PACS y estudios multiserie como una fase posterior, manteniendo una ruta completamente abierta y autoalojable.
- Representantes, profesionales y organizaciones si el modelo legal lo permite.

## 21. Historias prioritarias

1. Como persona invitada, creo mi cuenta con Google y sólo veo mi espacio vacío.
2. Como titular, subo un informe y puedo descargar exactamente el mismo original años después.
3. Como titular, veo en un sitio sencillo qué campos extrajo el sistema y corrijo los dudosos sin perder el original.
4. Como titular, pregunto qué controles corresponden y recibo fechas, motivos y fuentes, o una respuesta honesta de que no se sabe.
5. Como titular, autorizo mi cliente de IA desde el sitio y luego consulto por MCP sin volver a entregar mi contraseña o token Google.
6. Como titular, comparto sólo un examen con otra persona o un médico durante 48 horas y puedo revocarlo.
7. Como titular, veo qué IA o persona consultó mis datos.
8. Como cliente autorizado, consulto tendencias mediante API o MCP sin obtener documentos fuera de mi scope.
9. Como titular, exporto todo y puedo abandonar MiSalud sin perder información.

## 22. Riesgos abiertos

| Riesgo | Mitigación inicial |
| --- | --- |
| Extracción incorrecta | confianza por campo, citas y confirmación humana |
| Consejo médico indebido | motor determinista, jerarquía de fuentes y límites de lenguaje |
| Portal no descargable | carga manual e importadores autorizados; nunca prometer respaldo fallido |
| Fuga por vínculo | expiración, hash del token, revocación, alcance mínimo y segundo factor opcional |
| Cliente de IA excesivamente autorizado | scopes incrementales, audiencia, consentimiento y auditoría |
| SSRF/malware | descargador aislado, egress controlado, cuarentena y sandbox |
| Dependencia del proveedor | FHIR/JSON, originales exportables y almacenamiento abstraído |
| Regulación mal interpretada | asesoría jurídica y evaluación de impacto antes de datos reales |
| Terminología o reglas desactualizadas | versiones, vigencia, propietario y revisión programada |
| Costos de OCR/LLM | extracción por etapas, caché por hash y modelos sólo donde aporten valor |

## 23. Decisiones antes de implementar

1. ¿Será sólo para uso personal/familiar o se ofrecerá a terceros?
2. ¿Dónde deben residir físicamente los datos y qué proveedores son aceptables?
3. ¿MiSalud podrá enviar recordatorios externos o sólo responder consultas?
4. ¿Qué nivel de revisión humana se acepta antes de usar un resultado extraído?
5. ¿Se compartirán documentos anónimamente con token o se exigirá identidad del médico?
6. ¿Qué fuentes autenticadas se priorizarán después del MVP?
7. ¿Quién será responsable de aprobar y mantener reglas clínicas generales?

La especificación recomienda comenzar con uso personal, una sola cuenta por titular, carga manual/URL pública, sin reglas clínicas generales y con toda extracción sensible revisable.

Decisiones confirmadas: el proyecto será personal/familiar, gratuito y de código abierto; el despliegue de referencia será una bóveda de una sola persona en un único contenedor local; SQLite y el sistema de archivos cifrado serán suficientes para el MVP; cada titular conserva su propia base y clave; la nube barata será opcional. Google seguirá siendo la única dependencia externa obligatoria del MVP para crear la cuenta e iniciar sesión.

## 24. Primer backlog implementable

1. Evaluación reproducible de proyectos existentes y decisión adoptar/extender/construir.
2. ADR de licencia, rol legal, retención, residencia y perfiles de despliegue.
3. Matriz de controles inspirada en `compliance-cl`, corregida contra fuentes oficiales y ampliada con Ley 20.584, Decreto 41 y artículo 16 bis.
4. Modelo de amenazas y matriz de permisos/scopes.
5. Esquema y migraciones SQLite/D1 para cuenta, grupo, paciente, documento, objeto, procedencia y auditoría.
6. Docker Compose con volúmenes fuera del repo y datos sintéticos.
7. Google OIDC, invitaciones, sesiones y autorización de clientes MCP/API.
8. Sitio web mínimo para carga, revisión, permisos y ejercicio humano de derechos.
9. Carga directa con cuarentena, antivirus, hash y cifrado.
10. Descargador URL aislado y protegido contra SSRF.
11. API de documentos y exportación.
12. Compartición doméstica y enlaces temporales revocables.
13. Extracción de laboratorio con dataset sintético y revisión humana.
14. `DiagnosticReport`/`Observation`, tendencias y validación de unidades.
15. Plan de seguimiento y cálculo determinista.
16. API OpenAPI y servidor MCP con OAuth y scopes.
17. Perfil Cloudflare con Workers, D1, R2 y Queues.
18. Pruebas de aislamiento, portabilidad, restauración y seguridad clínica.
19. Revisión jurídica y de seguridad antes de usar información real.

## 25. Búsqueda previa de alternativas abiertas

**Estado de esta revisión:** búsqueda documental y auditoría estática verificadas el 2026-09-02. Los cuatro candidatos principales fueron clonados y quedaron documentados en [Auditoría estática previa](AUDITORIA_ESTATICA_CANDIDATOS.md). Ningún candidato fue ejecutado; su comportamiento real queda **NO PROBADO** hasta completar la prueba sintética cerrada de la Fase -1.

| Proyecto | Licencia/estado | Coincidencias | Brechas frente a MiSalud | Decisión preliminar |
| --- | --- | --- | --- | --- |
| [Health Assistant](https://github.com/health-assistant-io/health-assistant) | Apache-2.0, beta, activo | Docker, exámenes, tendencias, FHIR R4, multi-tenant, DICOM básico, exportación con hashes | TimescaleDB tiene licencia mixta; IA y destinos externos configurables; sin cifrado clínico de aplicación demostrado; 2 vulnerabilidades altas | **Preparar prueba sintética cerrada sólo después de corregir y aislar** |
| [YourPHR](https://github.com/jwilleke/yourphr) | GPL-3.0, activo; continuación comunitaria de Fasten | personal/familiar, SQLite, FHIR R4, importación y DICOM con visor | llamadas a Fasten y otros servicios; relay externo; no endurecido para Internet; cifrado contradictorio; 4 vulnerabilidades altas | **En espera; no ejecutar con datos reales** |
| [Strand](https://github.com/potalora/strand) | MIT, activo pero joven | procedencia, FHIR y cifrado de aplicación sólido | puede enviar originales a la nube; ruta local validada para Apple/MLX; 1 vulnerabilidad crítica y 38 altas | **No ejecutar esta revisión; referencia de cifrado** |
| [PHR de Health Samurai](https://github.com/HealthSamurai/phr) | MIT para la aplicación | Google OAuth, varios pacientes, FHIR y documentos | exige Aidbox con activación/licencia; configuración dev expuesta; terminología externa y envío clínico a OpenAI si se habilita; 1 crítica y 2 altas | **Descartar como base** |
| [Medplum](https://github.com/medplum/medplum) | Apache-2.0, activo y maduro | servidor/plataforma FHIR completo, API y ecosistema | es una plataforma clínica general, bastante mayor que el producto doméstico; no resuelve por sí sola bóveda, ingestión y seguimientos | usar librerías o patrones, no adoptar todo inicialmente |
| [MedCP](https://github.com/BaranziniLab/MedCP) | MIT, activo y joven | MCP de sólo lectura para consultar EHR y grafos biomédicos | no es una bóveda personal, sitio, autenticación doméstica ni almacenamiento de documentos | referencia para herramientas MCP seguras |
| [OwnChart](https://github.com/nickpdawson/OwnChart) | PolyForm Noncommercial; código visible pero no cumple el requisito usual de open source | producto personal, PDFs, eventos, IA con citas y puente MCP | licencia no comercial restrictiva y no estándar OSI; no sirve como base abierta del proyecto | excluir como base; observar ideas, sin copiar código |
| [Fasten OnPrem](https://github.com/fastenhealth/fasten-onprem) | GPL-3.0, archivado | Docker, personal/familiar, FHIR y agregación | upstream archivado, multiusuario incompleto y funciones IA futuras | no iniciar sobre upstream; evaluar su fork YourPHR |

### 25.1 Recomendación de reutilización

No comenzar un backend nuevo inmediatamente. El orden revisado es:

1. corregir y aislar una copia de Health Assistant sin ejecutarla todavía;
2. generar SBOM, fijar imágenes, bloquear egreso y comprobar su configuración;
3. sólo entonces levantarla en `localhost` con datos sintéticos y observar su tráfico;
4. usar YourPHR y Strand como referencias estáticas de DICOM/SQLite y cifrado, sin ejecutar sus revisiones actuales;
5. hacer un prototipo pequeño de Google OIDC + MCP sólo si el núcleo elegido supera la prueba;
6. si las brechas exigen reescribir una parte sustancial, iniciar MiSalud greenfield usando bibliotecas abiertas maduras.

La auditoría confirmó que **Health Assistant es el candidato funcional más cercano, pero no el más simple**: exige TimescaleDB, Redis y varios servicios. Dada la prioridad explícita de sencillez, bajo costo y autoalojamiento, la decisión preliminar es construir un MiSalud mínimo desde cero y reutilizar únicamente patrones o bibliotecas abiertas acotadas. Los candidatos no se instalarán salvo que aparezca una pregunta técnica concreta que justifique una prueba sintética.

### 25.2 Licencia y gobernanza

- Si MiSalud se construye desde cero, licencia recomendada: **AGPL-3.0-or-later**, para que una versión modificada y ofrecida por red publique también su fuente.
- Si se extiende otro proyecto, respetar su licencia, avisos y compatibilidad; no cambiar licencias sin revisión.
- Código, esquema, migraciones, documentación y despliegues Docker/Cloudflare permanecen públicos.
- Datos, secretos y configuración de cada hogar no forman parte del proyecto y nunca se publican.
- Sin telemetría obligatoria ni dependencia de un servicio central de MiSalud.
- Aceptar contribuciones mediante revisión, tests y certificado simple de origen (`DCO`) si aparece comunidad.

## 26. Fuentes técnicas y normativas consultadas

- [MINSAL Chile — Estándares y perfiles de interoperabilidad](https://interoperabilidad.minsal.cl/docs/especificacion-de-la-arquitectura/estandares-perfiles.html): adopción de FHIR R4 y terminologías clínicas.
- [Guía de Estándares de Información de Salud de MINSAL](https://interoperabilidad.minsal.cl/fhir/ig/eis/0.2.0/): guía chilena basada en FHIR R4.
- [HL7 FHIR R5 — DiagnosticReport](https://hl7.org/fhir/diagnosticreport.html): separación entre informe y observaciones atómicas; se usa como referencia conceptual, mientras la frontera chilena propuesta permanece en R4.
- [HL7 FHIR R5 — DocumentReference](https://fhir.hl7.org/fhir/documentreference.html): representación de documentos no estructurados. Se usa como referencia conceptual con perfil R4 en implementación.
- [SMART App Launch 2.2](https://build.fhir.org/ig/HL7/smart-app-launch/app-launch.html): OAuth, PKCE y scopes FHIR.
- [Model Context Protocol — especificación 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28): núcleo sin estado, solicitudes autocontenidas y extensiones negociadas.
- [Model Context Protocol — Authorization, revisión 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization): servidor de recursos OAuth, descubrimiento, audiencia, Resource Indicators y autorización incremental.
- [Model Context Protocol — Server resources, revisión 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/resources): recursos y validación de URI. Si cambia la revisión estable antes de implementar, se debe actualizar el diseño.
- [IETF RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700): mejores prácticas actuales de seguridad OAuth 2.0.
- [Google Identity — OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): flujo de login, validación de identidad y documento de descubrimiento.
- [Google Identity — scopes OAuth](https://developers.google.com/identity/protocols/oauth2/scopes): scopes básicos `openid`, `email` y `profile`, separados de permisos para otras APIs.
- [Cloudflare Workers — precios y límites](https://developers.cloudflare.com/workers/platform/pricing/): asignación gratuita y restricciones de CPU vigentes.
- [Cloudflare D1 — precios](https://developers.cloudflare.com/d1/platform/pricing/): base SQLite serverless, consumo por filas y almacenamiento.
- [Cloudflare R2 — precios](https://developers.cloudflare.com/r2/pricing/): objetos, asignación gratuita Standard y egreso sin cobro.
- [Cloudflare Queues — precios](https://developers.cloudflare.com/queues/platform/pricing/): operaciones, retención y asignación gratuita.
- [OWASP API Security](https://owasp.org/www-project-api-security/): riesgos de autorización por objeto, SSRF, consumo de recursos e inventario de APIs.
- [Ley 20.584, texto en Biblioteca del Congreso Nacional](https://www.bcn.cl/leychile/navegar?idNorma=1039348): derechos y deberes en atención de salud y tratamiento de ficha clínica.
- [Ley 19.628, versión vigente hasta el 30 de noviembre de 2026](https://www.bcn.cl/leychile/Navegar?idNorma=141599&idParte=8642680): régimen vigente de protección de datos.
- [Ley 21.719, texto con vigencia desde el 1 de diciembre de 2026](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=1209272&idParte=10527471&idVersion=2026-12-01): nuevo marco chileno de protección de datos personales.
- [`compliance-cl`](https://github.com/Lelemon-studio/compliance-cl): catálogo MIT usado como referencia de controles y plantillas; no se considera fuente jurídica y sus límites quedan registrados en la auditoría estática.

## 27. Definición corta del producto

**MiSalud es un backend personal de salud que conserva evidencia médica original, la transforma en datos clínicos trazables y permite consultarla o compartirla de forma segura mediante API y MCP, sin delegar decisiones clínicas a una inteligencia artificial.**
