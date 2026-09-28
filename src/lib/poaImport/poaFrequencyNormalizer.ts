// =============================================================================
// Módulo de Normalización Semántica de Frecuencias Contractuales (ADR-0007 / POA)
//
// Traduce la frecuencia expresada en el Excel del POA al dominio canónico Mantenix
// aplicando la Matriz de Precedencia Jerárquica de Evidencia (Niveles 1 a 5).
//
// Axioma de Gobierno:
// La evidencia contractual explícita tiene autoridad absoluta sobre cualquier inferencia.
// La heurística operativa secundaria sólo completa información ausente, NUNCA
// sobrescribe una fuente explícita. Ante ambigüedad incorregible, el sistema declara
// incertidumbre (requiresHumanReview = true, canonicalFrequency = null) sin inventar semántica.
// =============================================================================

export interface FrequencyNormalizationContext {
  frecExcel?: number | null;
  /** Código contractual de la actividad (ej. "1.01", "1.10", "2.07") */
  activityKey?: string | null;
  /** Unidad contractual de la actividad (ej. "M²", "UND", "ML", "DIA") */
  unit?: string | null;
  /** Nombre o descripción para inferir si es inherentemente diaria */
  descripcion?: string | null;
}

export type EvidenceLevel =
  | 'EXPLICIT_METADATA'
  | 'NUMERIC_CONTRACTUAL'
  | 'OPERATIONAL_HEURISTIC'
  | 'AMBIGUOUS_UNRESOLVED';

export interface FrequencyResolutionResult {
  canonicalFrequency: number | null;
  evidenceLevel: EvidenceLevel;
  evidenceSource: string;
  hasConflict: boolean;
  conflictDescription: string | null;
  requiresHumanReview: boolean;
  confidenceScore: number;
}

/**
 * Función Principal Pura y Determinista: Resuelve la frecuencia canónica aplicando
 * la Matriz de Precedencia Jerárquica de Evidencia (Niveles 1 a 5).
 */
export function resolvePoaFrequencyWithPrecedence(
  context: FrequencyNormalizationContext
): FrequencyResolutionResult {
  const { frecExcel } = context;

  // 0. Valores nulos, indefinidos o no válidos
  if (frecExcel === null || frecExcel === undefined || !Number.isFinite(frecExcel) || frecExcel <= 0) {
    return {
      canonicalFrequency: null,
      evidenceLevel: 'AMBIGUOUS_UNRESOLVED',
      evidenceSource: 'null_or_invalid_numeric_value',
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 0.0,
    };
  }

  const desc = (context.descripcion || '').toUpperCase();
  const unit = (context.unit || '').toUpperCase();
  const key = (context.activityKey || '').trim();

  // Evaluador de Metadato Explícito Diario
  const hasExplicitDailyText =
    unit === 'DIA' ||
    unit === 'DÍAS' ||
    unit === 'DIAS' ||
    desc.includes('DIARIO') ||
    desc.includes('DIARIA') ||
    desc.includes('RUTINARIO DIARIO');

  // Evaluador de Metadato Explícito Semanal/Periódico
  const hasExplicitWeeklyText =
    desc.includes('SEMANAL') ||
    desc.includes('1 VEZ/SEMANA') ||
    desc.includes('UNA VEZ POR SEMANA') ||
    desc.includes('POR SEMANA');

  const hasExplicitQuincenalText = desc.includes('QUINCENAL');
  const hasExplicitMensualText = desc.includes('MENSUAL');

  // Evaluador de Palabras Clave Operativas de Rutina
  const dailyKeywords = [
    'TRASIEGO', 'CARGUE', 'ARRUME', 'ACOPIO', 'BARRIDO', 'LIMPIEZA',
    'PODA', 'DESHIERBE', 'RECOLECCION', 'RECOLECCIÓN', 'ROBER',
    'MANTENIMIENTO', 'REPASO', 'OPERACION', 'OPERACIÓN', 'OXIGENACION',
    'OXIGENACIÓN', 'PLATEO', 'LAVADO', 'CORTE', 'CORTA', 'TRANSPORTE',
    'DESMALEZADO', 'RIEGO', 'DESPUNTE', 'SIEMBRA'
  ];
  const matchesKeyword = dailyKeywords.some((kw) => desc.includes(kw));
  const matchesRoutineChapter = /^1\.\d+/.test(key) || /^2\.\d+/.test(key);

  // ─────────────────────────────────────────────────────────────────────────
  // NIVEL 1: Evidencia Explícita en Metadatos (Precedencia Máxima)
  // ─────────────────────────────────────────────────────────────────────────

  // 1A. Metadato Explícito Semanal
  if (hasExplicitWeeklyText) {
    const hasConflict = matchesKeyword || matchesRoutineChapter;
    return {
      canonicalFrequency: 4, // 1x/semana (Lunes)
      evidenceLevel: 'EXPLICIT_METADATA',
      evidenceSource: `text: SEMANAL (${context.descripcion})`,
      hasConflict,
      conflictDescription: hasConflict
        ? 'EXPLICIT_WEEKLY_TEXT_VS_OPERATIONAL_DAILY_KEYWORD'
        : null,
      requiresHumanReview: hasConflict,
      confidenceScore: hasConflict ? 0.85 : 1.0,
    };
  }

  if (hasExplicitQuincenalText) {
    return {
      canonicalFrequency: 12.5, // Quincenal para Scheduler (12.5 días hábiles entre ejecuciones)
      evidenceLevel: 'EXPLICIT_METADATA',
      evidenceSource: `text: QUINCENAL (${context.descripcion})`,
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 1.0,
    };
  }

  if (hasExplicitMensualText) {
    return {
      canonicalFrequency: 25, // Mensual para Scheduler (25 días hábiles entre ejecuciones)
      evidenceLevel: 'EXPLICIT_METADATA',
      evidenceSource: `text: MENSUAL (${context.descripcion})`,
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 1.0,
    };
  }

  // 1B. Metadato Explícito Diario
  if (hasExplicitDailyText) {
    const hasConflict = desc.includes('SEMANAL');
    return {
      canonicalFrequency: 1, // Diario L-S (6 ocurrencias/semana)
      evidenceLevel: 'EXPLICIT_METADATA',
      evidenceSource: `unit_or_text: DIARIO (${unit || desc})`,
      hasConflict,
      conflictDescription: hasConflict
        ? 'EXPLICIT_DAILY_TEXT_VS_WEEKLY_TEXT'
        : null,
      requiresHumanReview: hasConflict,
      confidenceScore: hasConflict ? 0.85 : 1.0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NIVEL 2: Frecuencia Numérica Contractual Inequívoca (salvo FREC = 1)
  // ─────────────────────────────────────────────────────────────────────────

  if (frecExcel === 6) {
    return {
      canonicalFrequency: 1, // Diario L-S
      evidenceLevel: 'NUMERIC_CONTRACTUAL',
      evidenceSource: 'excel_frec: 6 (diario L-S)',
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 1.0,
    };
  }

  if (frecExcel === 4) {
    return {
      canonicalFrequency: 4, // Semanal Lunes
      evidenceLevel: 'NUMERIC_CONTRACTUAL',
      evidenceSource: 'excel_frec: 4 (1x/semana Lunes)',
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 1.0,
    };
  }

  // Frecuencias numéricas periódicas/fraccionarias distintas de 1
  if (frecExcel !== 1) {
    return {
      canonicalFrequency: frecExcel,
      evidenceLevel: 'NUMERIC_CONTRACTUAL',
      evidenceSource: `excel_frec: ${frecExcel}`,
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 1.0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NIVEL 4: Heurística Operativa Secundaria (Sólo ante FREC = 1 y sin conflicto L1)
  // ─────────────────────────────────────────────────────────────────────────

  if (matchesKeyword || matchesRoutineChapter) {
    const matchedSource = matchesKeyword
      ? 'keyword_operativa'
      : 'capitulo_rutinario_1_o_2';

    return {
      canonicalFrequency: 1, // Inferencia a diario L-S
      evidenceLevel: 'OPERATIONAL_HEURISTIC',
      evidenceSource: `${matchedSource}: ${key || desc}`,
      hasConflict: false,
      conflictDescription: null,
      requiresHumanReview: false,
      confidenceScore: 0.90,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NIVEL 5: Ambigüedad Incorregible — "No Inventar Semántica Silenciosamente"
  // ─────────────────────────────────────────────────────────────────────────

  return {
    canonicalFrequency: null, // Estrictamente NULL para no fabricar semántica
    evidenceLevel: 'AMBIGUOUS_UNRESOLVED',
    evidenceSource: `frec_1_sin_evidencia_diaria_ni_keywords (${key || desc})`,
    hasConflict: true,
    conflictDescription: 'FREC_1_WITHOUT_EXPLICIT_OR_HEURISTIC_DAILY_EVIDENCE',
    requiresHumanReview: true,
    confidenceScore: 0.0,
  };
}

/**
 * Función de compatibilidad inversa: Extrae el valor numérico canónico.
 */
export function normalizePoaFrequency(context: FrequencyNormalizationContext): number | null {
  const resolution = resolvePoaFrequencyWithPrecedence(context);
  return resolution.canonicalFrequency;
}

/**
 * Infiere si una actividad es diaria según la resolución jerárquica de evidencia.
 */
export function isDailyActivityByMetadata(context: FrequencyNormalizationContext): boolean {
  const resolution = resolvePoaFrequencyWithPrecedence(context);
  return resolution.canonicalFrequency === 1;
}
