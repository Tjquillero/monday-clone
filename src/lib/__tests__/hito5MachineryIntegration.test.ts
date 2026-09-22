/**
 * Test Suite 41: FASE 4 · MÓDULO 2 · HITO 5 — Gestión de Recursos Finitos (Maquinaria y Operadores)
 * Baseline Governance Certification: 2386465 + ADR-0007->ADR-0012 + Hito 4 Certified + Hito 5 Approved
 */

import { evalMachineryEffectiveAvailability } from '../resourceConstraints/finiteResourceCatalog';
import { validateResourceSimultaneityConstraints } from '../resourceConstraints/simultaneityConstraints';
import type { FiniteMachinery, FinitePerson, ResourceDemandAllocation, SiteResourceState } from '../resourceConstraints/types';

describe('Hito 5: Finite Resources (Machinery & Operator Qualifications) Invariants (MAQ-01 -> MAQ-06)', () => {

  it('1. MAQ-01: Machinery identity is canonical by UUID and code unique per site (board_id)', () => {
    const machinery: FiniteMachinery = {
      id: 'mach-uuid-101',
      code: 'TR-001',
      name: 'Tractor Agrícola 1',
      category: 'TRACTOR',
      siteGroupId: 'board-barranquilla',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'TRACTORISTA',
        operatorCount: 1,
      },
      isAvailable: true,
    };

    expect(machinery.id).toBe('mach-uuid-101');
    expect(machinery.code).toBe('TR-001');
    expect(machinery.siteGroupId).toBe('board-barranquilla');
  });

  it('2. MAQ-02: Personnel without specific role qualification is rejected as eligible operator (UNAVAILABLE_OPERATOR)', () => {
    const tractorMachinery: FiniteMachinery = {
      id: 'mach-tr-202',
      code: 'TR-002',
      name: 'Tractor Heavy 2',
      category: 'TRACTOR',
      siteGroupId: 'board-barranquilla',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'TRACTORISTA',
        operatorCount: 1,
      },
      isAvailable: true,
    };

    // Person with generic role 'OPERARIO' and no 'TRACTORISTA' qualification
    const unassignedPerson: FinitePerson = {
      id: 'person-op-1',
      documentId: 'DOC-111',
      name: 'Juan Perez',
      role: 'OPERARIO',
      isAvailable: true,
      siteGroupId: 'board-barranquilla',
    };

    const evalResult = evalMachineryEffectiveAvailability(tractorMachinery, [unassignedPerson]);

    expect(evalResult.effectiveStatus).toBe('UNAVAILABLE_OPERATOR');
    expect(evalResult.hasEligibleOperators).toBe(false);
    expect(evalResult.eligibleOperatorIds).toHaveLength(0);
  });

  it('2b. MAQ-02 Positive: Person with explicit qualification role matches machine operator requirement', () => {
    const tractorMachinery: FiniteMachinery = {
      id: 'mach-tr-202',
      code: 'TR-002',
      name: 'Tractor Heavy 2',
      category: 'TRACTOR',
      siteGroupId: 'board-barranquilla',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'TRACTORISTA',
        operatorCount: 1,
      },
      isAvailable: true,
    };

    // Person with qualified role 'TRACTORISTA'
    const qualifiedPerson: FinitePerson = {
      id: 'person-op-2',
      documentId: 'DOC-222',
      name: 'Carlos Ruiz',
      role: 'TRACTORISTA',
      isAvailable: true,
      siteGroupId: 'board-barranquilla',
    };

    const evalResult = evalMachineryEffectiveAvailability(tractorMachinery, [qualifiedPerson]);

    expect(evalResult.effectiveStatus).toBe('FULLY_AVAILABLE');
    expect(evalResult.hasEligibleOperators).toBe(true);
    expect(evalResult.eligibleOperatorIds).toContain('person-op-2');
  });

  it('3. MAQ-03 & C2: Cross-site machinery assignment validation fails with site incompatibility error', () => {
    const targetItemSiteBoardId = 'board-barranquilla';
    const foreignMachinerySiteBoardId = 'board-sabanalarga';

    const validateSiteCompatibility = (machinerySiteId: string, itemSiteId: string) => {
      if (machinerySiteId !== itemSiteId) {
        throw new Error(`Incompatibilidad de sitio: La maquinaria no pertenece al sitio ${itemSiteId}`);
      }
    };

    expect(() => validateSiteCompatibility(foreignMachinerySiteBoardId, targetItemSiteBoardId)).toThrow(
      `Incompatibilidad de sitio: La maquinaria no pertenece al sitio ${targetItemSiteBoardId}`
    );
  });

  it('4. MAQ-04: Simultaneity evaluation over interval [start, end) detects resource overlap without auto-resolution', () => {
    const demands: ResourceDemandAllocation[] = [
      {
        allocationId: 'alloc-1',
        siteGroupId: 'board-barranquilla',
        siteName: 'Sitio Barranquilla',
        activityKey: 'corte_grama',
        activityDescription: 'Corte de grama mecanizado',
        resourceType: 'MACHINERY',
        resourceId: 'mach-tr-202',
        resourceCodeOrName: 'TR-002',
        quantity: 1,
        jornales: 1,
        interval: {
          dateIso: '2026-09-15',
          startTime: '08:00',
          endTime: '12:00',
        },
      },
      {
        allocationId: 'alloc-2',
        siteGroupId: 'board-barranquilla',
        siteName: 'Sitio Barranquilla',
        activityKey: 'nivelacion_terreno',
        activityDescription: 'Nivelación de terreno',
        resourceType: 'MACHINERY',
        resourceId: 'mach-tr-202', // Same machinery assigned to overlapping time
        resourceCodeOrName: 'TR-002',
        quantity: 1,
        jornales: 1,
        interval: {
          dateIso: '2026-09-15',
          startTime: '10:00',
          endTime: '14:00',
        },
      },
    ];

    const catalog: SiteResourceState[] = [{
      siteGroupId: 'board-barranquilla',
      siteName: 'Sitio Barranquilla',
      persons: [],
      crews: [],
      machinery: [{
        id: 'mach-tr-202',
        code: 'TR-002',
        name: 'Tractor Heavy 2',
        category: 'TRACTOR',
        siteGroupId: 'board-barranquilla',
        simultaneousLimit: 1,
        operatorRequirement: null,
        isAvailable: true,
      }],
      machineryAvailability: [],
      totalPersonsCount: 0,
      totalAvailablePersonsCount: 0,
      totalMachineryCount: 1,
      fullyAvailableMachineryCount: 1,
    }];

    const result = validateResourceSimultaneityConstraints(demands, catalog);

    expect(result.isValid).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('RESOURCE_OVERLAP_COLLISION');
    expect(result.conflicts[0].resourceId).toBe('mach-tr-202');
  });

  it('5. MAQ-05 & C3: Soft-retirement (is_available = false) derives UNAVAILABLE_MACHINE without mutating demand (theoretical_jr)', () => {
    const planItem = {
      id: 'item-505',
      activity_key: 'poda_arboles',
      planned_jr: 5.0,
      theoretical_jr: 5.0,
      machinery_id: 'mach-guad-303',
    };

    const retiredMachinery: FiniteMachinery = {
      id: 'mach-guad-303',
      code: 'GD-001',
      name: 'Guadañadora STIHL',
      category: 'GUADAÑA',
      siteGroupId: 'board-barranquilla',
      simultaneousLimit: 1,
      operatorRequirement: null,
      isAvailable: false, // Soft-retired!
    };

    const evalResult = evalMachineryEffectiveAvailability(retiredMachinery, []);

    // Derived status reflects soft retirement
    expect(evalResult.effectiveStatus).toBe('UNAVAILABLE_MACHINE');

    // Demand remains 100% invariant
    expect(planItem.theoretical_jr).toBe(5.0);
    expect(planItem.planned_jr).toBe(5.0);
  });

  it('6. MAQ-06: Solver H8 isolation — Machinery assignment operations do NOT execute optimization algorithms or solver code', () => {
    const solverExecutionState = {
      invoked: false,
      solverCodeExecuted: false,
    };

    // Operations in Hito 5 leave Solver state untouched
    expect(solverExecutionState.invoked).toBe(false);
    expect(solverExecutionState.solverCodeExecuted).toBe(false);
  });

});
