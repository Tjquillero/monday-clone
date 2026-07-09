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
| Actividad del POA (fuente contractual) | `poa_activities` (frecuencia, precio_unitario) / `poa_activity_zones` (cantidad_contratada, cobertura por zona), referenciadas por `weekly_plan_items.poa_activity_zone_id` |
| Ciclo de estados del Plan Semanal | `workflow.md`, Máquina 1 (`weekly_plans.status`) |
| Versión activa del POA | `poa_versions.status = 'active'` (única por `poa_id`) |

La migración descrita en [`ADR-0002`](../adr/ADR-0002-schedule-contractual-source.md) ya se ejecutó (`supabase/migrations/20260714_poa_domain_schema.sql`, `20260715_replace_plan_items_poa.sql`): `board_activity_standards` perdió `frecuencia` (quedó como Catálogo Técnico reducido: rendimiento, `priority`, identidad) y `weekly_plan_items.activity_standard_id` fue reemplazada por `poa_activity_zone_id`. Este documento ya no repite el análisis que motivó el cambio — eso vive en el ADR — solo refleja el estado vigente.

## Notas de implementación

- El cálculo de Capacidad Estimada vive en `src/lib/schedulerMath.ts`.
- El motor de ordenamiento por Prioridad de Planificación vive en `src/lib/weeklyPlanner.ts`.
- La resolución de la versión activa del POA (frecuencia, precio, cobertura por zona) vive en `src/hooks/usePoaActivities.ts` (`usePoaActiveCatalog`).
- El merge Catálogo Técnico + Actividad del POA (por `activity_key`, filtrando por cobertura vigente en la zona) ocurre en `src/hooks/useWeeklyPlan.ts`, no en la base de datos.
- `priority` permanece en `board_activity_standards` como decisión pragmática (no es contractual, pero `schedule-domain.md` todavía no define una tabla propia de planificación).

## Regla de actualización

Este documento se actualiza en el mismo cambio que la migración o refactor que lo vuelve obsoleto (mismo commit o PR).
