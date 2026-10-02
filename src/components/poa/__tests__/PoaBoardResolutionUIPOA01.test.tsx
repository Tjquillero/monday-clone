/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PoaPage from '@/app/poa/page';

const mockUseAuth = jest.fn();
const mockUseSearchParams = jest.fn();
const mockRouterReplace = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => ({
    replace: mockRouterReplace,
    push: jest.fn(),
  }),
}));

function mockSupabaseChain(data: any, count: number | null = null, error: any = null) {
  const query: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    single: jest.fn().mockResolvedValue({ data, error }),
    then: (resolve: (val: any) => any) => resolve({ data, count, error }),
  };
  return query;
}

describe('GATE UI-POA-01 — Resolución de POA por Tablero', () => {
  const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
  const poaId = 'poa-board-123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams(`boardId=${boardId}`));
  });

  test('/poa resuelve el poaId del tablero, muestra versión activa, conteo y botones de acción', async () => {
    mockUseAuth.mockReturnValue({
      user: { app_metadata: { role: 'admin' } },
      session: { user: { app_metadata: { role: 'admin' } } },
      loading: false,
    });

    // Mock DB queries
    mockFrom.mockImplementation((table: string) => {
      if (table === 'poa') {
        return mockSupabaseChain({ id: poaId, board_id: boardId, name: 'POA Contractual 2026' });
      }
      if (table === 'poa_versions') {
        return mockSupabaseChain([
          { id: 'ver_1', poa_id: poaId, version_number: 1, status: 'active', created_at: '2026-09-01T00:00:00Z' },
        ]);
      }
      if (table === 'poa_activities') {
        return mockSupabaseChain(null, 26);
      }
      return mockSupabaseChain([]);
    });

    render(<PoaPage />);

    await waitFor(() => {
      expect(screen.getByText('Plan Operativo Anual (POA)')).toBeInTheDocument();
      expect(screen.getAllByText('V1').length).toBeGreaterThan(0);
      expect(screen.getByText('26')).toBeInTheDocument();
    });

    // Botones hacia las rutas con el poaId resuelto
    const importBtn = screen.getByRole('link', { name: /Importar nueva versión/i });
    expect(importBtn).toHaveAttribute('href', `/poa/${poaId}/import`);

    const zonesBtn = screen.getByRole('link', { name: /Asignar zonas/i });
    expect(zonesBtn).toHaveAttribute('href', `/poa/${poaId}/zone-mappings`);
  });

  test('/poa bloquea acceso si el usuario no es admin por app_metadata', async () => {
    mockUseAuth.mockReturnValue({
      user: { user_metadata: { role: 'admin' }, app_metadata: { role: 'member' } },
      session: { user: { app_metadata: { role: 'member' } } },
      loading: false,
    });

    render(<PoaPage />);

    await waitFor(() => {
      expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    });

    expect(screen.queryByText('Plan Operativo Anual (POA)')).not.toBeInTheDocument();
  });
});
