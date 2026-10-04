/**
 * Utilidades para normalizar fechas de consulta a lunes de semana operativa.
 */

export function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diff = day === 0 ? -6 : 1 - day; // Desplazamiento al lunes
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function resolveWeekMonday(
  dateInput?: string | null,
  ctxWeekStart?: string | null,
  ctxTodayBogota?: string | null
): string {
  if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return getMondayOfWeek(dateInput.trim());
  }
  if (ctxWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(ctxWeekStart.trim())) {
    return getMondayOfWeek(ctxWeekStart.trim());
  }
  const today =
    ctxTodayBogota ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  return getMondayOfWeek(today);
}
