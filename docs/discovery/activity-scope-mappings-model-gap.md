# Descubrimiento: `activity_scope_mappings` no migró al modelo POA — bloqueaba el Cronograma para cualquier board con datos reales

**RESUELTO (2026-07-18).** Se insertaron las 19 filas de la tabla puente propuesta abajo (`activity_key` POA → `scope_key` existente) y se verificó contra el board de prueba real (E2E, no solo lógica): el Cronograma genera el plan completo para las 19 actividades, con cantidad/JR-mes/JR-semana correctos, 0 errores de consola. Ver "Resolución ejecutada" al final.

Este documento se conserva como registro del hallazgo y del razonamiento — no se reescribe.

## Fecha
2026-07-18

## Contexto

Al validar de punta a punta la importación real del POA (19 actividades ya confirmadas en `board_activity_standards`, ver `docs/discovery/poa-activity-equivalences.md`) contra un board de prueba con zonas y catálogo técnico completamente resueltos, la importación fue exitosa (`scripts/e2e/verify-poa-import-success.cjs`, primer E2E que prueba este camino) — pero el Cronograma **no generó ningún plan para ninguna zona**.

## Hallazgo

`useWeeklyPlan.ts` → `buildWeeklyPlanningContext()` (`src/lib/weeklyPlanner.ts:123`) filtra cada actividad del catálogo técnico por `activity_scope_mappings` (tabla **global**, no por board: `activity_key` → `scope_key`). Verificado contra la base real: esa tabla tenía **exactamente 23 filas**, las mismas 23 claves en snake_case (`limpieza_general`, `poda_arbustos`, `riego_grama`, `trasiego_playa`...) del seed original de `docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md` (2026-06-28, "CONGELADO"). Nunca se actualizó cuando ADR-0002 (2026-07-05) cambió `activity_key` a los códigos numéricos del POA (`1.01`, `2.16`...).

Consecuencia verificada en código, no solo inferida: si `activity_key` no tiene fila en `activity_scope_mappings`, el bucle `for (const scopeKey of scopeByKey.get(s.activity_key) ?? [])` itera cero veces — la actividad nunca entra al plan. Con 0 de los 19 códigos POA mapeados, `plan.activities` era siempre `[]`, para cualquier zona, en cualquier board.

**No había bypass manual.** `ResourceEfficiencyWidget.tsx` (única UI para ingresar `resource_analysis`, cantidades por sitio) deriva sus categorías de entrada del mismo cruce `board_activity_standards × activity_scope_mappings` (`buildActivityMappings()`, `schedulerAdapter.ts`) — con 0 mappings, el widget no mostraba ninguna categoría para llenar. `WeeklyPlannerContainer.tsx:70` (`if (plan.activities.length === 0) return;`) tampoco permitía guardar un plan vacío ni agregar un ítem suelto.

**Impacto:** esto habría bloqueado Tablero Principal exactamente igual el día que se resuelvan los 88 rendimientos pendientes (`docs/discovery/poa-rendimiento-decision-request.md`) — era independiente y anterior en la secuencia.

## Preguntas que motivaron la investigación (ya respondidas con evidencia)

1. ~~¿`activity_scope_mappings` quedó obsoleto después de ADR-0002, o debe migrar?~~ — **Verificado: NO estaba obsoleta.** `resource_analysis` (cantidades físicas por sitio y `scope_key`) tenía 2 filas en toda la base — **ambas en Tablero Principal** — una con datos reales para `PLAYA DEL COUNTRY` (`{arboles:111, arbustos:2295, zona_dura:3852, zona_playa:19287, corte_troncos:350, trasiego_playa:9644, limpieza_manual:1470, total_paisajismo:2295}`), actualizada por última vez el **2026-07-13** — 5 días antes de este hallazgo. Alguien está usando este mecanismo activamente.
2. **¿Debe mapear códigos POA directamente, o seguir usando claves semánticas?** — Con datos reales recientes atados a la taxonomía actual de `scope_key` (10 valores: `arboles`, `arbustos`, `corte_troncos`, `grama`, `limpieza_manual`, `limpieza_marmol`, `total_paisajismo`, `trasiego_playa`, `zona_dura`, `zona_playa`), reemplazar el modelo habría descartado ese trabajo ya hecho. Se optó por una **tabla puente** (`activity_key` POA → `scope_key` existente), no por sustituir `scope_key`.
3. ~~¿`resource_analysis` también debe migrarse al modelo POA?~~ — **No.** Con datos reales de producción ya cargados, se preservó tal cual — la tabla puente reutiliza la taxonomía existente sin tocar `resource_analysis`.
4. **¿Existe algún flujo manual que cree `weekly_plan_items` sin pasar por `buildWeeklyPlanningContext`?** Verificado en código: no existía (`WeeklyPlannerContainer.tsx:70`). Por eso este hallazgo era un bloqueo arquitectónico real, no un detalle de UX.

## Evidencia técnica (verificada, no asumida)

- `activity_scope_mappings`: 23 filas totales en toda la base antes de la resolución, ninguna con clave numérica POA (consulta directa, 2026-07-18).
- `resource_analysis`: 2 filas en TODA la base, ambas en Tablero Principal — `PLAZA PUERTO COLOMBIA` (`scope_data: {}`, vacía) y `PLAYA DEL COUNTRY` (`scope_data` con 8 cantidades reales, `updated_at: 2026-07-13`). No es una tabla abandonada.
- Los 10 `scope_key` distintos: `arboles`, `arbustos`, `corte_troncos`, `grama`, `limpieza_manual`, `limpieza_marmol`, `total_paisajismo`, `trasiego_playa`, `zona_dura`, `zona_playa`.
- `weeklyPlanner.ts:123` y `schedulerAdapter.ts` (`buildActivityMappings`): ambos hacen el mismo join `activity_key` → `scope_key`, ambos silenciosamente producen un resultado vacío para actividades sin mapeo — no lanzan error, por eso pasó desapercibido hasta hacer un E2E con datos reales.
- `scripts/e2e/seed-poa-import-full-flow.cjs` + `scripts/e2e/verify-poa-import-success.cjs`: reproducen el hallazgo de forma determinística contra un board de prueba (no Tablero Principal), con las 19 actividades ya confirmadas con evidencia real.

## Tabla puente aplicada (19 actividades)

Las categorías ya asignadas en `board_activity_standards` (`ZONA VERDE`/`ZONA DE PLAYA`/`ZONA DURA`) y las descripciones de cada actividad corresponden razonablemente bien a los `scope_key` existentes — varias actividades comparten el mismo `scope_key`, igual que ya ocurría en los 23 mappings originales (ej. `riego_grama`/`fertilizacion_grama`/`herbicida_grama` comparten `grama`):

| `activity_key` (POA) | Descripción | `scope_key` aplicado | Evidencia |
|---|---|---|---|
| `1.09` | Corte de troncos de madera en playa | `corte_troncos` | Coincidencia literal de nombre |
| `1.10` | Trasiego con maquinaria en sitio estratégico | `trasiego_playa` | Coincidencia literal de nombre |
| `1.01` | Limpieza manual de infraestructura costera | `limpieza_manual` | Coincidencia literal de nombre |
| `3.06` | Pulido y encerado de pisos de mármol | `limpieza_marmol` | Coincidencia literal de nombre |
| `1.11` | Cargue con maquinaria de material acopiado en volquetas | `trasiego_playa` | Mismo `scope_key` que `1.10` — paso siguiente de la misma cadena logística (acopio → trasiego → cargue en volquetas) |
| `1.14`, `1.15` | Nivelación mecánica, limpieza + oxigenación mecánica de playas | `zona_playa` | Sin nombre exacto; comparten la misma cantidad contratada por zona (área total de playa), mantenimiento genérico de toda la superficie |
| `2.01`, `2.06`, `2.09`, `2.12` | Control de malezas/fungicidas/fertilizantes/poda — arbustos y cubresuelos | `arbustos` | Categoría `ZONA VERDE`, mismo target de vegetación |
| `2.07`, `2.10`, `2.13` | Fungicidas/fertilizantes/poda — grama | `grama` | Categoría `ZONA VERDE`, mismo target |
| `2.08`, `2.11`, `2.14` | Fungicidas/fertilizantes/poda — árboles y palmas | `arboles` | Categoría `ZONA VERDE`, mismo target |
| `3.03`, `3.04` | Aseo/limpieza de zonas duras, lavado a presión | `zona_dura` | Categoría `ZONA DURA` |

Reutiliza la taxonomía y los datos ya existentes (incluida la fila real de `PLAYA DEL COUNTRY`) en vez de crear una nueva — ningún `scope_key` nuevo, ninguna cantidad física reinventada.

## Resolución ejecutada (2026-07-18)

1. Confirmadas las 19 filas de la tabla de arriba con el responsable de la sesión (los 3 casos sin coincidencia literal de nombre — `1.11`, `1.14`, `1.15` — se resolvieron por relación de proceso, no por adivinanza, y se presentaron para confirmación explícita antes de insertar).
2. Insertadas las 19 filas en `activity_scope_mappings` (tabla real, no un fixture).
3. Verificado con un E2E de navegador real (no solo una prueba unitaria): se sembró `resource_analysis` para una zona del board de prueba y se confirmó que el Cronograma genera el plan completo — 19 actividades con cantidad, JR/mes y JR/semana calculados, 0 errores de consola. El aviso "Plan infactible" que aparece es el comportamiento esperado (capacidad de sitio superada con las cantidades de prueba sembradas), no un error.
4. No se modificó ningún código de producción — la resolución fue enteramente de datos (la tabla puente), consistente con que las 4 preguntas originales se respondieron a favor de "reutilizar el modelo existente", no de "cambiarlo".

**Pendiente, fuera de alcance de este hallazgo:** las 31 actividades contratadas restantes del POA (bloqueadas hoy por `docs/discovery/poa-rendimiento-decision-request.md`, ver revisión 2026-07-18 que redujo el alcance de 88 a 31) también necesitarán su propia fila en esta tabla puente cuando se confirmen sus rendimientos — ese trabajo se hace entonces, no ahora.
