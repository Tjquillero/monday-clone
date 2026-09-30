# Artefactos SQL Rechazados — Decisión D16

**Fecha:** 2026-09-30  
**Decisión de Gobernanza:** D16 (Tomás)  
**Estado:** RECHAZADO / ARCHIVADO

---

## 1. Artefactos Rechazados

1. `supabase/rejected/2026092801_reconcile_weekly_plan_items_gateway.sql` (Migración)
2. `supabase/rejected/31_weekly_plan_items_reconciliation_c15.sql` (Suite de pruebas pgTAP)

---

## 2. Razones Fundamentales del Rechazo (D16)

La propuesta de reconciliación temporal C1.5 contenida en la migración `2026092801` fue rechazada por tres fallas estructurales de integridad:

1. **Persistencia de `LIMIT 1` sobre `poa_activity_zones`:**
   Mantiene la consulta fallback `SELECT id FROM poa_activity_zones LIMIT 1`, vinculando de manera arbitraria ítems a zonas pertenecientes a otros sitios (evidencia en producción: 3.998 ítems contaminados).

2. **Uso de `activity_standard_id` como zona:**
   Aplica `COALESCE(..., (item->>'activity_standard_id')::UUID, ...)`, confundiendo el estándar de catálogo técnico con la llave foránea contractual de zona (`poa_activity_zones.id`).

3. **Incompatibilidad con la Invariante D14 (`ON CONFLICT DO UPDATE`):**
   Reemplaza `ON CONFLICT DO NOTHING` por `ON CONFLICT (plan_id, planned_sequence) DO UPDATE`, permitiendo sobrescrituras y relleno de huecos en planes previamente materializados, lo cual contradice la Decisión D14 (bloqueo total ante cualquier discrepancia o conflicto de identidad).

---

## 3. Estado de Tests TypeScript Asociados

- `src/lib/__tests__/governedTemporalReconciliationC15.test.ts`: **Pendiente de decisión**. No ha sido modificado en este gate y será evaluado de forma independiente según los requerimientos de la fase correspondiente.
