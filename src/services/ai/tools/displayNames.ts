// Diccionario de presentación para citas en la UI — puramente cosmético,
// no afecta el Orchestrator ni el Registry. Cada tool nuevo en
// registry.ts debe agregar su entrada aquí; si falta, la cita cae al
// nombre técnico (getToolDisplayName) en vez de romper.
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_current_board: 'Board y rol actual',
  get_acta_totals: 'Resumen financiero del acta',
  get_pending_billable_work: 'Saldo certificable',
  get_board_summary: 'Resumen del tablero',
  get_delayed_weekly_plans: 'Cronogramas retrasados',
  get_execution_summary: 'Resumen de verificación',
};

export function getToolDisplayName(tool: string): string {
  return TOOL_DISPLAY_NAMES[tool] ?? tool;
}
