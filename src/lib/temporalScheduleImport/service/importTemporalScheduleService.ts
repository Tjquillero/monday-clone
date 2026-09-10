/**
 * Servicio Orquestador de Integración Temporal (FASE 2 Hito 3)
 *
 * Encapsula la cadena completa de integración:
 *   Parser Hito 1 -> Mapeador Hito 2 -> Payload Hito 3
 *
 * Invariantes Congeladas:
 * - Orquestador puro sin lógica de planificación ni redistribución.
 * - R-TEMP-07 a R-TEMP-12: Conservación de payload, no reinterpretación,
 *   trazabilidad end-to-end, conservación agregada, idempotencia y núcleo congelado.
 */

import { parseTemporalScheduleExcel } from '../parseTemporalExcel';
import { mapTemporalScheduleToDomain } from '../mapper';
import { buildTemporalSchedulePayload, DEFAULT_FIXED_TIMESTAMP } from './buildTemporalPayload';
import type { TemporalIntegrationResult } from '../types';

export function executeTemporalScheduleIntegration(
  fileBuffer: Uint8Array,
  availableGroups: Array<{ id: string; title: string }>,
  fixedTimestamp: string = DEFAULT_FIXED_TIMESTAMP
): TemporalIntegrationResult {
  // Step 1: Parser Hito 1 (Extracción Fiel K:AOA)
  const parsedResult = parseTemporalScheduleExcel(fileBuffer);

  // Step 2: Mapeador Hito 2 (Identidad Semántica por groups.id)
  const mappedResult = mapTemporalScheduleToDomain(parsedResult, availableGroups);

  // Step 3: Constructor Hito 3 (Payload Inmutable de Referencia)
  const payload = buildTemporalSchedulePayload(mappedResult, fixedTimestamp);

  return {
    success: true,
    payload,
    mappedResult,
    warnings: mappedResult.warnings,
  };
}
