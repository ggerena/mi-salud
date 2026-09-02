# MiSalud

MiSalud es un proyecto abierto para que cada persona pueda autoalojar una bóveda privada de información de salud, conservar sus documentos originales y consultar datos estructurados mediante una interfaz web, API o MCP.

El diseño prioriza una instalación sencilla y económica: un contenedor, SQLite, archivos cifrados y una bóveda independiente por titular. No existe un servicio central de MiSalud y el repositorio nunca debe contener información clínica real, credenciales ni bases de usuarios.

## Estado

El proyecto se encuentra **detenido en análisis y diseño**. Todavía no contiene código ejecutable, dependencias ni contenedores. La implementación sólo comenzará después de una autorización explícita.

Documentos principales:

- [Especificación funcional y técnica](docs/md/ESPECIFICACION_MISALUD.md)
- [Auditoría estática de proyectos similares](docs/md/AUDITORIA_ESTATICA_CANDIDATOS.md)

## Licencia

El código y la documentación propia de MiSalud se publican bajo **GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)**. Los datos, claves, configuraciones y respaldos de cada persona no forman parte del proyecto ni quedan sujetos a esta licencia.

MiSalud no entrega diagnósticos ni sustituye la atención de profesionales de salud.
