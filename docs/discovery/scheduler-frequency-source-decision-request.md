# Decisión requerida: ¿qué realidad debe modelar el Scheduler — contractual, operativa, o ambas?

**Para:** dueño del proceso / responsable de la operación
**De:** equipo de desarrollo de Mantenix
**Fecha:** 2026-07-22
**Evidencia completa:** conciliación fila por fila Manglares (esta sesión), `docs/adr/ADR-0002-schedule-contractual-source.md`, `docs/domain/resource-analysis-domain.md` (Sección 2, Regla de Gobierno de Datos), `docs/architecture/poa-technical-catalog-decoupling.md`

## Contexto

Al conciliar el cálculo de jornales de Manglares (bloque Zona de Playa) entre el Excel de Resource Analysis y el motor del Scheduler, aparecieron dos totales muy distintos para el mismo sitio (Manglares, Zona de Playa): **107,56 JR/mes** (Excel) frente a **620,99 JR/mes** (Scheduler, usando el POA vigente).

**Esa diferencia no se explica por un solo factor.** La conciliación encontró cuatro causas actuando a la vez, no una:

1. **Frecuencia distinta.** El Excel usa su propia frecuencia operativa por actividad (25, 4, 4 para las tres actividades comparadas); el Scheduler usa la frecuencia contractual del POA (1, la misma para todas).
2. **Conjunto de actividades distinto.** El Excel, en este bloque, solo lista 3 actividades (Acopio, Arrume, Corte de troncos). El Scheduler suma también `1.11` (Cargue con maquinaria) y `1.14` (nivelación mecánica de playas), que consumen las mismas cantidades (`trasiego_playa`, `zona_playa`) pero no aparecen en la tabla del Excel para este sitio.
3. **Correspondencia de actividades distinta.** No hay una equivalencia 1:1 clara entre las filas del Excel y las actividades del POA — por ejemplo, "Acopio y limpieza manual" del Excel no necesariamente corresponde a una única actividad POA, y el mapeo `activity_scope_mappings` permite que varias actividades POA compartan la misma cantidad física (`scope_key`).
4. **Objetivo del cálculo distinto.** El Excel responde "¿cuánto personal necesito realmente para operar este sitio?" (dimensionamiento operativo). El Scheduler responde "¿qué exige contractualmente el POA?" (planificación contractual). No son la misma pregunta.

**La frecuencia es uno de los cuatro factores, no el único.** Cambiar solo la fuente de la frecuencia no haría que ambos números coincidan — seguirían divergiendo por las otras tres razones. Antes de tocar el motor de cálculo hay que decidir si ambos modelos deben converger en un solo número, o si deben coexistir respondiendo preguntas distintas.

**Hallazgo de gobierno, no de implementación:** `ADR-0002` (2026-07-05) se decidió **antes** de que `docs/domain/resource-analysis-domain.md` existiera como concepto documentado (2026-07-21). No existe evidencia documental de que ambos modelos hayan sido comparados al tomar ADR-0002. Es una laguna real en el registro, no necesariamente una decisión tomada y luego incumplida.

## La pregunta a decidir

**¿Qué debe representar `theoretical_journals_month` en el Cronograma?**

### Opción A — Cumplimiento contractual (el modelo actual, sin cambios)
El Scheduler sigue derivando jornales exclusivamente del POA — actividades, frecuencia y correspondencia tal como existen hoy. Resource Analysis sigue aportando solo cantidades (`scope_data`), nunca frecuencia, catálogo de actividades ni rendimiento. El Cronograma responde "¿cumplo el contrato?", no "¿cuánto necesito operativamente?".

- [ ] Confirmado: el Scheduler debe seguir representando exclusivamente el cumplimiento contractual (Modelo A, sin cambios de código).

### Opción B — Planeación operativa real (modelo completo, no solo la frecuencia)
El Scheduler adopta el modelo operativo de Resource Analysis para el cálculo de recursos — no únicamente la frecuencia. Esto obliga a definir explícitamente, para cada sitio:
- **Qué catálogo de actividades usar** (¿el del POA, el del Excel, o una fusión de ambos?).
- **Cómo se corresponden las actividades del POA con las del Resource Analysis** (hoy esa correspondencia no es 1:1 — hace falta una tabla de equivalencia explícita, análoga a `activity_scope_mappings`, pero a nivel de actividad, no solo de cantidad).
- **Qué ocurre cuando una actividad existe en un modelo y no en el otro** (¿se descarta, se incluye igual, se marca como advertencia?).
- **Qué pasa cuando Resource Analysis no tiene datos para un sitio** (hoy 3 de 12 sitios de Tablero Principal) — ¿el Cronograma queda bloqueado para ese sitio, o cae de nuevo al modelo POA como respaldo?

Sin resolver estos cuatro puntos, "usar la frecuencia de Resource Analysis" por sí solo no cerraría la brecha entre 107,56 y 620,99.

- [ ] Confirmado: el Scheduler debe adoptar el modelo operativo de Resource Analysis (Modelo B) — completar las 4 definiciones de arriba antes de construirlo.

### Opción C — Ambos indicadores, en paralelo
El sistema muestra dos números distintos, cada uno correcto dentro de su propio modelo, sin intentar reconciliarlos. Cada indicador mantiene su propia fuente de verdad y no se deriva matemáticamente del otro:
- **Jornales contractuales** (POA) — lo que ya existe hoy, sin tocar.
- **Jornales operativos** (Resource Analysis) — un indicador nuevo, calculado con el modelo operativo completo del Excel (su propio catálogo de actividades, su propia frecuencia), mostrado junto al primero (ej. en Costos Operativos o en una columna nueva del Cronograma).

Un sitio puede cumplir la frecuencia contractual y, al mismo tiempo, necesitar más (o menos) recursos operativos por razones reales de terreno — ambos números pueden ser correctos simultáneamente porque responden preguntas distintas: "¿qué prometí?" vs. "¿qué necesito?".

- [ ] Confirmado: construir ambos indicadores por separado (Modelo C) — indicar dónde debería vivir el segundo indicador (Costos Operativos existente, o una vista nueva).

## Impacto de no responder

Mientras esta decisión no se tome, el Scheduler sigue exactamente como está hoy (Modelo A, ya implementado y en producción) — **no se toca el motor de cálculo sin esta decisión explícita**, para no invertir la jerarquía de fuentes de verdad sin autorización. La conciliación fila por fila que originó esta pregunta queda documentada como evidencia, no como corrección pendiente.

## Qué pasa después de la respuesta

1. Si Opción A: se documenta la confirmación aquí mismo y se cierra esta pregunta — el Scheduler queda formalmente ratificado como "solo contractual", sin ambigüedad para el futuro.
2. Si Opción B: se abre un ADR nuevo (no reemplaza ADR-0002, lo complementa) definiendo las 4 piezas del modelo operativo completo, y se construye como un incremento aparte con su propio Discovery → Diseño → Implementación → Verificación — no se mezcla con el importador de Resource Analysis ya cerrado.
3. Si Opción C: se abre un ADR nuevo definiendo el segundo indicador como una magnitud independiente (no reemplaza nada existente), con el mismo proceso disciplinado.

En cualquier caso, ninguna opción implica tocar el importador de Resource Analysis, el parser, la validación ni el mapeo de sitios ya cerrados y verificados esta sesión — esos quedan tal como están.
