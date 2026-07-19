# Contrato: Scheduler (`schedulerMath.ts` + consumidores) — cálculo de jornales teóricos

**Estado: Vigente — describe el comportamiento real tras ADR-0009** (`docs/adr/ADR-0009-theoretical-journals-frequency-scaling.md`, Aceptado 2026-07-19, commits `2cccc3e`/`41096f9`).

Este documento no es una guía de implementación — es la especificación del comportamiento garantizado de `calculateTheoreticalJournals()` y de la regla de una sola fuente que deben seguir todos sus consumidores. Cambiar cualquiera de los invariantes de abajo (la fórmula, quién puede calcularla, qué hace o no hace el motor con un rendimiento) requiere una decisión explícita de arquitectura (ADR o equivalente) — no un ajuste silencioso "porque un caso particular lo necesita".

**Marco (por qué existe este documento):** con ADR-0009 cerrado, el proyecto entró en una etapa distinta a la que lo trajo hasta aquí — de construir el Scheduler a calibrarlo (ver `feedback_dev_philosophy`, ampliación 2026-07-19). Los cambios futuros deben poder clasificarse sin ambigüedad en dos carriles: **cambios de software** (violan uno de estos invariantes, requieren ADR) vs. **cambios de parámetros operativos** (rendimiento, frecuencia, salario, capacidad — se hacen desde el Catálogo Técnico / datos, nunca requieren tocar este contrato). Este documento es la línea divisoria entre ambos.

---

## Invariantes garantizados (requieren ADR para cambiar)

1. **`JR_mes = cantidad / rendimiento`.** `calculateTheoreticalJournals(qty, rendimiento, frecuencia)` en `src/lib/schedulerMath.ts` — única fórmula, sin excepciones por unidad, categoría ni origen de la actividad.

2. **La frecuencia no escala la magnitud de `JR_mes`.** Solo determina si la actividad participa del cálculo: `frecuencia === null` (actividad contratada sin programación periódica, ADR-0005) o `frecuencia <= 0` → la actividad queda excluida, nunca genera "0 jornales" como si fuera un dato real. Fuera de ese gate binario, el valor exacto de la frecuencia no afecta el resultado.

3. **`requiere_rendimiento = false` excluye la actividad del mismo modo que `frecuencia = null`** (mismo patrón, ver `docs/architecture/poa-technical-catalog-decoupling.md`, Decisión 4) — nunca entra al cálculo con un rendimiento inventado ni con "0 jornales".

4. **El Scheduler consume rendimientos, nunca los valida ni los interpreta.** No existe, ni debe existir, ninguna lógica en `schedulerMath.ts`/`weeklyPlanner.ts`/`schedulerAdapter.ts` que juzgue si un `rendimiento` es "razonable" — esa responsabilidad es enteramente del Catálogo Técnico y de la operación de campo (ver tarea #54).

5. **El Scheduler nunca escribe en `board_activity_standards` ni en ninguna tabla del Catálogo Técnico.** Es una cadena de funciones puras (`qty`/`rendimiento`/`frecuencia` → número) y hooks de solo lectura — no muta el contrato ni la configuración técnica bajo ninguna circunstancia.

6. **`calculateTheoreticalJournals` es la única fuente de la fórmula.** Ningún otro módulo puede reimplementarla en línea, ni siquiera parcialmente. Precedente real de por qué esta regla existe: `ResourceEfficiencyWidget.tsx` la había reimplementado en línea con el mismo factor `frecuencia/25` que ADR-0009 eliminó — quedó desincronizada silenciosamente hasta esa auditoría. Todo consumidor nuevo debe importar la función, nunca derivar su propia versión.

7. **Costos Operativos consume exactamente la salida del Scheduler, sin recalcular jornales.** `CostosOperativosContainer`/`CostosOperativosView` reciben `WeeklyPlanningContext.activities` (el mismo `useWeeklyPlan` que usa el Cronograma) y solo multiplican `theoretical_journals_month × costoJornal` — ningún otro cálculo de cantidad, rendimiento o frecuencia le pertenece a este módulo.

---

## Fuera de alcance de este contrato (no congelado, puede cambiar sin ADR)

- **Cómo se distribuye `JR_mes` entre semanas** (`calculateWeeklyDistribution`) — hoy es distribución uniforme (v1), deliberadamente sin usar `frecuencia` para concentrar el trabajo en semanas específicas (decisión explícita al cerrar ADR-0009, para acotar el radio de impacto del fix). Mejorar esto es una mejora de producto, no una violación de este contrato.
- **De dónde sale `costoJornal`** (`resource_analysis.wages_data`) — es un dato operativo, no un invariante del motor.
- **`siteCapacity.ts`** (capacidad diaria hardcodeada por nombre de zona, deuda técnica v1 ya registrada) — no es parte de este contrato; el Scheduler solo consume `daily_capacity`, no decide cómo se obtiene.

---

## Ejemplo mínimo

```ts
import { calculateTheoreticalJournals } from '@/lib/schedulerMath';

// Corte de troncos (1.09, Tablero Principal): 300 UN/mes, rendimiento 20 UN/jornal
calculateTheoreticalJournals(300, 20, 1); // → 15 (JR/mes)

// Actividad sin programación periódica en esta versión del POA (ADR-0005)
calculateTheoreticalJournals(300, 20, null); // → 0, excluida — no es un "0 real"
```

---

## Documentos relacionados

- [`docs/adr/ADR-0009-theoretical-journals-frequency-scaling.md`](../adr/ADR-0009-theoretical-journals-frequency-scaling.md) — evidencia completa, decisión y alcance de la corrección que originó este contrato.
- [`docs/adr/ADR-0005-poa-frecuencia-ausente.md`](../adr/ADR-0005-poa-frecuencia-ausente.md) — origen del gate `frecuencia = null`.
- [`docs/architecture/poa-technical-catalog-decoupling.md`](./poa-technical-catalog-decoupling.md) — Decisión 4, origen del gate `requiere_rendimiento = false`.
- [`docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md`](../MAINTENANCE_SCHEDULING_ENGINE_v1.md) — especificación funcional completa del motor (este documento es el contrato acotado; ese es el diseño de fondo).
