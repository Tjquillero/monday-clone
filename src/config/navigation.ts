// ============================================================================
// MODELO DE NAVEGACIÓN CONGELADO — decisión de dominio (2026-07-01)
// ============================================================================
// La navegación habla el lenguaje de la operación, no el de un software
// genérico. Nombres prohibidos: "OPS", "Operations", "Work Orders", "Planner"
// y cualquier variante en inglés de un módulo de negocio.
//
// TABLERO (ribbon)
// ├── Tabla        (board)      — hoja de actividades
// ├── Ejecución    (execution)  — tablero de avance en campo
// ├── Mapa         (map)        — geolocalización de sitios
// ├── Costos       (financial)  — control financiero
// └── Cronograma   (planner)    — planificación semanal
//
// MENÚ LATERAL (sidebar)
// ├── Inicio           (/dashboard)
// ├── Planificación    (/projects)
// ├── Mis actividades  (/my-work)
// ├── Verificación     (/verification)
// ├── Objetivos        (/okrs)
// └── Insumos          (/dashboard)
//
// Flujo funcional del dominio:
//   Asistente  → Cronograma       (publica el plan semanal)
//   Líder      → Mis actividades  (registra jornadas)
//   Supervisor → Verificación     (aprueba o rechaza jornadas)
//                ↓
//           Reportes / Indicadores
//
// Verificación: pantalla del Supervisor (bandeja de jornadas reported,
// verificar/observar). Registrada 2026-07-09 al construir la pantalla.
//
// NO agregar, renombrar ni eliminar entradas sin decisión explícita del
// propietario del producto. Toda vista nueva se registra aquí, nunca inline.
// Los ids son contrato público (deep links `?view=`): no se renombran.
// ============================================================================

import {
  Table2, Activity, MapPin, DollarSign, Calendar,
  Home, Briefcase, CheckSquare, Target, Layout, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/** Vistas internas del tablero. Algunas (dashboards, kanban, reports,
 *  notifications, agenda) no tienen pestaña en el ribbon pero siguen siendo
 *  accesibles por URL o accesos secundarios.
 *
 *  'agenda' — Agenda Operativa (ADR-0006, Fase 1/2 del roadmap en
 *  docs/architecture/agenda-operativa-design.md). Deep-link deliberado sin
 *  pestaña: ExecutionView sigue viva en "Ejecución" hasta que la Agenda
 *  cubra semáforo + Hoy + Semana (criterio literal de ADR-0006, sin
 *  modificar). En la Fase 3 se promueve reemplazando el destino de
 *  'execution' — no antes, y no silenciosamente.
 *
 *  'catalogo-tecnico' — Catálogo Técnico (2026-07-18, ver
 *  docs/architecture/poa-technical-catalog-decoupling.md). Responde "¿cómo
 *  debe ejecutarse técnicamente una actividad?" — distinto del Cronograma
 *  (que solo consume el catálogo ya configurado). Deep-link deliberado sin
 *  pestaña: se llega desde el banner de bloqueo del Cronograma
 *  (PlanningWarnings.tsx) o por URL directa.
 *
 *  'costos-operativos' — Dashboard de Costos Operativos (2026-07-19, ADR-0009).
 *  Responde "¿cuántos jornales/dinero consume cada actividad?" a partir de lo
 *  que ya calcula el Scheduler (useWeeklyPlan) — nunca reinterpreta cantidad,
 *  rendimiento ni frecuencia. Deliberadamente NO se llama 'costos' ni
 *  reutiliza la pestaña 'financial' (esa es el módulo de Actas/presupuesto,
 *  un concepto de "costos" distinto y ya establecido). Deep-link sin pestaña,
 *  se llega desde el Cronograma. */
export type BoardViewId =
  | 'board'
  | 'execution'
  | 'map'
  | 'financial'
  | 'planner'
  | 'dashboards'
  | 'kanban'
  | 'reports'
  | 'notifications'
  | 'agenda'
  | 'catalogo-tecnico'
  | 'costos-operativos';

export interface BoardTab {
  id: BoardViewId;
  label: string;
  icon: LucideIcon;
}

/** Pestañas del ribbon del tablero — estructura congelada. */
export const BOARD_TABS: readonly BoardTab[] = [
  { id: 'board', label: 'Tabla', icon: Table2 },
  { id: 'execution', label: 'Ejecución', icon: Activity },
  { id: 'map', label: 'Mapa', icon: MapPin },
  { id: 'financial', label: 'Costos', icon: DollarSign },
  { id: 'planner', label: 'Cronograma', icon: Calendar },
] as const;

/** Valores aceptados en el query param `?view=` del dashboard. */
export const VALID_VIEW_PARAMS: readonly BoardViewId[] = [
  'board', 'execution', 'map', 'financial', 'planner',
  'dashboards', 'kanban', 'reports', 'notifications', 'agenda', 'catalogo-tecnico',
  'costos-operativos',
] as const;

export interface SidebarItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

/** Menú lateral — estructura congelada. */
export const SIDEBAR_ITEMS: readonly SidebarItem[] = [
  { icon: Home, label: 'Inicio', path: '/dashboard' },
  { icon: Briefcase, label: 'Planificación', path: '/projects' },
  { icon: CheckSquare, label: 'Mis actividades', path: '/my-work' },
  { icon: ShieldCheck, label: 'Verificación', path: '/verification' },
  { icon: Target, label: 'Objetivos', path: '/okrs' },
  // Insumos aún no tiene módulo propio; apunta al dashboard de forma
  // provisional hasta que exista su ruta.
  { icon: Layout, label: 'Insumos', path: '/dashboard' },
] as const;
