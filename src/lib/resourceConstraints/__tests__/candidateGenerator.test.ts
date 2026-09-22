import { applyCandidateTransformation } from '../candidateGenerator';
import { getSiteResourceState } from '../finiteResourceCatalog';
import { buildResourceTemporalAllocation } from '../temporalResourceAllocation';
import type {
  ResourceDemandAllocation,
  SiteResourceState,
  FinitePerson,
  FiniteMachinery,
  FiniteCrew,
} from '../types';
import type { ScheduleCandidatePlan } from '../decisionProblemTypes';
import type { CandidateTransformation } from '../searchSpaceTypes';

describe('FASE 3 Hito 6: Espacio de Búsqueda y Generador Puro de Candidatos', () => {
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
    {
      id: 'pers_tractorista_3',
      documentId: '10982343',
      name: 'Juan Tractorista 2',
      role: 'TRACTORISTA',
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

  test('1. Transformación Temporal Válida (SHIFT_TIME_INTERVAL)', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    // 2026-09-11 es Viernes (día hábil)
    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_shift_001',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    expect(result.success).toBe(true);
    expect(result.derivedCandidate).toBeDefined();
    expect(result.derivedCandidate?.allocations[0].interval.dateIso).toBe('2026-09-11');
    expect(result.derivationTrace?.parentCandidateId).toBe('plan_origin');
  });

  test('2. Rechazo F3.1: Desplazamiento a Domingo (2026-09-13)', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    // 2026-09-13 es Domingo
    const shiftSunday: CandidateTransformation = {
      transformationId: 'trans_shift_sunday',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-13', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftSunday, mockCatalog);

    expect(result.success).toBe(false);
    expect(result.rejectionReason).toContain('Domingo (día no hábil)');
  });

  test('3. Rechazo F3.1: Desplazamiento a Festivo Colombiano', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftHoliday: CandidateTransformation = {
      transformationId: 'trans_shift_holiday',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-07-20', startTime: '08:00', endTime: '12:00' }, // 20 de Julio
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftHoliday, mockCatalog, ['2026-07-20']);

    expect(result.success).toBe(false);
    expect(result.rejectionReason).toContain('Festivo colombiano');
  });

  test('4. R-SOL-02: Conservación Estricta de Cantidad Contractual y Jornales', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
      demands: [sampleDemandPerson],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_shift_002',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    expect(result.success).toBe(true);
    expect(result.derivedCandidate?.allocations[0].quantity).toBe(1000);
    expect(result.derivedCandidate?.allocations[0].jornales).toBe(1);
  });

  test('5. Reasignación de Recurso Equi-Rol Válida (REASSIGN_RESOURCE_EQUI_ROLE)', () => {
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]); // Carlos Tractorista
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [allocOp],
    };

    const reassignTransformation: CandidateTransformation = {
      transformationId: 'trans_reassign_001',
      transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
      allocationId: allocOp.allocationId,
      reassignParams: {
        newResourceId: 'pers_tractorista_3', // Juan Tractorista 2
        newResourceCodeOrName: 'Juan Tractorista 2',
      },
    };

    const result = applyCandidateTransformation(candidateA, reassignTransformation, mockCatalog);

    expect(result.success).toBe(true);
    expect(result.derivedCandidate?.allocations[0].resourceId).toBe('pers_tractorista_3');
  });

  test('6. R-SOL-08: Rechazo de Recurso Inexistente en Catálogo Hito 1', () => {
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [allocOp],
    };

    const reassignInexistent: CandidateTransformation = {
      transformationId: 'trans_reassign_inexistent',
      transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
      allocationId: allocOp.allocationId,
      reassignParams: {
        newResourceId: 'pers_fantasma_999',
        newResourceCodeOrName: 'Tractorista Fantasma',
      },
    };

    const result = applyCandidateTransformation(candidateA, reassignInexistent, mockCatalog);

    expect(result.success).toBe(false);
    expect(result.rejectionReason).toContain('no existe en el catálogo activo');
  });

  test('7. Vinculación Explícita de Operador Requerido (BIND_OPERATOR_DEPENDENCY)', () => {
    const allocMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);

    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [allocMach, allocOp],
    };

    const bindTransformation: CandidateTransformation = {
      transformationId: 'trans_bind_001',
      transformationType: 'BIND_OPERATOR_DEPENDENCY',
      allocationId: allocMach.allocationId,
      bindParams: {
        operatorAllocationId: allocOp.allocationId,
        operatorId: 'pers_tractorista_1',
      },
    };

    const result = applyCandidateTransformation(candidateA, bindTransformation, mockCatalog);

    expect(result.success).toBe(true);
    expect(result.derivedCandidate?.allocations[0].machineryOperatorBinding?.isSatisfied).toBe(true);
    expect(result.derivedCandidate?.allocations[0].machineryOperatorBinding?.operatorId).toBe('pers_tractorista_1');
  });

  test('8. R-SOL-10: Inmutabilidad del Candidato Padre y Determinismo Absoluto', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const copyA = JSON.parse(JSON.stringify(candidateA));
    const catalogCopy = JSON.parse(JSON.stringify(mockCatalog));

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_shift_det',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    const run1 = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);
    const run2 = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);
    jest.useRealTimers();

    // Inmutabilidad (R-SOL-10)
    expect(candidateA).toEqual(copyA);
    expect(mockCatalog).toEqual(catalogCopy);

    // Determinismo
    expect(run1).toEqual(run2);
  });

  test('9. Trazabilidad Completa DerivationTrace (Padre -> Transformación -> Hijo)', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_parent_123',
      allocations: [alloc],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_trace_456',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    expect(result.derivationTrace).toBeDefined();
    expect(result.derivationTrace?.parentCandidateId).toBe('plan_parent_123');
    expect(result.derivationTrace?.transformationId).toBe('trans_trace_456');
    expect(result.derivationTrace?.changedAllocationId).toBe(alloc.allocationId);
    expect(result.derivationTrace?.previousValue).toContain('2026-09-10');
    expect(result.derivationTrace?.newValue).toContain('2026-09-11');
  });

  test('10. FRONTERA NEGATIVA (NO BUSCA): Aplicación 1:1 Retorna Unico Candidato (Cero Bucles)', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_shift_single',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    // Retorna estrictamente 1 candidato derivado, NO un arreglo ni colección de exploración
    expect(result.derivedCandidate).toBeDefined();
    expect(Array.isArray(result.derivedCandidate)).toBe(false);
  });

  test('11. FRONTERA NEGATIVA (NO OPTIMIZA): Cero Llamadas a Hito 5 Objective Evaluator', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_no_opt',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    // El resultado no posee puntuaciones, scoring ni comparativas lexicográficas
    expect(result).not.toHaveProperty('vectorA');
    expect(result).not.toHaveProperty('objectiveScore');
  });

  test('12. FRONTERA NEGATIVA (NO REPROGRAMA): Cero Intentos de Auto-Corregir Conflictos Hito 4', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_no_autofix',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    // El generador aplica exactamente lo solicitado, NO prueba fechas adicionales si falla
    expect(result.derivedCandidate?.allocations[0].interval.dateIso).toBe('2026-09-11');
  });

  test('13. FRONTERA NEGATIVA (NO CREA CAPACIDAD): Cero Recuentos o Personas Adicionales', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_no_cap',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    expect(result.derivedCandidate?.allocations.length).toBe(1); // Mismo número de asignaciones
  });

  test('14. Rechazo por Asignación Objetivo Inexistente en Candidato', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftInexistentAlloc: CandidateTransformation = {
      transformationId: 'trans_inexistent_alloc',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: 'alloc_fantasma_999',
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftInexistentAlloc, mockCatalog);

    expect(result.success).toBe(false);
    expect(result.rejectionReason).toContain('no existe en el candidato');
  });

  test('15. Rechazo por Parámetros Ausentes en Transformación', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const invalidTransformation: CandidateTransformation = {
      transformationId: 'trans_no_params',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
    };

    const result = applyCandidateTransformation(candidateA, invalidTransformation, mockCatalog);

    expect(result.success).toBe(false);
    expect(result.rejectionReason).toContain('shiftParams no especificados');
  });

  test('16. Inmunidad a Solucionadores / Optimizadores Explicita', () => {
    const alloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_origin',
      allocations: [alloc],
    };

    const shiftTransformation: CandidateTransformation = {
      transformationId: 'trans_pure_check',
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: { dateIso: '2026-09-11', startTime: '08:00', endTime: '12:00' },
      },
    };

    const result = applyCandidateTransformation(candidateA, shiftTransformation, mockCatalog);

    expect(result.success).toBe(true);
    // Verificación de que NO se retornan estados de ejecución de solver Hito 7
    expect(result).not.toHaveProperty('solverStatus');
  });
});
