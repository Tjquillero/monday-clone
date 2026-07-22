// =============================================================================
// Tipos del Incremento 4 (Importación) del importador de Resource Analysis.
// Ref: docs/architecture/resource-analysis-import-design.md
//
// Contrato congelado antes de implementar (decisión explícita del usuario,
// 2026-07-22):
//   - scope_data: REPLACE completo por sitio, nunca merge con lo que ya
//     había en la fila. Un solo escritor (el formulario manual en
//     ResourceEfficiencyWidget.tsx) ya trata esa columna como snapshot
//     completo — el importador respeta esa misma semántica en vez de
//     introducir un segundo comportamiento (merge) sobre la misma columna.
//   - Condición para el replace: el sitio se reemplaza solo si TODOS sus
//     bloques (puede tener 1 o 2 — Zona Verde / Zona de Playa) están libres
//     de errores de validación. Si falta un bloque o alguno tiene error, el
//     sitio se salta por completo — nunca se persiste un scope_data parcial.
//   - workers_data / wages_data: NUNCA se tocan. Siguen siendo exclusivos
//     del formulario manual — misma Regla de Gobierno de Datos que ya rige
//     rendimiento/frecuencia (docs/domain/resource-analysis-domain.md,
//     Sección 2): el Excel puede estar desactualizado para datos que hoy
//     mantiene un humano.
//   - No recalcula Cronograma, no toca board_activity_standards, no lee la
//     Biblioteca Documental automáticamente, no cambia el Scheduler.
// =============================================================================

import type { ValidationIssue } from '../types';

export interface ImportResourceAnalysisInput {
  boardId: string;
  file: ArrayBuffer | Uint8Array;
  /** Solo para trazabilidad en el resultado devuelto — resource_analysis no tiene columna para esto, no se persiste. */
  importedBy: string;
}

export interface ImportedSiteDetail {
  groupId: string;
  /** Hoja(s) del Excel que aportaron datos a este sitio (1 o 2, ver siteMappings.ts). */
  sheetNames: string[];
  scopeKeysCount: number;
  status: 'imported' | 'updated';
}

export interface SkippedSiteDetail {
  /** null cuando el bloque ni siquiera tiene sitio resuelto (RA002). */
  groupId: string | null;
  sheetNames: string[];
  reason: string;
}

export interface ImportResourceAnalysisResult {
  importedBy: string;
  sitesImported: number;
  sitesUpdated: number;
  sitesSkipped: number;
  details: ImportedSiteDetail[];
  skipped: SkippedSiteDetail[];
  /** Pass-through de validateResourceAnalysis — informativo, no bloqueante. */
  warnings: ValidationIssue[];
}

export interface ImportPayloadSite {
  groupId: string;
  sheetNames: string[];
  scopeData: Record<string, number>;
}

export interface ImportPayload {
  toUpsert: ImportPayloadSite[];
  skipped: SkippedSiteDetail[];
  warnings: ValidationIssue[];
}
