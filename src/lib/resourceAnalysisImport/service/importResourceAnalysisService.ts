// =============================================================================
// importResourceAnalysisService — Incremento 4: persistencia real.
// Ref: docs/architecture/resource-analysis-import-design.md,
//      docs/architecture/resource-analysis-site-mapping.md
//
// Flujo:
//   parseResourceAnalysisExcel() -> validateResourceAnalysis() (con el
//   mapeo congelado de siteMappings.ts) -> buildImportPayload() [función
//   pura] -> upsertResourceAnalysisSite() por cada sitio [independiente,
//   NO todo-o-nada — a diferencia de importPoaService].
//
// Alcance deliberadamente estricto (decisión explícita del usuario,
// 2026-07-22) — este servicio SOLO escribe `resource_analysis.scope_data`:
//   - NO recalcula Cronograma ni factibilidad.
//   - NO toca board_activity_standards ni rendimiento/frecuencia.
//   - NO lee automáticamente la Biblioteca Documental.
//   - NO cambia el Scheduler ni ninguna fórmula.
//   - NO toca workers_data/wages_data (ver persistResourceAnalysisImport.ts).
// =============================================================================

import { parseResourceAnalysisExcel } from '../parseExcel';
import { validateResourceAnalysis } from '../validate';
import { RESOURCE_ANALYSIS_SITE_MAPPINGS } from '../siteMappings';
import { buildImportPayload } from './buildImportPayload';
import { fetchExistingSiteIds, upsertResourceAnalysisSite } from './persistResourceAnalysisImport';
import type {
  ImportResourceAnalysisInput,
  ImportResourceAnalysisResult,
  ImportedSiteDetail,
} from './types';

export interface ImportResourceAnalysisServiceDeps {
  fetchExistingSiteIds(boardId: string): Promise<Set<string>>;
  upsertResourceAnalysisSite(
    boardId: string,
    site: { groupId: string; sheetNames: string[]; scopeData: Record<string, number> },
    isNew: boolean,
  ): Promise<void>;
}

export interface ImportResourceAnalysisService {
  importResourceAnalysis(input: ImportResourceAnalysisInput): Promise<ImportResourceAnalysisResult>;
}

export function createImportResourceAnalysisService(
  deps: ImportResourceAnalysisServiceDeps,
): ImportResourceAnalysisService {
  return {
    async importResourceAnalysis(input: ImportResourceAnalysisInput): Promise<ImportResourceAnalysisResult> {
      if (!input.boardId) throw new Error('importResourceAnalysis: boardId es obligatorio');
      if (!input.file) throw new Error('importResourceAnalysis: file es obligatorio');
      if (!input.importedBy) throw new Error('importResourceAnalysis: importedBy es obligatorio');

      const parseResult = parseResourceAnalysisExcel(input.file);
      const validationResult = validateResourceAnalysis(parseResult, {
        siteMappings: RESOURCE_ANALYSIS_SITE_MAPPINGS,
      });
      const payload = buildImportPayload(parseResult, validationResult, RESOURCE_ANALYSIS_SITE_MAPPINGS);

      const existingSiteIds = await deps.fetchExistingSiteIds(input.boardId);

      const details: ImportedSiteDetail[] = [];
      for (const site of payload.toUpsert) {
        const isNew = !existingSiteIds.has(site.groupId);
        await deps.upsertResourceAnalysisSite(input.boardId, site, isNew);
        details.push({
          groupId: site.groupId,
          sheetNames: site.sheetNames,
          scopeKeysCount: Object.keys(site.scopeData).length,
          status: isNew ? 'imported' : 'updated',
        });
      }

      return {
        importedBy: input.importedBy,
        sitesImported: details.filter((d) => d.status === 'imported').length,
        sitesUpdated: details.filter((d) => d.status === 'updated').length,
        sitesSkipped: payload.skipped.length,
        details,
        skipped: payload.skipped,
        warnings: payload.warnings,
      };
    },
  };
}

export const defaultImportResourceAnalysisService: ImportResourceAnalysisService =
  createImportResourceAnalysisService({ fetchExistingSiteIds, upsertResourceAnalysisSite });

export const importResourceAnalysis: ImportResourceAnalysisService['importResourceAnalysis'] =
  defaultImportResourceAnalysisService.importResourceAnalysis;
