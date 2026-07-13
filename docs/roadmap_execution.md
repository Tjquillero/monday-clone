# Mantenix — Roadmap de Ejecución
**Fecha de análisis:** 2026-06-24  
**Versión analizada:** 0.1.0  
**Basado en:** código fuente, migraciones SQL, documentación técnica y reglas de desarrollo

---

## 1. Estado Actual del Producto

Mantenix es una aplicación de gestión de operaciones y mantenimiento de campo orientada a tres roles: **operarios**, **supervisores** y **coordinadores**. Está construida sobre Next.js 16 (App Router), React 19, Supabase (PostgreSQL + Realtime + RLS) y TanStack Query v5 con una arquitectura offline-first respaldada por IndexedDB y Service Worker.

El producto tiene un núcleo funcional sólido (tablero, Gantt, ejecución diaria, reportes y financiero). Sin embargo, existen **tablas de base de datos referenciadas en el código que no están creadas en ninguna migración**, lo que implica que ciertos módulos producirán errores en tiempo de ejecución hasta que se completen esas migraciones.

### Resumen ejecutivo de estado

| Dimensión | Estado |
|-----------|--------|
| Arquitectura base | Sólida y coherente |
| Módulo de tablero | Operativo |
| Módulo financiero / actas | Código completo, **BD ausente** |
| Módulo de incidentes | Código parcial, **BD ausente** |
| Offline-first | Implementado |
| Automaciones (motor) | Backend completo, UI parcial |
| Dashboards personalizables | Esquema listo, widgets pendientes |
| Verificación GPS + foto | Documentada, implementación por validar |
| Tests | Mínimos (2 archivos) |

---

## 2. Funcionalidades Terminadas

Estas funcionalidades tienen esquema de BD, hook, componente y ruta de navegación completos y consistentes entre sí.

### 2.1 Tablero principal (Board View)
- Grid estilo Monday.com con grupos (sitios/lotes) e ítems (actividades)
- CRUD completo: crear, editar, eliminar ítems y grupos
- Columnas dinámicas vía JSONB (`values` en `items`)
- Subitems (jerarquía padre-hijo)
- Drag & drop con dnd-kit
- Filtros por estado, prioridad y persona
- Optimistic updates con rollback automático en TanStack Query

### 2.2 Gantt y dependencias
- Diagrama Gantt con barras por ítem y línea de tiempo
- Dependencias entre ítems (`task_dependencies`) con tipo Finish-to-Start
- Reprogramación en cascada automática al mover fechas (rescheduleSuccessors)
- Fallback offline para dependencias vía IndexedDB

### 2.3 Vista de Ejecución diaria
- Registro de cumplimiento por día (`daily_execution` JSONB)
- Semáforo de cumplimiento (verde/amarillo/rojo)
- Toggle hoy / semana
- Cálculo automático de progreso que actualiza el estado del ítem

### 2.4 Sistema de Autenticación
- Login con Supabase Auth
- Middleware Next.js que protege rutas: `/dashboard`, `/projects`, `/my-work`, `/okrs`, `/dashboards`
- Modo demo con cookie simulada (`sb-mock-session`) para desarrollo
- Contexto de autenticación (`AuthContext`) con hook `useAuth`
- Sistema de permisos por rol (`usePermissions`, `PERMISSIONS`)

### 2.5 Offline-first
- IndexedDB (`offlineDB.ts`) como caché local para: boards, groups, items, board_columns, activity_templates, task_dependencies
- Cola de mutaciones pendientes con reintentos (máximo 3)
- Sincronización automática al recuperar conectividad (`useOfflineSync`)
- Service Worker (`public/sw.js`) para activos estáticos
- `OfflineIndicator` visible para el usuario

### 2.6 Reportes
- API Routes en `/api/reports/`: acta, actividad, tablero, ejecutivo, novedades
- Generación de PDF con jsPDF + jsPDF-autoTable
- Exportación a Excel con `xlsx`
- `ReportsViewContainer` integrado en el dashboard principal

### 2.7 Gestión de Personal
- Tabla `personnel` con nombre, rol y tarifa
- `PersonnelManagement`, `PersonnelPicker`
- Asignación de personal a ítems
- `usePersonnel` hook con CRUD completo

### 2.8 Plantillas de actividades
- Tabla `activity_templates` con nombre, unidad, rendimiento, categoría, precio
- Selector de actividades en `ActivitySelector`
- Seed de datos iniciales en la migración consolidada
- Cache offline de 1 hora (staleTime alta)

### 2.9 Sistema de notificaciones
- Tabla `notifications` con RLS por `user_id`
- `NotificationBell` con contador de no leídas
- `NotificationsView` integrada en el dashboard
- Publicación Realtime configurada

### 2.10 OKRs
- Tablas `okrs` y `okr_links` con RLS
- Vinculación de OKRs a boards e ítems
- Visibilidad personal/general
- `OkrsView`, `OkrModal`, `useOkrs` hook

### 2.11 Adjuntos (Attachments)
- Tabla `attachments` con RLS granular por membresía de tablero
- Bucket `attachments` en Supabase Storage
- `useAttachments` hook con upload y delete
- `PhotoVerificationModal` para captura de evidencia

### 2.12 Motor de automatizaciones (backend)
- Tabla `automations` con RLS por rol
- `useAutomations` con executeAutomations, createRule, deleteRule, toggleRule
- Lógica `processRule` para triggers: `status_change`, `value_change`
- Acciones implementadas: `notify`, `set_value`, `verify_evidence`
- Regla especial: si status → Done sin adjunto, revierte y notifica
- Integrado en el flujo `updateItem` de `useBoardMutations`

### 2.13 Mapa geolocalizado
- `MantenixMap` con Leaflet y MapLibre GL
- Marcadores por grupo/sitio con lat/lng
- Integrado como vista en el dashboard principal

### 2.14 Dashboards personalizables (estructura)
- Tablas `dashboards` y `dashboard_widgets` con RLS
- Layout de widgets con JSONB compatible con react-grid-layout
- Página `/dashboards` con listado y creación
- Publicación Realtime configurada

---

## 3. Funcionalidades Incompletas

### 3.1 CRÍTICO — Tablas de BD ausentes en migraciones

#### `financial_actas` y `financial_acta_details`
- **Código existente:** `useActas.ts` hace SELECT/INSERT/UPDATE/DELETE sobre estas tablas. `FinancialViewContainer.tsx` las consume.
- **Estado:** Las tablas **no existen en ningún archivo de migración**. El módulo financiero/actas fallará con error en producción.
- **Impacto:** Toda la facturación y el historial de actas de cobro no funciona.

#### `site_incidents`
- **Código existente:** `offlineDB.ts` la cachea, `useOfflineSync.ts` la sincroniza, `20240315_add_indexes.sql` crea índices para ella, `IncidentModal.tsx` existe.
- **Estado:** La tabla **no existe en ninguna migración**.
- **Impacto:** El módulo de novedades/incidentes de campo falla silenciosamente.

### 3.2 Dashboards personalizables — widgets sin implementar
- La página `/dashboards/[dashboardId]` existe pero los tipos de widget documentados en el esquema (`scurve`, `budget-execution`, `task-list`, `incident-log`) no tienen componentes React implementados.
- `DashboardViewContainer.tsx` existe pero necesita validación de completitud.
- El layout de drag & drop con react-grid-layout está configurado como dependencia pero no confirmado en uso.

### 3.3 Verificación GPS + Foto — flujo end-to-end sin validar
- `PhotoVerificationModal.tsx` y `AssessmentViewContainer.tsx` existen.
- `docs/verification_manual.md` documenta el flujo completo (GPS API, cámara trasera forzada, sello digital, carga a Supabase Storage).
- Pendiente: validar que la implementación cubre todos los casos de borde documentados (modo offline, GPS fallido, batería baja, permisos denegados).
- El bucket `execution_photos` no tiene SQL de creación; solo se menciona en comentarios.

### 3.4 UI de creación de automatizaciones
- `AutomationsModal.tsx` existe pero no se ha validado si permite crear reglas personalizadas o solo las muestra.
- La recipe semilla (evidencia obligatoria) no tiene flujo de configuración visual para el usuario.
- Solo el administrador del tablero puede gestionar automatizaciones, pero no hay pantalla de gestión clara.

### 3.5 Inconsistencia de esquemas SQL
- `docs/production_schema.sql` (versión 1.0.0, fecha 2026-03-28) define políticas RLS permisivas: cualquier usuario autenticado puede escribir en boards, groups e items.
- `supabase/migrations/20240316_consolidated_schema.sql` define políticas granulares por rol (`admin`, `member`, `viewer`) usando `get_user_board_role()`.
- No está documentado cuál de los dos esquemas es el activo en producción. Las políticas del esquema de producción son inseguras.

### 3.6 Tests insuficientes
- Solo existen `GanttView.test.tsx` e `itemUtils.test.ts`. 
- El motor de automaciones, el sistema offline, las mutaciones y los reportes no tienen tests.

---

## 4. Riesgos Técnicos

### ALTO — BD inconsistente con el código
El código consulta `financial_actas`, `financial_acta_details` y `site_incidents` que no existen en ninguna migración. Esto producirá errores 42P01 (table does not exist) en producción.

### ALTO — Políticas RLS débiles en producción
Si `docs/production_schema.sql` es el esquema activo, cualquier usuario autenticado puede modificar cualquier tablero de cualquier organización. El esquema consolidado tiene las políticas correctas pero puede no estar aplicado.

### MEDIO — Sincronización offline sin control de conflictos
`useOfflineSync.triggerSync` aplica mutaciones en orden FIFO sin detectar conflictos. Si dos usuarios editan el mismo ítem offline, el último en sincronizar gana sin notificación. Para el caso de uso de campo (varios operarios en un sitio), esto puede producir pérdida silenciosa de datos.

### MEDIO — `daily_execution` JSONB crece sin límite
El campo acumula una entrada por cada día de ejecución por ítem. En un proyecto de 12 meses con 500 actividades, cada ítem podría tener cientos de entradas en un campo JSONB que se carga completo en cada query. No hay estrategia de archivado.

### MEDIO — refreshLocalCache sin paginación
`useOfflineSync.refreshLocalCache` ejecuta `SELECT *` sin LIMIT sobre todas las tablas. A medida que crecen los datos, este snapshot completo puede tardar decenas de segundos y consumir memoria excesiva en el cliente.

### BAJO — alert() en manejo de errores UI
`useBoardMutations` usa `alert()` para errores de BD. Bloquea el hilo principal, es inconsistente con el resto de la UI y no permite recuperación controlada.

### BAJO — Tipos duplicados
`monday.ts` define `Dependency` dos veces (líneas 75 y 121). TypeScript usa la segunda definición, ignorando la primera. Esto puede ocultar errores en el sistema de dependencias del Gantt.

### BAJO — Modo demo activo en producción
El middleware lee `NEXT_PUBLIC_ALLOW_DEMO` para habilitar sesiones simuladas. Si esta variable no se desactiva explícitamente en producción, cualquiera puede crear una cookie `sb-mock-session` y acceder a rutas protegidas.

---

## 5. Orden Recomendado de Desarrollo

El criterio de ordenamiento es: **desbloquear módulos ya construidos primero, luego completar los que agregan valor inmediato al operador de campo**.

### Fase 1 — Estabilización de BD (1-2 días)
> Sin esto, partes del producto actualmente fallan en producción.

1. **Crear migración `financial_actas` y `financial_acta_details`**  
   Incluir RLS usando `get_user_board_role()` consistente con el esquema consolidado. Agregar a publicación Realtime.

2. **Crear migración `site_incidents`**  
   Incluir RLS, índices por `board_id` y `group_id`, y publicación Realtime. Los índices ya están en `20240315`.

3. **Reconciliar esquemas: eliminar o archivar `docs/production_schema.sql`**  
   Confirmar que el esquema consolidado con políticas granulares es el de producción. Si `production_schema.sql` tiene diferencias válidas (como `capacity_jornales`), migrarlas al esquema consolidado.

### Fase 2 — Seguridad (1 día)
4. **Auditar y aplicar RLS correcto en producción**  
   Verificar que las políticas de `consolidated_schema.sql` estén activas. Eliminar `Public Read Access` y `Admin All Permissions` permisivos.

5. **Proteger modo demo**  
   Añadir validación explícita de `NEXT_PUBLIC_ALLOW_DEMO=false` en el build de producción. Documentar en `.env.example`.

### Fase 3 — Verificación de campo GPS+Foto (3-5 días)
6. **Crear bucket `execution_photos` con SQL y políticas de storage**  
   Separado del bucket `attachments` existente. Política: solo el operario que sube puede ver/eliminar su foto.

7. **Validar `PhotoVerificationModal` contra `verification_manual.md`**  
   Probar: GPS fallido, offline, cámara denegada, batería baja (<10%), archivo pesado en 3G.

8. **Conectar flujo con actualización de estado de ítem**  
   Al subir foto con GPS válido → ítem pasa a estado "Done" automáticamente si la regla de automatización está activa.

### Fase 4 — Dashboards configurables (5-7 días)
9. **Implementar widgets individuales**  
   Priorizar: `task-list` (más útil), `budget-execution` (curva S), `incident-log`. Cada widget lee directamente de Supabase filtrado por su `config` JSONB.

10. **Layout drag & drop con react-grid-layout**  
    Persistir posiciones en `dashboard_widgets.layout`. Solo admins pueden guardar cambios de layout.

### Fase 5 — UI de automatizaciones (3-4 días)
11. **Completar `AutomationsModal`**  
    Formulario para crear regla: seleccionar trigger (campo + valor), seleccionar acción (notificar / cambiar valor / evidencia requerida). Lista de reglas existentes con toggle activo/inactivo.

12. **Documentar las 3 recetas estándar en la UI**  
    "Evidencia obligatoria para Done", "Notificar al supervisor al completar", "Mover grupo al aprobar".

### Fase 6 — Resiliencia técnica (continuo)
13. **Reemplazar `alert()` con sistema de toasts**  
14. **Limitar `refreshLocalCache` con paginación o límite por tabla**  
15. **Estrategia de archivado para `daily_execution` JSONB**  
16. **Ampliar tests: motor de automatizaciones, offline sync, mutaciones**  
17. **Corregir duplicado de interfaz `Dependency` en `monday.ts`**

---

## 6. Qué NO Debemos Desarrollar Todavía

### No ahora — Falta base estable primero

| Funcionalidad | Razón para posponer |
|--------------|-------------------|
| **Nuevos tipos de reporte** | Los módulos que alimentan los reportes (actas, incidentes) aún tienen la BD incompleta |
| **App móvil nativa** | La PWA offline-first ya cubre el caso de uso de campo; una app nativa sería redundante en esta etapa |
| **Multi-tenant / multi-organización** | El modelo actual es single-tenant. Introducir aislamiento de tenants requiere refactorizar RLS, routing y storage |
| **IA generativa adicional** | `MantenixAgent` (prototipo de self-healing prompts) fue retirado por completo — reemplazado por un copiloto de dominio (Tool Registry + Orchestrator + DomainTools sobre las RPC oficiales, `AgentControlCenter.tsx` → `/api/ai/ask`). El catálogo mínimo (6 tools: actas, avance de contrato, cronograma, certificaciones) ya está implementado y verificado end-to-end. Expandirlo es agregar tools nuevos al registro, priorizados por `ai_tool_call_attempts` (qué pidió el modelo sin tener autorización) — no requiere resolver datos faltantes primero |
| **Integraciones externas (ERP, SAP)** | No hay demanda documentada; agrega complejidad sin valor inmediato |
| **Curva S animada / charts avanzados** | Recharts ya está disponible; dedicar tiempo a esto antes de tener datos completos no tiene sentido |
| **Modo oscuro completo** | `isDarkMode` existe en el estado pero no tiene implementación completa. No es prioridad operativa |
| **API pública REST** | No hay consumidores externos identificados |
| **Gestión de múltiples tableros simultáneos** | El flujo actual carga un board a la vez; paralelizarlo introduce complejidad sin caso de uso claro |

---

## 7. Dependencias entre Módulos

El siguiente diagrama muestra qué módulos deben estar listos antes de que otros puedan funcionar correctamente.

```
[auth + RLS]
    │
    ├──► [tablero (boards/groups/items)]
    │         │
    │         ├──► [gantt + dependencias]
    │         │         └──► [reprogramación en cascada]
    │         │
    │         ├──► [ejecución diaria]
    │         │         └──► [motor de automatizaciones] ◄── [notificaciones]
    │         │
    │         ├──► [adjuntos (attachments)]
    │         │         └──► [verificación GPS+foto] ◄── [bucket execution_photos]
    │         │
    │         ├──► [financial_actas] ← TABLA FALTANTE
    │         │         └──► [reportes ejecutivos / curva S]
    │         │
    │         └──► [site_incidents] ← TABLA FALTANTE
    │                   └──► [dashboards widgets: incident-log]
    │
    ├──► [plantillas de actividades]
    │         └──► [tablero: selector de actividades]
    │
    ├──► [personal (personnel)]
    │         └──► [tablero: asignación de personas]
    │         └──► [workload view]
    │
    ├──► [OKRs]
    │         └──► [vinculación con boards e ítems]
    │
    └──► [dashboards personalizables]
              ├──► [requiere: tablero operativo]
              ├──► [requiere: financial_actas (widget budget-execution)]
              └──► [requiere: site_incidents (widget incident-log)]
```

### Dependencias críticas de datos

| Módulo dependiente | Depende de | Estado del bloqueante |
|-------------------|-----------|----------------------|
| Vista financiera / Actas | `financial_actas`, `financial_acta_details` | TABLA AUSENTE |
| Dashboard widget "budget-execution" | Vista financiera operativa | Bloqueada por lo anterior |
| Novedades / Incidentes | `site_incidents` | TABLA AUSENTE |
| Dashboard widget "incident-log" | Módulo de incidentes | Bloqueada por lo anterior |
| Verificación GPS obligatoria | Motor de automatizaciones activo | Listo (motor OK) |
| Reportes ejecutivos completos | Actas aprobadas en BD | Bloqueada por `financial_actas` |
| Curva S | Datos de ejecución diaria + actas | Parcialmente bloqueada |
| Offline sync de incidentes | Tabla `site_incidents` en BD | TABLA AUSENTE |

---

## Apéndice — Inventario de archivos por estado

### Migraciones SQL aplicadas (7)
| Archivo | Contenido |
|---------|-----------|
| `20240315_add_indexes.sql` | Índices condicionales (incluye `site_incidents` que no existe) |
| `20240316_consolidated_schema.sql` | Esquema base completo con RLS granular |
| `20240317_attachments_system.sql` | Adjuntos + Storage bucket `attachments` |
| `20240318_dashboards_system.sql` | Dashboards y widgets |
| `20240319_automation_system.sql` | Motor de automatizaciones |
| `20240320_user_profiles.sql` | Perfiles + trigger sincronización |
| `20240321_okr_system.sql` | OKRs y vínculos |

### Tablas referenciadas en código pero **sin migración**
- `financial_actas`
- `financial_acta_details`
- `site_incidents`

### Esquema alternativo que debe ser auditado
- `docs/production_schema.sql` — política RLS permisiva, inconsistente con el consolidado
