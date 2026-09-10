/**
 * Constructor Puro de Payload de Integración Temporal (FASE 2 Hito 3)
 *
 * Convierte MappedTemporalScheduleResult en un payload inmutable listo para
 * almacenamiento o serialización sin alterar ni un solo valor del modelo.
 *
 * Invariantes Congeladas:
 * - R-TEMP-07: Conservación de Payload (coincidencia 1:1 en cada asignación).
 * - R-TEMP-08: No Reinterpretación (cero re-resolución de identidades).
 * - R-TEMP-09: Trazabilidad End-to-End conservada en origin.
 * - R-TEMP-10: Conservación Agregada (sumas totales idénticas en Parser, Mapper y Payload).
 * - R-TEMP-11: Idempotencia de Construcción (mismo input produce exactamente el mismo payload).
 * - R-TEMP-12: Cero mutación sobre Gateway V6, F3.1, weekly_plans o weekly_plan_items.
 */

import type {
  MappedTemporalScheduleResult,
  TemporalSchedulePayload,
  TemporalPayloadActivity,
  TemporalPayloadAllocation,
} from '../types';

export const DEFAULT_FIXED_TIMESTAMP = '2026-09-09T00:00:00.000Z';

/**
 * Función Pura: Construye el payload de integración del cronograma temporal de referencia.
 */
export function buildTemporalSchedulePayload(
  mappedResult: MappedTemporalScheduleResult,
  fixedTimestamp: string = DEFAULT_FIXED_TIMESTAMP
): TemporalSchedulePayload {
  const activities: TemporalPayloadActivity[] = mappedResult.activities.map((act) => {
    const allocations: TemporalPayloadAllocation[] = act.allocations.map((alloc) => ({
      id: alloc.id,
      group_id: alloc.site.groupId,
      excel_site_name: alloc.site.excelSiteName,
      matched_title: alloc.site.matchedTitle,
      resolution_status: alloc.site.resolutionStatus,
      activity_key: alloc.activityKey,
      activity_description: alloc.activityDescription,
      date_iso: alloc.date,
      resource_type: alloc.resourceType,
      quantity: alloc.quantity,
      operator_jornales: alloc.operatorJornales,
      machinery_jornales: alloc.machineryJornales,
      total_jornales: alloc.totalJornales,
      is_empty_cell: alloc.isEmptyCell,
      is_zero_value: alloc.isZeroValue,
      origin: { ...alloc.origin },
    }));

    return {
      excel_row: act.excelRow,
      group_id: act.site.groupId,
      excel_site_name: act.site.excelSiteName,
      activity_key: act.activityKey,
      activity_description: act.activityDescription,
      unit: act.unit,
      cant_header: act.headers.cantHeader,
      jornales_header: act.headers.jornalesHeader,
      allocations,
      sum_quantity: act.sumQuantity,
      sum_operator_jornales: act.sumOperatorJornales,
      sum_machinery_jornales: act.sumMachineryJornales,
      sum_total_jornales: act.sumTotalJornales,
      reconciliation_status: act.reconciliation.status,
    };
  });

  return {
    version_timestamp: fixedTimestamp,
    source_sheet: mappedResult.sheetName,
    total_activities: activities.length,
    total_allocations: mappedResult.totalMappedAllocations,
    activities,
    summary: {
      total_quantity: mappedResult.summary.totalQuantity,
      total_operator_jornales: mappedResult.summary.totalOperatorJornales,
      total_machinery_jornales: mappedResult.summary.totalMachineryJornales,
      total_jornales: mappedResult.summary.totalJornales,
      reconciled_cant_count: mappedResult.summary.reconciledCantCount,
      reconciled_jornales_count: mappedResult.summary.reconciledJornalesCount,
      discrepancy_count: mappedResult.summary.discrepancyCount,
    },
  };
}
