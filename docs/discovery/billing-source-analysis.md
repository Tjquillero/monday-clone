# Descubrimiento: Fuente de la Facturación

**Esto no es un ADR.** Es evidencia de investigación sobre una decisión que depende de personas fuera de este repositorio (dueños de Facturación y de Operaciones). Se convertirá en `docs/adr/ADR-000N-billing-source.md` únicamente cuando esa decisión exista. Hasta entonces, vive aquí para no simular una gobernanza que todavía no se ha ejercido.

## Fecha
2026-07-05

## Contexto
`poa-domain.md` (Congelado v1) establece, en la Regla 14 (Origen Único del Cobro), que toda cantidad incluida en un acta definitiva debe tener exactamente uno de dos orígenes: una Actividad del POA de la versión vigente, o un NP registrado por el administrador. No existen otros orígenes válidos.

La implementación real de Facturación no sigue ese modelo:

- `financial_actas` / `financial_acta_details` (`supabase/migrations/20260624_missing_tables.sql:36-122`) registran actas con `status` propio (`draft`/`approved`/`paid`), independiente de `workflow.md`.
- `financial_acta_details.item_id` referencia un `item` genérico del tablero (una tarea Monday-clone con columnas de texto/número), no una Actividad del POA.
- `src/utils/financialUtils.ts` calcula precio y cantidad leyendo directamente `item.values.unit_price` / `item.values.cant` / `item.values.executed_qty` — columnas editables del tablero, sin ninguna referencia a `POA_ACTIVITY.precio_unitario`, a la Cantidad Contratada, ni a la Cantidad Ejecutada certificada por una Jornada verificada (`execution-domain.md`).
- No existe ninguna tabla de NP (Novedad de Pago) en el repositorio — es puramente conceptual en `poa-domain.md`.

**No es un caso vacío como ADR-0002.** El board real del contrato ("Tablero Principal") tiene datos de producción: 1 acta ("Acta 32", en `draft`) con 37 líneas de detalle, y **0 planes semanales** (`weekly_plans`) en ese mismo board. El nombre "Acta 32" sugiere un historial de aproximadamente 32 períodos ya facturados por este mecanismo. El desarrollo en curso sobre los widgets financieros (`FinancialWidget.tsx` y otros, verificado por `git diff`) es una refactorización de centralización de columnas — no toca ni resuelve esta desconexión.

## Lo que esto significa
No es una brecha técnica como ADR-0002 (una tabla vacía a la espera de un esquema mejor). Es un **choque de gobernanza**: hoy coexisten dos fuentes de verdad sobre el mismo contrato —

- un sistema **formal** (POA → Cronograma → Ejecución), congelado como dominio pero sin datos reales todavía, y
- un sistema **operativo-histórico** (Actas sobre ítems genéricos del tablero), sin reglas de frontera explícitas, que ya está generando dinero real.

El sistema actual usa ambos sin que nadie haya decidido cuál manda cuando entran en conflicto. Eso no se resuelve con SQL ni con la buena voluntad del dominio recién congelado.

## Políticas posibles para las actas ya facturadas (~32 períodos)
No hay una respuesta técnica correcta aquí, solo políticas de negocio con distintos costos:

| Opción | Descripción | A favor | En contra |
|---|---|---|---|
| **A — Historial congelado** | Las actas existentes se tratan como legado pre-normalización: se conservan tal cual, no se recalculan ni se corrigen. | No rompe la contabilidad histórica. | Se acepta una inconsistencia estructural permanente entre lo histórico y lo nuevo. |
| **B — Reconciliación retroactiva** | Se intenta mapear las actas existentes al nuevo modelo POA y se reprocesa la lógica de facturación. | Consistencia total del historial. | Riesgo financiero real y discusiones extensas con negocio sobre cifras ya cerradas. |
| **C — Corte explícito de sistema** | Se define una frontera (fecha de activación del POA v1, versión de contrato, o cambio de régimen de facturación): todo lo anterior es "sistema legacy de facturación", todo lo posterior usa el modelo POA. | Conceptualmente limpio. | Exige disciplina operativa fuerte para no mezclar los dos regímenes después del corte. |

## Preguntas abiertas (requieren decisión de negocio, no solo técnica)
1. **¿"Tablero Principal" es el mismo contrato que gobierna `poa-domain.md`?** Si sí, hay una contradicción activa entre el dominio congelado (Regla 14) y el proceso real de cobro — no son el mismo sistema aunque compartan la misma interfaz y los mismos datos de contrato.
2. **¿Cuál de las tres políticas (A/B/C) aplica a Acta 32 y anteriores?**
3. **Si es C, ¿cuál es el criterio exacto de corte?** (fecha de activación del POA v1, versión de contrato, o cambio de régimen — no una fecha arbitraria).
4. **¿Existe un flujo real de Novedades de Pago (NP) fuera del sistema** (papel, Excel, correo, acuerdos comerciales paralelos) que ya esté generando cobros? Si existe, no puede ignorarse en el modelo nuevo — solo hay dos caminos sanos: formalizarlo como entidad del dominio con reglas explícitas de facturación, o prohibirlo explícitamente y forzar que todo pase por el POA. Ignorarlo no es arquitectura, es negación.
5. **¿Quién tiene autoridad para responder lo anterior?** No es una decisión de código ni de quien escribe el dominio. Corresponde a quien es dueño del proceso de facturación (Finanzas/Administración) y a quien es dueño del contrato operativo (gerencia de operaciones / administrador del POA real) — y ambos deben acordar la pregunta de fondo: **¿qué sistema manda cuando negocio y sistema no coinciden?**

## Qué hacer con esto cuando exista una decisión
Cuando los dueños del proceso respondan las preguntas abiertas: crear `docs/adr/ADR-000N-billing-source.md` (numeración según el siguiente ADR disponible al momento) con Estado Aceptado, la Decisión concreta (una de las políticas A/B/C o una variante), y las Consecuencias. Solo entonces se redacta `docs/domain/billing-domain.md`. Este archivo puede archivarse o enlazarse desde ese ADR como el registro de la investigación que lo originó.

## Documentos relacionados
- `docs/domain/poa-domain.md` (Regla 14, referenciada; sin cambios)
- `docs/domain/billing-domain.md` (no existe; no se redacta hasta que exista una decisión)
