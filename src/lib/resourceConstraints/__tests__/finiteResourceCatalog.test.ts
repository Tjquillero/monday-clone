import {
  evalMachineryEffectiveAvailability,
  getSiteResourceState,
  evaluateGlobalResourceCatalog,
  normalizeOperatorRole,
} from '../finiteResourceCatalog';
import type { FinitePerson, FiniteCrew, FiniteMachinery } from '../types';

describe('FASE 3 Hito 1: Catálogo y Modelo de Recursos Finitos', () => {
  const mockPersons: FinitePerson[] = [
    {
      id: 'pers_001',
      documentId: '10982341',
      name: 'Carlos Conductor',
      role: 'TRACTORISTA',
      isAvailable: true,
      siteGroupId: 'group_country_001',
    },
    {
      id: 'pers_002',
      documentId: '10982342',
      name: 'María Operaria',
      role: 'OPERARIO',
      isAvailable: true,
      siteGroupId: 'group_country_001',
    },
    {
      id: 'pers_003',
      documentId: '10982343',
      name: 'Pedro Indisponible',
      role: 'TRACTORISTA',
      isAvailable: false, // Operador enfermo/de vacaciones
      siteGroupId: 'group_salinas_004',
    },
  ];

  const mockCrews: FiniteCrew[] = [
    {
      id: 'crew_001',
      name: 'Cuadrilla ZV Country',
      code: 'CWD-COUNTRY-01',
      leaderId: 'pers_001',
      memberIds: ['pers_001', 'pers_002'],
      siteGroupId: 'group_country_001',
      isAvailable: true,
    },
  ];

  const mockMachinery: FiniteMachinery[] = [
    {
      id: 'mach_001',
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
      id: 'mach_002',
      code: 'TR-002',
      name: 'Tractor Agrícola 2',
      category: 'TRACTOR',
      siteGroupId: 'group_salinas_004',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'TRACTORISTA',
        operatorCount: 1,
      },
      isAvailable: true, // Máquina OK pero único tractorista (pers_003) está indisponible
    },
    {
      id: 'mach_003',
      code: 'VQ-001',
      name: 'Volqueta de Trasiego',
      category: 'VOLQUETA',
      siteGroupId: 'group_country_001',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'CONDUCTOR_VOLQUETA',
        operatorCount: 1,
      },
      isAvailable: false, // Máquina en taller
    },
  ];

  test('1. R-FIN-02: Normalización de roles e identidades estables', () => {
    expect(normalizeOperatorRole('Tractorista Oficial')).toBe('TRACTORISTA');
    expect(normalizeOperatorRole('Conductor de Volqueta')).toBe('CONDUCTOR_VOLQUETA');
    expect(normalizeOperatorRole('Guadañador')).toBe('GUADAÑADOR');
  });

  test('2. R-FIN-04 & R-FIN-05: Máquina != Operador y Dependencia Explícita', () => {
    // Caso A: Maquinaria disponible + Operador disponible -> FULLY_AVAILABLE
    const resCountry = evalMachineryEffectiveAvailability(mockMachinery[0], mockPersons);
    expect(resCountry.effectiveStatus).toBe('FULLY_AVAILABLE');
    expect(resCountry.isMachineAvailable).toBe(true);
    expect(resCountry.hasEligibleOperators).toBe(true);
    expect(resCountry.eligibleOperatorIds).toContain('pers_001');

    // Caso B: Maquinaria disponible + Operador INDISPONIBLE -> UNAVAILABLE_OPERATOR (R-FIN-05)
    const resSalinas = evalMachineryEffectiveAvailability(mockMachinery[1], mockPersons);
    expect(resSalinas.effectiveStatus).toBe('UNAVAILABLE_OPERATOR');
    expect(resSalinas.isMachineAvailable).toBe(true);
    expect(resSalinas.hasEligibleOperators).toBe(false);
    expect(resSalinas.reason).toContain('Faltan operadores capacitados');

    // Caso C: Maquinaria INDISPONIBLE (en taller) -> UNAVAILABLE_MACHINE
    const resVolqueta = evalMachineryEffectiveAvailability(mockMachinery[2], mockPersons);
    expect(resVolqueta.effectiveStatus).toBe('UNAVAILABLE_MACHINE');
    expect(resVolqueta.isMachineAvailable).toBe(false);
  });

  test('3. R-FIN-03 & R-FIN-06: getSiteResourceState calcula estado de sitio sin realizar asignaciones', () => {
    const siteState = getSiteResourceState(
      'group_country_001',
      'PLAYA DEL COUNTRY',
      mockPersons,
      mockCrews,
      mockMachinery
    );

    expect(siteState.siteGroupId).toBe('group_country_001');
    expect(siteState.totalPersonsCount).toBe(2);
    expect(siteState.totalAvailablePersonsCount).toBe(2);
    expect(siteState.totalMachineryCount).toBe(2); // TR-001 y VQ-001
    expect(siteState.fullyAvailableMachineryCount).toBe(1); // Solo TR-001 (VQ-001 en taller)
  });

  test('4. R-FIN-01 & R-FIN-08: evaluateGlobalResourceCatalog es soberano y no infiere recursos desde el Excel K:AOA', () => {
    const sites = [
      { id: 'group_country_001', title: 'PLAYA DEL COUNTRY' },
      { id: 'group_salinas_004', title: 'SALINAS DEL REY' },
    ];

    const catalogState = evaluateGlobalResourceCatalog(
      sites,
      mockPersons,
      mockCrews,
      mockMachinery
    );

    expect(catalogState.length).toBe(2);
    expect(catalogState[0].siteName).toBe('PLAYA DEL COUNTRY');
    expect(catalogState[1].siteName).toBe('SALINAS DEL REY');

    // Comprobar que en Salinas del Rey la maquinaria no es fully available porque falta operador
    expect(catalogState[1].fullyAvailableMachineryCount).toBe(0);
  });
});
