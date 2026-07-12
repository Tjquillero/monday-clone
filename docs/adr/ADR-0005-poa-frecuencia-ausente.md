# ADR-0005 — Frecuencia Ausente como Estado de Negocio Válido

## Estado
Aceptado

## Fecha
2026-07-11

## Contexto
Al implementar el importador del Excel del POA, la capa de validación (`src/lib/poaImport/validate.ts`) trataba cualquier celda `FREC.` vacía en una zona con cantidad contratada como un error de captura (`campo_requerido_vacio`), bloqueando la importación completa de esa actividad hasta que alguien completara el dato.

El dueño del proceso corrigió esa suposición: una `FREC.` vacía no es necesariamente un error. El dominio admite actividades que permanecen contratadas (`cantidad_contratada > 0` en alguna zona) pero sin programación periódica en una versión determinada del POA — para eso existe el versionado del POA (Regla 1 de `poa-domain.md`): cuando la operación requiera ejecutar esa actividad, se crea una nueva versión que le asigna frecuencia. El importador debe procesar el Excel exactamente como viene, sin convertir la ausencia en un error ni inventar un valor.

Antes de decidir el alcance exacto, se reclasificaron las 15 actividades reales del archivo `POA 2026 V.02 Ene.26-2026.xlsx` que hoy no resuelven a una única frecuencia, cruzando categoría y unidad de cada una (no solo su nombre):

| Patrón | Actividades | Descripción |
|---|---|---|
| Frecuencia vacía en el 100% de sus zonas contratadas | `3.14` (1) | Mantenimiento preventivo de planta eléctrica — caso inequívoco: no hay ningún valor entre el cual elegir. |
| Frecuencia real en algunas zonas, vacía en otras | `3.1` (1) | Mantenimiento de bombas centrífugas — 4 zonas con valor real (que además no concuerdan entre sí), 1 zona vacía. |
| Frecuencia real en todas las zonas, pero no concuerda entre ellas | `1.12`, `1.13`, `1.15`, `2.04`–`2.11`, `2.14`, `3.04` (13) | Ninguna celda vacía — el valor existe siempre, solo difiere numéricamente entre zonas. |

Un intento inicial de explicar el segundo y tercer grupo como "actividades por demanda" (ej. arborización) resultó no estar sustentado por el dato real: la actividad de poda técnica (`2.14`, el ejemplo de arborización citado) no tiene ninguna celda vacía — tiene un valor real en las 7 zonas donde se ejecuta, simplemente no idéntico entre todas. La única actividad con ausencia total (`3.14`) es mantenimiento preventivo de un generador — trabajo típicamente periódico, no "a demanda" en el sentido operativo del término. Se descartó explícitamente inferir una narrativa de negocio a partir del Excel; la regla que sigue se limita a lo que el dueño del proceso confirmó, no a una interpretación de por qué el dato está vacío.

## Decisión
Una celda `FREC.` vacía se preserva tal cual viene del Excel — nunca se convierte en un error de validación por defecto, y el importador nunca completa ni deduce un valor para llenarla.

Alcance deliberadamente estrecho — este ADR resuelve **únicamente** el caso inequívoco:

1. **Ninguna zona contratada de la actividad reporta frecuencia.** Se persiste `frecuencia = null` para la actividad completa. No hay ninguna política de consolidación involucrada: no existe ningún valor entre el cual elegir.
2. **Algunas zonas tienen frecuencia y otras no.** Este caso **NO se resuelve aquí**. Persistir un único valor de actividad exigiría decidir cuál de los valores presentes usar (o si la ausencia invalida el conjunto) — una política de consolidación que no está definida como regla de negocio. Sigue bloqueando la importación, bajo el mismo mecanismo ya existente para "no hay una frecuencia única resoluble" (`frecuencia_pendiente_regla_negocio`), con un `motivo` (`mixed_null_and_value`) que lo distingue del caso 3 para no perder la causa real del bloqueo.
3. **Todas las zonas tienen frecuencia, pero los valores no concuerdan entre sí.** Sin cambios respecto a antes de este ADR — sigue pendiente de la decisión de negocio documentada en `docs/discovery/poa-frequency-per-zone.md` (`motivo: different_values`).

Este ADR no decide si la frecuencia pertenece a la Actividad del POA o al par Actividad×Zona — esa pregunta (los casos 2 y 3 de arriba) sigue abierta y es explícitamente independiente de esta decisión.

## Consecuencias de esquema
- `poa_activities.frecuencia` pasa de `NUMERIC NOT NULL CHECK (frecuencia > 0)` a `NUMERIC NULL`, con el mismo `CHECK (frecuencia > 0)` — Postgres ya considera satisfecho un `CHECK` cuando la expresión evalúa a `NULL`, así que no hace falta reescribir la restricción (`supabase/migrations/20260726_poa_activities_frecuencia_nullable.sql`).
- `import_poa_version()` no requirió cambios de lógica — `(item->>'frecuencia')::NUMERIC` ya maneja `NULL` correctamente; el único bloqueo era la restricción de columna.
- `docs/architecture/import-poa-version-contract.md` actualizado: `frecuencia` deja de ser un campo obligatorio del payload.
- `ValidatedActivity.frecuencia`, `ImportPayloadActivity.frecuencia`, `PoaActivity.frecuencia`, `ActivityStandardWithFrecuencia.frecuencia` y `PoaActivityEntry.frecuencia` (catálogo activo consumido por el motor de planificación) pasan de `number` a `number | null`.
- El motor de planificación (`calculateTheoreticalJournals`, `schedulerMath.ts`) trata explícitamente `frecuencia === null` igual que `frecuencia <= 0`: cero jornales teóricos, no un error. `buildWeeklyPlanningContext` (`weeklyPlanner.ts`) excluye las actividades con `frecuencia = null` antes de construir un ítem planificable — `weekly_plan_items.planned_frecuencia` sigue siendo `NOT NULL` (una actividad sin programación periódica no genera, por definición, un ítem de cronograma) y `PlanningActivity.frecuencia` conserva el tipo `number` no nulo por esa garantía de construcción.

## Alternativas consideradas
- **Interpretar la ausencia como "actividad por demanda" y aplicarlo a los 3 casos (`3.1`, `3.14`, y por extensión a la ambigüedad de valores distintos).** Descartada: no está sustentada por los datos reales (ver Contexto) y habría requerido inventar una narrativa de negocio no confirmada.
- **Consolidar automáticamente un único valor cuando algunas zonas tienen frecuencia y otras no** (ej. usar el valor de las zonas que sí la tienen). Descartada explícitamente: es una política de negocio no definida: decidir "qué valor gana" ante datos mixtos no es una inferencia técnica válida sin una decisión humana.
- **Mover `frecuencia` de `poa_activities` a `poa_activity_zones`** para representar frecuencia por zona directamente. Descartada para este incremento: resolvería los casos 2 y 3 de la Decisión, pero es un cambio de esquema mayor que contradice el Glosario vigente de `poa-domain.md` y afecta el motor de Cronograma (que hoy lee frecuencia desde `poa_activities`, no por zona). Queda como la pregunta ya documentada en `docs/discovery/poa-frequency-per-zone.md`, sin resolver aquí.

## Documentos afectados
- `docs/domain/poa-domain.md` (Glosario, "Frecuencia") — se amplía para reconocer la ausencia como estado de negocio válido para una versión, sin modificar la Regla 18 (inmutabilidad dentro de la vigencia de una versión, que ya era compatible con este cambio tal como estaba redactada).
- `docs/architecture/import-poa-version-contract.md` — campo `frecuencia` deja de ser obligatorio.
- `docs/discovery/poa-frequency-per-zone.md` — no se reescribe (sigue como registro de la investigación original); este ADR resuelve únicamente el subconjunto de "ausencia total", no la pregunta de fondo sobre valores que sí existen pero no concuerdan.

## Criterio para revisar esta decisión
Si el dueño del proceso confirma una política de consolidación para el caso "algunas zonas con frecuencia, otras sin ella" (caso 2 de la Decisión), o resuelve si la frecuencia pertenece a la actividad o a la actividad×zona (caso 3, la pregunta de `poa-frequency-per-zone.md`), esa respuesta se documenta en un ADR nuevo que referencie este — no se reinterpreta silenciosamente el `motivo: 'mixed_null_and_value'` ni `'different_values'` ya persistidos en los mensajes de error.
