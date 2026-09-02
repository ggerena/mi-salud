# Auditoría estática previa de candidatos para MiSalud

**Fecha:** 2026-09-02
**Estado:** revisión estática terminada; ejecución con Docker todavía bloqueada
**Alcance:** licencias, dependencias comerciales, comunicaciones externas, seguridad visible en código y encaje preliminar con normativa chilena

## 1. Conclusión

Ninguna alternativa debe instalarse todavía con información real. Ninguna acredita por sí sola cumplimiento de la legislación chilena y todas requieren cambios o condiciones previas.

| Candidato | Licencia del repositorio | Sorpresa principal | Resultado |
| --- | --- | --- | --- |
| Health Assistant | Apache-2.0 | IA externa configurable, TimescaleDB con licencia mixta e imágenes `latest` | **Referencia funcional, no base simple**; no ejecutar por ahora |
| YourPHR | GPL-3.0 | todavía contacta infraestructura Fasten y otros servicios; la base no se cifra sin una clave | **En espera**; no exponer a Internet ni usar datos reales |
| Strand | MIT | puede enviar documentos originales a proveedores de IA; 1 vulnerabilidad crítica y 38 altas | **No ejecutar esta revisión**; sirve como referencia de cifrado |
| Health Samurai PHR | MIT para la aplicación | depende de Aidbox comercial y puede enviar historia clínica a OpenAI | **Descartado como base de MiSalud** |

La búsqueda documental inicial favorecía una prueba de Health Assistant. La prioridad confirmada de usar la solución más sencilla y barata cambia esa decisión: quitar TimescaleDB y Redis, bloquear salidas e incorporar Google OIDC, cifrado clínico, enlaces temporales y un servidor MCP modificaría demasiado su núcleo. MiSalud se construirá como monolito mínimo y estos repositorios quedarán como referencias.

## 2. Evidencia y límites

Los repositorios quedaron fuera de MiSalud, en una carpeta hermana llamada `misalud-candidatos`, y se auditó esta revisión exacta:

| Carpeta | Repositorio | Revisión |
| --- | --- | --- |
| `health-assistant` | `health-assistant-io/health-assistant` | `7af68f2671c9e299fe156a5e0f61e88cd403cfc3` |
| `yourphr` | `jwilleke/yourphr` | `bec65cc879432dc5ff9af0d1840ee7bedf706f67` |
| `strand` | `potalora/strand` | `e5f1381a8b22814cf2f7cea4831c10d3579b106f` |
| `healthsamurai-phr` | `HealthSamurai/phr` | `b2f88ca31698f42f02af333175796ee13fb32e05` |

Se leyeron licencias, documentación, manifiestos, Docker, autenticación, cifrado, IA y destinos de red. También se ejecutaron Trivy y Gitleaks sobre los archivos clonados; sus informes JSON redactados están en la subcarpeta `_auditoria` de esa carpeta externa.

No se instalaron paquetes, construyeron imágenes, levantaron contenedores ni iniciaron servidores. No se cargó información personal. Los clones son superficiales, por lo que el historial Git completo no fue auditado. Las licencias transitivas tampoco quedan agotadas hasta generar un SBOM de las imágenes realmente construidas.

## 3. Hallazgos por candidato

### 3.1 Health Assistant

**A favor**

- El código principal es Apache-2.0 y ya contiene laboratorios, tendencias, FHIR R4, tenants, PDF, imágenes, DICOM básico, exportación y trazabilidad.
- Permite apuntar su integración compatible con OpenAI a un servicio local.
- En la composición autónoma, PostgreSQL y Redis se publican sólo en `localhost`.

**Licencias y costos**

- Usa `timescale/timescaledb:latest-pg14`. TimescaleDB mezcla componentes Apache-2.0 y Timescale License. Puede autoalojarse sin pagar, pero no todo es código abierto OSI. MiSalud debería sustituirlo por PostgreSQL puro o fijar explícitamente la edición Apache.
- Referencia LOINC, SNOMED CT, ICD-10 y ATC. La licencia del programa no concede automáticamente derechos sobre esas terminologías. Chile es miembro de SNOMED International, pero hay procedimientos nacionales y una distribución internacional puede requerir permisos adicionales.
- Varias imágenes usan etiquetas mutables `latest`, cuyo contenido puede cambiar sin cambios en el repositorio.

**Salidas y seguridad**

- Si se configura la clave, el OCR usa OpenAI por defecto y envía contenido al proveedor configurado. También hay integraciones opcionales con MCP externos, Firebase, RxNav/NLM y catálogos alojados en GitHub.
- No se encontró analítica obligatoria; varias apariciones de “telemetry” corresponden a datos de dispositivos de salud.
- Trivy detectó 2 vulnerabilidades altas en `browserslist` 4.28.1, corregidas en 4.28.7, y ninguna crítica.
- El cifrado visible protege secretos de integraciones, pero no demuestra cifrado de aplicación para todos los documentos y datos clínicos.
- Gitleaks marcó 22 coincidencias, principalmente ejemplos, pruebas y configuración. Trivy no confirmó secretos y no se identificó una credencial real, pero falta analizar el historial completo.
- No ofrece Google OIDC como única identidad, servidor MCP personal ni el modelo exacto de enlaces médicos revocables.

**Condición para probarlo:** actualizar dependencias, fijar imágenes por versión y digest, elegir PostgreSQL o Timescale Apache, desactivar IA e integraciones, bloquear egreso y usar sólo identidades y exámenes sintéticos.

### 3.2 YourPHR

**A favor**

- Es GPL-3.0, usa SQLite y está orientado a un archivo personal/familiar FHIR.
- Conserva DICOM mediante `DocumentReference`/`Binary` y dispone de un visor web básico abierto.
- No se encontró una dependencia comercial obligatoria equivalente a Aidbox.

**Sorpresas y seguridad**

- El código actual todavía contacta `lighthouse.fastenhealth.com` pese a la intención documentada de eliminar esa dependencia.
- La sincronización usa por defecto `relay.nerdsbythehour.com`; su secreto compartido figura pendiente. También consulta MedlinePlus, NLM Clinical Tables, DailyMed y Wikipedia, y la página cloud carga recursos de `cdn.hello.coop`. Una consulta puede revelar el término clínico buscado y metadatos de red.
- La propia documentación dice que debe situarse detrás de autenticación/red y que no está endurecido para exposición pública.
- SQLCipher sólo se activa si se entrega una clave no vacía; la configuración base la deja vacía. La documentación se contradice sobre el cifrado y los backups, de modo que ambos quedan **NO PROBADOS**.
- El multiusuario sigue en desarrollo y el operador raíz puede ver datos familiares.
- Trivy detectó 4 vulnerabilidades altas y 6 configuraciones débiles en ejemplos Kubernetes. Gitleaks marcó un JWT de prueba, sin confirmar una credencial real.

**Condición para reconsiderarlo:** retirar Fasten y relay, volver locales u opcionales los catálogos, corregir vulnerabilidades, probar cifrado/backups y no publicarlo directamente en Internet.

### 3.3 Strand

**A favor**

- Es MIT y tiene el patrón más sólido observado de cifrado de aplicación: AES-256-GCM para archivos, campos clínicos, FHIR, resúmenes y claves.
- Documenta procedencia y diferencia rutas locales de rutas asistidas por nube.

**Sorpresas y seguridad**

- En la ruta cloud, el PDF, TIFF o sus páginas originales sin anonimizar pueden enviarse al proveedor de visión. El texto posterior se intenta desidentificar, pero el proyecto aclara que no es anonimización certificada.
- Admite Gemini, OpenAI, Anthropic, OpenRouter, Vertex y endpoints locales; la configuración predeterminada privilegia Gemini y ciertos fallos pueden derivar hacia ese proveedor.
- Google Fonts revela al menos IP y agente de usuario. La telemetría de Next.js y Hugging Face sí aparece desactivada.
- La ruta estrictamente local es optativa; el paquete validado documentado es de unos 9 GB para Apple M4/MLX y no está demostrado en Windows.
- Trivy detectó 1 vulnerabilidad crítica y 38 altas. La crítica está en NLTK 3.9.4 y tiene corrección en 3.10.3. Gitleaks marcó 2 valores tipo API key en workflows, sin confirmar secretos reales.
- No incluye Google OAuth, servidor MCP, administración familiar, enlaces médicos ni recordatorios como MiSalud.

**Decisión:** no ejecutar esta revisión; aprovechar sólo conceptos después de comprobar las licencias de cada biblioteca.

### 3.4 Health Samurai PHR

**Licencia y dependencia comercial**

- La aplicación es MIT, pero usa `healthsamurai/aidboxone:edge`. Aidbox requiere activación/licencia y no forma parte del código MIT. Esto contradice el requisito de una solución completamente abierta y sin servicio pagado obligatorio.
- `edge` es una etiqueta mutable.

**Salidas y seguridad**

- Google OAuth comparte con Google la identidad mínima esperada, pero no se encontró una lista de invitados o dominios permitidos: cualquier inicio válido podría crear una cuenta.
- El motor de terminología apunta a `tx.health-samurai.io`.
- Si se configura OpenAI, el procesador envía texto o páginas de documentos, y el copiloto arma solicitudes con nombre, demografía, historia y resúmenes clínicos.
- Docker trae secretos de desarrollo, `BOX_SECURITY_DEV_MODE=true` y publica PostgreSQL y Aidbox. No es apto para datos reales.
- No se encontró cifrado clínico de aplicación. Trivy detectó 1 vulnerabilidad crítica y 2 altas, todas corregibles. Gitleaks marcó 2 autorizaciones de ejemplo, sin confirmar secretos reales.

**Decisión:** descartarlo como base. Su Google OAuth puede estudiarse como referencia sin incorporar Aidbox.

## 4. Contraste con `compliance-cl`

Se clonó también [`Lelemon-studio/compliance-cl`](https://github.com/Lelemon-studio/compliance-cl) en la revisión `4972a821ff98caf777e809baf468d72517616ada`. Es una skill documental MIT y no una aplicación sanitaria: no almacena exámenes, no reemplaza a MiSalud y no incorpora un servicio obligatorio o telemetría propia. Trivy no encontró dependencias, vulnerabilidades, secretos ni configuraciones analizables; Gitleaks tampoco encontró filtraciones.

No se instaló ni se ejecutó como skill. Usarla mediante Claude Code o una automatización cloud puede enviar el código y los documentos generados al proveedor de IA. Además, las automatizaciones propuestas pueden requerir una suscripción o API pagada. Eso no ocurre por clonar el repositorio, pero sería una transferencia externa que debe aprobarse antes de usarlo.

### 4.1 Qué aporta a MiSalud

Su catálogo convierte la ley futura en controles verificables y deja cuatro mejoras concretas para la especificación:

| Área de `compliance-cl` | Estado en la especificación MiSalud | Acción |
| --- | --- | --- |
| Responsable y rol por flujo | Parcial | decidir si cada flujo es actividad personal, responsable o encargado y guardar el fundamento |
| Inventario/RAT | Parcial | crear un inventario operativo de finalidades, datos, destinatarios, transferencias, retención y medidas; no asumir que el nombre “RAT” implica una obligación universal |
| Consentimiento y deber de información | Parcial | versionar texto y hash, registrar acto afirmativo, finalidad, fecha, método y revocación; separar salud, IA, compartición y avisos |
| Derechos del titular | Parcial | agregar canal humano, bloqueo temporal, respuesta fundada y seguimiento de plazos, además de exportación/borrado técnicos |
| Retención y minimización | Parcial | mapa declarativo por campo/objeto, causal, plazo y acción; test que falle si aparece un dato sin clasificar |
| Encargados y transferencias | Parcial | DPA, subencargados, país, finalidad y mecanismo por Google, hosting, OCR o IA |
| EIPD | Planificada | hacerla antes de datos reales por prudencia y documentar el test legal exacto |
| Seguridad | Bien cubierta en diseño | conservar TLS, cifrado de aplicación, restauración, pruebas regulares, MFA administrativo, tenant y secretos |
| Brechas y monitoreo | Parcial | registro de vulneraciones, runbook, responsables y alertas; no confundir análisis periódico con vigilancia 24/7 |

MiSalud adoptará el catálogo como checklist de evidencia, no sus plantillas sin revisión. Los documentos operativos con nombres, correos, identificadores, proveedores o contratos no se versionarán en el repositorio público: vivirán cifrados en la configuración privada de cada instancia. El repositorio público sólo tendrá modelos vacíos y datos sintéticos.

### 4.2 Límites y correcciones necesarias

- El proyecto está marcado **alpha**, está orientado a SaaS/empresas y su roadmap reconoce que el mapa de artículos sigue incompleto. El pack de Ley 21.595 no corresponde por defecto a una bóveda doméstica sin empresa.
- No cubre de manera suficiente las reglas sanitarias especiales: Ley 20.584, Decreto 41 y, especialmente, el artículo 16 bis futuro sobre datos de salud.
- Su flujo no considera expresamente la exclusión del artículo 1 futuro para el tratamiento que realizan personas naturales en relación con sus actividades personales. Esta exclusión puede ser relevante para una instancia puramente doméstica, pero su frontera debe confirmarse si se comparte con médicos, se usan proveedores externos o se amplía a terceros.
- La afirmación de que el delegado de protección de datos es obligatorio para organismos públicos o datos sensibles a gran escala no está respaldada por el texto examinado. El artículo 50 dice que el responsable **podrá** designarlo; sí pasa a ser parte necesaria si se adopta voluntariamente el modelo de prevención de infracciones de los artículos 49 a 53.
- La plantilla EIPD simplifica demasiado el artículo 15 ter. La ley la exige siempre para evaluación automatizada sólo cuando produce efectos jurídicos significativos; para tratamiento sensible, el supuesto automático citado es el tratamiento bajo excepciones al consentimiento. La regla general de alto riesgo puede igualmente justificar una EIPD para MiSalud.
- La plantilla general de consentimiento sensible no recoge que el artículo 16 bis limita el tratamiento consentido de salud a fines previstos por leyes sanitarias especiales. Determinar si una bóveda personal con IA entra en esos fines es una consulta jurídica prioritaria antes de datos reales.
- Presentar un RAT como “exigible por la Agencia” es más fuerte que la evidencia localizada. Mantener un inventario es una práctica necesaria para demostrar cumplimiento, pero la base jurídica exacta de una obligación formal y universal debe verificarse.
- “Quedar listo para cumplir sin abogado” no equivale a cumplimiento garantizado. Para esta aplicación médica, la delimitación de actividad personal y finalidad sanitaria requiere revisión profesional aunque las tareas documentales puedan prepararse internamente.

## 5. Evaluación legal preliminar para Chile

Esto no es una certificación ni reemplaza asesoría jurídica. Cumplir depende del operador, propósito, contratos, configuración, procesos y uso real, no sólo del código.

- La Ley 19.628 vigente hasta el 30 de noviembre de 2026 trata la salud como dato sensible y restringe su tratamiento.
- La Ley 21.719 entra en vigor el **1 de diciembre de 2026**. Refuerza consentimiento demostrable, derechos de acceso/rectificación/supresión/oposición/portabilidad, privacidad por diseño, seguridad y restauración, notificación de brechas y reglas de transferencias internacionales.
- Hasta el 30 de noviembre de 2026, la ley vigente examinada no contiene la misma exclusión expresa para actividades personales. Desde el 1 de diciembre de 2026, el nuevo artículo 1 excluye el tratamiento efectuado por personas naturales en relación con sus actividades personales. Una instancia estrictamente doméstica puede quedar dentro de esa exclusión, pero no se debe extenderla sin análisis a operación para terceros, uso institucional o comercial, ni asumir que toda cesión o proveedor externo conserva su carácter personal.
- Si la nueva ley resulta aplicable, su artículo 16 bis impone reglas especiales a datos de salud. Aun con consentimiento expreso, limita el tratamiento a fines previstos por las leyes sanitarias; el encaje exacto de esta bóveda y su asistente requiere validación jurídica.
- La Ley 20.584 protege ficha clínica, estudios y documentos. El Decreto 41 regula fichas de prestadores. No se debe afirmar sin dictamen que toda obligación de un prestador, como su plazo específico de conservación, aplica idénticamente a una bóveda personal.

### Requisitos antes de datos reales

1. Cada adulto debe tener cuenta y consentimiento propios; administrar datos ajenos exige autorización granular y revocable.
2. Google recibirá sólo identidad mínima. OAuth no autoriza enviarle exámenes, diagnósticos ni preguntas clínicas.
3. OCR e IA externos estarán desactivados por defecto. Activarlos exige documentar proveedor, país, datos, finalidad, retención, subencargados, entrenamiento, contrato y fundamento de transferencia.
4. La red negará salidas por defecto. Cada destino permitido será documentado y visible; hasta una búsqueda de medicamentos o diagnósticos puede ser sensible.
5. Documentos, base, backups, índices y derivados se cifrarán con claves separadas; restauración y eliminación deben probarse.
6. El enlace médico será granular, expirable, revocable y auditable; nunca una URL pública permanente.
7. Deben existir exportación, corrección, eliminación, auditoría y respuesta a incidentes/brechas.
8. Antes de datos familiares reales se hará una evaluación de impacto aunque su obligatoriedad automática dependa del riesgo y del supuesto legal. También se revisarán la exclusión de actividad personal y la finalidad sanitaria del artículo 16 bis. Servir a médicos u organizaciones exige analizar además si MiSalud actúa como sistema de un prestador.

Ningún candidato cubre y documenta por completo estas condiciones para Chile.

### 5.1 Riesgo según la forma de usar MiSalud

| Escenario | Efecto legal práctico estimado |
| --- | --- |
| Cada persona instala MiSalud sólo para sí, con su propia base y clave | Es el caso más claro de actividad personal; desde el 1 de diciembre de 2026 puede operar la exclusión del artículo 1. El proyecto y otros familiares no reciben ni administran esos datos. Siguen siendo necesarias seguridad y confidencialidad por prudencia y por otras reglas aplicables. |
| Una instancia doméstica compartida por pocos adultos, cada uno con cuenta y espacio propios | Riesgo bajo o moderado. Puede seguir siendo actividad personal, pero el límite no está definido en el proyecto. Cada persona debe controlar sus datos y el administrador no debe tener acceso clínico ordinario. |
| Compartir un examen puntual con un médico mediante enlace temporal | No convierte por sí solo a MiSalud en prestador, pero es una comunicación de salud que requiere acción expresa, alcance mínimo, expiración, revocación y auditoría. |
| Alojamiento en una nube o autenticación Google | No vuelve automáticamente comercial la actividad. Introduce terceros y transferencias técnicas que deben reducirse y transparentarse; Google recibe sólo identidad, nunca contenido clínico. |
| Enviar documentos o historia a una IA externa | Eleva sustancialmente el riesgo. Si la ley resulta aplicable, requiere analizar encargado, finalidad sanitaria, contrato, retención y transferencia internacional. Permanecerá desactivado por defecto. |
| Ofrecer cuentas a público, clínicas o clientes | Deja de ser el caso doméstico seguro. Debe asumirse cumplimiento completo como responsable o encargado, junto con la regulación sanitaria que corresponda. |

Hasta el 30 de noviembre de 2026, el consentimiento expreso permite tratar datos sensibles bajo el artículo 10 de la Ley 19.628 vigente. Desde el 1 de diciembre, la exclusión de actividades personales puede ser más favorable para el uso doméstico. Sin embargo, si la ley aplica, sus derechos son personales, intransferibles e irrenunciables: una casilla donde cada persona “se hace responsable” no libera al operador de seguridad, confidencialidad o finalidad.

Para el uso familiar previsto, MiSalud adoptará una solución proporcional: consentimiento expreso y versionado, cuenta y espacio independiente, administrador sin vista clínica ordinaria, compartir sólo por acción del titular, exportación/borrado y registro de accesos. Por tratarse de tres adultos, sin uso público ni decisiones automatizadas significativas, una EIPD completa no parece activarse automáticamente por escala; se mantendrá una evaluación simplificada y se revisará antes de cambiar el alcance.

La opción preferida pasa a ser una instancia y un SQLite por persona. Esto reduce más el riesgo que una base multiusuario: quien publica el código no recibe datos y ningún familiar actúa normalmente como administrador de la salud de otro. Una carpeta Dropbox puede guardar backups cifrados, pero no la base activa. El cifrado estándar de Dropbox protege tránsito y almacenamiento bajo claves gestionadas por el proveedor; MiSalud cifra además el archivo antes de sincronizarlo, de manera que Dropbox no sea la única barrera de confidencialidad.

## 6. Barrera antes de ejecutar Docker

La primera prueba autorizable será sólo sintética y en una red observada. Antes se debe:

- corregir vulnerabilidades críticas y altas aplicables y repetir Trivy;
- construir desde fuente y generar SBOM e inventario de licencias transitivas;
- reemplazar `latest`/`edge` por versiones y digest inmutables;
- eliminar claves de ejemplo y generar secretos fuera del repositorio;
- desactivar IA, OCR cloud, telemetría, relays, terminología remota, notificaciones y MCP externos;
- bloquear egreso por defecto y capturar DNS/conexiones;
- enlazar sólo a `127.0.0.1`, sin Tunnel ni publicación a Internet;
- probar aislamiento, exportación, borrado, backup/restauración y logs con documentos sintéticos;
- documentar cada excepción de red y revisar la configuración final.

No se ejecutará ningún candidato por ahora. Si surge una duda que sólo pueda resolverse empíricamente, se preparará una prueba sintética aislada del componente pertinente, nunca una instalación doméstica con datos reales.

## 7. Fuentes oficiales principales

- [Ley 19.628, texto vigente](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=141599&idParte=)
- [Ley 21.719, vigente desde el 1 de diciembre de 2026](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=1209272)
- [Ley 19.628 consolidada para el 1 de diciembre de 2026](https://www.bcn.cl/leychile/navegar?idNorma=141599&idParte=8642686&idVersion=2026-12-01)
- [Cláusulas modelo para transferencias internacionales](https://www.bcn.cl/leychile/Navegar?idNorma=1219636&idVersion=2025-12-19)
- [Ley 20.584](https://www.bcn.cl/leychile/navegar?idNorma=1039348&idParte=9252049&idVersion=2019-12-13)
- [Decreto 41 sobre fichas clínicas de prestadores](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=1046753&idVersion=2012-12-15)
- [Licencias de TimescaleDB](https://github.com/timescale/timescaledb/blob/main/LICENSE)
- [Ediciones de TimescaleDB](https://docs.timescale.com/about/latest/timescaledb-editions/)
- [SNOMED International — Chile](https://www.snomed.org/members/chile)
- [SNOMED International — obtención y condiciones](https://www.snomed.org/get-snomed)
- [`compliance-cl`, referencia MIT auditada](https://github.com/Lelemon-studio/compliance-cl)
