# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Inventario F1.2 (Microcopy), Guardrails y Matriz Before/After (Fase 0 Certificada, F1.1 Certificado)  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012)

---

## 1. Resumen Ejecutivo y Marco Normativo

Mantenix mantiene certificadas sus invariantes backend (72/72 test suites, 0 errores TypeScript, Baseline 2386465). 

Para el **Sub-bloque F1.2 (Microcopy & Lenguaje Operacional)**, se aplica la norma estricta:
> **"La interfaz debe expresar el lenguaje operacional del usuario y ocultar la complejidad técnica del dominio, sin alterar las claves internas de DB, payloads de API o contratos de servicio."**

---

## 2. Inventario de Términos F1.2 y Clasificación de Seguridad

### A. Términos de Estado (`status` / `priority`)
- `'Not Started'`: Clave interna de DB. Label visible en UI normalizado de `'Sin iniciar'` a **`'Pendiente'`**.
- `'Working on it'`: Clave interna de DB. Label visible en UI normalizado a **`'En Proceso'`**.
- `'Stuck'`: Clave interna de DB. Label visible en UI normalizado de `'Detenido'` a **`'Bloqueado'`**.
- `'Done'`: Clave interna de DB. Label visible en UI normalizado de `'Listo'` a **`'Completado'`**.

### B. Identificadores Técnicos de Dominio Backend
- `contractually_certifiable_qty`: Variable interna de `actaService.ts` y tests. **NO expuesta en la UI**. Intacta.
- `weekly_plan_item_id`: Clave foránea en `executionService.ts` / `verificationService.ts`. **NO expuesta en la UI**. Intacta.

---

## 3. Matriz Before / After — Sub-bloque F1.2

| Componente | Término Interno (DB/Key) | Presentación Anterior (Before) | Presentación Nueva (After F1.2) | Clasificación Técnico-UX |
|---|---|---|---|---|
| `KanbanView.tsx` | `'Not Started'` | `'Sin iniciar'` | `'Pendiente'` | Presentación UI pura |
| `KanbanView.tsx` | `'Working on it'` | `'En proceso'` | `'En Proceso'` | Presentación UI pura |
| `KanbanView.tsx` | `'Stuck'` | `'Detenido'` | `'Bloqueado'` | Presentación UI pura |
| `KanbanView.tsx` | `'Done'` | `'Listo'` | `'Completado'` | Presentación UI pura |
| `useAutomations.ts` | `'Working on it'`, `'Done'` | Lógica interna | **INTACTO** (Sin cambio) | Regla de automatización |
| `columnUtils.ts` | `label.id` | Clave interna DB | **INTACTO** (Sin cambio) | Contrato de datos |
| `actaService.ts` | `contractually_certifiable_qty` | Variable calculada | **INTACTO** (Sin cambio) | Contrato de servicio |

---

## 4. Criterios de Certificación F1.2
- **TypeScript:** 0 errores (`npx tsc --noEmit`).
- **Suites de Pruebas:** 72/72 PASS (540/540 tests).
- **Contratos & Payloads:** 100% idénticos.
- **Offline / Sync:** 100% idéntico.
