// =============================================================================
// importPoaService — Commit 1/5: esqueleto, sin lógica todavía.
// Ref: docs/architecture/import-poa-orchestrator-flow.md,
//      src/lib/poaImport/service/types.ts
//
// Recibe ImportPoaInput y devuelve Promise<ImportPoaResult>, cumpliendo la
// interfaz ImportPoaService — sin invocar todavía parsePoaExcel(),
// validateParsedPoa(), poa_zone_mappings, ni import_poa_version(). Cada una
// de esas piezas se conecta en un commit propio (2-4), y el Commit 5 cierra
// con la suite de pruebas del servicio completo.
// =============================================================================

import type { ImportPoaInput, ImportPoaResult, ImportPoaService } from './types';

export async function importPoaVersion(input: ImportPoaInput): Promise<ImportPoaResult> {
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

  throw new Error(
    'importPoaVersion: pendiente de implementar (Commits 2-4 — parser/validate, resolución de zonas, persistencia)',
  );
}

export const defaultImportPoaService: ImportPoaService = {
  importPoaVersion,
};
