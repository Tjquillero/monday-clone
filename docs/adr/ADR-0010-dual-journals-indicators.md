# ADR-0010 — Jornales Contractuales y Jornales Operativos como indicadores independientes

## Estado
**Aceptado (2026-07-22).** El dueño del proceso eligió la Opción C de `docs/discovery/scheduler-frequency-source-decision-request.md`. Esta ADR registra la decisión de negocio; el diseño de implementación (Sección "Alcance de implementación" más abajo) queda pendiente como un incremento aparte, con su propio Discovery → Diseño → Implementación → Verificación — mismo proceso disciplinado que ya se usó para el importador de Resource Analysis.

## Contexto

Al conciliar fila por fila el cálculo de jornales de Manglares entre el Excel de Resource Analysis (`COSTOS GENERALES (V2).xlsx`) y el Scheduler (que usa el POA vigente), aparecieron dos totales muy distintos para el mismo sitio: **107,56 JR/mes** (Excel) frente a **620,99 JR/mes** (Scheduler). La diferencia no se explicaba por un solo factor, sino por cuatro simultáneos: frecuencia distinta, conjunto de actividades distinto, correspondencia de actividades no 1:1, y objetivo del cálculo distinto (dimensionamiento operativo vs. cumplimiento contractual) — ver el documento de discovery para el detalle completo.

Se encontró además un vacío de gobierno: `ADR-0002` (frecuencia viene del POA) se decidió el 2026-07-05, **antes** de que Resource Analysis existiera como concepto documentado (2026-07-21). No hubo una comparación consciente entre ambos modelos al tomar esa decisión.

## Decisión

**El sistema mostrará dos indicadores de jornales independientes, ninguno derivado matemáticamente del otro:**

1. **Jornales Contractuales** — el indicador que ya existe hoy (`calculateTheoreticalJournals`, `theoretical_journals_month`, todo el Scheduler/Cronograma actual). Fuente: POA vigente (`poa_activities.frecuencia`) + Catálogo Técnico (`board_activity_standards.rendimiento`) + `resource_analysis.scope_data` (cantidades). **Sin cambios** — `ADR-0002`, `ADR-0005`, `ADR-0008` y `ADR-0009` siguen vigentes exactamente como están.
2. **Jornales Operativos** — un indicador nuevo, modelo derivado de Resource Analysis, preservando su metodología de cálculo (su propia tabla de rendimiento/frecuencia/cantidad por actividad, ya capturada por el parser como `ParsedActivityStandardRaw` pero hoy descartada tras el reporte de discrepancias RA006/RA007). El Excel fue el origen de este modelo; la fuente de verdad del sistema será el dominio que se defina e implemente para este indicador, no el archivo en sí. Responde "¿cuánto personal necesito realmente para operar este sitio, según el análisis operativo vigente?" — una pregunta distinta a "¿qué exige el contrato?".

Ambos indicadores pueden ser correctos simultáneamente. No existe una fórmula de conversión entre ellos ni se espera que coincidan.

## Por qué esta opción y no las otras dos

- **Opción A (solo contractual, sin cambios)** se descartó porque dejaría sin resolver la pregunta operativa real que motivó construir el importador de Resource Analysis en primer lugar — el dueño del proceso ya había señalado que esa pregunta ("¿cuánto necesito para operar?") es una necesidad de negocio real, no solo curiosidad.
- **Opción B (el Scheduler contractual adopta el modelo operativo)** se descartó porque exigía resolver primero la correspondencia de actividades POA↔Excel, qué catálogo de actividades usar, y qué hacer cuando falta el dato — cambios profundos al motor de planificación existente, con alto radio de impacto (afectaría directamente `theoretical_journals_month`, ya usado por Cronograma, Costos Operativos y factibilidad).
- **Opción C** evita ambos problemas: no toca el Scheduler existente, y el nuevo indicador **no necesita resolver la correspondencia POA↔Excel** — el "Jornales Operativos" es autocontenido dentro del propio modelo del Excel (sus propias actividades, su propia frecuencia, su propia cantidad), sin necesidad de vincularse a `poa_activities` en absoluto.

## Alcance de implementación — pendiente de diseño (incremento aparte)

Esta ADR fija la decisión de negocio, no el diseño técnico. Preguntas abiertas para el próximo incremento, antes de escribir código:

1. **¿Se persiste el total operativo, o se recalcula en cada import?** El parser ya descarta `rendimiento`/`frecuencia` tras el reporte RA006/RA007 (por la Regla de Gobierno de Datos — esos valores no son el Catálogo Técnico). Si "Jornales Operativos" debe sobrevivir después de que termine la sesión de importación, hace falta persistir el **total ya calculado** (no el rendimiento/frecuencia crudos) en una columna nueva, separada de `scope_data` y de `board_activity_standards` — para no violar esa regla ni crear una segunda fuente de rendimiento.
2. **¿Dónde vive el indicador en la UI?** Candidatos: Costos Operativos (junto al costo contractual) o una columna nueva en el Cronograma. No se decide aquí.
3. **¿Qué pasa con los sitios sin Resource Analysis?** (hoy: Punta Astilleros, Presupuesto General ×2). El indicador operativo simplemente no existe para esos sitios — no es un bloqueo, es la ausencia esperada de un dato que nunca se cargó.
4. **¿El indicador es por sitio completo o por actividad?** El Excel ya trae el desglose por actividad (`ParsedActivityStandardRaw`) — decidir si se expone ese detalle o solo el total agregado por sitio/bloque.

## Consecuencias

- Ningún cambio en el Scheduler, Cronograma, Catálogo Técnico ni en el importador de Resource Analysis ya cerrado (Incrementos 1-5) — todos siguen funcionando exactamente igual.
- Se habilita, por primera vez, mostrar una cifra de dimensionamiento operativo real (la que el Excel ya calculaba y que hoy se descarta silenciosamente tras el reporte de discrepancias).
- Riesgo a vigilar: que alguien, en el futuro, intente "conciliar" ambos indicadores o use uno para validar al otro — este ADR establece explícitamente que no deben serlo.

## Documentos relacionados

- `docs/discovery/scheduler-frequency-source-decision-request.md` — la pregunta original y las 3 opciones evaluadas.
- `docs/adr/ADR-0002-schedule-contractual-source.md`, `ADR-0005`, `ADR-0008`, `ADR-0009` — siguen vigentes, gobiernan exclusivamente el indicador contractual.
- `docs/domain/resource-analysis-domain.md` — la Regla de Gobierno de Datos que motiva por qué el indicador operativo no puede alimentar el Catálogo Técnico.

## Criterio para revisar esta decisión

Si en el futuro el dueño del proceso determina que ambos indicadores deberían converger en uno solo (Opción A o B originales), esta ADR se reabre y se documenta esa nueva decisión — no se asume automáticamente al implementar el indicador operativo.
