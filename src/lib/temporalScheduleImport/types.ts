/**
 * Tipos y Contratos del Parser y Mapeador Semántico de la Matriz Temporal K:AOA (FASE 2 Hitos 1 & 2)
 *
 * Invariantes Congeladas:
 * - R-TEMP-01: Conservación temporal (cantidades y jornales exactos).
 * - R-TEMP-02: No optimización durante ingesta (sin alteración de datos).
 * - R-TEMP-03: Identidad de fecha ISO.
 * - R-TEMP-04: Conservación de origen (trazabilidad completa).
 * - R-TEMP-05: Cero != ausencia (distinción celda vacía vs 0 vs parcial).
 * - R-TEMP-06: No redondeo destructivo (tolerancia 1e-4).
 * - Solución de Referencia Inmutable: El modelo es una fuente inmutable de comparación (PLAN HISTÓRICO).
 * - Identidad Maestra por groups.id: Resolución estricta de sitio con prevención de aliasing.
 * - Separación de Recursos: Operador != Maquinaria.
 */

export type TemporalResourceType = 'operator' | 'machinery' | 'mixed';

export interface TemporalSourceOrigin {
  sourceSheet: string;
  sourceRow: number; // 1-based (Excel row)
  colOpLetter: string; // ej. 'M'
  colCantLetter: string; // ej. 'N'
  siteName: string;
  np: number | null;
  activityDescription: string;
}

export interface ParsedTemporalAllocation {
  id: string; // ID sintáctico de trazabilidad: row_site_np_date
  origin: TemporalSourceOrigin;
  date: string; // ISO string 'YYYY-MM-DD'
  resourceType: TemporalResourceType;
  jornales: number; // Valor numérico exacto de Op / Maq
  quantity: number; // Valor numérico exacto de Cant.
  isEmptyCell: boolean; // true si la celda original era null/vacía (R-TEMP-05)
  isZeroValue: boolean; // true si la celda tenía un 0 explícito (R-TEMP-05)
}

export interface ActivityHeaderTotals {
  cantHeader: number;
  jornalesHeader: number;
  rendimientoHeader: number;
  frecuenciaHeader: number;
}

export interface ReconciliationStatus {
  cantMatched: boolean;
  jornalesMatched: boolean;
  cantDiff: number;
  jornalesDiff: number;
  toleranceUsed: number;
  status: 'EXACT_MATCH' | 'RECONCILIATION_MISMATCH';
  details: string;
}

export interface ParsedTemporalActivityRow {
  excelRow: number;
  siteName: string;
  np: number | null;
  activityDescription: string;
  unit: string | null;
  headers: ActivityHeaderTotals;
  allocations: ParsedTemporalAllocation[];
  activeAllocationsCount: number; // Total de días con asignación > 0
  sumQuantity: number; // Suma exacta de quantity en las asignaciones
  sumJornales: number; // Suma exacta de jornales en las asignaciones
  reconciliation: ReconciliationStatus;
}

export interface TemporalDateColumnHeader {
  colOpIndex: number;
  colCantIndex: number;
  colOpLetter: string;
  colCantLetter: string;
  excelSerialDate: number;
  isoDate: string; // YYYY-MM-DD
  dayLabel: string | null; // ej. 'Día 73'
  dayName: string | null; // ej. 'LUNES'
  subHeaderOp: string | null;
  subHeaderCant: string | null;
}

export interface TemporalParseWarning {
  excelRow: number;
  type: 'empty_row' | 'header_mismatch' | 'invalid_date' | 'reconciliation_discrepancy';
  message: string;
  details?: Record<string, unknown>;
}

export interface TemporalScheduleParseResult {
  sheetName: string;
  totalRowsProcessed: number;
  totalActivities: number;
  totalAllocationsParsed: number;
  totalActiveAllocations: number;
  dateHeaders: TemporalDateColumnHeader[];
  activities: ParsedTemporalActivityRow[];
  sites: string[];
  warnings: TemporalParseWarning[];
  summary: {
    reconciledCantCount: number;
    reconciledJornalesCount: number;
    discrepancyCount: number;
    tolerance: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del Hito 2 (Modelo Mapeado Semántico)
// ─────────────────────────────────────────────────────────────────────────────

export interface MappedSiteIdentity {
  groupId: string | null; // UUID de groups si está RESUELTO
  excelSiteName: string;
  matchedTitle: string | null;
  resolutionStatus: 'RESOLVED' | 'UNRESOLVED' | 'EXCLUDED_FINANCIAL';
}

export interface MappedTemporalAllocation {
  id: string; // Trazabilidad sintáctica
  site: MappedSiteIdentity;
  activityKey: string;
  activityDescription: string;
  date: string; // ISO 'YYYY-MM-DD'
  resourceType: TemporalResourceType;
  quantity: number; // Cantidad ejecutable histórica exactas
  operatorJornales: number; // Jornales de operador exactos (OP)
  machineryJornales: number; // Jornales de maquinaria exactos (MAQ)
  totalJornales: number; // Suma de jornales en el período
  isEmptyCell: boolean; // Preserva distinción R-TEMP-05
  isZeroValue: boolean; // Preserva distinción R-TEMP-05
  origin: TemporalSourceOrigin; // Trazabilidad completa R-TEMP-04
}

export interface MappedTemporalActivity {
  excelRow: number;
  site: MappedSiteIdentity;
  activityKey: string;
  activityDescription: string;
  unit: string | null;
  headers: ActivityHeaderTotals;
  allocations: MappedTemporalAllocation[];
  activeAllocationsCount: number;
  sumQuantity: number;
  sumOperatorJornales: number;
  sumMachineryJornales: number;
  sumTotalJornales: number;
  reconciliation: ReconciliationStatus;
}

export interface MappedTemporalScheduleResult {
  sheetName: string;
  parsedResult: TemporalScheduleParseResult;
  sites: MappedSiteIdentity[];
  activities: MappedTemporalActivity[];
  resolvedSitesCount: number;
  unresolvedSitesCount: number;
  excludedFinancialSitesCount: number;
  totalMappedAllocations: number;
  summary: {
    totalQuantity: number;
    totalOperatorJornales: number;
    totalMachineryJornales: number;
    totalJornales: number;
    reconciledCantCount: number;
    reconciledJornalesCount: number;
    discrepancyCount: number;
  };
  warnings: TemporalParseWarning[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del Hito 3 (Payload e Integración de Referencia)
// ─────────────────────────────────────────────────────────────────────────────

export interface TemporalPayloadAllocation {
  id: string;
  group_id: string | null;
  excel_site_name: string;
  matched_title: string | null;
  resolution_status: 'RESOLVED' | 'UNRESOLVED' | 'EXCLUDED_FINANCIAL';
  activity_key: string;
  activity_description: string;
  date_iso: string;
  resource_type: TemporalResourceType;
  quantity: number;
  operator_jornales: number;
  machinery_jornales: number;
  total_jornales: number;
  is_empty_cell: boolean;
  is_zero_value: boolean;
  origin: TemporalSourceOrigin;
}

export interface TemporalPayloadActivity {
  excel_row: number;
  group_id: string | null;
  excel_site_name: string;
  activity_key: string;
  activity_description: string;
  unit: string | null;
  cant_header: number;
  jornales_header: number;
  allocations: TemporalPayloadAllocation[];
  sum_quantity: number;
  sum_operator_jornales: number;
  sum_machinery_jornales: number;
  sum_total_jornales: number;
  reconciliation_status: 'EXACT_MATCH' | 'RECONCILIATION_MISMATCH';
}

export interface TemporalSchedulePayload {
  version_timestamp: string;
  source_sheet: string;
  total_activities: number;
  total_allocations: number;
  activities: TemporalPayloadActivity[];
  summary: {
    total_quantity: number;
    total_operator_jornales: number;
    total_machinery_jornales: number;
    total_jornales: number;
    reconciled_cant_count: number;
    reconciled_jornales_count: number;
    discrepancy_count: number;
  };
}

export interface TemporalIntegrationResult {
  success: boolean;
  payload: TemporalSchedulePayload;
  mappedResult: MappedTemporalScheduleResult;
  warnings: TemporalParseWarning[];
}

