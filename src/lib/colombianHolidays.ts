/**
/**
 * Utility for Colombian National Holidays (Ley 51 de 1983 - Ley Emiliani).
 * Computes official fixed and Ley Emiliani moved holidays for any year.
 */

export interface Holiday {
  dateStr: string; // YYYY-MM-DD
  name: string;
}

/**
 * Calculates Easter Sunday for a given year using Meeus/Jones/Butcher algorithm.
 */
export function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function moveToMonday(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  if (dayOfWeek === 1) return date; // Already Monday
  const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const result = new Date(date);
  result.setUTCDate(date.getUTCDate() + daysToAdd);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Returns all official Colombian holidays for a specific year.
 */
export function getColombianHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Fixed date holidays
  holidays.push({ dateStr: `${year}-01-01`, name: 'Año Nuevo' });
  holidays.push({ dateStr: `${year}-05-01`, name: 'Día del Trabajo' });
  holidays.push({ dateStr: `${year}-07-20`, name: 'Día de la Independencia' });
  holidays.push({ dateStr: `${year}-08-07`, name: 'Batalla de Boyacá' });
  holidays.push({ dateStr: `${year}-12-08`, name: 'Inmaculada Concepción' });
  holidays.push({ dateStr: `${year}-12-25`, name: 'Navidad' });

  // Ley Emiliani holidays (fixed date moved to next Monday if not Monday)
  const emilianiFixed: Array<{ month: number; day: number; name: string }> = [
    { month: 1, day: 6, name: 'Reyes Magos' },
    { month: 3, day: 19, name: 'San José' },
    { month: 6, day: 29, name: 'San Pedro y San Pablo' },
    { month: 8, day: 15, name: 'La Asunción de la Virgen' },
    { month: 10, day: 12, name: 'Día de la Raza' },
    { month: 11, day: 1, name: 'Todos los Santos' },
    { month: 11, day: 11, name: 'Independencia de Cartagena' },
  ];

  emilianiFixed.forEach((item) => {
    const rawDate = new Date(Date.UTC(year, item.month - 1, item.day));
    const movedDate = moveToMonday(rawDate);
    holidays.push({ dateStr: formatDateISO(movedDate), name: item.name });
  });

  // Easter-dependent holidays
  const easter = getEasterSunday(year);

  // Jueves Santo (-3) & Viernes Santo (-2)
  holidays.push({ dateStr: formatDateISO(addDays(easter, -3)), name: 'Jueves Santo' });
  holidays.push({ dateStr: formatDateISO(addDays(easter, -2)), name: 'Viernes Santo' });

  // Easter-dependent moved holidays
  // Ascensión del Señor (Easter + 40 days, moved to Monday -> Easter + 43 days)
  holidays.push({ dateStr: formatDateISO(addDays(easter, 43)), name: 'Ascensión del Señor' });
  // Corpus Christi (Easter + 60 days, moved to Monday -> Easter + 64 days)
  holidays.push({ dateStr: formatDateISO(addDays(easter, 64)), name: 'Corpus Christi' });
  // Sagrado Corazón de Jesús (Easter + 68 days, moved to Monday -> Easter + 71 days)
  holidays.push({ dateStr: formatDateISO(addDays(easter, 71)), name: 'Sagrado Corazón' });

  return holidays;
}

/**
 * Checks whether a given Date or YYYY-MM-DD string is a Colombian national holiday.
 */
export function isColombianHoliday(dateInput: Date | string): boolean {
  let dateStr: string;
  let year: number;

  if (typeof dateInput === 'string') {
    dateStr = dateInput.slice(0, 10);
    year = parseInt(dateStr.slice(0, 4), 10);
  } else {
    dateStr = formatDateISO(dateInput);
    year = dateInput.getUTCFullYear();
  }

  const holidays = getColombianHolidays(year);
  return holidays.some((h) => h.dateStr === dateStr);
}

/**
 * Returns the name of the holiday if the given date is a holiday, otherwise null.
 */
export function getColombianHolidayName(dateInput: Date | string): string | null {
  let dateStr: string;
  let year: number;

  if (typeof dateInput === 'string') {
    dateStr = dateInput.slice(0, 10);
    year = parseInt(dateStr.slice(0, 4), 10);
  } else {
    dateStr = formatDateISO(dateInput);
    year = dateInput.getUTCFullYear();
  }

  const holidays = getColombianHolidays(year);
  const found = holidays.find((h) => h.dateStr === dateStr);
  return found ? found.name : null;
}
