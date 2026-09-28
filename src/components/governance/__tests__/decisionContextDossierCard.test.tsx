import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DecisionContextDossierCard } from '../DecisionContextDossierCard';
import { DecisionContextDossier } from '@/types/decisionContextDossier';
import { RepairProposalRecord } from '@/types/repairProposal';

describe('Hito 7.11 — DecisionContextDossierCard UI Suite (Governed Human Decision Surface)', () => {
  const baseDossier: DecisionContextDossier = {
    proposalId: 'prop_test_001',
    planId: 'plan_sem_38',
    actionType: 'PROPOSE_CREW_REASSIGNMENT',
    targetEntityId: 'item_guadua_01',
    targetMetric: 'executed_qty',
    metricDirection: 'INCREASE',
    projectedDelta: 25.5,
    cohortKey: 'PROPOSE_CREW_REASSIGNMENT::item_guadua_01::executed_qty::INCREASE',
    historicalFeedbackStatus: 'HISTORICAL_EVALUATIONS_AVAILABLE',
    totalEvaluations: 10,
    evaluatedCount: 8,
    achievedCount: 6,
    notAchievedCount: 2,
    indeterminateCount: 2,
    empiricalSuccessRate: 0.75,
    averageAchievementRatio: 1.15,
    contextProvenance: {
      proposalId: 'prop_test_001',
      planId: 'plan_sem_38',
      cohortKey: 'PROPOSE_CREW_REASSIGNMENT::item_guadua_01::executed_qty::INCREASE',
    },
    evaluatedAt: '2026-09-24T18:00:00.000Z',
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
    authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
  };

  const baseProposal: RepairProposalRecord = {
    proposalId: 'prop_test_001',
    planId: 'plan_sem_38',
    diagnosticId: 'diag_test_01',
    anomalyId: 'anom_test_01',
    actionType: 'PROPOSE_CREW_REASSIGNMENT',
    targetEntityId: 'item_guadua_01',
    payload: { crewId: 'crew_alfa' },
    expectedOutcome: {
      targetMetric: 'executed_qty',
      projectedDelta: 25.5,
      metricDirection: 'INCREASE',
    },
    status: 'PROPOSAL_GENERATED',
    evaluationTarget: 'SandboxEngine',
    evaluatedAt: '2026-09-24T18:00:00.000Z',
    timezone: 'America/Bogota',
    proposalVersion: 'v1.0',
    requiresHumanReview: true,
  };

  // 1. Escenario Canónico 1: Renderizado completo en estado HISTORICAL_EVALUATIONS_AVAILABLE
  test('Escenario 1 (AC-1, AC-2): Renderizado completo en estado HISTORICAL_EVALUATIONS_AVAILABLE', () => {
    render(<DecisionContextDossierCard dossier={baseDossier} proposal={baseProposal} />);

    expect(screen.getByTestId('field-action-type')).toHaveTextContent('Reasignación de Cuadrilla');
    expect(screen.getByTestId('field-target-entity')).toHaveTextContent('item_guadua_01');
    expect(screen.getByTestId('field-target-metric')).toHaveTextContent('executed_qty');
    expect(screen.getByTestId('field-metric-direction')).toHaveTextContent('INCREMENTAR');
    expect(screen.getByTestId('field-projected-delta')).toHaveTextContent('+25.5');
    expect(screen.getByTestId('field-historical-status')).toHaveTextContent('Evaluaciones Históricas Disponibles');
    expect(screen.getByTestId('field-empirical-success-rate')).toHaveTextContent('75.0%');
    expect(screen.getByTestId('field-average-achievement-ratio')).toHaveTextContent('1.15x');
    expect(screen.getByTestId('field-total-evaluations')).toHaveTextContent('10');
    expect(screen.getByTestId('field-evaluated-count')).toHaveTextContent('8');
    expect(screen.getByTestId('field-achieved-count')).toHaveTextContent('6');
    expect(screen.getByTestId('field-not-achieved-count')).toHaveTextContent('2');
    expect(screen.getByTestId('field-indeterminate-count')).toHaveTextContent('2');
  });

  // 2. Escenario Canónico 2: Renderizado en estado ONLY_INDETERMINATE_EVIDENCE
  test('Escenario 2 (AC-2): Renderizado en estado ONLY_INDETERMINATE_EVIDENCE', () => {
    const dossierIndet: DecisionContextDossier = {
      ...baseDossier,
      historicalFeedbackStatus: 'ONLY_INDETERMINATE_EVIDENCE',
      totalEvaluations: 3,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 3,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
    };

    render(<DecisionContextDossierCard dossier={dossierIndet} />);

    expect(screen.getByTestId('field-historical-status')).toHaveTextContent('Evidencia Histórica Indeterminada');
    expect(screen.getByTestId('field-empirical-success-rate')).toHaveTextContent('Sin datos empíricos');
    expect(screen.getByTestId('field-average-achievement-ratio')).toHaveTextContent('No aplicable');
    expect(screen.getByTestId('field-indeterminate-count')).toHaveTextContent('3');
  });

  // 3. Escenario Canónico 3: Renderizado en estado NO_HISTORICAL_DATA
  test('Escenario 3 (AC-2): Renderizado en estado NO_HISTORICAL_DATA', () => {
    const dossierNoData: DecisionContextDossier = {
      ...baseDossier,
      historicalFeedbackStatus: 'NO_HISTORICAL_DATA',
      totalEvaluations: 0,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      evaluatedAt: null,
    };

    render(<DecisionContextDossierCard dossier={dossierNoData} />);

    expect(screen.getByTestId('field-historical-status')).toHaveTextContent('Sin Antecedentes en Memoria');
    expect(screen.getByTestId('field-empirical-success-rate')).toHaveTextContent('Sin datos empíricos');
    expect(screen.getByTestId('field-average-achievement-ratio')).toHaveTextContent('No aplicable');
    expect(screen.getByTestId('field-evaluated-at')).toHaveTextContent('No registrada');
  });

  // 4. Escenario Canónico 4: Renderizado en estado INDETERMINATE_INPUT
  test('Escenario 4 (AC-2): Renderizado en estado INDETERMINATE_INPUT', () => {
    const dossierInputIndet: DecisionContextDossier = {
      ...baseDossier,
      historicalFeedbackStatus: 'INDETERMINATE_INPUT',
      targetMetric: null,
      metricDirection: null,
      projectedDelta: null,
      totalEvaluations: 0,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      evaluatedAt: null,
    };

    render(<DecisionContextDossierCard dossier={dossierInputIndet} />);

    expect(screen.getByTestId('field-historical-status')).toHaveTextContent('Entrada Indeterminada / Datos Incompletos');
    expect(screen.getByTestId('field-target-metric')).toHaveTextContent('No especificada');
    expect(screen.getByTestId('field-metric-direction')).toHaveTextContent('No especificada');
    expect(screen.getByTestId('field-projected-delta')).toHaveTextContent('No cuantificado');
  });

  // 5. Escenario Canónico 5: Preservación estricta de null en empiricalSuccessRate (0 ceros)
  test('Escenario 5 (AC-3): Preservación estricta de null en empiricalSuccessRate (jamás 0 ni 0%)', () => {
    const dossierNullRate: DecisionContextDossier = {
      ...baseDossier,
      empiricalSuccessRate: null,
    };

    render(<DecisionContextDossierCard dossier={dossierNullRate} />);

    const rateElement = screen.getByTestId('field-empirical-success-rate');
    expect(rateElement).toHaveTextContent('Sin datos empíricos');
    expect(rateElement).not.toHaveTextContent('0%');
    expect(rateElement).not.toHaveTextContent('0.0%');
  });

  // 6. Escenario Canónico 6: Preservación estricta de null en averageAchievementRatio (0 ceros)
  test('Escenario 6 (AC-3): Preservación estricta de null en averageAchievementRatio (jamás 0.0x)', () => {
    const dossierNullRatio: DecisionContextDossier = {
      ...baseDossier,
      averageAchievementRatio: null,
    };

    render(<DecisionContextDossierCard dossier={dossierNullRatio} />);

    const ratioElement = screen.getByTestId('field-average-achievement-ratio');
    expect(ratioElement).toHaveTextContent('No aplicable');
    expect(ratioElement).not.toHaveTextContent('0.0x');
    expect(ratioElement).not.toHaveTextContent('0x');
  });

  // 7. Escenario Canónico 7: Preservación estricta de null en projectedDelta (0 ceros)
  test('Escenario 7 (AC-3): Preservación estricta de null en projectedDelta (jamás 0)', () => {
    const dossierNullDelta: DecisionContextDossier = {
      ...baseDossier,
      projectedDelta: null,
    };

    render(<DecisionContextDossierCard dossier={dossierNullDelta} />);

    const deltaElement = screen.getByTestId('field-projected-delta');
    expect(deltaElement).toHaveTextContent('No cuantificado');
    expect(deltaElement).not.toHaveTextContent('+0');
    expect(deltaElement).not.toHaveTextContent('0');
  });

  // 8. Escenario Canónico 8: Proyección exacta de la trazabilidad
  test('Escenario 8 (AC-6): Proyección exacta de la trazabilidad (proposalId, planId, cohortKey)', () => {
    render(<DecisionContextDossierCard dossier={baseDossier} />);

    expect(screen.getByTestId('field-provenance-proposal-id')).toHaveTextContent('prop_test_001');
    expect(screen.getByTestId('field-provenance-plan-id')).toHaveTextContent('plan_sem_38');
    expect(screen.getByTestId('field-provenance-cohort-key')).toHaveTextContent(
      'PROPOSE_CREW_REASSIGNMENT::item_guadua_01::executed_qty::INCREASE'
    );
  });

  // 9. Escenario Canónico 9: Presencia incondicional del disclaimer de no autorización
  test('Escenario 9 (AC-5): Presencia incondicional del disclaimer de no autorización y revisión humana', () => {
    render(<DecisionContextDossierCard dossier={baseDossier} />);

    const banner = screen.getByTestId('governance-disclaimer-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('CONTEXTO CONSULTIVO — NO CONSTITUYE AUTORIZACIÓN DE ACCIÓN');
    expect(banner).toHaveTextContent('Requiere Decisión Humana Soberana');
  });

  // 10. Escenario Canónico 10: Ausencia demostrada de lenguaje evaluativo o normativo añadido
  test('Escenario 10 (AC-4): Ausencia demostrada de etiquetas normativas o rankings evaluativos', () => {
    render(<DecisionContextDossierCard dossier={baseDossier} />);

    const cardText = screen.getByTestId('decision-context-dossier-card').textContent || '';

    // Palabras normativas/evaluativas prohibidas
    expect(cardText).not.toMatch(/buena tasa/i);
    expect(cardText).not.toMatch(/mala tasa/i);
    expect(cardText).not.toMatch(/alta efectividad/i);
    expect(cardText).not.toMatch(/bajo riesgo/i);
    expect(cardText).not.toMatch(/riesgo alto/i);
    expect(cardText).not.toMatch(/acción recomendada/i);
    expect(cardText).not.toMatch(/favorable/i);
    expect(cardText).not.toMatch(/desfavorable/i);
    expect(cardText).not.toMatch(/conviene ejecutar/i);
  });

  // 11. Escenario Canónico 11: Preservación exacta de valores numéricos y tasas
  test('Escenario 11 (AC-1): Preservación exacta de tasas y conteos numéricos', () => {
    const customDossier: DecisionContextDossier = {
      ...baseDossier,
      empiricalSuccessRate: 0.8333,
      averageAchievementRatio: 2.054,
      totalEvaluations: 12,
      evaluatedCount: 12,
      achievedCount: 10,
      notAchievedCount: 2,
    };

    render(<DecisionContextDossierCard dossier={customDossier} />);

    expect(screen.getByTestId('field-empirical-success-rate')).toHaveTextContent('83.3%');
    expect(screen.getByTestId('field-average-achievement-ratio')).toHaveTextContent('2.05x');
    expect(screen.getByTestId('field-total-evaluations')).toHaveTextContent('12');
  });

  // 12. Escenario Canónico 12: Ausencia total de botones, handlers o triggers de mutación/ejecución
  test('Escenario 12 (AC-7): Ausencia total de botones, inputs o triggers de mutación/ejecución', () => {
    render(<DecisionContextDossierCard dossier={baseDossier} />);

    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(0);

    const inputs = screen.queryAllByRole('textbox');
    expect(inputs).toHaveLength(0);
  });
});
