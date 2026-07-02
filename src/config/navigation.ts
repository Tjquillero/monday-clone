// ============================================================================
// MODELO DE NAVEGACIÓN CONGELADO — decisión de dominio (2026-07-01)
// ============================================================================
// La navegación habla el lenguaje de la operación, no el de un software
// genérico. Nombres prohibidos: "OPS", "Operations", "Work Orders", "Planner"
// y cualquier variante en inglés de un módulo de negocio.
//
// TABLERO
// ├── Tabla        (board)      — hoja de actividades
// ├── Ejecución    (execution)  — tablero de avance en campo
// ├── Mapa         (map)        — geolocalización de sitios
// ├── Costos       (financial)  — control financiero
// └── Cronograma   (planner)    — planificación semanal
//
// Menú lateral: Inicio · Planificación · Mis actividades · Objetivos · Insumos
//
// Flujo funcional del dominio:
//   Asistente  → Cronograma   (publicar)
//   Líder      → Actividades  (registrar jornadas)
//   Supervisor → Verificación (aprobar / rechazar)
//   → Reportes / Indicadores
//
// NO agregar, renombrar ni eliminar entradas sin decisión explícita del
// propietario del producto. Toda vista nueva se registra aquí, nunca inline.
// Los ids son contrato público (deep links `?view=`): no se renombran.
// ============================================================================

import {
  Table2, Activity, MapPin, DollarSign, Calendar,
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
