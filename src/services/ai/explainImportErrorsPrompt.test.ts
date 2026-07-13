import { buildExplainImportErrorsPrompt } from './explainImportErrorsPrompt';
import type { ImportValidationError } from '@/lib/poaImport/types';

describe('buildExplainImportErrorsPrompt', () => {
  it('incluye cada error real con su código, mensaje y ubicación', () => {
    const errors: ImportValidationError[] = [
      { code: 'zona_sin_mapeo', message: 'La zona "Sector 4" no tiene group asignado.', zona: 'Sector 4' },
      {
        code: 'activity_key_inexistente',
        message: 'La actividad CM_099 no existe en el catálogo técnico.',
        activityKey: 'CM_099',
        excelRow: 45,
      },
    ];

    const prompt = buildExplainImportErrorsPrompt(errors);

    expect(prompt).toContain('2 en total');
    expect(prompt).toContain('[zona_sin_mapeo]');
    expect(prompt).toContain('La zona "Sector 4" no tiene group asignado.');
    expect(prompt).toContain('zona: Sector 4');
    expect(prompt).toContain('[activity_key_inexistente]');
    expect(prompt).toContain('actividad: CM_099');
    expect(prompt).toContain('fila Excel: 45');
  });

  it('no omite ningún error de la lista', () => {
    const errors: ImportValidationError[] = Array.from({ length: 5 }, (_, i) => ({
      code: 'campo_requerido_vacio' as const,
      message: `Error número ${i + 1}`,
    }));

    const prompt = buildExplainImportErrorsPrompt(errors);

    for (let i = 1; i <= 5; i++) {
      expect(prompt).toContain(`Error número ${i}`);
    }
  });
});
