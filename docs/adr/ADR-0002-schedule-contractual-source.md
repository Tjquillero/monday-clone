# ADR-0002 — Fuente Contractual del Cronograma

## Estado
Aceptado

## Fecha
2026-07-05

**Enmienda (2026-07-18):** ver sección "Enmienda — Rol de la frecuencia" al final. No cambia el esquema ni ninguna decisión de esta página — aclara que `frecuencia` es un parámetro de planificación, no un dato de certificación/facturación.

## Contexto
`docs/domain/poa-domain.md` (Congelado v1) establece que el Cronograma siempre nace de una versión específica y aprobada del POA (Regla 2), y que la separación entre Catálogo Técnico y Catálogo Contractual es estricta: rendimientos y tiempos estándar pertenecen al catálogo técnico; precio, frecuencia y cantidad contratada pertenecen exclusivamente a la versión del POA (Regla 17, Regla 18, sección "Separación de Catálogo y Contrato").

No existe ninguna tabla `poa_version` ni `poa_activity` en el repositorio. La implementación actual del Cronograma usa:

- `weekly_plan_items.activity_standard_id` → referencia `board_activity_standards` (`supabase/migrations/20260708_scheduler_engine.sql:18-44`).
- `board_activity_standards` almacena `rendimiento` **y** `frecuencia` en la misma fila, junto con `priority`, `category`, `unit`, `name`, `activity_key`. No tiene columna de precio ni de cantidad contratada.
- Versionado **incremental por fila**: cada cambio inserta una fila nueva con `effective_from`/`effective_to` (INSERT-only, nunca UPDATE), aislado por `(board_id, group_id)`. `group_id = NULL` significa estándar de contrato; `group_id = UUID` significa excepción de sitio.
- El modelo POA exige un versionado **atómico por snapshot**: una Versión del POA es "el catálogo contractual completo aplicable durante una vigencia determinada", no cambios incrementales fila por fila.

Estas dos filosofías de versionado (incremental por fila vs. snapshot atómico) no son compatibles entre sí sin traducción. Mantener `board_activity_standards` como fuente contractual del Cronograma, sin ajustes, contradice la Regla 2 y el principio de Separación de Catálogo y Contrato del dominio congelado.

## Evidencia (verificación 2026-07-05, base de esta decisión)
1. **`board_activity_standards` está vacía.** Consulta de solo lectura contra Supabase (conteo exacto): 0 filas. También 0 en `weekly_plans`, `weekly_plan_items`, `weekly_plan_item_executions`, `activity_performance_observations`. Única tabla con datos: `activity_scope_mappings` (23 filas, mapping `activity_key`↔`scope_key`, no depende de `activity_standard_id`). **La transición es de esquema puro, sin backfill de datos de contrato.**
2. **9 consumidores identificados**, todos internos: `src/hooks/useWeeklyPlans.ts`, `src/hooks/useWeeklyPlanMutations.ts`, `src/hooks/useActivityStandards.ts`, `src/lib/schedulerAdapter.ts`, `src/types/scheduler.ts`, `src/components/planner/PlanningWarnings.tsx`, `src/components/views/WeeklyPlannerContainer.tsx`, `src/components/dashboard/ResourceEfficiencyWidget.tsx`, `supabase/tests/01_state_machine.sql`, más las migraciones `20260708`-`20260711` y el seed E2E `scripts/e2e/seed-plan.cjs`. Sin vistas ni funciones SQL adicionales fuera de las ya listadas. Ningún consumidor externo al equipo.
3. **`priority` es un parámetro de planificación, no contractual.** Único uso funcional: `src/lib/weeklyPlanner.ts:149`, para ordenar actividades (`must_execute` primero) cuando la capacidad de jornales no alcanza. No participa en ningún cálculo de precio, facturación o liquidación.
4. **Impacto de reemplazar `activity_standard_id`: bajo.** Sin datos reales en ninguna tabla dependiente, no hay riesgo de migración de datos; el esfuerzo se limita a actualizar los 9 archivos del punto 2 y sus tests (`schedulerAdapter.test.ts`, `weeklyPlanner.test.ts`).
5. **Cobertura de atributos del modelo objetivo, sin huecos:** `activity_key`/`name`/`unit`/`category`/`rendimiento`/`version`/`effective_from`/`effective_to`/`group_id` (NULL=contrato, UUID=excepción) permanecen en el Catálogo Técnico reducido, sin conflicto — la Frecuencia ya es "única por actividad, independientemente de las zonas" (glosario de `poa-domain.md`), así que no necesita el mismo mecanismo de excepción por sitio. `frecuencia` pasa a `POA_ACTIVITY`; `priority` pasa a schedule-domain; `precio_unitario` y `cantidad_contratada` son campos nuevos (no migran de ningún lado, hoy no existen). Único matiz de diseño, no bloqueante: `POA_ACTIVITY_ZONE` no tiene un atajo "aplica a todas las zonas" — una actividad que cubra las 11 zonas requiere 11 filas en vez de 1 (costo de captura de datos, no falla del modelo).

## Decisión
`board_activity_standards`, tal como existe hoy, **es reemplazada** como fuente contractual del Cronograma — no adaptada in-place ni mantenida como vista de compatibilidad. Su versionado incremental por fila no puede representar una "Versión del POA" sin perder la semántica de snapshot atómico que el dominio exige, y la evidencia recogida descarta los riesgos que habrían justificado una alternativa más conservadora.

Transición:

1. **Catálogo Técnico reducido.** `board_activity_standards` conserva `activity_key`, `name`, `category`, `unit`, `rendimiento`, `version`, `effective_from`/`effective_to`, `group_id`. Pierde `frecuencia` y `priority`.
2. **Tablas del dominio POA.** Se crean `poa`, `poa_versions`, `poa_activities` (con `frecuencia` y `precio_unitario`) y `poa_activity_zones` (con `cantidad_contratada`), según `poa-domain.md`.
3. **`priority` migra a schedule-domain**, no a `POA_ACTIVITY` — vive como parámetro propio del motor de planificación.
4. **Repunte del Cronograma.** `weekly_plan_items` referencia `poa_activity_id` (o `poa_activity_zone_id`) en lugar de `activity_standard_id`. El patrón de snapshot autosuficiente ya existente (`planned_rendimiento`, `planned_frecuencia` copiados al planificar) se conserva sin cambios.
5. **Sin backfill de datos**: al estar todas las tablas en 0 filas, las tablas POA se crean antes de cargar las 220 actividades del Excel, y la carga se hace directamente sobre el modelo correcto.

## Alternativas consideradas
- **Adaptar `board_activity_standards` in-place.** Descartada: su versionado por fila no puede expresar un snapshot atómico de versión sin construir lógica adicional de agrupación — más complejo que crear las tablas correctas, y el nombre de la tabla seguiría prometiendo algo que ya no sería cierto.
- **Vista de compatibilidad.** Descartada: los 9 consumidores están bajo control del mismo equipo y no hay contrato de API externo que dependa del nombre o forma actual; una vista añadiría indirección sin beneficio real.

## Consecuencias
- El catálogo de 220 actividades del Excel se carga sobre el esquema POA nuevo, no sobre `board_activity_standards` en su forma actual.
- `useActivityStandards()`, `schedulerAdapter.ts` y `ResourceEfficiencyWidget` se actualizan para leer rendimiento del catálogo técnico reducido y frecuencia/precio de las tablas POA.
- `docs/domain/schedule-domain.md` se redacta tomando como premisa que el Cronograma deriva de `poa_activity`/`poa_activity_zone`, y que `priority` es un parámetro propio de ese subdominio.
- Bloquea, a propósito, cualquier desarrollo nuevo que siga escribiendo `frecuencia` en `board_activity_standards` como si fuera la fuente contractual.

## Documentos afectados
- `docs/domain/poa-domain.md` (referenciado; sin cambios)
- `docs/domain/schedule-domain.md` (a redactar, con esta decisión como premisa)

## Criterio para revisar esta decisión
Si en el futuro aparece un consumidor externo (API pública, integración de terceros) que dependa del nombre o la forma actual de `board_activity_standards`, se debe emitir un ADR nuevo que reevalúe la opción de vista de compatibilidad — no reabrir este ADR.

## Enmienda (2026-07-18) — Rol de la frecuencia

**Origen:** al resolver `docs/discovery/poa-frequency-per-zone.md` (14 actividades del POA 2026 con `FREC.` inconsistente entre zonas), el administrador y responsable del proceso — dueño funcional del contrato — señaló que la frecuencia no es un dato que la operación use para certificar ni facturar: la factura (Acta) se genera contra cantidades ejecutadas y verificadas, nunca contra la frecuencia planificada.

**Verificado antes de aceptar la aclaración, no solo de palabra:** `generate_acta_draft` (`supabase/migrations/20260728_generate_acta_draft.sql`) no referencia `frecuencia` en ninguna parte de su cálculo — certifica exclusivamente `precio_unitario × executed_qty` de ejecuciones `verified`. La observación es exacta para el código tal como existe hoy.

**Aclaración de rol, sin cambio de esquema:** `frecuencia` permanece en `poa_activities` — se sigue cargando desde la versión del POA, y `weekly_plan_items.planned_frecuencia` se sigue copiando de ahí al planificar, sin ningún cambio de código. Lo que se aclara es su **rol**: es un parámetro que usa el Scheduling Engine para sugerir el plan semanal (cuántos jornales por semana hacen falta) — no un dato de certificación o facturación. La Regla 18 de `poa-domain.md` ("una única frecuencia por actividad, independiente de la zona") se mantiene sin cambios; esta enmienda no la contradice, solo precisa para qué se usa ese valor una vez capturado.

**Consecuencia práctica:** esto es lo que permitió resolver las 14 actividades de `poa-frequency-per-zone.md` sin esperar una validación adicional de la lógica de facturación (que de todas formas no la usa) — la decisión sobre el valor correcto de `frecuencia` para cada actividad es una decisión de planificación operativa, dentro de la autoridad del administrador del proceso, no una decisión que además deba conciliarse con reglas de certificación ya construidas.

**No se reabre esta enmienda si en el futuro `frecuencia` empieza a usarse en algún cálculo de facturación** — eso sí exigiría un ADR nuevo, porque cambiaría la premisa verificada arriba (que hoy no la usa).
