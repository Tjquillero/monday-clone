/**
 * Suite de Certificación Auditorial de Factibilidad Operacional (FASE 4 Hito 2)
 *
 * Pruebas Rectoras Exigidas AUD-01 -> AUD-08:
 * AUD-01: Diagnóstico sobre P0 Real sin modificar P0.
 * AUD-02: Identificación de Conflictos con Mapeo H4 Nativo.
 * AUD-03: Evaluación One-Step H6 (DIRECTLY_MITIGABLE_BY_H6_ONE_STEP vs NOT_DIRECTLY_MITIGABLE).
 * AUD-04: Respeto a Calendario F3.1 (Domingos/Festivos como INVALID_WORKING_CALENDAR_DAY).
 * AUD-05: Determinismo Absoluto (Reporte y IDs idénticos en dos corridas).
 * AUD-06: Prueba Negativa (Cero Auto-Fix / Cero Winner).
 * AUD-07: Prueba Negativa (No Exploración Multi-step / Cero BFS/DFS / Cero H7 search space).
 * AUD-08: Prueba Negativa (No Alteración de Taxonomía H4 / Taxonomía intacta).
 */

import { auditOperationalFeasibility } from '../operationalAuditService';
import type { ScheduleCandidatePlan } from '../decisionProblemTypes';
import type { SiteResourceState } from '../types';

describe('FASE 4 Hito 2: Operational Feasibility Audit Service Suite (AUD-01 -> AUD-08)', () => {
  let mockCatalog: SiteResourceState[];
  let samplePlanP0: ScheduleCandidatePlan;

  beforeEach(() => {
    mockCatalog = [
      {
        siteGroupId: 'grp_piscina',
        siteName: 'Piscina Centro',
        persons: [
          {
            id: 'op_001',
            documentId: 'DOC-1',
            name: 'Juan Perez',
            role: 'TRACTORISTA',
            isAvailable: true,
            siteGroupId: 'grp_piscina',
          },
          {
            id: 'op_002',
            documentId: 'DOC-2',
            name: 'Maria Gomez',
            role: 'GUADAÑA',
            isAvailable: true,
            siteGroupId: 'grp_piscina',
          },
        ],
        crews: [],
        machinery: [
          {
            id: 'maq_001',
            code: 'TR-01',
            name: 'Tractor 1',
            category: 'TRACTOR',
            siteGroupId: 'grp_piscina',
            simultaneousLimit: 1,
            operatorRequirement: {
              requiredRole: 'TRACTORISTA',
              operatorCount: 1,
            },
            isAvailable: true,
          },
          {
            id: 'maq_002',
            code: 'TR-02',
            name: 'Tractor 2',
            category: 'TRACTOR',
            siteGroupId: 'grp_piscina',
            simultaneousLimit: 1,
            operatorRequirement: {
              requiredRole: 'TRACTORISTA',
              operatorCount: 1,
            },
            isAvailable: true,
          },
        ],
        machineryAvailability: [],
        totalPersonsCount: 2,
        totalAvailablePersonsCount: 2,
        totalMachineryCount: 2,
        fullyAvailableMachineryCount: 2,
      },
    ];

    samplePlanP0 = {
      candidateId: 'plan_p0_canonical_test',
      contractualReference: 'POA-2025-PISCINA',
      allocations: [
        {
          allocationId: 'alloc_001',
          demandId: 'dem_001',
          siteGroupId: 'grp_piscina',
          siteName: 'Piscina Centro',
          activityKey: 'ROCERIA_MECANIZADA',
          activityDescription: 'Rocería zona norte',
          resourceType: 'MACHINERY',
          resourceId: 'maq_001',
          resourceCodeOrName: 'TR-01',
          interval: {
            dateIso: '2025-06-02', // Lunes
            startTime: '08:00',
            endTime: '12:00',
          },
          quantity: 10,
          jornales: 1,
          machineryOperatorBinding: {
            machineryAllocationId: 'alloc_001',
            machineryId: 'maq_001',
            operatorAllocationId: 'alloc_001',
            operatorId: 'op_001',
            requiredRole: 'TRACTORISTA',
            isSatisfied: true,
          },
        },
        {
          allocationId: 'alloc_002',
          demandId: 'dem_002',
          siteGroupId: 'grp_piscina',
          siteName: 'Piscina Centro',
          activityKey: 'CORTA_CESPED',
          activityDescription: 'Corte zona sur (Domingo)',
          resourceType: 'PERSON',
          resourceId: 'op_002',
          resourceCodeOrName: 'Maria Gomez',
          interval: {
            dateIso: '2025-06-01', // Domingo 1 de Junio 2025
            startTime: '08:00',
            endTime: '12:00',
          },
          quantity: 5,
          jornales: 1,
        },
      ],
      demands: [
        {
          allocationId: 'dem_001',
          siteGroupId: 'grp_piscina',
          siteName: 'Piscina Centro',
          activityKey: 'ROCERIA_MECANIZADA',
          activityDescription: 'Rocería zona norte',
          resourceType: 'MACHINERY',
          resourceId: 'maq_001',
          resourceCodeOrName: 'TR-01',
          interval: {
            dateIso: '2025-06-02',
            startTime: '08:00',
            endTime: '12:00',
          },
          quantity: 10,
          jornales: 1,
        },
        {
          allocationId: 'dem_002',
          siteGroupId: 'grp_piscina',
          siteName: 'Piscina Centro',
          activityKey: 'CORTA_CESPED',
          activityDescription: 'Corte zona sur (Domingo)',
          resourceType: 'PERSON',
          resourceId: 'op_002',
          resourceCodeOrName: 'Maria Gomez',
          interval: {
            dateIso: '2025-06-01',
            startTime: '08:00',
            endTime: '12:00',
          },
          quantity: 5,
          jornales: 1,
        },
      ],
    };
  });

  test('AUD-01: Diagnóstico sobre P0 Real sin modificar P0 (Inmutabilidad)', () => {
    const planP0Copy = JSON.parse(JSON.stringify(samplePlanP0));

    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    expect(report).toBeDefined();
    expect(report.sourcePlanId).toBe('plan_p0_canonical_test');
    expect(report.totalAllocationsEvaluated).toBe(2);
    expect(samplePlanP0).toEqual(planP0Copy);
  });

  test('AUD-02: Identificación de Conflictos Reales con Mapeo H4 Nativo', () => {
    samplePlanP0.allocations.push({
      allocationId: 'alloc_003',
      demandId: 'dem_003',
      siteGroupId: 'grp_piscina',
      siteName: 'Piscina Centro',
      activityKey: 'ROCERIA_COMPLEMENTARIA',
      activityDescription: 'Rocería complementaria colisionante',
      resourceType: 'MACHINERY',
      resourceId: 'maq_001',
      resourceCodeOrName: 'TR-01',
      interval: {
        dateIso: '2025-06-02',
        startTime: '08:00',
        endTime: '12:00',
      },
      quantity: 5,
      jornales: 1,
    });

    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    expect(report.totalConflictsDetected).toBeGreaterThan(0);
    const simultaneityEntries = report.auditEntries.filter(
      (e) => e.violation.category === 'SIMULTANEITY_OVERLAP'
    );
    expect(simultaneityEntries.length).toBeGreaterThan(0);
    expect(simultaneityEntries[0].violation.nativeConstraintCode).toBe(
      'SIMULTANEITY_TEMPORAL_COLLISION'
    );
  });

  test('AUD-03: Evaluación One-Step H6 (DIRECTLY_MITIGABLE_BY_H6_ONE_STEP vs NOT_DIRECTLY_MITIGABLE)', () => {
    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    const sundayEntry = report.auditEntries.find(
      (e) => e.diagnosticStatus.allocationId === 'alloc_002'
    );
    expect(sundayEntry).toBeDefined();
    expect(sundayEntry?.violation.category).toBe('INVALID_WORKING_CALENDAR_DAY');
    expect(sundayEntry?.reachability.status).toBe('DIRECTLY_MITIGABLE_BY_H6_ONE_STEP');
    expect(sundayEntry?.reachability.testedTransformationType).toBe('SHIFT_TIME_INTERVAL');
  });

  test('AUD-04: Respeto de Festivos/Domingos (HARD_CONSTRAINT sin auto-fix)', () => {
    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    const calendarConflict = report.auditEntries.find(
      (e) => e.violation.category === 'INVALID_WORKING_CALENDAR_DAY'
    );

    expect(calendarConflict).toBeDefined();
    expect(calendarConflict?.violation.severity).toBe('HARD_CONSTRAINT');
    expect(calendarConflict?.violation.nativeConstraintCode).toBe('INVALID_WORKING_CALENDAR_DAY');
    expect(samplePlanP0.allocations[1].interval.dateIso).toBe('2025-06-01');
  });

  test('AUD-05: Determinismo Absoluto Diagnóstico (Mismo P0 -> Mismo Reporte e IDs)', () => {
    const report1 = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);
    const report2 = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    expect(report1).toEqual(report2);
    expect(report1.auditEntries.map((e) => e.auditEntryId)).toEqual(
      report2.auditEntries.map((e) => e.auditEntryId)
    );
  });

  test('AUD-06: Prueba Negativa (Cero Auto-Fix / Cero Winner)', () => {
    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    expect(report).not.toHaveProperty('winnerCandidate');
    expect(report).not.toHaveProperty('recommendedPlan');
    expect(report).not.toHaveProperty('autoFixedAllocations');
    expect(samplePlanP0.allocations.length).toBe(2);
  });

  test('AUD-07: Prueba Negativa (No Exploración Multi-step / Cero BFS/DFS)', () => {
    const startMs = Date.now();
    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);
    const durationMs = Date.now() - startMs;

    expect(report).toBeDefined();
    expect(durationMs).toBeLessThan(100);
    expect(report).not.toHaveProperty('searchSpaceH7');
    expect(report).not.toHaveProperty('exploredNodes');
  });

  test('AUD-08: Prueba Negativa (No Alteración de Taxonomía H4)', () => {
    const report = auditOperationalFeasibility(samplePlanP0, mockCatalog, []);

    report.auditEntries.forEach((entry) => {
      expect([
        'CONTRACTUAL_QUANTITY_MISMATCH',
        'INEXISTENT_CATALOG_RESOURCE',
        'UNBOUND_OPERATOR_DEPENDENCY',
        'SIMULTANEITY_TEMPORAL_COLLISION',
        'INVALID_WORKING_CALENDAR_DAY',
        'CARDINALITY_DUPLICATION',
        'UNDETERMINED_RESOURCE_CONTEXT',
      ]).toContain(entry.violation.nativeConstraintCode);
    });
  });
});
