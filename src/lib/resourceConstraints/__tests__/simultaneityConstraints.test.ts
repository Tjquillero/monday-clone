import {
  intervalsOverlap,
  validateResourceSimultaneityConstraints,
} from '../simultaneityConstraints';
import { getSiteResourceState } from '../finiteResourceCatalog';
import type {
  ResourceDemandAllocation,
  SiteResourceState,
  FinitePerson,
  FiniteMachinery,
  FiniteCrew,
} from '../types';

describe('FASE 3 Hito 2: Modelo de Restricciones de Simultaneidad y Exclusividad Temporal', () => {
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
      id: 'pers_indisponible_3',
      documentId: '10982343',
      name: 'Pedro Indisponible',
      role: 'CONDUCTOR_VOLQUETA',
      isAvailable: false,
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
    {
      id: 'mach_volqueta_1',
      code: 'VQ-001',
      name: 'Volqueta 1',
      category: 'VOLQUETA',
      siteGroupId: 'group_country_001',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'CONDUCTOR_VOLQUETA',
        operatorCount: 1,
      },
      isAvailable: true, // Máquina sana pero único conductor (pers_indisponible_3) está indisponible
    },
    {
      id: 'mach_tractor_2',
      code: 'TR-002',
      name: 'Tractor Agrícola 2',
      category: 'TRACTOR',
      siteGroupId: 'group_salinas_004',
      simultaneousLimit: 1,
      operatorRequirement: null,
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

  const mockSalinasState: SiteResourceState = getSiteResourceState(
    'group_salinas_004',
    'SALINAS DEL REY',
    mockPersons,
    mockCrews,
    mockMachinery
  );

  const mockCatalog = [mockCountryState, mockSalinasState];

  test('1. Semántica de Intervalos [start, end): Solapamiento vs Contiguos vs Días Distintos', () => {
    // A. Fechas distintas -> NO solapan
    const resDiffDates = intervalsOverlap(
      { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
      { dateIso: '2026-09-11', startTime: '08:00', endTime: '10:00' }
    );
    expect(resDiffDates.overlaps).toBe(false);

    // B. Mismo día, contiguos [08:00, 10:00) y [10:00, 12:00) -> NO solapan
    const resContiguous = intervalsOverlap(
      { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
      { dateIso: '2026-09-10', startTime: '10:00', endTime: '12:00' }
    );
    expect(resContiguous.overlaps).toBe(false);

    // C. Mismo día, solapados [08:00, 10:00) y [09:30, 11:00) -> SÍ solapan [09:30, 10:00)
    const resOverlapping = intervalsOverlap(
      { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
      { dateIso: '2026-09-10', startTime: '09:30', endTime: '11:00' }
    );
    expect(resOverlapping.overlaps).toBe(true);
    expect(resOverlapping.overlapStart).toBe('2026-09-10 T09:30');
    expect(resOverlapping.overlapEnd).toBe('2026-09-10 T10:00');
  });

  test('2. Caso 1: Recurso Libre -> NO_CONFLICT', () => {
    const demands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_001',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '1',
        activityDescription: 'Limpieza Manual',
        resourceType: 'PERSON',
        resourceId: 'pers_operario_2',
        resourceCodeOrName: 'María Operaria',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
        quantity: 1000,
        jornales: 1,
      },
    ];

    const result = validateResourceSimultaneityConstraints(demands, mockCatalog);
    expect(result.isValid).toBe(true);
    expect(result.conflictsCount).toBe(0);
  });

  test('3. Casos 2, 3, 4: Misma Maquinaria con solapamiento, contigua y mismo día en distintas horas', () => {
    // Solapamiento -> Conflicto
    const overlapDemands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_tr_a',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '2',
        activityDescription: 'Arrume Tractor A',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
        quantity: 5000,
        jornales: 0.2,
      },
      {
        allocationId: 'alloc_tr_b',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '4',
        activityDescription: 'Cargue Tractor B',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '09:00', endTime: '11:00' },
        quantity: 5000,
        jornales: 0.2,
      },
    ];

    const resOverlap = validateResourceSimultaneityConstraints(overlapDemands, mockCatalog);
    expect(resOverlap.isValid).toBe(false);
    expect(resOverlap.summary.resourceOverlapCount).toBe(1);
    expect(resOverlap.conflicts[0].conflictType).toBe('RESOURCE_OVERLAP_COLLISION');

    // Horarios contiguos -> Sin conflicto
    const contiguousDemands: ResourceDemandAllocation[] = [
      { ...overlapDemands[0] },
      { ...overlapDemands[1], interval: { dateIso: '2026-09-10', startTime: '10:00', endTime: '12:00' } },
    ];
    const resContiguous = validateResourceSimultaneityConstraints(contiguousDemands, mockCatalog);
    expect(resContiguous.isValid).toBe(true);

    // Mismo día, distintas horas (mañana y tarde) -> Sin conflicto
    const separateHoursDemands: ResourceDemandAllocation[] = [
      { ...overlapDemands[0] },
      { ...overlapDemands[1], interval: { dateIso: '2026-09-10', startTime: '14:00', endTime: '16:00' } },
    ];
    const resSeparate = validateResourceSimultaneityConstraints(separateHoursDemands, mockCatalog);
    expect(resSeparate.isValid).toBe(true);
  });

  test('4. Caso 5: Operador ocupado simultáneamente en dos actividades -> Conflicto R-RES-03', () => {
    const operatorDemands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_op_1',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '1',
        activityDescription: 'Poda de Árboles',
        resourceType: 'PERSON',
        resourceId: 'pers_tractorista_1',
        resourceCodeOrName: 'Carlos Tractorista',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '11:00' },
        quantity: 10,
        jornales: 0.5,
      },
      {
        allocationId: 'alloc_op_2',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '3',
        activityDescription: 'Corte Troncos',
        resourceType: 'PERSON',
        resourceId: 'pers_tractorista_1',
        resourceCodeOrName: 'Carlos Tractorista',
        interval: { dateIso: '2026-09-10', startTime: '10:00', endTime: '12:00' },
        quantity: 5,
        jornales: 0.25,
      },
    ];

    const result = validateResourceSimultaneityConstraints(operatorDemands, mockCatalog);
    expect(result.isValid).toBe(false);
    expect(result.summary.resourceOverlapCount).toBe(1);
    expect(result.conflicts[0].reason).toContain('Carlos Tractorista');
  });

  test('5. Caso 6: Maquinaria + Operador Requerido Indisponible -> UNSATISFIED_OPERATOR_DEPENDENCY R-RES-02', () => {
    const volquetaDemand: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_vq_1',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '4',
        activityDescription: 'Trasiego Volqueta',
        resourceType: 'MACHINERY',
        resourceId: 'mach_volqueta_1',
        resourceCodeOrName: 'VQ-001',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
        quantity: 1000,
        jornales: 0.5,
      },
    ];

    const result = validateResourceSimultaneityConstraints(volquetaDemand, mockCatalog);
    expect(result.isValid).toBe(false);
    expect(result.summary.unsatisfiedDependencyCount).toBe(1);
    expect(result.conflicts[0].conflictType).toBe('UNSATISFIED_OPERATOR_DEPENDENCY');
  });

  test('6. Casos 7 y 8: Actividades multi-recurso y recursos distintos', () => {
    // Recursos distintos (TR-001 vs TR-002 en sitios distintos) -> Sin conflicto entre ellos
    const distinctDemands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_tr1',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '2',
        activityDescription: 'Arrume Country',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
        quantity: 1000,
        jornales: 0.5,
      },
      {
        allocationId: 'alloc_tr2',
        siteGroupId: 'group_salinas_004',
        siteName: 'SALINAS DEL REY',
        activityKey: '2',
        activityDescription: 'Arrume Salinas',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_2',
        resourceCodeOrName: 'TR-002',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
        quantity: 1000,
        jornales: 0.5,
      },
    ];

    const result = validateResourceSimultaneityConstraints(distinctDemands, mockCatalog);
    expect(result.isValid).toBe(true);
  });

  test('7. Casos 9 y 10: Conflicto físico != déficit de jornales (R-RES-06)', () => {
    // Si hay colisión de simultaneidad en TR-001, DEBE reportar conflicto aunque el sitio tenga superávit de jornales Y
    const demands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_a',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '2',
        activityDescription: 'Arrume A',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
        quantity: 1000,
        jornales: 0.2,
      },
      {
        allocationId: 'alloc_b',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '5',
        activityDescription: 'Oxigenación B',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '09:00', endTime: '11:00' },
        quantity: 1000,
        jornales: 0.2,
      },
    ];

    const result = validateResourceSimultaneityConstraints(demands, mockCatalog);
    expect(result.isValid).toBe(false);
    expect(result.summary.resourceOverlapCount).toBe(1);
  });

  test('8. Caso 14: Recurso Inexistente / No Resuelto -> UNRESOLVED_RESOURCE', () => {
    const unresolvedDemands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_unk',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '99',
        activityDescription: 'Actividad con Recurso Inexistente',
        resourceType: 'MACHINERY',
        resourceId: 'mach_inexistente_999',
        resourceCodeOrName: 'Tractor Fantasma',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
        quantity: 100,
        jornales: 0.1,
      },
    ];

    const result = validateResourceSimultaneityConstraints(unresolvedDemands, mockCatalog);
    expect(result.isValid).toBe(false);
    expect(result.summary.unresolvedResourceCount).toBe(1);
    expect(result.conflicts[0].conflictType).toBe('UNRESOLVED_RESOURCE');
  });

  test('9. Casos 11, 12, 13: Input Inmutable y Resultado Determinista (R-RES-08)', () => {
    const demands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc_det_1',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '2',
        activityDescription: 'Det 1',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
        quantity: 1000,
        jornales: 0.2,
      },
      {
        allocationId: 'alloc_det_2',
        siteGroupId: 'group_country_001',
        siteName: 'PLAYA DEL COUNTRY',
        activityKey: '5',
        activityDescription: 'Det 2',
        resourceType: 'MACHINERY',
        resourceId: 'mach_tractor_1',
        resourceCodeOrName: 'TR-001',
        interval: { dateIso: '2026-09-10', startTime: '09:00', endTime: '11:00' },
        quantity: 1000,
        jornales: 0.2,
      },
    ];

    const demandsCopy = JSON.parse(JSON.stringify(demands));
    const catalogCopy = JSON.parse(JSON.stringify(mockCatalog));

    const resultRun1 = validateResourceSimultaneityConstraints(demands, mockCatalog);
    const resultRun2 = validateResourceSimultaneityConstraints(demands, mockCatalog);

    // Inmutabilidad
    expect(demands).toEqual(demandsCopy);
    expect(mockCatalog).toEqual(catalogCopy);

    // Determinismo
    expect(resultRun1).toEqual(resultRun2);
  });
});
