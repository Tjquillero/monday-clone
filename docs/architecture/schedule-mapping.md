# Mapeo Técnico: Dominio de Cronograma → Esquema Actual

Este documento traduce los conceptos de [`docs/domain/schedule-domain.md`](../domain/schedule-domain.md) a su representación técnica. **No es un documento de dominio**: cambia con la implementación. Si el negocio cambia, se actualiza primero `schedule-domain.md`; este archivo se ajusta después para reflejarlo — nunca al revés.

## Estado actual

| Concepto de dominio | Implementación |
|---|---|
| Plan Semanal | `weekly_plans` |
| Línea Programada | `weekly_plan_items` |
| Prioridad de Planificación | `weekly_plan_items.priority` (`must_execute`/`preferred`/`flexible`) |
| Cantidad Planificada | `weekly_plan_items.planned_qty` |
| Capacidad Estimada | `weekly_plan_items.planned_jr`, calculada por `schedulerMath.ts` (`qty / (rendimiento × frecuencia/25)`) |
| Secuencia Programada | `weekly_plan_items.planned_sequence` |
| Rendimiento/frecuencia del snapshot | `weekly_plan_items.planned_rendimiento` / `planned_frecuencia` |
| Actividad del POA (fuente contractual) | `board_activity_standards`, vía `weekly_plan_items.activity_standard_id` |
| Ciclo de estados del Plan Semanal | `workflow.md`, Máquina 1 (`weekly_plans.status`) |

## Estado objetivo (pendiente de migración)

| Concepto de dominio | Implementación objetivo |
|---|---|
| Actividad del POA / Cobertura por Zona (fuente contractual) | `poa_activities` / `poa_activity_zones`, referenciadas directamente por `weekly_plan_items` |

El análisis que motivó este cambio de fuente contractual quedó registrado en [`ADR-0002`](../adr/ADR-0002-schedule-contractual-source.md). Este documento no repite ni mantiene actualizado ese análisis; solo refleja, en cada momento, cuál de las dos filas de esta tabla describe el sistema real.

## Notas de implementación

- El cálculo de Capacidad Estimada vive en `src/lib/schedulerMath.ts`.
- El motor de ordenamiento por Prioridad de Planificación vive en `src/lib/weeklyPlanner.ts`.
- El inventario de consumidores de la fuente contractual actual es un dato vivo de arquitectura, no un hecho histórico: se mantiene en este documento (o se verifica directamente contra el código), no en el ADR.

## Regla de actualización

Este documento se actualiza en el mismo cambio que la migración o refactor que lo vuelve obsoleto (mismo commit o PR). Cuando la migración de ADR-0002 se ejecute, la fila "Estado objetivo" pasa a "Estado actual" y la anterior se elimina — no se dejan ambas como si estuvieran vigentes a la vez.
