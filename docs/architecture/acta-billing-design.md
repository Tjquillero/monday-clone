# Diseño: Esquema del Acta de Cobro

**Estado: Propuesto — diseño previo a la primera migración, no implementado todavía.**

Traduce a esquema técnico las reglas ya congeladas en `docs/domain/poa-domain.md` (Regla 7) y `docs/adr/ADR-0003-billing-source.md` ("Mecanismo de emisión del Acta"). No decide ninguna regla de negocio nueva — solo estructura las entidades necesarias para representarlas. Referencia técnica, no un ADR: si algo aquí necesita cambiar, se cambia este documento directamente, sin el proceso de gobernanza de un ADR.

## Entidades

### `Acta`
Documento contractual de facturación. No representa una ejecución ni una versión del POA — es el documento mediante el cual se cobran una o más cantidades previamente certificadas.

| Campo | Notas |
|---|---|
| `id` | |
| `board_id` | |
| `numero` | Consecutivo único del contrato, continuo entre años (hoy: 37). Asignado al emitir, no al crear el borrador. |
| `estado` | `draft` \| `issued` |
| `fecha` | |
| `observaciones` | |
| `generated_by`/`generated_at` | |
| `issued_by`/`issued_at` | Solo se completan al emitir. |

### `ActaItem`
Línea de facturación. No representa una actividad del POA ni una ejecución — representa el cobro de una cantidad determinada de **una** actividad contractual. Referencia exactamente un `poa_activity_id` — dos actividades nunca se combinan en una sola línea, aunque compartan precio o descripción, para no perder el origen contractual exacto (consistente con Regla 14, Origen Único del Cobro).

| Campo | Notas |
|---|---|
| `id` | |
| `acta_id` | |
| `poa_activity_id` | Exactamente una actividad por línea. |
| `descripcion_snapshot` | Congelado al emitir. |
| `unidad_snapshot` | Congelado al emitir. |
| `precio_unitario_snapshot` | Congelado al emitir — mientras el acta es `draft`, se recalcula contra la versión `active` del POA (Regla de negocio central, ADR-0003). |
| `cantidad_facturada` | Suma de sus `ActaItemSource.cantidad_consumida`. |
| `valor_total` | `cantidad_facturada * precio_unitario_snapshot`, congelado al emitir. |

### `ActaItemSource`
De dónde sale la cantidad de una línea. Una línea puede alimentarse de varias ejecuciones (ej. 80 + 20 = 100); una ejecución puede alimentar varias líneas en distintas actas, mientras le quede saldo certificado sin facturar.

| Campo | Notas |
|---|---|
| `id` | |
| `acta_item_id` | |
| `execution_id` (`weekly_plan_item_executions.id`) | |
| `cantidad_consumida` | Porción de la cantidad certificada de esa ejecución que esta línea consume. |

### `Execution` (`weekly_plan_item_executions`, ya existente)
Sin cambios de significado — evidencia certificada de que cierta cantidad fue ejecutada. La ejecución en sí **nunca sabe si fue facturada**; eso vive exclusivamente en `ActaItemSource`, no como una columna en la propia ejecución (se descartó explícitamente una columna simple `billed_in_acta_id` — no representa la facturación parcial entre actas).

## Relación

```
Acta (1) ── (N) ActaItem (1) ── (N) ActaItemSource (N) ── (1) Execution
```

Ejemplo — una línea alimentada por dos ejecuciones:

```
Execution A: cantidad certificada = 80
Execution B: cantidad certificada = 20

Acta 15
  ActaItem "Poda de árboles" — cantidad_facturada = 100
    ActaItemSource → Execution A, cantidad_consumida = 80
    ActaItemSource → Execution B, cantidad_consumida = 20
```

Ejemplo — una ejecución repartida entre dos actas (caso excepcional de cierre contable, Regla 7):

```
Execution A: cantidad certificada = 100

Acta 10
  ActaItem — cantidad_facturada = 30
    ActaItemSource → Execution A, cantidad_consumida = 30
  (Execution A: saldo disponible = 70)

Acta 12
  ActaItem — cantidad_facturada = 70
    ActaItemSource → Execution A, cantidad_consumida = 70
  (Execution A: saldo disponible = 0)
```

## Restricciones

1. Una ejecución solo puede aportar hasta su cantidad certificada — `SUM(ActaItemSource.cantidad_consumida)` agrupado por `execution_id`, a través de todas las actas, nunca supera la cantidad certificada de esa ejecución.
2. Un acta emitida (`estado = 'issued'`) es inmutable — ni `Acta`, ni sus `ActaItem`, ni sus `ActaItemSource` se modifican después de emitir.
3. Los snapshots de `ActaItem` (`descripcion`/`unidad`/`precio_unitario`) nunca se recalculan una vez emitida el acta.
4. El precio unitario de una línea, mientras el acta es `draft`, siempre proviene de la versión `active` del POA en el momento del cálculo (Regla de negocio central, ADR-0003) — no del precio vigente cuando se ejecutó.
5. Una línea (`ActaItem`) puede alimentarse de múltiples ejecuciones.
6. Una ejecución puede alimentar múltiples líneas de acta, en la misma o en distintas actas, mientras le quede saldo certificado sin facturar.
7. Cada `ActaItem` referencia exactamente una `poa_activity` — nunca combina dos actividades contractuales distintas en una sola línea, incluso si comparten precio y descripción.

## RLS

Mismo patrón que el resto del dominio POA: `get_user_board_role(board_id, auth.uid())`. Lectura para cualquier miembro del board; escritura (crear/editar borrador, emitir) restringida a `admin` — consistente con que `close_weekly_plan` (certificar el período) y la facturación son ambas operaciones admin-only. `ActaItem`/`ActaItemSource` heredan el `board_id` a través de `Acta`, sin columna `board_id` propia.

**Verificado contra el precedente real, no solo por analogía**: `poa_activity_zones` (`20260714_poa_domain_schema.sql`) tampoco tiene `board_id` propio, y su política de RLS ya resuelve una cadena de **tres** JOINs (`poa_activity_zones → poa_activities → poa_versions → poa.board_id`), con índice de soporte en la FK (`idx_poa_activity_zones_activity`) — patrón en producción, cubierto por 88/88 pgTAP. La cadena propuesta aquí es más corta (`Acta` ya trae `board_id` directo, sin depender de subir hasta una tabla raíz): `ActaItem → Acta.board_id` es un solo salto, `ActaItemSource → ActaItem → Acta.board_id` son dos. Al migrar, indexar `ActaItem.acta_id` y `ActaItemSource.acta_item_id` (mismo criterio que el índice ya existente en `poa_activity_zones.poa_activity_id`).

## Qué NO decide este documento

- El mecanismo exacto de generación del borrador automático (qué función SQL, qué trigger) — eso es el Commit 2 (generador) de la secuencia ya acordada.
- La UI de edición del borrador ni el formato del PDF — Commits 3 y 4.
- Si `poa_activity_id` en `ActaItem` debe permitir NULL para casos NP (Novedad de Pago) — `docs/discovery/billing-source-analysis.md`/ADR-0003 dejan NP como supuesto de trabajo no confirmado; este documento no lo resuelve.

## Documentos relacionados
- `docs/domain/poa-domain.md`, Regla 7 — regla de negocio que este esquema traduce.
- `docs/adr/ADR-0003-billing-source.md`, "Mecanismo de emisión del Acta" — decisión de la que este esquema es consecuencia directa.
