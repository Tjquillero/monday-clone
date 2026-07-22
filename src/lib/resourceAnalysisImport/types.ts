// =============================================================================
// Tipos del Incremento 2 (Parser) del importador de Resource Analysis.
// Ref: docs/domain/resource-analysis-domain.md,
//      docs/architecture/resource-analysis-import-design.md
//
// Esta capa NO decide nada — solo lee el Excel y organiza las cantidades
// crudas por hoja/bloque. No resuelve a qué `group_id` pertenece cada bloque
// (eso requiere la tabla de mapeo humano descrita en el diseño, Sección 3,
// todavía no construida) y no escribe en ninguna tabla. Rendimiento y
// frecuencia se leen (Sección 6 del diseño, "reporte de discrepancias") pero
// nunca se traducen a `board_activity_standards` — esa tabla es del Catálogo
// Técnico, gobernada por ADR-0008, nunca por este importador.
// =============================================================================

export type ScopeKey =
  | 'total_paisajismo'
  | 'zona_dura'
  | 'grama'
  | 'limpieza_marmol'
  | 'arbustos'
  | 'arboles'
  | 'zona_playa'
  | 'trasiego_playa'
  | 'limpieza_manual'
  | 'corte_troncos';

/** Una cantidad reconocida dentro de un bloque (mapea a `resource_analysis.scope_data`). */
export interface ParsedQuantity {
  scopeKey: ScopeKey;
  cantidad: number;
  excelRow: number;
}

/** Rendimiento/frecuencia crudos de una actividad, tal como aparecen en el Excel — solo para el reporte de discrepancias (Sección 6 del diseño), nunca para persistir. */
export interface ParsedActivityStandardRaw {
  actividad: string;
  unidad: string | null;
  rendimiento: number | null;
  frecuencia: number | null;
  cantidad: number | null;
  excelRow: number;
}

/**
 * Un bloque de sitio dentro de una hoja (hasta 2 por hoja: Zona Verde y Zona
 * de Playa). `blockLabel` es el texto crudo de la celda "NOMBRE DEL
 * PROYECTO:" — se conserva solo para trazabilidad/depuración humana. NO se
 * usa para resolver el sitio real: el discovery encontró que esta etiqueta
 * está copiada de otro sitio en al menos 4 hojas (ver
 * docs/discovery/resource-analysis-sheet-mapping-gaps.md).
 */
export interface ParsedBlock {
  blockLabel: string;
  excelRow: number;
  quantities: ParsedQuantity[];
  /** Informativo (Sección 6 del diseño) — nunca se persiste. */
  activityStandardsRaw: ParsedActivityStandardRaw[];
}

export interface ParsedSheet {
  sheetName: string;
  blocks: ParsedBlock[];
}

export type ParseWarningType =
  | 'descripcion_no_reconocida'
  | 'cantidad_negativa'
  | 'hoja_sin_bloques';

export interface ParseWarning {
  tipo: ParseWarningType;
  sheetName: string;
  excelRow: number;
  detalle?: string;
}

export interface ParseResult {
  sheets: ParsedSheet[];
  warnings: ParseWarning[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Incremento 3 — Validación
//
// Capa pura: no conoce Supabase, no resuelve mapeos por sí misma. El caller
// (futuro Incremento 4) le pasa el contexto ya resuelto (`siteMappings`),
// igual que src/lib/poaImport/validate.ts recibe `zoneMappings` en vez de
// consultarlas. Códigos estables (RA00N) para que tests, UI y documentos de
// arquitectura puedan referirse a una regla sin copiar el texto del mensaje.
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationCode =
  | 'RA001' // Hoja sin bloques válidos
  | 'RA002' // Sitio no identificado
  | 'RA003' // Actividad desconocida (informativo)
  | 'RA004' // Cantidad negativa
  | 'RA005' // Bloque duplicado (dos bloques de la misma hoja resuelven al mismo sitio)
  | 'RA006' // Rendimiento leído pero ignorado (informativo — Regla de Gobierno de Datos)
  | 'RA007'; // Frecuencia leída pero ignorada (informativo — Regla de Gobierno de Datos)

export interface ValidationIssue {
  code: ValidationCode;
  message: string;
  sheetName: string;
  blockIndex?: number;
  blockLabel?: string;
  excelRow?: number;
  detalle?: string;
}

export interface ValidationSummary {
  totalSheets: number;
  totalBlocks: number;
  /** Bloques sin ningún error (RA001/RA002/RA004/RA005) — pueden tener warnings igual. */
  validBlocks: number;
  blockedBlocks: number;
}

export interface ValidationResult {
  /** `errors.length === 0`. No implica "todo el archivo se importa completo" — Resource Analysis no es todo-o-nada (a diferencia del POA): cada bloque/sitio es independiente. */
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: ValidationSummary;
}

export interface ValidateResourceAnalysisContext {
  /**
   * Clave `${sheetName}#${blockIndex}` (0-indexado, en el orden en que
   * parseResourceAnalysisExcel detectó los bloques) → identificador de sitio
   * ya resuelto (ej. un futuro `group_id`), o `null`/`undefined` si sigue sin
   * mapeo. Esta función NO decide el mapeo — ver
   * docs/discovery/resource-analysis-sheet-mapping-gaps.md.
   */
  siteMappings: Map<string, string | null | undefined>;
}
