/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentControlCenter from './AgentControlCenter';

// Memoria conversacional por board: el widget vive montado globalmente y
// nunca se desmonta al cambiar de board (ver comentario en
// AgentControlCenter.tsx), así que esta prueba simula exactamente ese
// escenario — mismo componente montado, `useSearchParams` cambiando entre
// renders — sin depender de un mecanismo real de navegación en la app ni de
// una llamada real a Gemini.

let currentBoardId: string | null = 'board-a';
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'boardId' ? currentBoardId : null) }),
}));

function stripMotionProps({ whileHover, whileTap, initial, animate, exit, ...rest }: any) {
  return rest;
}
jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => React.createElement('button', stripMotionProps(props), children),
    div: ({ children, ...props }: any) => React.createElement('div', stripMotionProps(props), children),
  },
  AnimatePresence: ({ children }: any) => children,
}));

function mockNextAskResponse(text: string, history: unknown) {
  return {
    ok: true,
    json: async () => ({ text, toolsUsed: [], history }),
  };
}

describe('AgentControlCenter — memoria conversacional por board', () => {
  beforeEach(() => {
    currentBoardId = 'board-a';
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  async function openWidget() {
    const toggleButton = screen.getAllByRole('button')[0];
    fireEvent.click(toggleButton);
    return screen.findByPlaceholderText(/Pregunta algo/i);
  }

  function sendMessage(input: HTMLElement, text: string) {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  it('aísla el historial entre boards y lo restaura al volver', async () => {
    const historyA = { contents: [{ role: 'user', parts: [{ text: 'A1' }] }] };
    const historyB = { contents: [{ role: 'user', parts: [{ text: 'B1' }] }] };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockNextAskResponse('Respuesta board A', historyA) as any)
      .mockResolvedValueOnce(mockNextAskResponse('Respuesta board B', historyB) as any);

    const { rerender } = render(<AgentControlCenter />);
    const input = await openWidget();

    // Turno en board A.
    sendMessage(input, '¿Cuánto vale el acta de este board?');
    await waitFor(() => expect(screen.getByText('Respuesta board A')).toBeInTheDocument());
    expect(screen.getByText('¿Cuánto vale el acta de este board?')).toBeInTheDocument();

    // El primer fetch debe llevar boardId=board-a e historial vacío (primer turno).
    const firstCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(firstCallBody.boardId).toBe('board-a');
    expect(firstCallBody.history.contents).toHaveLength(0);

    // Cambia a board B (mismo componente montado, sin unmount).
    currentBoardId = 'board-b';
    rerender(<AgentControlCenter />);

    // El chat visible debe estar vacío para board B — no debe verse nada de board A.
    expect(screen.queryByText('¿Cuánto vale el acta de este board?')).not.toBeInTheDocument();
    expect(screen.queryByText('Respuesta board A')).not.toBeInTheDocument();

    // Turno en board B, sin ningún rastro del historial de A.
    sendMessage(input, '¿Y este board qué tiene pendiente?');
    await waitFor(() => expect(screen.getByText('Respuesta board B')).toBeInTheDocument());

    const secondCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(secondCallBody.boardId).toBe('board-b');
    expect(secondCallBody.history.contents).toHaveLength(0); // no contaminado por board A

    // Vuelve a board A: debe reaparecer la conversación original de A, no la de B.
    currentBoardId = 'board-a';
    rerender(<AgentControlCenter />);

    expect(screen.getByText('¿Cuánto vale el acta de este board?')).toBeInTheDocument();
    expect(screen.getByText('Respuesta board A')).toBeInTheDocument();
    expect(screen.queryByText('¿Y este board qué tiene pendiente?')).not.toBeInTheDocument();
    expect(screen.queryByText('Respuesta board B')).not.toBeInTheDocument();

    // Un tercer turno en A debe reenviar el historial guardado de A (no vacío).
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockNextAskResponse('Otra respuesta A', historyA) as any);
    sendMessage(input, '¿Y cuánto de eso es AIU?');
    await waitFor(() => expect(screen.getByText('Otra respuesta A')).toBeInTheDocument());
    const thirdCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[2][1].body);
    expect(thirdCallBody.boardId).toBe('board-a');
    expect(thirdCallBody.history).toEqual(historyA);
  });
});
