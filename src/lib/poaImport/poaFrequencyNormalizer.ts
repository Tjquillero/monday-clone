// =============================================================================
// Módulo de Normalización Semántica de Frecuencias Contractuales (ADR-0007 / POA)
//
// Traduce la frecuencia expresada en el Excel del POA (donde FREC = 1 representa
// 1 intervención por semana) a la notación canónica del Scheduler en BD (donde
// frecuencia = 4 representa 1 ocurrencia por semana, y frecuencia = 1 representa
// diario L-S / 6 ocurrencias por semana).
//
// Regla determinística pura (sin condicionales ad-hoc por activity_key):
//   - Si la frecuencia en Excel es 1 (1 vez/semana) y NO es una actividad diaria -> 4 (4/mes = 1/semana)
//   - Si la frecuencia en Excel es 6 (6 días L-S) o explícitamente diaria -> 1 (código diario scheduler)
//   - Para cualquier otra frecuencia (2, 12, 0.5, 0.333, 0.25) -> Se preserva igual
// =============================================================================

export interface FrequencyNormalizationContext {
  frecExcel?: number | null;
  /** Código contractual de la actividad (ej. "1.01", "1.10") */
  activityKey?: string | null;
  /** Unidad contractual de la actividad (ej. "M²", "UND", "ML", "DIA") */
  unit?: string | null;
  /** Nombre o descripción para inferir si es inherentemente diaria */
  descripcion?: string | null;
}

/**
 * Infiere si una actividad con FREC = 1 en Excel es inherentemente una actividad diaria.
 */
export function isDailyActivityByMetadata(context: FrequencyNormalizationContext): boolean {
  const desc = (context.descripcion || '').toUpperCase();
  const unit = (context.unit || '').toUpperCase();
  const key = (context.activityKey || '').trim();

  // 1. Unidad explícitamente diaria
  if (unit === 'DIA' || unit === 'DÍAS' || unit === 'DIAS') return true;

  // 2. Descripción o metadatos explícitamente diarios/rutinarios
  if (desc.includes('DIARIO') || desc.includes('DIARIA') || desc.includes('RUTINARIO')) return true;

  // 3. Palabras clave de actividades operativas de rutina diaria en POA
  const dailyKeywords = [
    'TRASIEGO', 'CARGUE', 'ARRUME', 'ACOPIO', 'BARRIDO', 'LIMPIEZA',
    'PODA', 'DESHIERBE', 'RECOLECCION', 'RECOLECCIÓN', 'ROBER',
    'MANTENIMIENTO', 'REPASO', 'OPERACION', 'OPERACIÓN', 'OXIGENACION',
    'OXIGENACIÓN', 'PLATEO', 'LAVADO', 'CORTE', 'CORTA', 'TRANSPORTE',
    'DESMALEZADO', 'RIEGO', 'DESPUNTE', 'SIEMBRA'
  ];
  if (dailyKeywords.some((kw) => desc.includes(kw))) return true;

  // 4. Capítulos 1 y 2 de operaciones rutinarias del POA (cualquier código 1.xx o 2.xx)
  if (/^1\.\d+/.test(key) || /^2\.\d+/.test(key)) return true;

  return false;
}

/**
 * Canonicaliza un valor de frecuencia proveniente del Excel a la notación del Scheduler.
 */
export function normalizePoaFrequency(context: FrequencyNormalizationContext): number | null {
  const { frecExcel } = context;
  if (frecExcel === null || frecExcel === undefined || !Number.isFinite(frecExcel) || frecExcel <= 0) {
    return null;
  }

  // FREC = 1 en Excel
  if (frecExcel === 1) {
    if (isDailyActivityByMetadata(context)) {
      return 1; // Permanece como 1 (Código Scheduler: 6 ocurrencias L-S)
    }
    // Frecuencia semanal por defecto en notación Excel: 1 vez/semana -> 4 ocurrencias/mes (1 día/semana Lunes)
    return 4;
  }

  // FREC = 6 en Excel -> Código diario Scheduler (1)
  if (frecExcel === 6) {
    return 1;
  }

  // Frecuencias fraccionarias o periódicas (0.5, 0.333, 0.25, 2, 12, etc.)
  return frecExcel;
}
