/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { isAppAdminUser } from '@/config/navigation';
import PoaImportPage from '@/app/poa/[poaId]/import/page';
import ZoneMappingsPage from '@/app/poa/[poaId]/zone-mappings/page';

// Mock useAuth
const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock containers
jest.mock('@/components/poa/PoaImportContainer', () => {
  return function MockPoaImportContainer() {
    return <div data-testid="poa-import-form">Formulario Importar POA</div>;
  };
});

jest.mock('@/components/poa/ZoneMappingsResolver', () => {
  return function MockZoneMappingsResolver() {
    return <div data-testid="zone-mappings-form">Formulario Mapeo de Zonas</div>;
  };
});

describe('GATE UI-POA-01 — Gobernanza de Acceso al POA', () => {
  describe('1. Validador isAppAdminUser', () => {
    test('Retorna true SOLO cuando user.app_metadata.role === "admin"', () => {
      expect(isAppAdminUser({ app_metadata: { role: 'admin' } })).toBe(true);
      expect(isAppAdminUser({ app_metadata: { role: 'Admin' } })).toBe(false);
    });

    test('Retorna false cuando el rol viene solo en user_metadata', () => {
      const user = {
        app_metadata: {},
        user_metadata: { role: 'admin' },
      };
      expect(isAppAdminUser(user as any)).toBe(false);
    });

    test('Retorna false para correos no verificados en app_metadata o usuarios nulos', () => {
      expect(isAppAdminUser(null)).toBe(false);
      expect(isAppAdminUser(undefined)).toBe(false);
      expect(isAppAdminUser({ app_metadata: {} })).toBe(false);
      expect(isAppAdminUser({ app_metadata: { role: 'member' } })).toBe(false);
    });
  });

  describe('2. Protección de Página /poa/[poaId]/import', () => {
    test('Usuario NO admin ve "Acceso restringido", no ve formulario y tiene enlace "Volver a POA"', async () => {
      mockUseAuth.mockReturnValue({
        user: { app_metadata: { role: 'member' }, user_metadata: { role: 'admin' } },
        session: { user: { app_metadata: { role: 'member' } } },
        loading: false,
      });

      render(<PoaImportPage params={{ poaId: 'poa-123' }} />);

      await waitFor(() => {
        expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('poa-import-form')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Volver a POA/i })).toBeInTheDocument();
    });

    test('Usuario admin con app_metadata.role = "admin" accede al formulario', async () => {
      mockUseAuth.mockReturnValue({
        user: { app_metadata: { role: 'admin' } },
        session: { user: { app_metadata: { role: 'admin' } } },
        loading: false,
      });

      render(<PoaImportPage params={{ poaId: 'poa-123' }} />);

      await waitFor(() => {
        expect(screen.getByTestId('poa-import-form')).toBeInTheDocument();
      });

      expect(screen.queryByText('Acceso restringido')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Volver a POA/i })).toBeInTheDocument();
    });
  });

  describe('3. Protección de Página /poa/[poaId]/zone-mappings', () => {
    test('Usuario NO admin ve "Acceso restringido", no ve formulario y tiene enlace "Volver a POA"', async () => {
      mockUseAuth.mockReturnValue({
        user: { app_metadata: {}, user_metadata: { role: 'admin' } },
        session: { user: { app_metadata: {} } },
        loading: false,
      });

      render(<ZoneMappingsPage params={{ poaId: 'poa-123' }} />);

      await waitFor(() => {
        expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('zone-mappings-form')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Volver a POA/i })).toBeInTheDocument();
    });

    test('Usuario admin con app_metadata.role = "admin" accede al mapeo de zonas', async () => {
      mockUseAuth.mockReturnValue({
        user: { app_metadata: { role: 'admin' } },
        session: { user: { app_metadata: { role: 'admin' } } },
        loading: false,
      });

      render(<ZoneMappingsPage params={{ poaId: 'poa-123' }} />);

      await waitFor(() => {
        expect(screen.getByTestId('zone-mappings-form')).toBeInTheDocument();
      });

      expect(screen.queryByText('Acceso restringido')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Volver a POA/i })).toBeInTheDocument();
    });
  });
});
