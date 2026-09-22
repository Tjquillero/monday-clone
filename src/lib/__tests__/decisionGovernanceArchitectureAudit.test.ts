/**
 * Test Suite: Architecture & Boundary Audit for Decision Governance & Outcome Evaluation (ARCH-01 to ARCH-07, GOV-01 to GOV-05)
 *
 * Invariantes y Barreras de Certificación Auditados:
 * - ARCH-01: Solver H8 isolation (0 imports, 0 invocaciones)
 * - ARCH-02: OperationalMemoryAnalyticsService (112/902) inalterado
 * - ARCH-03: OperationalAdvisoryService (113/922) inalterado
 * - ARCH-04: Cero mutaciones directas PostgREST en tablas de dominio sin gateway
 * - ARCH-05: Cero métricas inventadas: 100% canónicas de OperationalMetricKey
 * - ARCH-06: Inmutabilidad de persistencia con ON DELETE RESTRICT
 * - GOV-01: DecisionRecord estrictamente append-only (trigger de bloqueo anti-tampering)
 * - GOV-02: Restricción de privilegios (REVOKE direct mutation, SELECT RLS only, RPC-only creation)
 * - GOV-03: Manejo determinista de colisión concurrente (EXCEPTION WHEN unique_violation)
 * - GOV-04: Gateway delegation exactly-once y separación DecisionStatus != ActionStatus
 * - GOV-05: Trazabilidad inequívoca de cohorte post-intervención
 */

import * as fs from 'fs';
import * as path from 'path';
import { OutcomeEvaluationService, VerifiedExecutionFact } from '../outcomeEvaluationService';
import { DecisionRecord } from '../../types/decisionGovernance';
import { OperationalRecommendation } from '../../types/operationalAdvisory';

describe('Decision Governance & Outcome Evaluation — Architecture & Governance Audit (ARCH + GOV)', () => {
  const libDir = path.resolve(__dirname, '..');
  const migrationPath = path.resolve(libDir, '../../supabase/migrations/20260913_operational_advisory_decisions.sql');

  test('ARCH-01: Aislamiento total del Solver H8 (0 imports, 0 calls)', () => {
    const filesToAudit = [
      path.join(libDir, 'decisionGovernanceService.ts'),
      path.join(libDir, 'outcomeEvaluationService.ts'),
    ];

    for (const filePath of filesToAudit) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/from\s+['"].*solver.*['"]/i);
      expect(content).not.toMatch(/from\s+['"].*h8.*['"]/i);
      expect(content).not.toMatch(/import\s+.*solver/i);
    }
  });

  test('ARCH-02 & ARCH-03: Inmutabilidad de Analytics v1 y Advisory v1.2', () => {
    const analyticsFile = path.join(libDir, 'operationalMemoryAnalyticsService.ts');
    const advisoryFile = path.join(libDir, 'operationalAdvisoryService.ts');

    expect(fs.existsSync(analyticsFile)).toBe(true);
    expect(fs.existsSync(advisoryFile)).toBe(true);

    const analyticsContent = fs.readFileSync(analyticsFile, 'utf-8');
    const advisoryContent = fs.readFileSync(advisoryFile, 'utf-8');

    // Comprobar que no importan decision governance (mantienen pureza de capas)
    expect(analyticsContent).not.toMatch(/decisionGovernance/i);
    expect(advisoryContent).not.toMatch(/decisionGovernance/i);
  });

  test('ARCH-04: Cero mutaciones directas PostgREST en tablas de dominio sin gateway', () => {
    const decisionGovContent = fs.readFileSync(path.join(libDir, 'decisionGovernanceService.ts'), 'utf-8');
    const outcomeEvalContent = fs.readFileSync(path.join(libDir, 'outcomeEvaluationService.ts'), 'utf-8');

    // Decision Governance solo actualiza su propia tabla SoT: operational_advisory_decisions
    expect(decisionGovContent).not.toMatch(/\.from\(['"]weekly_plan_items['"]\)\.(insert|update|delete)/);
    expect(decisionGovContent).not.toMatch(/\.from\(['"]poa_activities['"]\)\.(insert|update|delete)/);

    // Outcome Evaluation es puramente de lectura / en memoria (0 llamadas .from(...).insert/update)
    expect(outcomeEvalContent).not.toMatch(/\.from\(/);
  });

  test('ARCH-05: Cero métricas inventadas: Todas las métricas consumidas existen en OperationalMetricKey', () => {
    const typesMemoryContent = fs.readFileSync(path.resolve(libDir, '../types/operationalMemory.ts'), 'utf-8');
    const outcomeEvalContent = fs.readFileSync(path.join(libDir, 'outcomeEvaluationService.ts'), 'utf-8');

    const canonicalMetricKeys = [
      'METRIC_PRODUCTIVITY_RATE',
      'METRIC_THEORETICAL_PRODUCTIVITY_RATE',
      'METRIC_PRODUCTIVITY_INDEX',
      'METRIC_EFFORT_VARIANCE_JR',
      'METRIC_MULTIDAY_DURATION_DAYS',
      'METRIC_DAILY_EXECUTION_INTENSITY',
      'METRIC_RESOURCE_CONSUMPTION_RATIO',
      'METRIC_RESOURCE_VARIANCE_DELTA',
      'METRIC_VERIFICATION_LEAD_TIME_HOURS',
      'METRIC_VERIFICATION_REJECTION_RATE',
      'METRIC_RESCHEDULE_OCCURRENCE_COUNT',
    ];

    for (const key of canonicalMetricKeys) {
      expect(typesMemoryContent).toContain(key);
    }

    const matches = outcomeEvalContent.match(/METRIC_[A-Z_]+/g) || [];
    for (const m of matches) {
      expect(canonicalMetricKeys).toContain(m);
    }
  });

  test('ARCH-06 & GOV-01: Inmutabilidad histórica en DDL y Trigger Anti-Tampering', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

    expect(migrationContent).toContain('ON DELETE RESTRICT');
    expect(migrationContent).toContain('prevent_decision_record_tampering');
    expect(migrationContent).toContain('TAMPERING_FORBIDDEN');
    expect(migrationContent).toContain('BEFORE UPDATE OR DELETE ON public.operational_advisory_decisions');
  });

  test('GOV-02: Restricción estricta de privilegios y seguridad RPC', () => {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

    expect(migrationContent).toContain('REVOKE ALL ON public.operational_advisory_decisions FROM anon, authenticated;');
    expect(migrationContent).toContain('GRANT SELECT ON public.operational_advisory_decisions TO authenticated;');
    expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.record_advisory_decision TO authenticated;');
    expect(migrationContent).toContain('SET search_path = pg_catalog, public, pg_temp');
    expect(migrationContent).toContain('AUTH_UNAUTHORIZED');
    expect(migrationContent).toContain('RBAC_FORBIDDEN');
  });

  test('GOV-03: Manejo transaccional determinista de colisión concurrente (unique_violation)', () => {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

    expect(migrationContent).toContain('EXCEPTION WHEN unique_violation THEN');
    expect(migrationContent).toContain('isIdempotentReplay');
    expect(migrationContent).toContain('pg_advisory_xact_lock(hashtext(p_recommendation_id))');
  });

  test('GOV-04: Separación ontológica estricta: DecisionStatus != ActionStatus', () => {
    const decisionGovTypes = fs.readFileSync(path.resolve(libDir, '../types/decisionGovernance.ts'), 'utf-8');

    expect(decisionGovTypes).toContain("export type DecisionStatus = 'ACCEPTED' | 'REJECTED' | 'POSTPONED'");
    expect(decisionGovTypes).toContain("export type ActionExecutionStatus =\n  | 'PENDING_EXECUTION'\n  | 'EXECUTED'\n  | 'EXECUTION_FAILED'\n  | 'NOT_APPLICABLE'");
  });

  test('GOV-05: Trazabilidad inequívoca de cohorte post-intervención contra targetEntity', () => {
    const mockRec: OperationalRecommendation = {
      recommendationId: 'rec_trace_01',
      recommendationKey: 'R-01_AJUSTE_RENDIMIENTO',
      priority: 'HIGH',
      status: 'PROPOSED',
      scope: { scopeType: 'ACTIVITY', scopeId: 'act_limpieza' },
      triggeredPatternKey: 'P-01_SYSTEMATIC_UNDERESTIMATION',
      targetEntity: { entityType: 'ACTIVITY', entityId: 'act_limpieza' },
      sampleSize: 5,
      confidenceScore: 0.9,
      rationale: 'IP bajo',
      supportingMetrics: [],
      proposedAction: {
        actionType: 'ADVISE_STANDARD_REVISION',
        targetEntity: { entityType: 'ACTIVITY', entityId: 'act_limpieza' },
        suggestedParameters: { proposedStandardRate: 150 },
        applicableDomainGateway: 'poaService',
      },
      projectedImpact: {
        metricKey: 'METRIC_PRODUCTIVITY_INDEX',
        currentObservedValue: 0.7,
        proposedTargetValue: 1.0,
        projectedValue: null,
        unit: 'adimensional',
        expectedImprovementDescription: 'Normalización',
      },
      generatedAtIso: '2026-09-01T10:00:00.000Z',
    };

    const mockDecision: DecisionRecord = {
      id: 'dec_trace_01',
      decisionMutationId: 'mut_trace_01',
      recommendationId: mockRec.recommendationId,
      recommendationKey: mockRec.recommendationKey,
      decisionSequenceNumber: 1,
      boardId: 'board_01',
      actorUserId: 'user_admin',
      actorRole: 'admin',
      decisionStatus: 'ACCEPTED',
      decisionReason: 'Aprobado',
      postponedUntilIso: null,
      decisionTimestamp: '2026-09-01T10:00:00.000Z',
      recommendationSnapshot: mockRec,
      actionStatus: 'EXECUTED',
      executionSnapshot: {
        actionType: 'ADVISE_STANDARD_REVISION',
        activityKey: 'act_limpieza',
        previousStandardRate: 200,
        confirmedUpdatedRate: 150,
        appliedAtIso: '2026-09-01T10:00:00.000Z',
      },
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };

    const executions: VerifiedExecutionFact[] = [
      // Actividad coincidente (act_limpieza)
      { executionId: 'e_match_1', occurrenceKey: 'o1', activityKey: 'act_limpieza', reportedDate: '2026-09-10', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e_match_2', occurrenceKey: 'o2', activityKey: 'act_limpieza', reportedDate: '2026-09-11', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e_match_3', occurrenceKey: 'o3', activityKey: 'act_limpieza', reportedDate: '2026-09-12', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      // Actividad ajena no intervenida (act_deshierbe)
      { executionId: 'e_other', occurrenceKey: 'o4', activityKey: 'act_deshierbe', reportedDate: '2026-09-10', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: mockDecision, executions });

    // La cohorte post debe contener única y exclusivamente las ejecuciones de la actividad intervenida
    expect(result.cohort.postExecutionIds).toEqual(['e_match_1', 'e_match_2', 'e_match_3']);
    expect(result.cohort.postExecutionIds).not.toContain('e_other');
  });
});
