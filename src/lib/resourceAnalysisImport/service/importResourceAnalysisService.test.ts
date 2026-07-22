// importResourceAnalysisService.ts importa (transitivamente, vía
// persistResourceAnalysisImport.ts) el cliente real de Supabase. Estos
// tests nunca ejercitan esa ruta — createImportResourceAnalysisService()
// siempre recibe fetchExistingSiteIds/upsertResourceAnalysisSite
// inyectados — pero el módulo real igual se instancia al cargar el
// archivo si no se mockea (mismo gotcha que importPoaService.test.ts).
jest.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

import { createImportResourceAnalysisService } from './importResourceAnalysisService';
import { realWorkbookArrayBuffer } from '../testFixtures';
import type { ImportResourceAnalysisInput } from './types';

function fakeDeps(existingSiteIds: Set<string> = new Set()) {
  const upserted: { boardId: string; groupId: string; scopeData: Record<string, number>; isNew: boolean }[] = [];
  return {
    deps: {
      fetchExistingSiteIds: async () => existingSiteIds,
      upsertResourceAnalysisSite: async (
        boardId: string,
        site: { groupId: string; sheetNames: string[]; scopeData: Record<string, number> },
        isNew: boolean,
      ) => {
        upserted.push({ boardId, groupId: site.groupId, scopeData: site.scopeData, isNew });
      },
    },
    upserted,
  };
}

const BOARD_ID = 'board-real-fixture';

describe('importResourceAnalysisService — archivo real', () => {
  it('importa los 9 sitios como "imported" cuando el board no tiene resource_analysis previo', async () => {
    const { deps, upserted } = fakeDeps(new Set());
    const service = createImportResourceAnalysisService(deps);
    const input: ImportResourceAnalysisInput = {
      boardId: BOARD_ID,
      file: realWorkbookArrayBuffer(),
      importedBy: 'user-test',
    };
    const result = await service.importResourceAnalysis(input);

    expect(result.sitesImported).toBe(9);
    expect(result.sitesUpdated).toBe(0);
    expect(result.sitesSkipped).toBe(0);
    expect(result.details).toHaveLength(9);
    expect(result.details.every((d) => d.status === 'imported')).toBe(true);
    expect(upserted).toHaveLength(9);
    // upsertResourceAnalysisSite se llamó con isNew=true para cada sitio.
    expect(upserted.every((u) => u.isNew)).toBe(true);
    expect(upserted.every((u) => u.boardId === BOARD_ID)).toBe(true);
  });

  it('clasifica como "updated" un sitio que ya tenía resource_analysis (ej. PLAYA DEL COUNTRY)', async () => {
    const PLAYA_DEL_COUNTRY = '6366520a-d981-4c7c-8d4d-72fbf06bb7f3';
    const { deps, upserted } = fakeDeps(new Set([PLAYA_DEL_COUNTRY]));
    const service = createImportResourceAnalysisService(deps);
    const result = await service.importResourceAnalysis({
      boardId: BOARD_ID,
      file: realWorkbookArrayBuffer(),
      importedBy: 'user-test',
    });

    expect(result.sitesImported).toBe(8);
    expect(result.sitesUpdated).toBe(1);
    const countryDetail = result.details.find((d) => d.groupId === PLAYA_DEL_COUNTRY)!;
    expect(countryDetail.status).toBe('updated');
    const countryUpsert = upserted.find((u) => u.groupId === PLAYA_DEL_COUNTRY)!;
    expect(countryUpsert.isNew).toBe(false);
    // El scope_data pasado a upsert es el REPLACE completo (8 claves: 4 ZV + 4 playa).
    expect(Object.keys(countryUpsert.scopeData)).toHaveLength(8);
  });

  it('devuelve importedBy tal cual se pasó, sin persistirlo (resource_analysis no tiene esa columna)', async () => {
    const { deps } = fakeDeps();
    const service = createImportResourceAnalysisService(deps);
    const result = await service.importResourceAnalysis({
      boardId: BOARD_ID,
      file: realWorkbookArrayBuffer(),
      importedBy: 'usuario-de-prueba',
    });
    expect(result.importedBy).toBe('usuario-de-prueba');
  });

  it('valida boardId/file/importedBy obligatorios antes de tocar cualquier dependencia', async () => {
    const { deps, upserted } = fakeDeps();
    const service = createImportResourceAnalysisService(deps);
    await expect(
      service.importResourceAnalysis({ boardId: '', file: realWorkbookArrayBuffer(), importedBy: 'x' }),
    ).rejects.toThrow('boardId');
    await expect(
      service.importResourceAnalysis({ boardId: BOARD_ID, file: undefined as unknown as ArrayBuffer, importedBy: 'x' }),
    ).rejects.toThrow('file');
    await expect(
      service.importResourceAnalysis({ boardId: BOARD_ID, file: realWorkbookArrayBuffer(), importedBy: '' }),
    ).rejects.toThrow('importedBy');
    expect(upserted).toHaveLength(0);
  });
});
