# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Inspección de Fase 2.1 (Experiencia de Campo `/my-work`) y Matriz de Contratos (F0, F1 Certificados)  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012)

---

## 1. Resumen Ejecutivo y Marco Normativo de Fase 2.1

La **Fase 2.1 (Experiencia de Campo en `/my-work`)** aborda la superficie principal del Líder de Cuadrilla.

Se adopta la regla de gobierno de campo:
> **"La UX de campo simplifica la operación en dispositivos móviles, pero NUNCA simplifica ni altera el modelo contractual subyacente. Se consumen estrictamente las mutaciones y RPCs existentes sin crear entidades, estados ni esquemas paralelos."**

---

## 2. Inventario de Superficie y Contrato de Datos Consumido (`/my-work`)

$$\text{WeeklyPlan} \longrightarrow \text{WeeklyPlanItem} \longrightarrow \text{ExecutionRecord (\texttt{weekly\_plan\_item\_executions})} \longrightarrow \text{ExecutionAttachment}$$

- **Ruta:** `/my-work` (`src/app/my-work/page.tsx`).
- **Container:** `ActividadesContainer.tsx`.
- **Vista Pura:** `ActividadesView.tsx` $\rightarrow$ `ItemRow` $\rightarrow$ `ItemExecutions.tsx` $\rightarrow$ `JornadaForm.tsx`.
- **Hooks Consumidos:** `usePublishedWeekPlans`, `useWeeklyPlanExecutions`, `useWeeklyPlanMutations`, `useExecutionAttachments`, `useExecutionSyncStatuses`.
- **RPC Backend:** `report_execution` (vía `reportExecution.mutate`).
- **Invariantes:** Cero modificaciones a la base de datos, RPCs, RLS o servicios.

---

## 3. Mapeo Estricto de las 4 Acciones del Líder de Cuadrilla

| Acción del Líder | Hook / Mutation Consumido | Payload Enviado | Estado Resultante en DB | Destino Post-Acción |
|---|---|---|---|---|
| **1. Consultar Jornada** | `usePublishedWeekPlans` | `{ week_start_date }` | Lectura de plan publicado | Vista `/my-work` (Tarjetas de Campo) |
| **2. Registrar Avance** | `createExecution` / `updateDraftExecution` | `{ plan_item_id, plan_id, group_id, execution_date, crew_name, worker_count, started_at, finished_at, executed_qty, notes }` | `status: 'draft'` en `weekly_plan_item_executions` | Borrador guardado localmente / DB |
| **3. Adjuntar Evidencia** | `uploadAttachment.mutateAsync` | `{ execution_id, file, phase }` | Registro en `execution_attachments` / `pendingAttachments` | Galería de evidencias de la jornada |
| **4. Enviar Ejecución** | `reportExecution.mutate` | `{ executionId, planItemId }` | RPC `report_execution` $\rightarrow$ `status: 'reported'` | Transición a `reported` (disponible para Verificación Supervisora) |

---

## 4. Matriz Before / After Arquitectónico-UX (Fase 2.1)

| Aspecto | Comportamiento Anterior (Before) | Comportamiento Nuevo (After F2.1) | Clasificación Técnico-UX |
|---|---|---|---|
| **Layout Móvil (`< 768px`)** | Grilla tabular comprimida de 6 columnas que desborda pantallas verticales de teléfonos. | **Tarjetas de Jornada Directas (*Field Cards*)**: Tarjeta táctil apilada con barra de avance %, badges de prioridad y botones táctiles grandes. | Layout CSS Responsive puro |
| **Acciones Principales** | Botones pequeños horizontales escondidos dentro de sub-filas desplegables. | Acciones táctiles destacadas de 48px de alto: `[📷 Adjuntar Foto]` y `[➕ Registrar Avance]`. | Componente UI local |
| **Estado de Ejecución** | Despliegue técnico de `draft` / `reported` / `verified`. | Estado operacional claro (`Borrador`, `Reportada`, `Verificada`, `Observada`) en español. | Presentación UI pura |
| **Offline Sync en Campo** | Indicador en cabecera superior lejano al flujo de trabajo del operador. | Badge contextual en la propia tarjeta del ítem al estar guardado offline (`Sin conexión - Se enviará al tener señal`). | Presentación UI pura |

---

## 5. Criterios de Certificación para Fase 2.1
- **TypeScript:** 0 errores (`npx tsc --noEmit`).
- **Suites de Pruebas:** 72/72 PASS (540/540 tests).
- **Mutaciones & RPC:** Payloads e invocaciones 100% idénticos a los Hooks de `useWeeklyPlanMutations`.
- **Invariantes:** Matriz de permisos, RLS, IndexedDB y cadena `POA → Billing` 100% Intactas.
