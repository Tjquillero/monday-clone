// =============================================================================
// Tipos del importador del Excel del POA
// Ref: docs/architecture/poa-excel-import-design.md,
//      docs/architecture/poa-excel-import-test-matrix.md
//
// La capa de extracción (parseExcel.ts) no decide nada — solo lee y organiza
// los datos crudos del archivo, incluidos los que resultarán inválidos. La
// capa de validación (validate.ts) es la única que decide qué es un error,
// qué queda pendiente de una regla de negocio, y qué está listo para persistir.
// =============================================================================

/** Frecuencia cruda de una actividad en una zona, tal como aparece en el Excel. */
export interface ZoneFrecuenciaRaw {
  excelZoneName: string;
  /** null = celda FREC. vacía en el Excel, pese a tener CANT. > 0 */
  frecuencia: number | null;
  excelFrecCell: string;
}

/** Asignación de una actividad a una zona con cantidad contratada real (CANT. > 0). */
export interface ParsedZoneAllocation {
  excelZoneName: string;
  cantidadContratada: number;
  excelRow: number;
  excelCantCell: string;
  excelFrecCell: string;
}

/** Una fila de actividad tal como se extrajo del Excel, sin validar todavía. */
export interface ParsedActivity {
  activityKey: string;
  descripcion: string;
  unidad: string | null;
  /** "Vr. UNITARIO 2026" (o el año vigente) — columna de referencia única por fila. */
  precioUnitario: number | null;
  /** Solo zonas con CANT. > 0 (Sección 6, paso 7 del diseño). */
  zonas: ParsedZoneAllocation[];
  /** Mismo largo que `zonas`; crudo, sin decidir si es constante o no. */
  frecuenciasPorZona: ZoneFrecuenciaRaw[];
  excelRow: number;
}

export interface ParsedZoneHeader {
  excelZoneName: string;
  startColumn: number;
}

export type ParseWarningType = 'fila_vacia' | 'fila_cierre_financiero';

export interface ParseWarning {
  tipo: ParseWarningType;
  excelRow: number;
  detalle?: string;
}

export interface ParseResult {
  sheetName: string;
  zonas: ParsedZoneHeader[];
  actividades: ParsedActivity[];
  /** Filas ignoradas intencionalmente (vacías o de cierre financiero) — informativo, no bloqueante. */
  warnings: ParseWarning[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

export type ImportValidationErrorCode =
  | 'zona_sin_mapeo'
  | 'codigo_actividad_duplicado'
  | 'activity_key_inexistente'
  | 'campo_requerido_vacio'
  | 'frecuencia_pendiente_regla_negocio';

export interface ImportValidationError {
  code: ImportValidationErrorCode;
  message: string;
  activityKey?: string;
  excelRow?: number;
  excelCell?: string;
  zona?: string;
}

/** Actividad ya validada, lista para persistir — frecuencia siempre resuelta a un único valor. */
export interface ValidatedActivity {
  activityKey: string;
  precioUnitario: number;
  frecuencia: number;
  zonas: { groupId: string; cantidadContratada: number }[];
}

/**
 * Actividad del catálogo técnico presente en el Excel pero sin cantidad
 * contratada en ninguna zona (CANT. = 0 en las 9 zonas). No es un error: el
 * POA es el catálogo contractual de una versión, no el catálogo técnico
 * completo (ver docs/domain/poa-domain.md, "Catálogo Contractual" vs.
 * "Catálogo Técnico"). No genera poa_activities para esta versión.
 */
export interface NoContratadaActivity {
  activityKey: string;
  excelRow: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ImportValidationError[];
  /** Solo poblado cuando valid === true (todo o nada, ADR-0004). */
  activities: ValidatedActivity[];
  /** Informativo, siempre poblado independientemente de `valid` — no bloquea la importación. */
  noContratadas: NoContratadaActivity[];
}
