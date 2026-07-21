# ADR-0009 — Qué representa `theoreticalJournals`: ¿jornales mensuales reales o una métrica escalada por frecuencia?

## Estado
**Reabierto y revertido (2026-07-21)** — el dueño del proceso confirmó explícitamente que la Interpretación B es la correcta: la fórmula del Resource Analysis oficial (`COSTOS GENERALES (V2).xlsx`), `qty × 25 / (rendimiento × frecuencia)`, es la que debe usar el Scheduler. Esto revierte la aceptación de la Interpretación A del 2026-07-19 (ver historial de estado abajo). Investigación que originó la reapertura: `docs/operacion/investigaciones/costos/INV-0002-formula-jornales-vs-adr0009.md` (cerrada con esta resolución).

Como parte de la misma resolución, se corrigió también el dato de origen: `board_activity_standards.rendimiento` para `1.09` (Corte de troncos, Tablero Principal) estaba capturado en 20 und/jornal; el dueño del proceso confirmó que el valor correcto es **30 und/jornal**. Corregido directamente en la fila vigente (sin crear nueva versión, por tratarse de una corrección de captura, no de un cambio contractual).

**Historial de estado:**
- **2026-07-19** — Aceptada la Interpretación A: no se encontró (ni se buscaría más) evidencia que justificara el factor `25/frecuencia`; implementado el mismo día.
- **2026-07-21 (nota de actualización)** — Apareció evidencia de que `COSTOS GENERALES (V2).xlsx` (Resource Analysis oficial vigente) usa la fórmula que este ADR había reemplazado. No reabría el ADR todavía; quedaba pendiente confirmación del dueño del proceso.
- **2026-07-21 (esta reapertura)** — El dueño del proceso confirmó directamente que la fórmula del Excel es la correcta. Revertido el mismo día — ver "Alcance de la reversión (implementado)" más abajo.

## Fecha
2026-07-19

## Contexto

Al revisar la tarea #54 (observar si los jornales teóricos del Cronograma real son razonables), se detectó que la actividad `1.09` (Corte de troncos, Tablero Principal) reporta **437.5 JR/mes** para una cantidad contractual de 350 unidades a un rendimiento de 20 unidades/jornal — un número que, leído por un supervisor real, no corresponde a la intuición operativa de "necesito unos 15-17.5 jornales para esto".

Se investigó exhaustivamente antes de sospechar del código:
1. Se confirmó que **no hay doble multiplicación** — la fórmula de `calculateTheoreticalJournals` (`schedulerMath.ts`) aplica la división por `frecuencia/workingDays` una sola vez.
2. Se trazaron los 5 valores reales del pipeline (`poa_activities.frecuencia=1`, `poa_activity_zones.cantidad_contratada=300`, `activity_scope_mappings`, `resource_analysis.scope_data.corte_troncos=350`, `board_activity_standards.rendimiento=20`) — ninguna etapa intermedia expande la cantidad.
3. Se leyó el Excel real (`POA 2026 V.02 Ene.26-2026.xlsx`, hoja `POA INICIAL 2026`) directamente: el encabezado de cada bloque de zona dice literalmente `(presupuesto mes)`, y la cantidad contratada (300, en nuestro caso) se repite idéntica en los 12 bloques mensuales de la fila, con el total anual siendo exactamente `300 × 12` — confirma que la cantidad **es mensual**, no anual ni de una sola vez.
4. Se trazó el uso de `theoreticalJournals` en sus dos consumidores internos:
   - `calculateDailyJournals`: `theoreticalJournals / workingDays` → "¿cuántos trabajadores necesito CADA DÍA?"
   - `calculateCapacityUsage`: compara `Σ theoreticalJournals` directamente contra `dailyCapacity × workingDays` (capacidad TOTAL del mes).

   Ambos usos confirman que `theoreticalJournals` está diseñado y consumido como un **total mensual real**, no como una métrica intermedia o de "intensidad".

## Problema

La fórmula actual:

```
JR_mes = qty / (rendimiento × frecuencia / workingDays)
       = (qty / rendimiento) × (workingDays / frecuencia)
```

hace que el resultado dependa de `frecuencia`, incluso cuando `qty` ya es la cantidad **mensual** total (confirmado en el Excel real) y `rendimiento` ya es "unidades por jornal" (confirmado por la propia etiqueta de la UI del Catálogo Técnico: *"Rendimiento (unidad por jornal)"*, tal como lo capturan los usuarios).

Matemáticamente, si el trabajo total es fijo (`qty` unidades a procesar a `rendimiento` unidades/jornal), el total de jornales necesarios en el mes es:

```
JR_evento = (qty / F) / rendimiento     — jornales de cada intervención
JR_mes    = JR_evento × F = qty / rendimiento
```

La frecuencia se cancela algebraicamente — determina **cómo se distribuye el trabajo en el calendario** (una intervención grande vs. varias pequeñas), pero no **cuánto trabajo total hay que hacer**. La fórmula actual, en cambio, introduce un factor `workingDays/frecuencia` que infla el resultado para cualquier actividad con `frecuencia < workingDays` (es decir, cualquier actividad que no sea diaria):

| Actividad | frecuencia | Factor `25/frecuencia` | JR "correcto" (qty/rend) | JR reportado hoy |
|---|---|---|---|---|
| Plateo (caso ya aceptado, Fase 4) | 12.5 | 2x | 14.34 | 28.69 |
| Corte de troncos (`1.09`) | 1 | 25x | 15-17.5 | 375-437.5 |

El efecto existe desde Fase 4 (2026-06-29) para **toda** actividad con `frecuencia < 25` — la mayoría del catálogo real. Pasó inadvertido porque las actividades revisadas hasta ahora tenían frecuencias relativamente altas (factor pequeño, poco visible), y porque nadie había comparado el JR reportado contra la intuición operativa de un supervisor real hasta esta tarea (#54).

## Consumidores afectados (transversal, no solo el Cronograma)

| Consumidor | Cómo usa la fórmula |
|---|---|
| `src/lib/schedulerMath.ts::calculateTheoreticalJournals` | Fuente única declarada de la fórmula |
| `src/lib/weeklyPlanner.ts::buildWeeklyPlanningContext` | JR/mes y JR/semana del Cronograma (`PlanningTable`) |
| `src/components/dashboard/ResourceEfficiencyWidget.tsx` (línea ~280) | **Reimplementa la misma fórmula en línea** (`factor = rule.freq / WORKING_DAYS_MONTH; theoretical = qty / (rend * factor)`) en vez de llamar a `calculateTheoreticalJournals` — viola la "regla absoluta" que el propio `schedulerMath.ts` declara ("Esta es la única fuente de la fórmula... importan desde aquí"). Si se corrige la fórmula, este archivo necesita el mismo cambio o quedará desincronizado. |
| `calculateCapacityUsage` / factibilidad del Cronograma | El déficit/utilización reportados hoy (ej. "667% de utilización" en Playa del Country) están inflados por el mismo factor para cualquier actividad de baja frecuencia — corregir la fórmula cambiaría también estos números de factibilidad |
| `calculateWeeklyDistribution` | Hoy reparte `JR_mes` uniformemente entre 4 semanas ("v1: distribución uniforme"). Si `frecuencia` deja de escalar el total, probablemente debe empezar a decidir **en qué semana(s)** cae cada intervención (ej. una actividad con `frecuencia=1` debería concentrarse en una sola semana, no repartirse por igual en las 4) — un cambio de comportamiento adicional, no solo aritmético |

## Pregunta a decidir (una sola)

**¿Qué representa contractualmente `board_activity_standards.rendimiento`?** — no es una pregunta simétrica entre dos lecturas igual de sustentadas. La evidencia ya inclina la balanza hacia una de ellas; lo que falta es descartar formalmente la otra.

**Evidencia a favor de la Interpretación A** ("unidades producidas por un jornal de trabajo", sin ajuste por frecuencia):
- El POA expresa cantidades mensuales (el Excel repite la misma cantidad en los 12 bloques mensuales; el total anual es la suma de esos 12 meses).
- La etiqueta de captura en el Catálogo Técnico dice literalmente "Rendimiento (unidad/jornal)" — no "unidad/jornal equivalente diario" ni "unidad/jornal ajustado por frecuencia".
- `theoreticalJournals` se usa como total mensual real en el propio código (dividido entre 25 para personal diario; comparado directo contra la capacidad mensual del sitio) — no como una métrica intermedia que toleraría un factor de escala adicional.
- Consistencia dimensional: si el trabajo total es fijo, la frecuencia debe cancelarse algebraicamente (ver "Problema" arriba); que no lo haga es la anomalía a explicar, no el punto de partida neutral.

**Evidencia que haría falta para sostener la Interpretación B** (el rendimiento incorpora implícitamente un ajuste por frecuencia — la fórmula actual sería intencional):
- Un documento funcional que defina el rendimiento con ese matiz explícito.
- Una fórmula contractual (POA, pliego, manual de operación) que lo exprese así.
- Un manual histórico o precedente de cálculo que lo use de esa forma.
- Cualquier justificación matemática escrita del factor `25/frecuencia` en particular.

**Verificado durante esta investigación: ninguna de las cuatro existe.** Se buscó en `docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md` (fuente única declarada de la fórmula — define el factor pero no lo justifica), en los ADR relacionados (0002, 0005, 0007) y en los documentos de discovery del POA — no aparece ninguna mención al factor `25/F` fuera de su propia definición matemática. Esto desplaza la carga de la prueba: no se trata de demostrar que (A) es correcta, sino de que quien quiera mantener la fórmula actual (B) debe aportar la documentación que la respalde.

**Prueba de sentido común, para cerrar cualquier ambigüedad residual:** cuando un supervisor configura "20 unidades/jornal" para una actividad con 300 unidades contratadas al mes, ¿espera que el sistema le diga que necesita 15 jornales, o 375? Ningún supervisor real respondería "375" — y si la respuesta natural es "15", la Interpretación B queda prácticamente descartada por la propia forma en que el dato se captura y se entiende operativamente.

## Decisión (2026-07-19 — histórica, revertida el 2026-07-21)

**Interpretación A aceptada**: `board_activity_standards.rendimiento` representa "unidades producidas por un jornal de trabajo", sin ajuste implícito por frecuencia. `JR_mes = qty / rendimiento`. La frecuencia no modifica el trabajo total — solo determina si la actividad participa del cálculo (`null`/`<=0` → excluida).

**Explícitamente fuera de alcance de esta corrección** (decisión del dueño del proceso, para acotar el riesgo del cambio): `calculateWeeklyDistribution` **no se toca** — sigue con distribución uniforme entre semanas, exactamente como antes. Cómo se reparte el trabajo dentro del calendario (concentrar una actividad de baja frecuencia en una sola semana en vez de repartirla uniforme) queda como mejora futura, deliberadamente no incluida aquí para que el único cambio observable sea la magnitud de `JR_mes` — sin efectos laterales en semanas ni asignación de calendario.

## Decisión de reapertura (2026-07-21)

**Interpretación B confirmada por el dueño del proceso**: `JR_mes = qty × 25 / (rendimiento × frecuencia)`, la misma fórmula del Resource Analysis oficial (`COSTOS GENERALES (V2).xlsx`). La Interpretación A (2026-07-19) queda revertida — no se sostiene frente al documento con el que Operaciones planifica recursos hoy.

Junto con la reversión de fórmula, se corrigió el dato base: `rendimiento` de Corte de troncos (`1.09`, Tablero Principal) pasó de 20 a **30** und/jornal, confirmado por el dueño del proceso como el valor real.

## Alcance de la corrección (implementado 2026-07-19, revertido 2026-07-21)

1. `calculateTheoreticalJournals`: `JR_mes = qty / rendimiento` (eliminado el factor `frecuencia/workingDays`; el parámetro `workingDays` se retiró de la firma por quedar sin uso).
2. `calculateWeeklyDistribution`: **sin cambios**, por decisión explícita (ver arriba).
3. `ResourceEfficiencyWidget.tsx`: eliminada la reimplementación en línea; ahora llama a `calculateTheoreticalJournals` directamente.
4. Regresión: `schedulerMath.test.ts` y `weeklyPlanner.test.ts` actualizados — valores esperados recalculados contra la nueva fórmula, incluyendo el caso Plateo (28.69→14.34), un caso nuevo con los valores reales de Corte de troncos (300/20 → 15 JR, antes 375), y un test que verifica explícitamente que la frecuencia ya NO cambia la magnitud de `JR_mes` (antes sí, ahora es invariante).
5. Reverificación de factibilidad: pendiente de confirmar en Tablero Principal tras el despliegue — los planes hoy "infactibles" por el factor inflado pueden volverse factibles.

## Alcance de la reversión (implementado 2026-07-21)

1. `calculateTheoreticalJournals`: restaurada la fórmula `qty / (rendimiento × (frecuencia / workingDays))`, con `workingDays = WORKING_DAYS_MONTH` de nuevo como parámetro opcional de la firma.
2. `ResourceEfficiencyWidget.tsx`: **sin cambios de código** — sigue llamando a `calculateTheoreticalJournals` como fuente única (patrón que ADR-0009 ya había corregido y que se mantiene); el resultado cambia automáticamente con la fórmula.
3. `calculateWeeklyDistribution`: **sin cambios**, sigue fuera de alcance.
4. `board_activity_standards.rendimiento` para `1.09` (Corte de troncos, Tablero Principal): corregido de 20 a 30, actualizado directamente en la fila vigente.
5. Regresión: `schedulerMath.test.ts` y `weeklyPlanner.test.ts` revertidos a los valores esperados originales (Plateo 14.34→28.69; Corte de troncos recalculado con rendimiento=30 → 250 JR/mes, no 15). Suite completa verificada en verde (392/392).

## Consecuencias

- Los JR reportados para actividades de baja frecuencia vuelven a subir (ej. Corte de troncos: 15 → 250, con el rendimiento ya corregido a 30) — esto puede volver "infactibles" planes que la aceptación original de ADR-0009 había vuelto factibles.
- Cualquier cálculo financiero que dependa de `theoreticalJournals` (vía `ResourceEfficiencyWidget`) cambia también, consistente de nuevo con el Excel oficial de Operaciones.
- Los rendimientos ya cargados en el Catálogo Técnico NO necesitan recapturarse en general — el número que el usuario entendió capturar ("unidades por jornal") no cambia; lo que cambió es cómo el motor lo usa. La excepción puntual es Corte de troncos, cuyo dato en sí estaba mal capturado (20 en vez de 30) y se corrigió aparte.
- Reverificación de factibilidad en Tablero Principal: pendiente tras el despliegue, igual que en la aceptación original.

## Alternativas consideradas

- **No tocar nada y reinterpretar la UI/documentación** para que quede claro que `theoreticalJournals` es una métrica de "intensidad teórica", no jornales reales — descartada: ya se demostró que el propio código la usa como total mensual real (comparación directa contra capacidad mensual), así que el rótulo no sería el único problema; el número seguiría siendo objetivamente incorrecto para decisiones de capacidad.
- **Rediseñar `calculateWeeklyDistribution` en el mismo cambio** para que la frecuencia determine en qué semana(s) cae el trabajo — descartada para este incremento por decisión explícita del dueño del proceso: minimizar el radio de impacto del cambio, un solo efecto observable (la magnitud de `JR_mes` baja) sin tocar el calendario. Puede reabrirse como mejora futura independiente.

## Documentos afectados

- `docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md` (fórmula fuente) — pendiente de actualizar para reflejar la reversión.
- `docs/architecture/poa-technical-catalog-decoupling.md` — sin cambios de alcance.
- `docs/operacion/investigaciones/costos/INV-0002-formula-jornales-vs-adr0009.md` — cerrada con esta resolución.

## Criterio para revisar esta decisión

Si en el futuro aparece evidencia de que el Excel oficial (`COSTOS GENERALES (V2).xlsx`) quedó desactualizado respecto a una decisión de negocio posterior que sí adoptó la Interpretación A — por ejemplo, si Operaciones actualiza ese documento para dejar de usar el factor `25/frecuencia` — este ADR se reabre nuevamente.
