// =============================================================================
// importPoaService — Commit 4/5: persistencia real. El orquestador queda
// completo de punta a punta.
// Ref: docs/architecture/import-poa-orchestrator-flow.md,
//      src/lib/poaImport/service/types.ts
//
// Flujo completo:
//   parsePoaExcel() -> resolveValidationContext() -> validateParsedPoa()
//   -> buildBlockedResult() [si blocked, termina aquí]
//   -> buildImportPayload() [función pura]
//   -> persistImportPoaVersion() [RPC import_poa_version()]
//   -> translatePersistenceError() [si falla] | 'success' [si no]
//
// import_operation_id NO se genera aquí: viene en ImportPoaInput, generado
// una única vez por quien invoca al servicio (nunca por el usuario
// directamente, nunca regenerado dentro de este archivo ante un reintento
// interno) — así lo estableció el contrato desde el Commit 1. Este archivo
// se limita a reenviarlo tal cual a persistImportPoaVersion(), preservando
// la semántica de idempotencia de import_poa_version().
// =============================================================================

import { parsePoaExcel } from '../parseExcel';
import { validateParsedPoa, type ValidatePoaImportContext } from '../validate';
import type { ParseResult } from '../types';
import { buildBlockedResult } from './buildBlockedResult';
import { buildImportPayload, type ImportPayloadActivity } from './buildImportPayload';
import { resolveValidationContext } from './resolveValidationContext';
import { persistImportPoaVersion } from './persistImportPoaVersion';
import { translatePersistenceError, type PostgrestLikeError } from './translatePersistenceError';
import type { ImportPoaInput, ImportPoaResult, ImportPoaService } from './types';

export interface ImportPoaServiceDeps {
  resolveValidationContext(
    parseResult: ParseResult,
    poaId: string,
    boardId: string,
  ): Promise<ValidatePoaImportContext>;
  persistImportPoaVersion(
    poaId: string,
    activities: ImportPayloadActivity[],
    importOperationId: string,
  ): Promise<string>;
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

      const payload = buildImportPayload(validationResult.activities);

      try {
        const versionId = await deps.persistImportPoaVersion(input.poaId, payload, input.importOperationId);
        return {
          status: 'success',
          versionId,
          activitiesImported: validationResult.activities.length,
          zonesImported: validationResult.activities.reduce((sum, a) => sum + a.zonas.length, 0),
          activitiesNotContracted: validationResult.noContratadas.length,
        };
      } catch (error) {
        return translatePersistenceError(error as PostgrestLikeError);
      }
    },
  };
}

export const defaultImportPoaService: ImportPoaService = createImportPoaService({
  resolveValidationContext,
  persistImportPoaVersion,
});

export const importPoaVersion: ImportPoaService['importPoaVersion'] =
  defaultImportPoaService.importPoaVersion;
