---
id: INV-0002
fecha: 2026-07-21
dominio: costos
estado: abierto
autor: Claude Code
fuentes:
  - Excel real (COSTOS GENERALES (V2).xlsx, Operaciones)
  - git (commit 2cccc3e)
  - src/lib/schedulerMath.ts
---

# INV-0002 — La fórmula de `CANT JORNALES MES` en el Resource Analysis oficial no coincide con la de ADR-0009

## Resumen

Al preparar la carga del documento de Resource Analysis al módulo Documentos, se inspeccionó `COSTOS GENERALES (V2).xlsx` (ruta: `OneDrive - CONSORCIO CONSERVACION COSTERA\Operaciones\ARCHIVOS ASISTENTE DE OPERACIONES\CENTROS DE COSTO\`) — el documento oficial con el que Operaciones planifica recursos hoy. La columna `CANT JORNALES MES` de ese archivo se calcula con una fórmula distinta a la que implementa el Scheduler tras ADR-0009 (2026-07-19, commit `2cccc3e`).

**Importante, corregido tras primera ronda de análisis**: la relación `CANT PERSONAL MES = CANT JORNALES MES / 25` (jornales del mes → personal promedio diario) NO es la disputa — es un paso posterior, verificado idéntico entre el Excel y el Scheduler (`calculateDailyJournals`). La disputa real es exclusivamente sobre cómo se calcula `CANT JORNALES MES` en sí, a partir de (cantidad, rendimiento, frecuencia).

## Pregunta

**La única que sigue sin responder**: ¿la fórmula para obtener `CANT JORNALES MES` debe seguir siendo la del Excel oficial (`Cantidad × 25 / (Rendimiento × Frecuencia)`), o la que implementó ADR-0009 (`Cantidad / Rendimiento`)?

Formulada como pregunta de negocio: ¿el Scheduler debe reproducir exactamente los cálculos del Resource Analysis oficial, o ADR-0009 cambió deliberadamente la metodología porque el negocio decidió abandonar esa fórmula? Ninguna de las dos respuestas puede asumirse todavía.

## Evidencia

**Capa 1 — `CANT JORNALES MES` (cantidad, rendimiento, frecuencia): la disputa real.** Hoja "PLAZA PUERTO COLOMBIA", bloque `ITEM, ACTIVIDAD, UNIDAD, RENDIMIENTO, FRECUENCIA, FACTOR, CANTIDAD, CANT JORNALES MES, V. ACTIVIDAD`:

| Actividad | RENDIMIENTO | FRECUENCIA | FACTOR | CANTIDAD | CANT JORNALES MES (Excel) |
|---|---|---|---|---|---|
| Plateo | 160 | 12.5 | 0.5 | 225 | 2.8125 |
| Poda Arbustos y CS | 1200 | 12.5 | 0.5 | 1850 | 3.0833333333333335 |
| Mtto Cama Siembra | 600 | 6.25 | 0.25 | 2620 | 17.466666666666665 |
| Limpieza zonas duras | 10000 | 1 | 0.04 | 17150 | 42.875 |

En las 4 filas, `FACTOR = FRECUENCIA / 25` exactamente, y `CANT JORNALES MES = (CANTIDAD / RENDIMIENTO) / FACTOR = CANTIDAD × 25 / (RENDIMIENTO × FRECUENCIA)`.

Esta estructura de columnas se repite en las hojas de los demás sitios del mismo archivo (Playa Manglares, Centro Gastronómico, Mercado La Sazón, Playa Miramar, Country 1, Country 2, Salinas del Rey, Santa Verónica) — la columna `CANT JORNALES MES` está presente en las 9 hojas.

**Capa 2 — `CANT PERSONAL MES` (jornales del mes → personal diario): NO es la disputa, verificada idéntica al Scheduler.** Subtotales al final de cada bloque:

| Sitio/bloque | CANT JORNALES MES | CANT PERSONAL MES | ÷25 exacto |
|---|---|---|---|
| Plaza Puerto Colombia, Zona Verde | 130.93599016676953 | 5.237439606670781 | ✓ (130.936/25 = 5.2374) |
| Playa Manglares, Zona Verde | 4.781114978396544 | 0.19124459913586175 | ✓ (4.7811/25 = 0.19124) |

`calculateDailyJournals` en `src/lib/schedulerMath.ts` (sin cambios por ADR-0009): `theoreticalJournals / workingDays` (`workingDays = WORKING_DAYS_MONTH = 25`) — estructuralmente idéntica a la relación del Excel. Esta capa nunca estuvo en disputa y el Excel y el Scheduler ya concuerdan en ella.

## Consultas realizadas

- Lectura directa del Excel con la librería `xlsx` (misma que usa `src/lib/poaImport/parseExcel.ts`), sin transformación.
- `git show 2cccc3e -- src/lib/schedulerMath.ts` — fórmula anterior del Scheduler (retirada): `qty / (rendimiento * (frecuencia / workingDays))`, equivalente a `qty × 25 / (rendimiento × frecuencia)` — algebraicamente idéntica a la `CANT JORNALES MES` del Excel.
- Fórmula actual del Scheduler (post ADR-0009): `qty / rendimiento`.
- Lectura de `calculateDailyJournals` (sin cambios): `theoreticalJournals / workingDays` — confirma que la Capa 2 (jornales→personal) es y siempre fue igual en ambos sistemas; ADR-0009 solo tocó la Capa 1.

## Hallazgos

- La coincidencia de la Capa 1 no es de una sola fila: se cumple exacta en las 4 filas verificadas de "Plaza Puerto Colombia", con `RENDIMIENTO`/`FRECUENCIA`/`CANTIDAD` distintos en cada una.
- La Capa 2 (`CANT PERSONAL MES = CANT JORNALES MES / 25`) es deliberada y consistente en el Excel, y coincide exactamente con cómo el Scheduler deriva "personal por día" desde su propio total mensual — verificado con 2 subtotales reales, exacto en ambos.
- **El debate no debe centrarse en la Capa 2** (esa relación es correcta y ya coincide) **sino exclusivamente en la Capa 1**: cómo se calcula el total mensual de jornales a partir de (cantidad, rendimiento, frecuencia).
- **Corrección importante sobre a quién corresponde la carga de la prueba**: `COSTOS GENERALES (V2).xlsx` es el documento oficial con el que Operaciones planifica recursos hoy — no es un artefacto legado ni un borrador. Si ese documento es la fuente de verdad del negocio, la carga de la prueba recae sobre ADR-0009 para justificar por qué el Scheduler debería calcular distinto al documento oficial vigente — no al revés. ADR-0009 (en su momento) asumió que la carga de la prueba estaba del lado de la fórmula antigua, sin haber contrastado contra este documento; esa asunción debe revisarse a la luz de esta evidencia nueva, no darse por buena automáticamente.

## Nivel de confianza

- **Alta** — `CANT JORNALES MES` (Capa 1) se calcula en el Excel como `cantidad × 25 / (rendimiento × frecuencia)`: verificado algebraicamente en 4 filas distintas.
- **Alta** — esa fórmula es algebraicamente idéntica a la que existía en `schedulerMath.ts` antes de `2cccc3e`: confirmado en el diff real del commit.
- **Alta** — `CANT PERSONAL MES = CANT JORNALES MES / 25` (Capa 2) es exacta y estructuralmente idéntica a `calculateDailyJournals`: verificado en 2 subtotales reales.
- **Baja** — cuál fórmula de Capa 1 (Excel o ADR-0009) representa la regla de negocio correcta, y a quién corresponde justificar la diferencia. Sin evidencia todavía para resolver esto — requiere confirmación de Operaciones, no más lectura de código.

## Conclusión

No hay conclusión todavía. Explícitamente NO se concluye que ADR-0009 esté mal, ni que el Excel esté mal — y explícitamente tampoco se asume por defecto que la carga de la prueba favorece a ADR-0009 solo por ser el código ya implementado.

## Estado

Abierto

## Próximos pasos

- Preguntar a Operaciones, con la pregunta ya acotada a la Capa 1 únicamente: ¿`CANT JORNALES MES` en `COSTOS GENERALES (V2).xlsx` representa la misma cantidad que el Scheduler llama `theoretical_journals_month`, calculada deliberadamente distinto por una razón de negocio (ej. dimensionar cuadrillas de forma conservadora), o es un cálculo que el propio Excel debería corregir?
- Si el Excel debe seguir siendo la fuente de verdad tal como está: ADR-0009 se reabre (ver su propio "Criterio para revisar esta decisión").
- Si ADR-0009 refleja una decisión de negocio ya tomada de abandonar esa fórmula: documentar explícitamente esa decisión (fecha, quién la tomó) y por qué el Excel oficial de Operaciones no se ha actualizado para reflejarla — dos fuentes de verdad divergentes sin que nadie lo haya decidido activamente es en sí mismo un riesgo operativo, incluso si ADR-0009 resulta ser el correcto.
- **No importar `COSTOS GENERALES (V2).xlsx` a `resource_analysis` hasta resolver esto** — poblar la tabla ahora arriesgaría cargar valores cuya interpretación todavía no está cerrada.
