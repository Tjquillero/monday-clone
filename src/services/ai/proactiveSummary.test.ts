import { buildProactiveSummaryMessage } from './proactiveSummary';

describe('buildProactiveSummaryMessage', () => {
  it('devuelve null cuando no hay nada que reportar (silencio, no relleno)', () => {
    expect(
      buildProactiveSummaryMessage({ delayedPlanCount: 0, pendingActivities: 0, estimatedValue: 0, currency: 'COP' })
    ).toBeNull();
  });

  it('reporta solo planes atrasados si no hay nada certificable', () => {
    expect(
      buildProactiveSummaryMessage({ delayedPlanCount: 4, pendingActivities: 0, estimatedValue: 0, currency: 'COP' })
    ).toBe('Detecté 4 planes semanales vencidos.');
  });

  it('reporta solo lo certificable si no hay planes atrasados', () => {
    expect(
      buildProactiveSummaryMessage({ delayedPlanCount: 0, pendingActivities: 2, estimatedValue: 500000, currency: 'COP' })
    ).toBe('Detecté 2 actividades certificables (~COP 500.000).');
  });

  it('combina ambos cuando hay planes atrasados y trabajo certificable', () => {
    expect(
      buildProactiveSummaryMessage({ delayedPlanCount: 4, pendingActivities: 2, estimatedValue: 500000, currency: 'COP' })
    ).toBe('Detecté 4 planes semanales vencidos y 2 actividades certificables (~COP 500.000).');
  });

  it('usa singular correctamente cuando el conteo es exactamente 1', () => {
    expect(
      buildProactiveSummaryMessage({ delayedPlanCount: 1, pendingActivities: 1, estimatedValue: 1000, currency: 'COP' })
    ).toBe('Detecté 1 plan semanal vencido y 1 actividad certificable (~COP 1.000).');
  });
});
