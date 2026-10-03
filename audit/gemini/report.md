# INFORME DE AUDITORÍA INDEPENDIENTE (FASE A — CORREGIDA)
## INCREMENTO C1.5-R1 / GATE-AUDIT-GEMINI-01 & GATE-FIN-01

**Fecha:** 2026-09-28  
**Auditor:** Gemini (Sesión Independiente Fase A — Corregida)  
**Entorno de Ejecución:** Producción Supabase (`READ ONLY` verificado)  
**Alcance:** Tablero Principal (`3ea0326f-6ff7-409f-848a-1f296e6e3cc8`), 10 planes operacionales, 4.011 items totales históricos, cadena Acta/Billing.

---

## 1. Separación Epistemológica: Planos de Auditoría

Para evitar contaminar hechos con interpretaciones o cerrar brechas prematuramente, esta auditoría separa estrictamente:

### Plano 1: Evidencia Física Observada (Hechos Verificados)
- **E001:** Definición del RPC vivo en PostgreSQL `sync_weekly_plan_items_rpc` (MD5: `96316db12584401945784bb5c2f83d36`, Migración `2026091401`). Contiene `ON CONFLICT DO NOTHING`, fallback `(SELECT id FROM poa_activity_zones LIMIT 1)` y filtro `AND item->>'planned_date' IS NOT NULL`.
- **E002:** Registro de migraciones aplicadas en `supabase_migrations.schema_migrations`. La última aplicada es `2026092502`. La migración `2026092801` NO está aplicada.
- **E003:** Auditoría de 10 planes de la semana `2026-09-28` (1.426 items):
  - 5 planes afectados (715 items): `planned_date = NULL`, `poa_activity_zone_id = 5eb5a0f9-fa86-4046-b26e-973011703681`.
  - 5 planes de control (711 items): `planned_date` poblado, `poa_activity_zone_id = 2969b907-0076-4f11-adad-04842f9dd0fe`.
  - En los 1.426 items: `occurrence_key` es `NULL` (0%), `executed_qty = 0`, `executed_jr = 0`, `is_manual_override = false`.
- **E004:** Auditoría de resolución espacial de zonas contra el POA activo `c67be574-9006-406b-9406-b48896845780`:
  - 715 afectados: 381 ZONE_MISMATCH (zona de otro grupo), 334 ZONE_UNRESOLVED (actividades sin resolución), 0 canónicas.
  - 711 control: 280 ZONE_MISMATCH, 431 ZONE_UNRESOLVED, 0 canónicas.
- **E005:** Auditoría de código UI (`/my-work`, `/verification`, `scheduleMaterializationService.ts`):
  - Las superficies de usuario resuelven el sitio mediante `weekly_plans.group_id -> groups.title`. No filtran ni dependen de `poa_activity_zone_id`.
  - `scheduleMaterializationService.ts` no envía `occurrence_key` ni `poa_activity_zone_id` en el DTO del RPC.
- **E006:** Auditoría financiera y de Actas (GATE-FIN-01):
  - Total Actas en base de datos: **0**.
  - Total Actas en Tablero Principal: **0**.
  - Total registros en `acta_item_sources`: **0**.
  - Total ejecuciones físicas en `weekly_plan_item_executions` para el tablero: **0**.
  - `poa_zone_mappings` en Tablero Principal: 9 zonas registradas, **0 con `group_id IS NULL`**.

---

## 2. Inventario de Productores y Fidelidad de Contratos

### A1. Inventario Completo de Writers
1. **RPC vivo en producción:** `sync_weekly_plan_items_rpc` (versión `2026091401`).
2. **Fallback TypeScript:** `syncWeeklyPlanForBoard` en `src/lib/weeklyPlanDbSync.ts` (opera con direct `UPSERT` / `INSERT`).
3. **Trigger / Batch scripts históricos:** Scripts de inicialización y sincronización masiva ejecutados durante migraciones previas.

### A5. Evidencia del Origen Histórico de las Filas
- Las 715 filas afectadas fueron creadas en bloque el `2026-09-28 06:22:54.673891+00`.
- Debido a la cláusula `AND item->>'planned_date' IS NOT NULL` en el RPC vivo `2026091401`, **el RPC vivo no pudo haber insertado estas filas con `planned_date = NULL`**.
- La atribución del origen de las 715 filas al RPC `2026091401` queda formalmente **CONTRADICTED**. Su origen real permanece como hipótesis abierta (`OPEN`), atribuible a un batch insert previo, fallback o importación directa.

### A6. Autoridad de `occurrence_key`
- En producción actual, el 100% de las 1.426 filas tienen `occurrence_key IS NULL`.
- El frontend no genera ni envía `occurrence_key`.
- Por tanto, la unicidad y el conflicto en base de datos se manejan exclusivamente sobre la restricción física `(plan_id, planned_sequence)`.

### A10. Fidelidad de Tests vs Producción
- Los tests unitarios creados en Fase 1 probaban un payload sintético con `occurrence_key` y `poa_activity_zone_id` poblados, lo cual **no refleja la realidad del frontend productivo**.

---

## 3. Registro y Partición de Claims Críticos

### C04: Contradicción del RPC Vivo vs Filas NULL
- **C04-A (PROVEN):** El RPC vivo `2026091401` contiene `AND item->>'planned_date' IS NOT NULL`, rechazando items sin fecha.
- **C04-B (PROVEN):** Las 715 filas afectadas tienen `planned_date = NULL`.
- **C04-C (CONTRADICTED):** La afirmación de que el RPC vivo `2026091401` originó las 715 filas NULL queda refutada por la conjunción de E001 y E003.

### C07: Partición de la Adscripción de Zonas
- **C07-A (PROVEN):** Las 711 filas de control tienen `poa_activity_zone_id = 2969b907-0076-4f11-adad-04842f9dd0fe`, coincidiendo exactamente con la ejecución actual de `SELECT id FROM poa_activity_zones LIMIT 1`.
- **C07-B (PROVEN):** Las 715 filas afectadas tienen `poa_activity_zone_id = 5eb5a0f9-fa86-4046-b26e-973011703681`, el cual **no coincide** con la resolución `LIMIT 1` actual.
- **C07-C (OPEN):** El origen del UUID `5eb5a0f9...` en las 715 filas afectadas permanece abierto (posible `LIMIT 1` bajo un orden de inserción previo o carga batch).

### C09: Desacoplamiento UI vs Acoplamiento Acta/Billing
- **UI (SUPPORTED / Desacoplada):** `/my-work` y `/verification` resuelven y operan sobre sitios mediante `weekly_plans.group_id`, sin depender de `poa_activity_zone_id`.
- **Acta/Billing (COUPLED / Acoplada):** `generate_acta_draft` realiza `JOIN public.poa_activity_zones paz ON paz.id = i.poa_activity_zone_id` para extraer `poa_activities.precio_unitario`.
- **Riesgo Financiero Actual (CONTAINED):** Dado que existen **0 ejecuciones físicas** y **0 Actas emitidas** en el tablero, la contaminación financiera es **0**.

### C12: Actividades sin Resolución en POA (UNRESOLVED)
- 334 actividades en planes afectados y 431 en control no encuentran correspondencia canónica en `poa_activity_zones`.
- Este claim permanece como **OPEN / UNRESOLVED**. No se asume que sean "rutinas no contractuales", manteniéndose abierta la investigación sobre el catálogo de estándares vs line-items contractuales del POA.

---

## 4. GATE-FIN-01: Dictamen de Impacto Financiero

| Consulta / Pregunta | Evidencia Primaria | Dictamen |
| :--- | :--- | :---: |
| **F1:** Definición viva de `generate_acta_draft` | `20260730_generate_acta_draft_lock_board.sql` (L55-L87) | `VERIFIED` |
| **F2:** Definición del motor de Acta | Serialización por board lock con snapshot de `precio_unitario` | `VERIFIED` |
| **F3:** Derivación contractual de precio y actividad | `weekly_plan_item -> paz.id -> pa.id -> pa.precio_unitario` | `COUPLED` |
| **F4:** Ejecuciones físicas sobre las 715 filas | `SELECT COUNT(*) FROM weekly_plan_item_executions` = **0** | `ZERO` |
| **F5:** Registros en `acta_item_sources` | `SELECT COUNT(*) FROM acta_item_sources` = **0** | `ZERO` |
| **F6:** Actas emitidas con zonas anómalas | `SELECT COUNT(*) FROM actas WHERE board_id = MAIN_BOARD` = **0** | `ZERO` |

**Conclusión Financiera:** El defecto espacial está **100% contenido operacionalmente** y no ha generado distorsión económica ni contractual en facturación o actas de cobro.

---

## 5. Estado de Cierre de Fase A

```text
GATE-AUDIT-GEMINI-01:  PASS (Claims corregidos, contradicción C04 documentada, C07 particionado, GATE-FIN-01 ejecutado)
FASE A CLAUDE:         PENDING (Sesión nueva independiente y ciega)
FASE B (ADVERSARIAL):  BLOCKED (A la espera de entrega de Claude Fase A)
REPARACIONES / DDL:    STRICT NO-GO
```
