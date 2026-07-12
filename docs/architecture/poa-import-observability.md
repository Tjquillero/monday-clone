# Observabilidad del importador del POA

**Estado: Propuesto — nota de diseño, nada de esto está implementado todavía.**

No es un ADR (no reemplaza ninguna decisión existente) ni un documento de dominio. Es la base para instrumentar `importPoaService` una vez que el importador reciba tráfico real de soporte — hoy el flujo es correcto y está verificado (71/71 tests de UI, 66/66 del orquestador, 86/86 pgTAP, más verificación en navegador real en cada commit), pero nadie puede responder "¿cuántas importaciones fallaron esta semana y por qué?" sin leer logs manualmente.

**Límite explícito:** esta nota define QUÉ capturar y DÓNDE encaja en la arquitectura ya congelada del importador. No decide un panel de visualización (dashboard, Metabase, pantalla admin) ni un proveedor externo — eso es un paso posterior, deliberadamente fuera de alcance aquí.

---

## Qué se propone capturar

Un evento por intento de importación (no por archivo — un mismo archivo reintentado dos veces son dos eventos, con `import_operation_id` distinto si el usuario seleccionó de nuevo, o el mismo si fue un "Reintentar"):

| Campo | Origen | Por qué |
|---|---|---|
| `poa_id`, `board_id` | `ImportPoaInput` | filtrar por proyecto/contrato |
| `import_operation_id` | `ImportPoaInput` | correlacionar reintentos del mismo intento |
| `outcome` | `ImportPoaResult.status` | `success` \| `blocked` \| `persistence_failed` |
| `unresolved_zones_count` | `result.unresolvedZones.length` cuando `blocked` | volumen de bloqueos por ADR-0004 (zonas sin mapear) |
| `ambiguous_frequency_count` | `result.ambiguousFrequencyActivities.length` cuando `blocked` | volumen de bloqueos por el Grupo B/D (`docs/discovery/poa-frequency-per-zone.md`) — mientras no exista la decisión de negocio, esto mide cuánto duele el bloqueo en la práctica |
| `validation_errors_count` | `result.validationErrors.length` cuando `blocked` | tercera categoría de `blocked` — sin ella, "¿por qué fallan las importaciones?" queda con un punto ciego justo en errores de forma del Excel, que en la práctica probablemente sean los más frecuentes |
| `sql_state` | `result.sqlState` cuando `persistence_failed` | agrupar fallos de persistencia por causa real, no por mensaje de texto libre |
| `duration_ms` | medido alrededor de la llamada (ver más abajo) | detectar si un Excel grande empieza a tardar de forma anómala |
| `importer_version` | string fijo en el código en el momento de la llamada (ver más abajo) | correlacionar cambios de comportamiento con despliegues, sin reconstruir la historia desde git |
| `created_by`, `created_at` | usuario autenticado, reloj del servidor | auditoría mínima |

Las tres categorías de `blocked` se capturan de forma simétrica (`unresolved_zones_count`, `ambiguous_frequency_count`, `validation_errors_count`) — no hay razón para medir dos y dejar la tercera como caja negra. No se propone guardar el detalle de cada error (qué fila, qué actividad), solo el conteo: el detalle ya lo ve el usuario en pantalla vía `ImportResultView`, y duplicarlo aquí sería redundante con lo que ya existe.

`importer_version` no necesita ser sofisticado — un string basta, por ejemplo el tag `poa-import-backend-complete` hoy, o el SHA corto del commit desplegado más adelante. Sin este campo, una pregunta tan simple como "¿los errores empezaron después del despliegue del 14 de agosto?" obliga a cruzar manualmente fechas de evento contra `git log`; con él, es un filtro directo sobre la propia tabla.

## Dónde encaja (sin romper la separación de capas ya congelada)

`import-poa-orchestrator-flow.md` establece que `importPoaService` no tiene ninguna dependencia de infraestructura propia — todo lo que toca Supabase entra inyectado vía `ImportPoaServiceDeps` (`resolveValidationContext`, `persistImportPoaVersion`). Escribir métricas es, otra vez, un efecto de infraestructura — debería seguir el mismo patrón, no una excepción:

```ts
export interface ImportPoaServiceDeps {
  resolveValidationContext(...): Promise<ValidatePoaImportContext>;
  persistImportPoaVersion(...): Promise<string>;
  recordImportAttempt?(event: ImportAttemptEvent): Promise<void>; // propuesto
}
```

Se propone medir `duration_ms` **dentro del orquestador** (desde que arranca `parsePoaExcel` hasta que se resuelve `ImportPoaResult`), no en la UI que lo invoca — la UI hoy hace una consulta previa (`poa.board_id`) antes de llamar al servicio, y esa consulta no es parte del trabajo de importar; medirla junto ensuciaría la métrica. `recordImportAttempt` se llamaría una sola vez, al final del flujo, con el `ImportPoaResult` ya resuelto (éxito, bloqueo o fallo) — nunca en un punto intermedio.

Ser opcional (`?`) evita romper `defaultImportPoaService` ni los tests existentes (`importPoaService.test.ts`, que inyectan deps falsas) el día que se implemente — un dep no provisto simplemente no registra nada, en vez de fallar.

**Por qué no en la UI (`PoaImportContainer.tsx`) directamente:** ya existe un solo llamador hoy, pero el flujo de importación no es exclusivo de una pantalla — un futuro job por lotes o una API de integración también invocarían `importPoaService` y necesitarían la misma métrica sin reimplementarla. Capturarla en el propio orquestador (vía dependencia inyectada, no hardcodeada) evita esa duplicación.

## Dónde se guardaría

Se investigó qué ya existe antes de proponer algo nuevo (mismo criterio de [[feedback-reuse-over-new-entities]]):

- **`src/app/api/log/route.js`** — no sirve: es un volcado de logs de consola del navegador a un archivo local (`browser_logs.txt`) en disco del servidor de desarrollo, no una tabla consultable ni apta para producción.
- **`activity_log`** — no sirve: `item_id` tiene FK dura a `items(id)`; un intento de importación no es un `item` del tablero.
- No hay ningún proveedor externo de observabilidad en el stack hoy (`package.json` no tiene Sentry/Datadog/PostHog ni similar) — adoptar uno es una decisión aparte, de costo/herramienta, no de este diseño.

Se propone una tabla nueva y pequeña, append-only, sin necesidad de una herramienta externa para empezar:

```sql
CREATE TABLE poa_import_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_id UUID NOT NULL REFERENCES poa(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  import_operation_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'blocked', 'persistence_failed')),
  unresolved_zones_count INT,
  ambiguous_frequency_count INT,
  validation_errors_count INT,
  sql_state TEXT,
  duration_ms INT NOT NULL,
  importer_version TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS seguiría el mismo patrón que el resto del proyecto (`get_user_board_role(board_id, user_id)`): lectura para miembros del board, escritura solo vía el propio flujo del importador (rol de servicio o `SECURITY DEFINER`, a definir junto con la migración real). No se propone RLS abierta de escritura a cualquier usuario autenticado.

## Límite firme: un resumen por intento, no un log de fases

`poa_import_events` representa **un evento por intento de importación completo**, escrito una sola vez al final (éxito, bloqueo o fallo) — nunca una secuencia de eventos intermedios tipo "empezó" / "parseó" / "validó" / "persistió". Ese es el diseño, no una simplificación temporal a mejorar después.

La razón no es solo costo — es que un registro resumido mantiene las consultas triviales (un `SELECT` con `GROUP BY outcome`, sin agregación posterior) y es suficiente para las preguntas que motivan esta nota (soporte, tendencias, salud del importador). Si en el futuro hiciera falta trazabilidad fase a fase (cuánto tardó el parseo vs. la validación vs. la escritura, para depurar una importación lenta puntual), eso es un problema distinto — tracing, no métricas de negocio — y merecería su propio mecanismo, no una tabla que empieza a acumular una fila por fase y termina siendo un log genérico con otro nombre.

## Qué NO decide esta nota

- Cómo se visualiza (pantalla admin nueva, export a una herramienta externa, consulta SQL manual de soporte).
- Si hace falta alertar activamente (ej. Slack/email cuando `persistence_failed` ocurre) — eso es un paso posterior, y probablemente sí necesitaría un proveedor externo.
- Retención de `poa_import_events` (¿se purga? ¿por cuánto tiempo?) — no es información contractual del POA, así que no aplica la Regla 19 de `poa-domain.md` (conservación histórica), pero tampoco se decide aquí un TTL.

## Próximo paso

Si esta nota se aprueba, el trabajo sería acotado: migración de `poa_import_events` + RLS; `recordImportAttempt` real (Supabase insert) inyectado como dep opcional en `defaultImportPoaService`; y un test que confirme que un dep no provisto no rompe el flujo existente. La visualización queda fuera del primer incremento.
