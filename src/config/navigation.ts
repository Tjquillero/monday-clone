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
// Verificación aún no existe: su entrada al sidebar se registrará AQUÍ
// cuando la pantalla esté construida, nunca antes ni inline.
//
// NO agregar, renombrar ni eliminar entradas sin decisión explícita del
// propietario del producto. Toda vista nueva se registra aquí, nunca inline.
// Los ids son contrato público (deep links `?view=`): no se renombran.
// ============================================================================

import {
  Table2, Activity, MapPin, DollarSign, Calendar,
  Home, Briefcase, CheckSquare, Target, Layout,
  type LucideIcon,
} from 'lucide-react';

/** Vistas internas del tablero. Algunas (dashboards, kanban, reports,
 *  notifications) no tienen pestaña en el ribbon pero siguen siendo
 *  accesibles por URL o accesos secundarios. */
export type BoardViewId =
  | 'board'
  | 'execution'
  | 'map'
  | 'financial'
  | 'planner'
  | 'dashboards'
  | 'kanban'
  | 'reports'
  | 'notifications';

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
  'dashboards', 'kanban', 'reports', 'notifications',
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
  { icon: Target, label: 'Objetivos', path: '/okrs' },
  // Insumos aún no tiene módulo propio; apunta al dashboard de forma
  // provisional hasta que exista su ruta.
  { icon: Layout, label: 'Insumos', path: '/dashboard' },
] as const;
