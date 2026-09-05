# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Inventario F1.3 (Skeletons & Async States), Guardrails y Matriz Before/After (F0 y F1.1 y F1.2 Certificados)  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012)

---

## 1. Resumen Ejecutivo y Marco Normativo de F1.3

Mantenix mantiene certificadas sus invariantes backend (72/72 test suites, 0 errores TypeScript, Baseline 2386465, commits `ac6771c` y `5411a1d`).

Para el **Sub-bloque F1.3 (Loading, Skeletons & Empty States)**, se aplica el principio estricto de gobernanza asíncrona:
> **"Un estado de carga o vacío NO debe mentir al usuario. Los estados Loading, Empty, Error, Ready y Submitting son disjuntos y nunca deben solaparse ni asumir data undefined como ausencia de datos."**

---

## 2. Invariante de Separación de Estados Asíncronos

$$\text{Loading} \neq \text{Empty} \neq \text{Error} \neq \text{Ready} \neq \text{Submitting}$$

1. `isLoading = true` $\rightarrow$ Renderizar **Skeleton Structure** (Estructura visual idéntica a la vista final en estado pulso). NUNCA mostrar Empty State ni Error.
2. `isError = true` $\rightarrow$ Renderizar **Error State Contextual** con opción de reintento.
3. `!isLoading && !isError && length === 0` $\rightarrow$ Renderizar **Contextual Empty State** especificando qué está vacío, por qué y qué acción puede tomar el usuario.
4. `submitting = true` $\rightarrow$ Preservar deshabilitación de controles e indicador inline (`Loader2 animate-spin`) sin desmontar el componente ni perder el foco.

---

## 3. Inventario de Superficies Asíncronas y Matriz Before / After (F1.3)

| Vista / Componente | Hook / Servicio Consumido | Estados Distinguidos | Comportamiento Anterior (Before) | Propuesta F1.3 (After) | Clasificación Técnico-UX |
|---|---|---|---|---|---|
| **`/my-work`** (`ActividadesContainer.tsx`) | `usePublishedWeekPlans` | `isLoading`, `isError`, `plans.length === 0`, `Ready` | Box punteado plano con spinner simple `Loader2`. | Skeleton de Tarjetas de Jornada (3 tarjetas en pulso). | Presentación UI local |
| **`/verification`** (`VerificationContainer.tsx`) | `useVerificationQueue`, `useWeeklyPlanMutations` | `isLoading`, `isError`, `queue.length === 0`, `Ready`, `isPending` | Spinner simple en box plano. | Skeleton de Tarjeta Supervisora con indicador inline de verificación. | Presentación UI local |
| **`/documentos`** (`OperationalDocumentsContainer.tsx`) | `useOperationalDocuments`, `useDocumentTypes` | `isLoading`, `isError`, `documents.length === 0`, `isUploading` | Indicador de carga plano. | Skeleton de Tabla Documental (4 columnas en pulso). | Presentación UI local |
| **`/dashboard`** (`DashboardContent` en `page.tsx`) | `useBoard`, `useUserBoards` | `boardLoading`, `boardError`, `userBoardsLoading`, `Ready` | Pantalla en blanco con spinner central. | Skeleton de Ribbon + Tabla de Actividades. | Presentación UI local |

---

## 4. Criterios de Certificación F1.3
- **TypeScript:** 0 errores (`npx tsc --noEmit`).
- **Suites de Pruebas:** 72/72 PASS (540/540 tests).
- **Invariantes:** Permisos, RLS, IndexedDB, servicios de dominio y contratos POA $\rightarrow$ Billing 100% intocados.
