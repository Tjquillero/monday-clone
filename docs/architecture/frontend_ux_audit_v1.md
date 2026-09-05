# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Inspección de Fase 2.2 (Experiencia de Verificación Supervisora `/verification`) — AUTORIZADA / IMPLEMENTACIÓN BLOQUEADA  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012) y Fase 2.1 (Commit `cb5cb3d` CERTIFICADO)

---

## 1. Resumen Ejecutivo y Marco Normativo de Fase 2.1

La **Fase 2.1 (Experiencia de Campo en `/my-work`)** abordó la superficie principal del Líder de Cuadrilla.

Se adoptó la regla de gobierno de campo:
> **"La UX de campo simplifica la operación en dispositivos móviles, pero NUNCA simplifica ni altera el modelo contractual subyacente. Se consumen strictly las mutaciones y RPCs existentes sin crear entidades, estados ni esquemas paralelos."**

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

---

## 6. Inspección de Fase 2.2 · Experiencia de Verificación Supervisora (`/verification`)

### 6.1 Superficie Actual y Arquitectura de Componentes
- **Ruta:** `/verification` (`src/app/verification/page.tsx`).
- **Contenedor Principal:** `VerificationContainer.tsx` (`src/components/verification/VerificationContainer.tsx`).
- **Componentes Auxiliares:** `CardSkeleton` (`src/components/ui/Skeleton.tsx`), `PhotoVerificationModal` (`src/components/modals/PhotoVerificationModal.tsx`, prop `readOnly={true}`).
- **Hooks Consumidos:** `useVerificationQueue`, `useWeeklyPlanMutations`, `useExecutionAttachments`, `useQueryClient`.
- **Servicios y Mutations Consumidos:**
  - `useVerificationQueue()`: Realiza query plana a `weekly_plan_item_executions` (`status = 'reported'`) + merge con `weekly_plan_items`, `weekly_plans`, `groups`, y `board_activity_standards`. Fallback a `offlineDB` en falla de red.
  - `verifyExecution.mutate({ executionId, planItemId })`: Invoca la RPC PostgreSQL `verify_execution(p_execution_id)`.
  - `rejectExecution.mutate({ executionId, planItemId, notes })`: Invoca la RPC PostgreSQL `reject_execution(p_execution_id, p_notes)`.
  - `queryClient.invalidateQueries({ queryKey: ['verification_queue'] })`: Reactiva la cola tras cada decisión supervisora.
- **Navegación Post-Acción:** Permanece en la bandeja `/verification`, removiendo automáticamente de la vista las jornadas procesadas.

### 6.2 Auditoría del Contrato de Evidencia y Datos Contextuales
- **Cadena de Datos:** `ExecutionRecord` (`status: 'reported'`) $\rightarrow$ `useVerificationQueue` $\rightarrow$ `VerificationContainer` $\rightarrow$ `useExecutionAttachments` $\rightarrow$ `PhotoVerificationModal` (`readOnly`).
- **Recuperación de Fotos:** Query `execution_attachments` ordenada por `created_at` descendente.
- **Metadatos Disponibles:** `id`, `file_name`, `file_url`, `file_type`, `file_size`, `uploaded_by`, `phase` (`before` / `after`), `file_hash`, `created_at`.
- **Falta de Evidencia:** El modal despliega el estado "Sin evidencia". No se inventan datos ni se bloquea la revisión si la RPC lo permite.
- **Fotos Pendientes de Sincronización:** Solo se muestran las evidencias efectivamente persistidas en el servidor para evitar discrepancias de revisión.

---

## 7. Matriz Estricta de Acciones del Supervisor (Fase 2.2)

| Acción del Supervisor | Hook / Servicio Consumido | Payload Exacto | Estado Resultante en DB | Permiso / RLS |
|---|---|---|---|---|
| **1. Cargar Bandeja de Revisión** | `useVerificationQueue()` | Ninguno (Query `status = 'reported'`) | Lectura (`VerificationQueueItem[]`) | Supervisor / Admin vía RLS |
| **2. Revisar Evidencia Fotográfica** | `useExecutionAttachments(id)` | `{ executionId }` | Lectura (`ExecutionAttachment[]`) | RLS `execution_attachments` (Select) |
| **3. Aprobar / Verificar** | `useWeeklyPlanMutations().verifyExecution.mutate` | `{ executionId, planItemId }` | RPC `verify_execution` $\rightarrow$ `status: 'verified'` | RPC valida rol `supervisor` \| `admin` |
| **4. Observar / Rechazar** | `useWeeklyPlanMutations().rejectExecution.mutate` | `{ executionId, planItemId, notes }` | RPC `reject_execution` $\rightarrow$ `status: 'rejected'`, `rejection_notes = notes` | RPC valida rol `supervisor` \| `admin` |

---

## 8. Matriz Before / After Arquitectónico-UX (Fase 2.2)

| Aspecto UX / Arquitectura | Comportamiento Actual (Before) | Propuesta de Transformación UX (After F2.2) | Riesgo & Clasificación |
|---|---|---|---|
| **Layout de la Bandeja** | Tarjetas verticales sueltas de texto con poca diferenciación visual de jerarquía. | **Visor Operacional de Inspección**: Cabecera clara de Actividad + Sitio + Fecha/Hora + Cuadrilla, con contraste tipográfico fuerte. | **Riesgo ZERO** (Componente UI local) |
| **Vista Previa de Evidencia** | Requiere clic en `[Ver evidencia]` y abrir modal fullscreen a ciegas para ver si existen fotos. | **Strip de Miniaturas (*Photo Preview Strip*)**: Muestra miniaturas directas en la tarjeta (con fase Antes/Después) + clic para visor modal HD solo-lectura. | **Riesgo ZERO** (UI pura sobre `useExecutionAttachments`) |
| **Flujo de Observación / Rechazo** | Input de texto plano de 1 línea con botón de confirmación simple. | **Panel de Observación Asistido**: Caja de motivo destacado con validación de campo requerido (no vacío), hint de impacto y botón de confirmación ámbar de 48px. | **Riesgo ZERO** (Mismo payload `rejectExecution`) |
| **Flujo de Verificación** | Botón plano verde simple. | **Acción Primaria Prominente**: Botón verde esmeralda `[✓ Verificar Ejecución]` de 48px de alto con estado de carga interactivo y feedback táctil. | **Riesgo ZERO** (Mismo payload `verifyExecution`) |
| **Responsive & Ergonomía** | Tarjetas con botones angostos en pantallas móviles. | **Ergonomía de Campo para Supervisor**: Layout adaptativo para tablets/móviles con touch targets de 48px y navegación ágil entre pendientes. | **Riesgo ZERO** (CSS Tailwind responsive) |

---

## 9. Frontera de Invariantes Congeladas y Fuera de Alcance

### 🔒 Invariantes Estrictamente Congeladas:
1. `verificationService` (Backend / RPCs PostgreSQL `verify_execution` y `reject_execution` 100% inalterados).
2. Definición de `ExecutionRecord` y tabla `weekly_plan_item_executions`.
3. RLS y matriz de permisos `usePermissions()`.
4. `OfflineSyncContext` e `IndexedDB` (`offlineDB`).
5. Reglas de certificación (`Certification`, `Acta`, `Billing`).
6. Ninguna nueva mutación, RPC, entidad o estado contractual.

---

### 🏛️ Estado de Gobernanza
```
FASE 2.2 · Supervisor /verification
  ├── Inspección 5bc0c3b/doc ✅ COMPLETADA
  ├── Inventario ✅ COMPLETADO
  ├── Contrato de datos ✅ MAREADO
  ├── Matriz Before / After ✅ CONSTRUIDA
  ├── Implementación 🔒 BLOQUEADA (Esperando autorización explícita)
  └── Certificación ⏳ PENDIENTE
```
