// =============================================================================
// importPoaService — Commit 2/5: integración parser -> validator.
// Ref: docs/architecture/import-poa-orchestrator-flow.md,
//      src/lib/poaImport/service/types.ts
//
// Conecta parsePoaExcel() -> validateParsedPoa() -> buildBlockedResult().
// Deliberadamente SIN tocar Supabase: la resolución de zonas y el catálogo
// técnico (ambos requieren consultar la base de datos) se inyectan como
// dependencia (`resolveValidationContext`), no se importan aquí. El
// Commit 3 reemplaza `defaultImportPoaService` para que esa dependencia
// consulte poa_zone_mappings de verdad — este archivo no debería necesitar
// cambios ese día.
// =============================================================================

import { parsePoaExcel } from '../parseExcel';
import { validateParsedPoa, type ValidatePoaImportContext } from '../validate';
import type { ParseResult } from '../types';
import { buildBlockedResult } from './buildBlockedResult';
import type { ImportPoaInput, ImportPoaResult, ImportPoaService } from './types';

export interface ImportPoaServiceDeps {
  resolveValidationContext(parseResult: ParseResult, poaId: string): Promise<ValidatePoaImportContext>;
}

export function createImportPoaService(deps: ImportPoaServiceDeps): ImportPoaService {
  return {
    async importPoaVersion(input: ImportPoaInput): Promise<ImportPoaResult> {
      if (!input.poaId) {
        throw new Error('importPoaVersion: poaId es obligatorio');
      }
      if (!input.boardId) {
        throw new Error('importPoaVersion: boardId es obligatorio');
      }
      if (!input.file) {
        throw new Error('importPoaVersion: file es obligatorio');
      }
      if (!input.importOperationId) {
        throw new Error('importPoaVersion: importOperationId es obligatorio');
      }

      const parseResult = parsePoaExcel(input.file);
      const context = await deps.resolveValidationContext(parseResult, input.poaId);
      const validationResult = validateParsedPoa(parseResult, context);

      const blocked = buildBlockedResult(parseResult, validationResult);
      if (blocked) return blocked;

      throw new Error(
        'importPoaVersion: pendiente de implementar (Commits 3-4 — resolución real de zonas, persistencia)',
      );
    },
  };
}

export const defaultImportPoaService: ImportPoaService = createImportPoaService({
  resolveValidationContext: async () => {
    throw new Error(
      'resolveValidationContext: pendiente de implementar (Commit 3 — consulta real a poa_zone_mappings)',
    );
  },
});

export const importPoaVersion: ImportPoaService['importPoaVersion'] =
  defaultImportPoaService.importPoaVersion;
