import { importPoaVersion, defaultImportPoaService } from './importPoaService';
import type { ImportPoaInput, ImportPoaService } from './types';

const VALID_INPUT: ImportPoaInput = {
  poaId: 'poa-1',
  boardId: 'board-1',
  file: new ArrayBuffer(8),
  importOperationId: 'op-1',
};

describe('importPoaVersion — Commit 1: esqueleto', () => {
  it('cumple la interfaz ImportPoaService (chequeo de tipos + wiring en runtime)', () => {
    const service: ImportPoaService = defaultImportPoaService;
    expect(typeof service.importPoaVersion).toBe('function');
  });

  it('rechaza un input sin poaId', async () => {
    await expect(
      importPoaVersion({ ...VALID_INPUT, poaId: '' }),
    ).rejects.toThrow('poaId es obligatorio');
  });

  it('rechaza un input sin boardId', async () => {
    await expect(
      importPoaVersion({ ...VALID_INPUT, boardId: '' }),
    ).rejects.toThrow('boardId es obligatorio');
  });

  it('rechaza un input sin importOperationId', async () => {
    await expect(
      importPoaVersion({ ...VALID_INPUT, importOperationId: '' }),
    ).rejects.toThrow('importOperationId es obligatorio');
  });

  it('con un input estructuralmente válido, confirma que la lógica real no existe todavía', async () => {
    await expect(importPoaVersion(VALID_INPUT)).rejects.toThrow('pendiente de implementar');
  });
});
