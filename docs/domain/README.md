# Índice de Dominio — Mantenix

Este directorio contiene los documentos de dominio congelados de Mantenix: el contrato de negocio inmutable del cual derivan el modelo de datos, las reglas de negocio y las APIs. Ningún documento de esta carpeta se reabre salvo que cambie el negocio; las entidades nuevas se documentan en su propio archivo, referenciando a los ya congelados.

## Core Domain

| Documento | Estado | Alcance |
|---|---|---|
| [`poa-domain.md`](./poa-domain.md) | **Congelado (v1)** | Plan Operativo Anual: Contrato, POA, Versión del POA, Actividad del POA (POA_ACTIVITY), Cobertura por Zona, precio, frecuencia, cantidad contratada, NP. Reglas 1-19. |
| [`workflow.md`](./workflow.md) | **Congelado (v1)** | Ciclo de estados semanal: transiciones de ejecución, verificación y rechazo. |
| [`schedule-domain.md`](./schedule-domain.md) | Propuesto | Cronograma / Planificación, alcance v1 limitado a Programación. Deriva del POA vigente, no lo modifica (ver Principio de Desacoplamiento del Cronograma en `poa-domain.md`). Asignaciones, Calendario, Dependencias y Reprogramación quedan fuera de alcance por ahora. |
| [`execution-domain.md`](./execution-domain.md) | Propuesto | Ejecución, alcance v1 limitado a Jornadas y Estados de ejecución. Evidencias e Incidencias quedan fuera de alcance por ahora. |
| [`resource-analysis-domain.md`](./resource-analysis-domain.md) | Propuesto (Discovery) | Resource Analysis: cantidades de trabajo por sitio y zona técnica (`resource_analysis.scope_data`), regla de gobierno de datos frente al Catálogo Técnico. Importador aún no construido — ver `docs/architecture/resource-analysis-import-design.md` y `docs/discovery/resource-analysis-sheet-mapping-gaps.md`. |
| `billing-domain.md` | Planeado | Pendiente de definición. Facturación: actas de cobro, liquidación, NP autorizados. |
| `glossary.md` | Planeado | Pendiente de definición. Glosario transversal de términos compartidos entre subdominios. |

## Otros directorios de documentación

| Directorio | Propósito |
|---|---|
| [`docs/adr/`](../adr/README.md) | Por qué se tomó una decisión de arquitectura |
| `docs/architecture/` | Cómo se materializa hoy un concepto del dominio en el esquema/código (ej. `schedule-mapping.md`) |

## Precedencia

En caso de conflicto entre este directorio, el modelo de datos, las APIs, el código fuente o la documentación técnica, prevalecerá el dominio definido en los documentos marcados como **Congelado**. Las implementaciones deberán adaptarse al dominio y no a la inversa.

## Regla de edición

Un documento marcado **Congelado** es la fuente de verdad. Antes de tocar código relacionado con sus entidades, releer el documento correspondiente. Los cambios a un documento congelado se hacen un punto a la vez (una regla o definición por edición), verificando después de cada cambio que no queden definiciones duplicadas ni numeración inconsistente.
