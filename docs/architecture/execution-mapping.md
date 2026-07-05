# Mapeo Técnico: Dominio de Ejecución → Esquema Actual

Este documento traduce los conceptos de [`docs/domain/execution-domain.md`](../domain/execution-domain.md) a su representación técnica. **No es un documento de dominio**: cambia con la implementación. Si el negocio cambia, se actualiza primero `execution-domain.md`; este archivo se ajusta después para reflejarlo — nunca al revés.

## Estado actual

| Concepto de dominio | Implementación |
|---|---|
| Jornada | `weekly_plan_item_executions` |
| Cuadrilla | `weekly_plan_item_executions.crew_name` / `crew_leader_id` |
| Cantidad Ejecutada | `weekly_plan_item_executions.executed_qty`, agregada en `weekly_plan_items.executed_qty` (solo `reported`/`verified`, `fn_sync_plan_item_totals`) |
| Jornal Ejecutado | `weekly_plan_item_executions.executed_jr` (columna generada: trabajadores × duración / 8h) |
| Estado de la Jornada | `weekly_plan_item_executions.status` (`draft`/`reported`/`verified`/`rejected`) — `workflow.md`, Máquina 2 |
| Ventana de Registro (Regla E2) | RLS: INSERT solo si `weekly_plans.status IN ('published','in_progress')` |
| Verificación Obligatoria antes de Confirmar (Regla E4) | RPC `confirm_weekly_plan`: gate de 0 filas en `status = 'reported'` |
| Solo Reportado/Verificado Cuenta (Regla E6) | Trigger `fn_sync_plan_item_totals`: suma solo `reported` + `verified` |
| Verificación / Rechazo | RPC `verify_execution` / `reject_execution` (`rejection_notes` obligatorio en rechazo) |
| Corrección | Nueva fila en `weekly_plan_item_executions` con `status = draft`; la rechazada permanece sin modificar |

## Fuera de alcance de este mapeo

`entity_attachments` / `entity_history` (Evidencias) y `site_incidents` (Incidencias) existen físicamente en la base, pero no forman parte de este mapeo porque `execution-domain.md` los deja fuera de alcance — no están integrados al ciclo de la Jornada. Se documentarán aquí cuando el dominio los incorpore.

## Notas de implementación

- La generación de `activity_performance_observations` al cerrar un Plan Semanal (retroalimentación de rendimiento) está descrita en `workflow.md`, transición `confirmed → closed`.

## Regla de actualización

Este documento se actualiza en el mismo cambio que la migración o refactor que lo vuelve obsoleto (mismo commit o PR).
