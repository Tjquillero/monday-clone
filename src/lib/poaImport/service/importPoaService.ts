// =============================================================================
// importPoaService — Commit 3/5: resolución real de contexto.
// Ref: docs/architecture/import-poa-orchestrator-flow.md,
//      src/lib/poaImport/service/types.ts
//
// Conecta parsePoaExcel() -> resolveValidationContext() -> validateParsedPoa()
// -> buildBlockedResult(). `resolveValidationContext` es la única frontera de
// infraestructura de todo el servicio (src/lib/poaImport/service/
// resolveValidationContext.ts, el único archivo con imports de Supabase);
// este archivo sigue sin ninguno — solo conoce la firma
// (parseResult, poaId, boardId) => Promise<ValidatePoaImportContext>, no de
// dónde sale ese contexto.
// =============================================================================

import { parsePoaExcel } from '../parseExcel';
import { validateParsedPoa, type ValidatePoaImportContext } from '../validate';
import type { ParseResult } from '../types';
import { buildBlockedResult } from './buildBlockedResult';
import { resolveValidationContext } from './resolveValidationContext';
import type { ImportPoaInput, ImportPoaResult, ImportPoaService } from './types';

export interface ImportPoaServiceDeps {
  resolveValidationContext(
    parseResult: ParseResult,
    poaId: string,
    boardId: string,
  ): Promise<ValidatePoaImportContext>;
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
      const context = await deps.resolveValidationContext(parseResult, input.poaId, input.boardId);
      const validationResult = validateParsedPoa(parseResult, context);

      const blocked = buildBlockedResult(parseResult, validationResult);
      if (blocked) return blocked;

      throw new Error('importPoaVersion: pendiente de implementar (Commit 4 — persistencia)');
    },
  };
}

export const defaultImportPoaService: ImportPoaService = createImportPoaService({
  resolveValidationContext,
});

export const importPoaVersion: ImportPoaService['importPoaVersion'] =
  defaultImportPoaService.importPoaVersion;
