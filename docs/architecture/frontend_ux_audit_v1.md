# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Inventario Técnico de Navegación, Guardrails y Criterios de Certificación (Fase 0 Aprobada)  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012)

---

## 1. Resumen Ejecutivo y Marco Normativo de Gobernanza

Mantenix ha alcanzado la certificación completa en su backend. Para la capa de usuario, se adopta la norma: **“0% de impacto en la Baseline de Base de Datos” NO implica “Riesgo Cero”**. Una modificación puramente frontend puede vulnerar invariantes operativas, alterar permisos (`usePermissions`), corromper la sincronización offline (`OfflineSyncContext`) o interrumpir secuencias de usuario clave sin tocar Postgres.

La **Fase 0 (Guardrail UX)** establece el inventario exhaustivo de rutas, roles, servicios, parámetros y secuencias de usuario antes de permitir cualquier modificación de código en la Fase 1.

### Regla UX Rector Inviolable
> **"La interfaz debe expresar el lenguaje operacional del usuario y ocultar la complejidad técnica del dominio, salvo cuando dicha complejidad sea necesaria para tomar una decisión."**

---

## 2. Inventario Técnico de Navegación y Contratos de Ruta (Guardrail UX-01)

| Ruta `src/app/` | Rol Autorizado (`usePermissions`) | Entrada de Navegación | Query Params Válidos | Datos Consumidos | Acciones Permitidas | Destino Posterior a Acción |
|---|---|---|---|---|---|---|
| `/` | Público / Todos | Raíz `/` | Ninguno | Ninguno | Ver Landing, Ir a Login | `/login` |
| `/login` | Público / Invitado | Botón Login / Logout | `?signedout=true` | Credenciales Auth | Iniciar Sesión | `/dashboard` |
| `/dashboard` | `ADMIN`, `PROJECT_MANAGER`, `MEMBER` | Menú Lateral "Inicio" / Slim Logo | `?boardId=`, `?view=`, `?groupId=` | Board, Columns, Groups, Items | Seleccionar Vista/Sitio, Filtrar, Buscar | Permanece en `/dashboard` con `?view=` actualizado |
| `/projects` | `ADMIN`, `PROJECT_MANAGER` | Menú Lateral "Planificación" | `?id=` | Proyectos, Personal, Asignaciones | Crear Board, Gestionar Cuadrillas | `/dashboard?boardId=` o modal |
| `/my-work` | `MEMBER` (Líder), `PROJECT_MANAGER`, `ADMIN` | Menú Lateral "Mis actividades" | `?date=` | Plan Semanal Publicado, Tareas | Reportar Avance, Adjuntar Foto Evidencia | Notificación de envío + Permanece en `/my-work` |
| `/verification` | `SUPERVISOR`, `PROJECT_MANAGER`, `ADMIN` | Menú Lateral "Verificación" | `?status=`, `?site=` | Ejecuciones `reported`, Evidencias | Aprobar (`verified`), Observar (`rejected`) | Actualización de lista `reported` en `/verification` |
| `/documentos` | Todos con acceso a Board | Menú Lateral "Documentos" | `?boardId=`, `?tab=` | Actas, POA, Resource Analysis | Generar Borrador Acta, Emitir Acta | `/documentos?tab=actas` con PDF generado |
| `/okrs` | Todos | Menú Lateral "Objetivos" | Ninguno | Objetivos estratégicos | Consultar KPIs | `/okrs` |
| `/poa` | `ADMIN`, `PROJECT_MANAGER` | Acceso secundario | `?versionId=` | Versiones POA, Zonas, Precios | Importar Excel POA, Activar Versión | `/dashboard?view=planner` |

---

## 3. Matriz de Guardrails Estrictos de Fase 0

### Guardrail UX-01: Contratos de Navegación
- Ningún parámetro de URL (`?boardId=`, `?view=`, `?groupId=`) será eliminado o alterado si cumple una función de *deep-linking* o resolutor de membresía (`resolveBoardNavigation`).

### Guardrail UX-02: Permisos Reales (UI no es Seguridad)
- La interfaz representa visualmente las capacidades de `usePermissions()` y Supabase RLS. Ocultar o deshabilitar un botón en el cliente **NO** reemplaza el control de acceso en la API.

### Guardrail UX-03: Sincronización Offline Derivada de Fuente Real
- El contador de evidencias locales pendientes en `SyncToast.tsx` y `OfflineIndicator.tsx` debe derivarse estrictamente de la cola IndexedDB de `OfflineSyncContext`. Está prohibido manejar contadores o estados paralelos en memoria UI.

### Guardrail UX-04: Regresión de Comportamiento (ANTES vs. DESPUÉS)
- Para cada sub-bloque de la Fase 1, se validará que:
  $$\text{Permisos} \land \text{Servicios} \land \text{Payloads} \land \text{Estados DB} \land \text{Offline} = \text{IDÉNTICOS}$$
  La única diferencia autorizada es la presentación visual, la navegación refinada y el feedback UX.

---

## 4. Plan de Descomposición Atómica de Fase 1 (Sub-bloques F1.1 → F1.4)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BLOQUE F1.1 — Navegación y Rutas                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ • Limpiar src/config/navigation.ts (eliminar enlace provisional "Insumos"│
│   que apunta a /dashboard).                                              │
│ • Visibilizar deep-links clave sin alterar la resolución de boardId.     │
│ ▶ CRITERIO DE VERIFICACIÓN: Navegación limpia en desktop y móvil.        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ BLOQUE F1.2 — Microcopy y Lenguaje Operacional                           │
├──────────────────────────────────────────────────────────────────────────┤
│ • Normalizar el 100% de los estados a español operacional:               │
│   'Not Started' -> 'Pendiente' | 'Working on it' -> 'En Proceso'         │
│   'Done' -> 'Completado'     | 'Stuck' -> 'Bloqueado'                    │
│ • Ocultar variables de DB (occurrence_key, contractually_certifiable_qty)│
│ ▶ CRITERIO DE VERIFICACIÓN: Ningún término técnico visible al usuario.  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ BLOQUE F1.3 — Loading, Empty States y Feedback Asíncrono                │
├──────────────────────────────────────────────────────────────────────────┤
│ • Incorporar Skeleton loaders en modales y tablas al cargar datos.       │
│ • Tarjetas contextuales para estados vacíos (Empty States).              │
│ ▶ CRITERIO DE VERIFICACIÓN: Feedback visual en < 100ms en cada clic.     │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ BLOQUE F1.4 — Feedback Offline Basado en IndexedDB                       │
├──────────────────────────────────────────────────────────────────────────┤
│ • Reforzar SyncToast.tsx derivando el conteo directo de IndexedDB.       │
│ ▶ CRITERIO DE VERIFICACIÓN: Conexión intermitente probada sin pérdida.   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Matriz de Cierre y Certificación de Fase 1

$$\text{F1.1} \longrightarrow \text{F1.2} \longrightarrow \text{F1.3} \longrightarrow \text{F1.4} \longrightarrow \begin{cases} \text{Tests 72/72} & \text{PASS} \\ \text{tsc --noEmit} & \text{0 errors} \\ \text{Permisos & RLS} & \text{OK} \\ \text{Offline Sync} & \text{OK} \\ \text{Contratos DB} & \text{OK} \end{cases} \longrightarrow \mathbf{FASE\ 1\ CERTIFICADA}$$
