import { evaluateScheduleFeasibility } from '../feasibilityEvaluator';
import { getSiteResourceState } from '../finiteResourceCatalog';
import { buildResourceTemporalAllocation, bindMachineryOperatorAllocation } from '../temporalResourceAllocation';
import type {
  ResourceDemandAllocation,
  SiteResourceState,
  FinitePerson,
  FiniteMachinery,
  FiniteCrew,
} from '../types';
import type { ScheduleCandidatePlan } from '../decisionProblemTypes';

describe('FASE 3 Hito 4: Especificación Formal del Problema de Decisión y Función de Factibilidad', () => {
  const mockPersons: FinitePerson[] = [
    {
      id: 'pers_tractorista_1',
      documentId: '10982341',
      name: 'Carlos Tractorista',
      role: 'TRACTORISTA',
      isAvailable: true,
      siteGroupId: 'group_country_001',
    },
    {
      id: 'pers_operario_2',
      documentId: '10982342',
      name: 'María Operaria',
      role: 'OPERARIO',
      isAvailable: true,
      siteGroupId: 'group_country_001',
    },
  ];

  const mockCrews: FiniteCrew[] = [
    {
      id: 'crew_001',
      name: 'Cuadrilla Country',
      code: 'CWD-01',
      leaderId: 'pers_tractorista_1',
      memberIds: ['pers_tractorista_1', 'pers_operario_2'],
      siteGroupId: 'group_country_001',
      isAvailable: true,
    },
  ];

  const mockMachinery: FiniteMachinery[] = [
    {
      id: 'mach_tractor_1',
      code: 'TR-001',
      name: 'Tractor Agrícola 1',
      category: 'TRACTOR',
      siteGroupId: 'group_country_001',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'TRACTORISTA',
        operatorCount: 1,
      },
      isAvailable: true,
    },
  ];

  const mockSiteState: SiteResourceState = getSiteResourceState(
    'group_country_001',
    'PLAYA DEL COUNTRY',
    mockPersons,
    mockCrews,
    mockMachinery
  );

  const mockCatalog = [mockSiteState];

  const sampleDemandPerson: ResourceDemandAllocation = {
    allocationId: 'demand_001',
    siteGroupId: 'group_country_001',
    siteName: 'PLAYA DEL COUNTRY',
    activityKey: '1',
    activityDescription: 'Limpieza Manual de Playa',
    resourceType: 'PERSON',
    resourceId: 'pers_operario_2',
    resourceCodeOrName: 'María Operaria',
    interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
    quantity: 1000,
    jornales: 1,
  };

  const sampleDemandMachinery: ResourceDemandAllocation = {
    allocationId: 'demand_002',
    siteGroupId: 'group_country_001',
    siteName: 'PLAYA DEL COUNTRY',
    activityKey: '2',
    activityDescription: 'Mecanizado con Tractor',
    resourceType: 'MACHINERY',
    resourceId: 'mach_tractor_1',
    resourceCodeOrName: 'TR-001',
    interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
    quantity: 500,
    jornales: 0.5,
  };

  test('1. Candidate Plan Factible (FEASIBLE)', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const allocMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMach = bindMachineryOperatorAllocation(allocMach, allocOp);

    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_feasible_001',
      contractualReference: 'POA_2026_COUNTRY',
      allocations: [allocPerson, boundMach, allocOp],
      demands: [sampleDemandPerson, sampleDemandMachinery, sampleDemandPerson],
    };

    const result = evaluateScheduleFeasibility(candidatePlan, mockCatalog);

    expect(result.status).toBe('FEASIBLE');
    expect(result.isFeasible).toBe(true);
    expect(result.violationsCount).toBe(0);
    expect(result.layerStatus.structural.isFeasible).toBe(true);
    expect(result.layerStatus.temporal.isFeasible).toBe(true);
    expect(result.layerStatus.operational.isFeasible).toBe(true);
  });

  test('2. FRONTERA NEGATIVA (R-DEC-01 & R-DEC-04): Discrepancia en Cantidad Contractual', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    // Alterar la cantidad asignada para forzar discrepancia contractual
    allocPerson.quantity = 870; // La demanda exige 1000

    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_qty_mismatch',
      allocations: [allocPerson],
      demands: [sampleDemandPerson],
    };

    const result = evaluateScheduleFeasibility(candidatePlan, mockCatalog);

    expect(result.status).toBe('INFEASIBLE');
    expect(result.isFeasible).toBe(false);
    expect(result.violations.some((v) => v.constraintType === 'CONTRACTUAL_QUANTITY_MISMATCH')).toBe(true);
  });

  test('3. FRONTERA NEGATIVA (R-DEC-05): Recurso Inexistente en Catálogo', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    allocPerson.resourceId = 'pers_fantasma_999';

    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_inexistent_resource',
      allocations: [allocPerson],
    };

    const result = evaluateScheduleFeasibility(candidatePlan, mockCatalog);

    expect(result.status).toBe('INFEASIBLE');
    expect(result.isFeasible).toBe(false);
    expect(result.layerStatus.structural.isFeasible).toBe(false);
    expect(result.violations.some((v) => v.constraintType === 'INEXISTENT_CATALOG_RESOURCE')).toBe(true);
  });

  test('4. FRONTERA NEGATIVA (R-DEC-07): Maquinaria Sin Operador Vinculado', () => {
    const unboundMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);

    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_unbound_op',
      allocations: [unboundMach],
    };

    const result = evaluateScheduleFeasibility(candidatePlan, mockCatalog);

    expect(result.status).toBe('INFEASIBLE');
    expect(result.isFeasible).toBe(false);
    expect(result.layerStatus.operational.isFeasible).toBe(false);
    expect(result.violations.some((v) => v.constraintType === 'UNBOUND_OPERATOR_DEPENDENCY')).toBe(true);
  });

  test('5. FRONTERA NEGATIVA (R-DEC-06 & R-DEC-12): Colisión de Simultaneidad Detectada Sin Auto-Resolución', () => {
    // Solapamiento de Carlos Tractorista en dos actividades
    const demandA: ResourceDemandAllocation = {
      allocationId: 'demand_a',
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      activityKey: '1',
      activityDescription: 'Actividad A',
      resourceType: 'PERSON',
      resourceId: 'pers_tractorista_1',
      resourceCodeOrName: 'Carlos Tractorista',
      interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
      quantity: 100,
      jornales: 0.1,
    };

    const demandB: ResourceDemandAllocation = {
      allocationId: 'demand_b',
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      activityKey: '2',
      activityDescription: 'Actividad B',
      resourceType: 'PERSON',
      resourceId: 'pers_tractorista_1',
      resourceCodeOrName: 'Carlos Tractorista',
      interval: { dateIso: '2026-09-10', startTime: '09:00', endTime: '11:00' },
      quantity: 100,
      jornales: 0.1,
    };

    const allocA = buildResourceTemporalAllocation(demandA, mockPersons[0]);
    const allocB = buildResourceTemporalAllocation(demandB, mockPersons[0]);

    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_collision',
      allocations: [allocA, allocB],
    };

    const result = evaluateScheduleFeasibility(candidatePlan, mockCatalog);

    expect(result.status).toBe('INFEASIBLE');
    expect(result.isFeasible).toBe(false);
    expect(result.layerStatus.temporal.isFeasible).toBe(false);
    expect(result.violations.some((v) => v.constraintType === 'SIMULTANEITY_TEMPORAL_COLLISION')).toBe(true);

    // Inmutabilidad estricta (R-DEC-12): El evaluador NO modificó las franjas horarias
    expect(allocA.interval.startTime).toBe('08:00');
    expect(allocB.interval.startTime).toBe('09:00');
  });

  test('6. ESTADO UNDETERMINED: Evaluación contra Catálogo Ausente / Indeterminado', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);

    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_undet',
      allocations: [allocPerson],
    };

    // Evaluar contra catálogo vacío []
    const result = evaluateScheduleFeasibility(candidatePlan, []);

    expect(result.status).toBe('UNDETERMINED');
    expect(result.isFeasible).toBe(false);
    expect(result.undeterminedCount).toBe(1);
    expect(result.violations.some((v) => v.constraintType === 'UNDETERMINED_RESOURCE_CONTEXT')).toBe(true);
  });

  test('7. R-DEC-10 & R-DEC-11: Inmutabilidad y Determinismo Absoluto', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidatePlan: ScheduleCandidatePlan = {
      candidateId: 'plan_det',
      allocations: [allocPerson],
    };

    const planCopy = JSON.parse(JSON.stringify(candidatePlan));
    const catalogCopy = JSON.parse(JSON.stringify(mockCatalog));

    const run1 = evaluateScheduleFeasibility(candidatePlan, mockCatalog);
    const run2 = evaluateScheduleFeasibility(candidatePlan, mockCatalog);

    // Inmutabilidad (R-DEC-10)
    expect(candidatePlan).toEqual(planCopy);
    expect(mockCatalog).toEqual(catalogCopy);

    // Determinismo (R-DEC-11)
    expect(run1).toEqual(run2);
  });
});
