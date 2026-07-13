// fetchProactiveSummary se prueba aparte del hook (sin React Query) — mockea
// las 2 DomainTools directamente, igual que generateExecutionObservations.test.ts.

const mockGetDelayedWeeklyPlans = jest.fn();
jest.mock('@/services/ai/domainTools/schedule', () => ({
  getDelayedWeeklyPlans: (...args: unknown[]) => mockGetDelayedWeeklyPlans(...args),
}));

const mockGetPendingBillableWork = jest.fn();
jest.mock('@/services/ai/domainTools/actas', () => ({
  getPendingBillableWork: (...args: unknown[]) => mockGetPendingBillableWork(...args),
}));

// El módulo importa @/lib/supabaseClient a nivel de módulo (para el hook de
// React Query) -- se mockea para no requerir credenciales reales, igual que
// AgentControlCenter.test.tsx hace con este mismo hook desde el otro lado.
jest.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

import { fetchProactiveSummary } from './useAiProactiveSummary';

describe('fetchProactiveSummary', () => {
  beforeEach(() => {
    mockGetDelayedWeeklyPlans.mockReset();
    mockGetPendingBillableWork.mockReset();
  });

  it('combina ambas fuentes cuando las dos responden', async () => {
    mockGetDelayedWeeklyPlans.mockResolvedValue([{ weeklyPlanId: 'p1' }, { weeklyPlanId: 'p2' }]);
    mockGetPendingBillableWork.mockResolvedValue({ activities: 3, executions: 5, estimatedValue: 500000, currency: 'COP' });

    const result = await fetchProactiveSummary({} as any, 'board-1');

    expect(result).toBe('Detecté 2 planes semanales vencidos y 3 actividades certificables (~COP 500.000).');
  });

  // Reproduce el bug de la revisión: antes, Promise.all hacía que un fallo
  // transitorio de getPendingBillableWork ocultara el aviso de planes
  // atrasados, que sí se había podido calcular.
  it('no pierde el aviso de planes atrasados si getPendingBillableWork falla', async () => {
    mockGetDelayedWeeklyPlans.mockResolvedValue([{ weeklyPlanId: 'p1' }]);
    mockGetPendingBillableWork.mockRejectedValue(new Error('conexión interrumpida'));

    const result = await fetchProactiveSummary({} as any, 'board-1');

    expect(result).toBe('Detecté 1 plan semanal vencido.');
  });

  it('no pierde el aviso de facturación pendiente si getDelayedWeeklyPlans falla', async () => {
    mockGetDelayedWeeklyPlans.mockRejectedValue(new Error('conexión interrumpida'));
    mockGetPendingBillableWork.mockResolvedValue({ activities: 1, executions: 1, estimatedValue: 100000, currency: 'COP' });

    const result = await fetchProactiveSummary({} as any, 'board-1');

    expect(result).toBe('Detecté 1 actividad certificable (~COP 100.000).');
  });

  it('devuelve null (sin lanzar) si ambas fuentes fallan', async () => {
    mockGetDelayedWeeklyPlans.mockRejectedValue(new Error('conexión interrumpida'));
    mockGetPendingBillableWork.mockRejectedValue(new Error('conexión interrumpida'));

    const result = await fetchProactiveSummary({} as any, 'board-1');

    expect(result).toBeNull();
  });
});
