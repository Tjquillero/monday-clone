# Descubrimiento: `activity_scope_mappings` no migró al modelo POA — bloquea el Cronograma para cualquier board con datos reales

**Esto no es un ADR.** Es evidencia de investigación que expone una pregunta de arquitectura sin resolver todavía — se convertirá en ADR (o en una enmienda a uno existente) cuando exista una decisión.

## Fecha
2026-07-18

## Contexto

Al validar de punta a punta la importación real del POA (19 actividades ya confirmadas en `board_activity_standards`, ver `docs/discovery/poa-activity-equivalences.md`) contra un board de prueba con zonas y catálogo técnico completamente resueltos, la importación fue exitosa (`scripts/e2e/verify-poa-import-success.cjs`, primer E2E que prueba este camino) — pero el Cronograma **no generó ningún plan para ninguna zona**.

## Hallazgo

`useWeeklyPlan.ts` → `buildWeeklyPlanningContext()` (`src/lib/weeklyPlanner.ts:123`) filtra cada actividad del catálogo técnico por `activity_scope_mappings` (tabla **global**, no por board: `activity_key` → `scope_key`). Verificado contra la base real: esa tabla tiene **exactamente 23 filas**, las mismas 23 claves en snake_case (`limpieza_general`, `poda_arbustos`, `riego_grama`, `trasiego_playa`...) del seed original de `docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md` (2026-06-28, "CONGELADO"). Nunca se actualizó cuando ADR-0002 (2026-07-05) cambió `activity_key` a los códigos numéricos del POA (`1.01`, `2.16`...).

Consecuencia verificada en código, no solo inferida: si `activity_key` no tiene fila en `activity_scope_mappings`, el bucle `for (const scopeKey of scopeByKey.get(s.activity_key) ?? [])` itera cero veces — la actividad nunca entra al plan. Con 0 de los 19 códigos POA mapeados, `plan.activities` es siempre `[]`, para cualquier zona, en cualquier board.

**No hay bypass manual.** `ResourceEfficiencyWidget.tsx` (única UI para ingresar `resource_analysis`, cantidades por sitio) deriva sus categorías de entrada del mismo cruce `board_activity_standards × activity_scope_mappings` (`buildActivityMappings()`, `schedulerAdapter.ts`) — con 0 mappings, el widget no muestra ninguna categoría para llenar. `WeeklyPlannerContainer.tsx:70` (`if (plan.activities.length === 0) return;`) tampoco permite guardar un plan vacío ni agregar un ítem suelto.

**Impacto:** esto bloquearía Tablero Principal exactamente igual el día que se resuelvan los 88 rendimientos pendientes (`docs/discovery/poa-rendimiento-decision-request.md`) — es independiente y anterior en la secuencia. Aunque llegara la respuesta completa hoy, el Cronograma seguiría sin poder generar planes para ningún board con el modelo POA real.

## Preguntas abiertas (no se responden en este documento)

1. **¿`activity_scope_mappings` quedó obsoleto después de ADR-0002, o debe migrar?**
2. **¿Debe mapear códigos POA (`1.01`, `2.16`...) directamente, o seguir usando claves semánticas** (y entonces necesitar una tabla puente `activity_key POA ↔ activity_key semántico`, análoga a como ADR-0002 separó Catálogo Técnico de `poa_activities`)?
3. **¿`resource_analysis` (cantidades físicas por sitio y `scope_key`) también debe migrarse al modelo POA**, o sigue siendo una capa independiente que alguien debe poblar a mano por cada sitio, sin importar el catálogo técnico?
4. **¿Existe algún flujo manual que cree `weekly_plan_items` sin pasar por `buildWeeklyPlanningContext`?** Verificado en código: no, hoy no existe (`WeeklyPlannerContainer.tsx:70`). Si la respuesta se mantiene "no", esto es un bloqueo arquitectónico real del siguiente incremento — no un detalle de UX pendiente.

## Evidencia técnica (verificada, no asumida)

- `activity_scope_mappings`: 23 filas totales en toda la base, ninguna con clave numérica POA (consulta directa, 2026-07-18).
- `weeklyPlanner.ts:123` y `schedulerAdapter.ts` (`buildActivityMappings`): ambos hacen el mismo join `activity_key` → `scope_key`, ambos silenciosamente producen un resultado vacío para actividades sin mapeo — no lanzan error, por eso pasó desapercibido hasta hacer un E2E con datos reales.
- `scripts/e2e/seed-poa-import-full-flow.cjs` + `scripts/e2e/verify-poa-import-success.cjs`: reproducen el hallazgo de forma determinística contra un board de prueba (no Tablero Principal), con las 19 actividades ya confirmadas con evidencia real.

## Qué no se hizo (a propósito)

No se modificó `activity_scope_mappings`, `weeklyPlanner.ts`, `schedulerAdapter.ts` ni ningún otro código del motor de planificación. Las 4 preguntas de arriba determinan si la solución es una migración de datos (poblar la tabla con los códigos POA), un cambio de modelo (activity_key deja de ser la clave de join), o ambos — y esa decisión no es del validador ni de este documento.
