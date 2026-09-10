import {
  buildResourceTemporalAllocation,
  bindMachineryOperatorAllocation,
  validateResourceTemporalAllocations,
} from '../temporalResourceAllocation';
import { getSiteResourceState } from '../finiteResourceCatalog';
import type {
  ResourceDemandAllocation,
  SiteResourceState,
  FinitePerson,
  FiniteMachinery,
  FiniteCrew,
  ResourceTemporalAllocation,
} from '../types';

describe('FASE 3 Hito 3: Modelo de Asignación Temporal de Recursos', () => {
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

  const mockCountryState: SiteResourceState = getSiteResourceState(
    'group_country_001',
    'PLAYA DEL COUNTRY',
    mockPersons,
    mockCrews,
    mockMachinery
  );

  const mockCatalog = [mockCountryState];

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
    origin: {
      sourceSheet: 'CRONOGRAMA 2025',
      sourceRow: 14,
      colOpLetter: 'F',
      colCantLetter: 'G',
      siteName: 'PLAYA DEL COUNTRY',
      activityDescription: 'Limpieza Manual de Playa',
    },
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

  test('1. R-ALLOC-01 & R-ALLOC-03: Construcción de Asignación Vinculada con Identidad Estable', () => {
    const allocation = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);

    expect(allocation.allocationId).toBe('alloc_demand_001_pers_operario_2');
    expect(allocation.demandId).toBe('demand_001'); // Separación Demanda -> Asignación (R-ALLOC-03)
    expect(allocation.resourceId).toBe('pers_operario_2'); // Identidad estable (R-ALLOC-01)
    expect(allocation.resourceType).toBe('PERSON');
    expect(allocation.interval.dateIso).toBe('2026-09-10');
    expect(allocation.origin?.sourceRow).toBe(14); // Trazabilidad (R-ALLOC-06)
  });

  test('2. R-ALLOC-04: Expresión Explícita de Dependencia Maquinaria -> Operador', () => {
    const machAllocation = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);

    // Inicialmente no vinculada
    expect(machAllocation.machineryOperatorBinding).toBeDefined();
    expect(machAllocation.machineryOperatorBinding?.isSatisfied).toBe(false);

    // Vinculación explícita mediante bindMachineryOperatorAllocation
    const opAllocation = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMachAllocation = bindMachineryOperatorAllocation(machAllocation, opAllocation);

    expect(boundMachAllocation.machineryOperatorBinding?.isSatisfied).toBe(true);
    expect(boundMachAllocation.machineryOperatorBinding?.operatorId).toBe('pers_tractorista_1');
    expect(boundMachAllocation.machineryOperatorBinding?.operatorAllocationId).toBe(opAllocation.allocationId);
  });

  test('3. R-ALLOC-07: Soporte para Múltiples Recursos por Demanda / Actividad', () => {
    const personAlloc = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const machAlloc = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);

    const result = validateResourceTemporalAllocations([personAlloc, machAlloc], mockCatalog);

    expect(result.totalAllocationsEvaluated).toBe(2);
  });

  test('4. FRONTERA NEGATIVA (R-ALLOC-01): Falsa Identidad Inexistente o Vacía', () => {
    const invalidAlloc: ResourceTemporalAllocation = {
      allocationId: 'alloc_invalid_id',
      demandId: 'demand_001',
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      activityKey: '1',
      activityDescription: 'Actividad Fantasma',
      resourceId: '', // Identidad vacía
      resourceType: 'PERSON',
      resourceCodeOrName: 'Sin Nombre',
      interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
      quantity: 100,
      jornales: 0.1,
    };

    const result = validateResourceTemporalAllocations([invalidAlloc], mockCatalog);

    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.issueType === 'MISSING_STABLE_IDENTITY')).toBe(true);
  });

  test('5. FRONTERA NEGATIVA (R-ALLOC-02): Franja Temporal Ausente o Inválida', () => {
    const noIntervalAlloc: ResourceTemporalAllocation = {
      allocationId: 'alloc_no_interval',
      demandId: 'demand_001',
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      activityKey: '1',
      activityDescription: 'Actividad Sin Fecha',
      resourceId: 'pers_operario_2',
      resourceType: 'PERSON',
      resourceCodeOrName: 'María Operaria',
      interval: { dateIso: '' }, // Sin fecha
      quantity: 100,
      jornales: 0.1,
    };

    const result = validateResourceTemporalAllocations([noIntervalAlloc], mockCatalog);

    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.issueType === 'MISSING_TIME_INTERVAL')).toBe(true);
  });

  test('6. FRONTERA NEGATIVA (R-ALLOC-04): Dependencia de Operador No Vinculada', () => {
    const unboundMachAlloc = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);

    const result = validateResourceTemporalAllocations([unboundMachAlloc], mockCatalog);

    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.issueType === 'UNBOUND_OPERATOR_DEPENDENCY')).toBe(true);
    expect(result.sovereigntySummary.unsatisfiedDependenciesCount).toBe(1);
  });

  test('7. FRONTERA NEGATIVA (R-ALLOC-08): Duplicación de Asignación por Cardinalidad', () => {
    const allocA = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const allocB = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]); // Mismo recurso a la misma demanda

    const result = validateResourceTemporalAllocations([allocA, allocB], mockCatalog);

    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.issueType === 'CARDINALITY_DUPLICATION')).toBe(true);
  });

  test('8. FRONTERA NEGATIVA (R-ALLOC-09): Integración con Hito 2 - Conflicto Detectado Sin Auto-Resolución', () => {
    // Asignación de Carlos Tractorista en Actividad A (08:00 - 10:00)
    const demandA: ResourceDemandAllocation = {
      allocationId: 'demand_a',
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      activityKey: '1',
      activityDescription: 'Mecanizado A',
      resourceType: 'PERSON',
      resourceId: 'pers_tractorista_1',
      resourceCodeOrName: 'Carlos Tractorista',
      interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
      quantity: 500,
      jornales: 0.5,
    };

    // Asignación de Carlos Tractorista en Actividad B (09:00 - 11:00) -> Solapamiento
    const demandB: ResourceDemandAllocation = {
      allocationId: 'demand_b',
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      activityKey: '2',
      activityDescription: 'Mecanizado B',
      resourceType: 'PERSON',
      resourceId: 'pers_tractorista_1',
      resourceCodeOrName: 'Carlos Tractorista',
      interval: { dateIso: '2026-09-10', startTime: '09:00', endTime: '11:00' },
      quantity: 500,
      jornales: 0.5,
    };

    const allocA = buildResourceTemporalAllocation(demandA, mockPersons[0]);
    const allocB = buildResourceTemporalAllocation(demandB, mockPersons[0]);

    const result = validateResourceTemporalAllocations([allocA, allocB], mockCatalog);

    expect(result.isValid).toBe(false);
    expect(result.simultaneityValidation.conflictsCount).toBe(1);
    expect(result.issues.some((i) => i.issueType === 'SIMULTANITY_COLLISION_HITO2')).toBe(true);
    // Verificar que NO se movieron las fechas (Inmutabilidad R-ALLOC-11)
    expect(allocA.interval.startTime).toBe('08:00');
    expect(allocB.interval.startTime).toBe('09:00');
  });

  test('9. R-ALLOC-10, R-ALLOC-11 & R-ALLOC-13: Inmutabilidad, Determinismo y Soberanía de Asignación', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const allocMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMach = bindMachineryOperatorAllocation(allocMach, allocOp);

    const allocationsList = [allocPerson, boundMach, allocOp];
    const allocationsCopy = JSON.parse(JSON.stringify(allocationsList));
    const catalogCopy = JSON.parse(JSON.stringify(mockCatalog));

    const run1 = validateResourceTemporalAllocations(allocationsList, mockCatalog);
    const run2 = validateResourceTemporalAllocations(allocationsList, mockCatalog);

    // Inmutabilidad (R-ALLOC-11)
    expect(allocationsList).toEqual(allocationsCopy);
    expect(mockCatalog).toEqual(catalogCopy);

    // Determinismo (R-ALLOC-10)
    expect(run1).toEqual(run2);

    // Soberanía (R-ALLOC-13)
    expect(run1.sovereigntySummary.totalAllocations).toBe(3);
    expect(run1.sovereigntySummary.satisfiedDependenciesCount).toBe(1);
  });
});
