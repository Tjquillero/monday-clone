/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PoaImportContainer from './PoaImportContainer';
import type { ImportPoaResult } from '@/lib/poaImport/service/types';

// Commit 4: pulido de UX. Estos tests cubren lo que el flujo E2E real
// (scripts/e2e/verify-poa-import-*.cjs) no ejerce fácilmente: un `success`
// real requeriría un Excel sintético + catálogo + zonas resueltas en la
// base enlazada. Aquí se mockea la capa de servicio para probar la lógica
// de UI pura (qué botón se muestra, qué se bloquea) sin duplicar las
// reglas de negocio, que ya están cubiertas por los tests del servicio.

const fromMock = jest.fn(() => ({
  select: () => ({
    eq: () => ({
      single: () => Promise.resolve({ data: { board_id: 'board-1' }, error: null }),
    }),
  }),
}));
jest.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...(args as [])) },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/usePoaZoneMappings', () => ({
  registerUnresolvedZones: jest.fn(() => Promise.resolve()),
}));

// TechnicalConfigSummary (dentro de ImportResultView) usa este hook — se
// mockea aquí en vez de envolver el render en QueryClientProvider, mismo
// patrón que el resto de este archivo (mockear en la frontera del hook,
// no reimplementar React Query en el test).
jest.mock('@/hooks/useActivityStandards', () => ({
  useMissingBoardActivityStandards: () => ({ data: [], isLoading: false }),
}));

const importPoaVersionMock = jest.fn<Promise<ImportPoaResult>, [unknown]>();
jest.mock('@/lib/poaImport/service/importPoaService', () => ({
  importPoaVersion: (input: unknown) => importPoaVersionMock(input),
}));

function makeFile(name = 'poa.xlsx') {
  const file = new File(['contenido'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  // jsdom's File does not implement arrayBuffer(); PoaImportContainer calls
  // it before invoking importPoaVersion (mocked below), so polyfill it here.
  (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
    Promise.resolve(new ArrayBuffer(0));
  return file;
}

async function selectFile(input: HTMLElement, file: File) {
  await fireEvent.change(input, { target: { files: [file] } });
}

// Compara DOM ignorando el orden de atributos: React reordena atributos
// como `disabled` en jsdom cuando se agregan/quitan varias veces a lo largo
// del ciclo de vida del componente (setAttribute los mueve al final), lo
// cual no es una diferencia real de UI.
function normalizeDom(html: string): string {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const serialize = (node: ChildNode): string => {
    if (node.nodeType !== Node.ELEMENT_NODE) return node.textContent ?? '';
    const el = node as Element;
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}="${a.value}"`)
      .sort()
      .join(' ');
    const children = Array.from(el.childNodes).map(serialize).join('');
    return `<${el.tagName}${attrs ? ' ' + attrs : ''}>${children}</${el.tagName}>`;
  };
  return Array.from(wrapper.childNodes).map(serialize).join('');
}

describe('PoaImportContainer — Commit 4 (pulido de UX)', () => {
  beforeEach(() => {
    importPoaVersionMock.mockReset();
    fromMock.mockClear();
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { board_id: 'board-1' }, error: null }),
        }),
      }),
    }));
  });

  it('tras un success, reemplaza "Importar" por "Importar otro archivo" (evita reintentar y crear una segunda versión)', async () => {
    importPoaVersionMock.mockResolvedValue({
      status: 'success',
      versionId: 'v1',
      activitiesImported: 10,
      zonesImported: 3,
      activitiesNotContracted: 0,
    });

    render(<PoaImportContainer poaId="poa-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await selectFile(input, makeFile());

    fireEvent.click(screen.getByRole('button', { name: /^Importar$/ }));

    await waitFor(() => expect(screen.getByText('Importación exitosa')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /^Importar$/ })).not.toBeInTheDocument();
    expect(importPoaVersionMock).toHaveBeenCalledTimes(1);

    const resetButton = screen.getByRole('button', { name: /Importar otro archivo/i });
    fireEvent.click(resetButton);

    expect(screen.queryByText('Importación exitosa')).not.toBeInTheDocument();
    expect(screen.getByText('Selecciona el Excel del POA (.xlsx)')).toBeInTheDocument();
    // El reset vuelve al estado inicial: "Importar" reaparece, pero
    // deshabilitado porque no hay archivo seleccionado todavía.
    expect(screen.getByRole('button', { name: /^Importar$/ })).toBeDisabled();
  });

  it('bloquea el input de archivo mientras hay una importación en curso', async () => {
    let resolveImport: (r: ImportPoaResult) => void;
    importPoaVersionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve;
      }),
    );

    render(<PoaImportContainer poaId="poa-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await selectFile(input, makeFile());

    fireEvent.click(screen.getByRole('button', { name: /^Importar$/ }));

    await waitFor(() => expect(screen.getByText(/Importando…/)).toBeInTheDocument());
    expect(input).toBeDisabled();
    expect(screen.getByText(/Leyendo el archivo, validando/)).toBeInTheDocument();

    resolveImport!({
      status: 'blocked',
      unresolvedZones: [],
      ambiguousFrequencyActivities: [],
      validationErrors: [{ code: 'campo_requerido_vacio', message: 'fila inválida' }],
    });
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it('mantiene "Importar" activo (para reintentar) cuando el resultado es blocked, no success', async () => {
    importPoaVersionMock.mockResolvedValue({
      status: 'blocked',
      unresolvedZones: [{ excelZoneName: 'Zona X' }],
      ambiguousFrequencyActivities: [],
      validationErrors: [],
    });

    render(<PoaImportContainer poaId="poa-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await selectFile(input, makeFile());
    fireEvent.click(screen.getByRole('button', { name: /^Importar$/ }));

    await waitFor(() => expect(screen.getByText(/zona.*sin mapear/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Importar$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Importar$/ })).not.toBeDisabled();
  });

  it('permite seleccionar otro archivo antes de importar, sin recargar la página', async () => {
    render(<PoaImportContainer poaId="poa-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await selectFile(input, makeFile('primero.xlsx'));

    expect(screen.getByText('primero.xlsx')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Seleccionar otro archivo/i }));

    expect(screen.getByText('Selecciona el Excel del POA (.xlsx)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Importar$/ })).toBeDisabled();
  });

  it('handleReset() deja la pantalla indistinguible de un montaje inicial (limpia file, result, loadError e importOperationId, no solo el archivo)', async () => {
    const { container } = render(<PoaImportContainer poaId="poa-1" />);
    const initialHtml = container.innerHTML;

    // Fuerza loadError (falla la consulta a `poa`, no el servicio de
    // importación) — es el único pedazo de estado que ningún otro test de
    // este archivo ejercita, y handleReset() también debe limpiarlo.
    fromMock.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          // runImport solo distingue instancias reales de Error (ver el
          // catch de runImport); un objeto plano cae en el mensaje
          // genérico, así que se usa un Error real para probar loadError.
          single: () => Promise.reject(new Error('poa no encontrado')),
        }),
      }),
    }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await selectFile(input, makeFile('con-error.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: /^Importar$/ }));

    await waitFor(() => expect(screen.getByText('poa no encontrado')).toBeInTheDocument());
    expect(importPoaVersionMock).not.toHaveBeenCalled(); // falló antes de invocar el servicio

    // file sigue seleccionado (loadError no lo limpia por sí solo) -> el
    // enlace de reinicio está visible.
    fireEvent.click(screen.getByRole('button', { name: /Seleccionar otro archivo/i }));

    // Mismo contenedor, mismo componente: el DOM tras el reset debe ser
    // equivalente al del montaje inicial (mismos elementos, atributos y
    // texto — normalizado para ignorar el orden de atributos, que jsdom
    // reordena al alternar `disabled` varias veces durante el ciclo de
    // vida; la `key` del input tampoco se refleja como atributo del DOM).
    expect(normalizeDom(container.innerHTML)).toBe(normalizeDom(initialHtml));
  });
});
