# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Inventario F1.4 (Offline Sync), Guardrails y Matriz Before/After (F0, F1.1, F1.2 y F1.3 Certificados)  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012)

---

## 1. Resumen Ejecutivo y Marco Normativo de F1.4

Mantenix mantiene certificadas sus invariantes backend y de UI (commits `ac6771c`, `5411a1d`, `e5cf13e`).

Para el **Sub-bloque F1.4 (Feedback Offline basado en IndexedDB)**, se aplica la norma inquebrantable de fuente única:
> **"La fuente de verdad del estado de sincronización es única: IndexedDB → OfflineSyncContext → OfflineIndicator / SyncToast → UI. Prohibido crear estados o contadores de pendientes paralelos en memoria UI."**

---

## 2. Invariante de Fuente Única y Estados Reales

$$\text{IndexedDB} \longrightarrow \text{OfflineSyncContext} \longrightarrow \begin{cases} \text{pendingCount} = \text{mutations} + \text{commands} + \text{attachments} \\ \text{conflictCount} = \text{commands}_{\text{conflicto}} + \text{attachments}_{\text{conflicto}} \\ \text{syncProgress} = \{\text{done}, \text{total}\} \\ \text{lastSyncResult} = \{\text{synced}, \text{conflicts}\} \end{cases} \longrightarrow \text{UI}$$

---

## 3. Inventario de Estados Offline y Matriz Before / After (F1.4)

| Estado Real (IndexedDB / `OfflineSyncContext`) | Propiedad del Contexto | Feedback Visible Anterior (Before) | Refinamiento UX Propuesto (After F1.4) | Clasificación Técnico-UX |
|---|---|---|---|---|
| Online + Cola vacía (`pendingCount === 0`) | `isOnline=true`, `syncStatus='synced'`, `pendingCount=0` | Oculto o `Sincronizado` | Indicador discreto `Conectado` / Oculto | Presentación UI pura |
| Offline + Cola vacía (`pendingCount === 0`) | `isOnline=false`, `pendingCount=0` | `Sin conexión · 0 guardados` | `Sin conexión · Sin pendientes` | Presentación UI pura |
| Offline + N pendientes (`pendingCount > 0`) | `isOnline=false`, `pendingCount=N` | `Sin conexión · N guardados` | `Sin conexión · N pendientes por sincronizar` | Presentación UI pura |
| Online + Sincronizando (`syncProgress != null`) | `isOnline=true`, `syncStatus='syncing'`, `syncProgress={done, total}` | `Sincronizando x/N...` + bar | `Sincronizando x/N (x%)` + bar en pulso | Presentación UI pura |
| Online + Error (`syncStatus === 'error'`) | `isOnline=true`, `syncStatus='error'`, `pendingCount=N` | `Error · N pendientes` | `Error al sincronizar · N pendientes [Reintentar]` | Presentación UI pura |
| Conflictos en cola (`conflictCount > 0`) | `conflictCount=C` | Badge rosa de conflicto | Badge de alerta + acceso directo a tray de resolución | Presentación UI pura |
| Cierre de Sincronización (`lastSyncResult != null`) | `lastSyncResult={synced, conflicts}` | Toast en bottom-right | Toast accesible en bottom-right con auto-dismiss | Presentación UI pura |

---

## 4. Criterios de Certificación F1.4 y Cierre de Fase 1
- **TypeScript:** 0 errores (`npx tsc --noEmit`).
- **Suites de Pruebas:** 72/72 PASS (540/540 tests).
- **Fuente de Verdad:** 100% derivada de IndexedDB a través de `OfflineSyncContext`.
- **Invariantes:** Cero modificaciones a `OfflineSyncContext.tsx`, `offlineDB.ts`, RLS o servicios de dominio.
