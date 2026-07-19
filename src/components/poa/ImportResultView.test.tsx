/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportResultView from './ImportResultView';
import type { ImportPoaResult } from '@/lib/poaImport/service/types';
import type { ImportValidationError } from '@/lib/poaImport/types';

// ImportResultView importa (transitivamente, vía useMissingBoardActivityStandards)
// el cliente real de Supabase, que falla en jsdom sin las env vars — estos
// tests nunca ejercitan esa ruta (solo status: 'blocked'), así que se mockea
// en la frontera del hook, mismo patrón que PoaImportContainer.test.tsx.
jest.mock('@/hooks/useActivityStandards', () => ({
  useMissingBoardActivityStandards: () => ({ data: [], isLoading: false }),
}));

describe('ImportResultView — explicar errores de validación con IA', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function blockedResult(validationErrors: ImportValidationError[]): ImportPoaResult {
    return {
      status: 'blocked',
      unresolvedZones: [],
      ambiguousFrequencyActivities: [],
      validationErrors,
    };
  }

  it('muestra el botón "Explícame estos errores" y, al hacer click, la explicación real del endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ explanation: 'La fila 45 no importó porque la actividad CM_099 no existe.' }),
    });

    render(
      <ImportResultView
        poaId="poa-1"
        boardId={null}
        result={blockedResult([
          { code: 'campo_requerido_vacio', message: 'La actividad CM_099 no existe.', activityKey: 'CM_099', excelRow: 45 },
        ])}
      />
    );

    const button = screen.getByRole('button', { name: /Explícame estos errores/i });
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByText('La fila 45 no importó porque la actividad CM_099 no existe.')).toBeInTheDocument()
    );

    // El fetch debe llevar los errores reales, no un resumen inventado.
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.errors).toEqual([
      { code: 'campo_requerido_vacio', message: 'La actividad CM_099 no existe.', activityKey: 'CM_099', excelRow: 45 },
    ]);

    // El botón desaparece una vez hay explicación (no se puede pedir dos veces a la vez).
    expect(screen.queryByRole('button', { name: /Explícame estos errores/i })).not.toBeInTheDocument();
  });

  it('muestra un error si el endpoint falla', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'GEMINI_API_KEY no configurada.' }),
    });

    render(
      <ImportResultView
        poaId="poa-1"
        boardId={null}
        result={blockedResult([{ code: 'campo_requerido_vacio', message: 'Falta un campo.' }])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Explícame estos errores/i }));

    await waitFor(() => expect(screen.getByText('GEMINI_API_KEY no configurada.')).toBeInTheDocument());
  });

  it('no muestra el botón cuando no hay errores de validación', () => {
    render(<ImportResultView poaId="poa-1" boardId={null} result={blockedResult([])} />);
    expect(screen.queryByRole('button', { name: /Explícame estos errores/i })).not.toBeInTheDocument();
  });
});
