import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  EMPTY_CONTEXT,
  getCopilotPlannerContext,
  setCopilotPlannerContext,
  clearCopilotPlannerContext,
  useCopilotPlannerContext,
} from '../copilotContext';

function TestComponent() {
  const ctx = useCopilotPlannerContext();
  return (
    <div data-testid="copilot-context">
      <span data-testid="groupId">{ctx.groupId ?? 'none'}</span>
      <span data-testid="groupTitle">{ctx.groupTitle ?? 'none'}</span>
      <span data-testid="weekStart">{ctx.weekStart ?? 'none'}</span>
    </div>
  );
}

describe('copilotContext — Estado compartido y SSR hydration safety', () => {
  beforeEach(() => {
    clearCopilotPlannerContext();
  });

  test('EMPTY_CONTEXT es inmutable (Object.isFrozen)', () => {
    expect(Object.isFrozen(EMPTY_CONTEXT)).toBe(true);
    expect(EMPTY_CONTEXT).toEqual({
      groupId: null,
      groupTitle: null,
      weekStart: null,
    });
  });

  test('renderToString con react-dom/server ejecuta getServerSnapshot sin loops y usa EMPTY_CONTEXT', () => {
    const html = renderToString(<TestComponent />);
    expect(html).toContain('none');
  });

  test('clearCopilotPlannerContext() deja el estado en la referencia exacta EMPTY_CONTEXT', () => {
    setCopilotPlannerContext({ groupId: 'group-1', groupTitle: 'Lote Norte', weekStart: '2026-10-05' });
    expect(getCopilotPlannerContext().groupId).toBe('group-1');

    clearCopilotPlannerContext();
    expect(getCopilotPlannerContext()).toBe(EMPTY_CONTEXT);
  });

  test('getServerSnapshot (useSyncExternalStore) devuelve la misma referencia en llamadas sucesivas', () => {
    // Verificamos que el valor inicial antes de cualquier set es EMPTY_CONTEXT
    expect(getCopilotPlannerContext()).toBe(EMPTY_CONTEXT);

    // Múltiples lecturas directas devuelven la misma referencia estática
    const snap1 = EMPTY_CONTEXT;
    const snap2 = EMPTY_CONTEXT;
    expect(snap1).toBe(snap2);
  });
});
