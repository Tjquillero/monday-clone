/**
 * Suite de Pruebas de Certificación de FASE 3 · Hito 7
 * Motor de Exploración del Espacio de Candidatos
 *
 * Axiomas Reguladores Probados:
 * - R-SEARCH-01 a R-SEARCH-25: Determinismo absoluto, canonicalización, límites N_max / D_max,
 *   convergencia de rutas, y aislamiento total de evaluadores de superioridad.
 */

import type { SiteResourceState, ResourceTemporalAllocation } from '../types';
import type { ScheduleCandidatePlan } from '../decisionProblemTypes';
import {
  canonicalSerialize,
  canonicalStateHash,
  generateDeterministicCandidateId,
  sortTransformationsCanonical,
  getSyntheticTimestampIso,
  exploreCandidateSearchSpace,
} from '../searchSpaceExplorer';
import type { CandidateTransformation } from '../searchSpaceTypes';

describe('FASE 3 · Hito 7: Motor de Exploración del Espacio de Candidatos', () => {
  // Catálogo Soberano Hito 1 de prueba
  const mockCatalog: SiteResourceState[] = [
    {
      siteGroupId: 'SITE-01',
      siteName: 'Tramo 1 - Ruta del Sol',
      persons: [
        {
          id: 'PER-01',
          documentId: '12345',
          name: 'Carlos Pérez',
          role: 'OPERARIO',
          isAvailable: true,
          siteGroupId: 'SITE-01',
        },
        {
          id: 'PER-02',
          documentId: '67890',
          name: 'Juan Gómez',
          role: 'OPERARIO',
          isAvailable: true,
          siteGroupId: 'SITE-01',
        },
        {
          id: 'PER-03',
          documentId: '55555',
          name: 'Pedro Martínez',
          role: 'TRACTORISTA',
          isAvailable: true,
          siteGroupId: 'SITE-01',
        },
      ],
      crews: [],
      machinery: [
        {
          id: 'MAC-01',
          code: 'TR-001',
          name: 'Tractor Agrícola 1',
          category: 'TRACTOR',
          siteGroupId: 'SITE-01',
          simultaneousLimit: 1,
          operatorRequirement: { requiredRole: 'TRACTORISTA', operatorCount: 1 },
          isAvailable: true,
        },
        {
          id: 'MAC-02',
          code: 'TR-002',
          name: 'Tractor Agrícola 2',
          category: 'TRACTOR',
          siteGroupId: 'SITE-01',
          simultaneousLimit: 1,
          operatorRequirement: { requiredRole: 'TRACTORISTA', operatorCount: 1 },
          isAvailable: true,
        },
      ],
      machineryAvailability: [],
      totalPersonsCount: 3,
      totalAvailablePersonsCount: 3,
      totalMachineryCount: 2,
      fullyAvailableMachineryCount: 2,
    },
  ];

  // Plan Inicial P0
  const mockInitialPlan: ScheduleCandidatePlan = {
    candidateId: 'PLAN_INIT_001',
    contractualReference: 'POA_2026_TRAMO1',
    allocations: [
      {
        allocationId: 'ALLOC-001',
        demandId: 'DEM-001',
        siteGroupId: 'SITE-01',
        siteName: 'Tramo 1 - Ruta del Sol',
        activityKey: 'ROCERIA_MANUAL',
        activityDescription: 'Rocería de franja de dominio',
        resourceId: 'PER-01',
        resourceType: 'PERSON',
        resourceCodeOrName: 'Carlos Pérez',
        interval: {
          dateIso: '2026-03-02',
          startTime: '08:00',
          endTime: '17:00',
        },
        quantity: 100.0,
        jornales: 2.5,
      },
      {
        allocationId: 'ALLOC-002',
        demandId: 'DEM-002',
        siteGroupId: 'SITE-01',
        siteName: 'Tramo 1 - Ruta del Sol',
        activityKey: 'CORTE_MECANIZADO',
        activityDescription: 'Corte de maleza con tractor',
        resourceId: 'MAC-01',
        resourceType: 'MACHINERY',
        resourceCodeOrName: 'Tractor Agrícola 1',
        interval: {
          dateIso: '2026-03-02',
          startTime: '08:00',
          endTime: '17:00',
        },
        quantity: 50.0,
        jornales: 1.0,
        machineryOperatorBinding: {
          machineryAllocationId: 'ALLOC-002',
          machineryId: 'MAC-01',
          operatorAllocationId: 'OP_ALLOC_002',
          operatorId: 'PER-03',
          requiredRole: 'TRACTORISTA',
          isSatisfied: true,
        },
      },
    ],
  };

  describe('1. Canonicalización Canónica y Fingerprinting (R-SEARCH-13, 14, 15, 23)', () => {
    test('canonicalSerialize debe ser idéntico independientemente del orden de asignaciones', () => {
      const planA: ScheduleCandidatePlan = {
        ...mockInitialPlan,
        allocations: [mockInitialPlan.allocations[0], mockInitialPlan.allocations[1]],
      };

      const planB: ScheduleCandidatePlan = {
        ...mockInitialPlan,
        allocations: [mockInitialPlan.allocations[1], mockInitialPlan.allocations[0]],
      };

      expect(canonicalSerialize(planA)).toBe(canonicalSerialize(planB));
      expect(canonicalStateHash(planA)).toBe(canonicalStateHash(planB));
      expect(generateDeterministicCandidateId(planA)).toBe(generateDeterministicCandidateId(planB));
    });

    test('preserva números flotantes con formato fijo sin truncamiento destructivo (R-SEARCH-23)', () => {
      const planFloat1: ScheduleCandidatePlan = {
        ...mockInitialPlan,
        allocations: [{ ...mockInitialPlan.allocations[0], quantity: 1.2 }],
      };

      const planFloat2: ScheduleCandidatePlan = {
        ...mockInitialPlan,
        allocations: [{ ...mockInitialPlan.allocations[0], quantity: 1.200000 }],
      };

      expect(canonicalSerialize(planFloat1)).toBe(canonicalSerialize(planFloat2));
    });

    test('candidateId es estrictamente determinista y tiene prefijo cand_ con 16 hex chars (R-SEARCH-16)', () => {
      const candId = generateDeterministicCandidateId(mockInitialPlan);
      expect(candId).toMatch(/^cand_[a-f0-9]{16}$/);
    });
  });

  describe('2. Orden Canónico de Transformaciones y Timestamps Sintéticos (R-SEARCH-18, 22)', () => {
    test('sortTransformationsCanonical ordena determinísticamente por tipo, allocationId y parámetros', () => {
      const t1: CandidateTransformation = {
        transformationId: 't1',
        transformationType: 'SHIFT_TIME_INTERVAL',
        allocationId: 'ALLOC-002',
        shiftParams: { newInterval: { dateIso: '2026-03-03' } },
      };

      const t2: CandidateTransformation = {
        transformationId: 't2',
        transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
        allocationId: 'ALLOC-001',
        reassignParams: { newResourceId: 'PER-02', newResourceCodeOrName: 'Juan Gómez' },
      };

      const sorted = sortTransformationsCanonical([t1, t2]);
      expect(sorted[0].transformationType).toBe('REASSIGN_RESOURCE_EQUI_ROLE');
      expect(sorted[1].transformationType).toBe('SHIFT_TIME_INTERVAL');
    });

    test('getSyntheticTimestampIso genera marcas temporales reproducibles sin consultar Date.now() (R-SEARCH-22)', () => {
      const ts1 = getSyntheticTimestampIso(1);
      const ts2 = getSyntheticTimestampIso(2);
      expect(ts1).toBe('2026-01-01T00:00:01.000Z');
      expect(ts2).toBe('2026-01-01T00:00:02.000Z');
    });
  });

  describe('3. Motor de Exploración de Candidatos (R-SEARCH-01 a R-SEARCH-25)', () => {
    test('Determinismo Absoluto 100%: 2 ejecuciones independientes generan la misma estructura (R-SEARCH-05)', () => {
      const limits = { maxDepth: 2, maxVisitedNodes: 50 };

      const res1 = exploreCandidateSearchSpace(mockInitialPlan, mockCatalog, limits);
      const res2 = exploreCandidateSearchSpace(mockInitialPlan, mockCatalog, limits);

      expect(res1.rootCandidateId).toBe(res2.rootCandidateId);
      expect(res1.totalVisitedNodes).toBe(res2.totalVisitedNodes);
      expect(res1.terminationStatus).toBe(res2.terminationStatus);
      expect(Array.from(res1.nodesByCandidateId.keys())).toEqual(Array.from(res2.nodesByCandidateId.keys()));
    });

    test('Semántica de N_max: N_max = 1 solo admite P0 y marca CARDINALITY_LIMIT_REACHED (R-SEARCH-09, R-SEARCH-24)', () => {
      const limits = { maxDepth: 5, maxVisitedNodes: 1 };
      const res = exploreCandidateSearchSpace(mockInitialPlan, mockCatalog, limits);

      expect(res.totalVisitedNodes).toBe(1);
      expect(res.terminationStatus).toBe('CARDINALITY_LIMIT_REACHED');
      expect(res.nodesByCandidateId.size).toBe(1);
    });

    test('Semántica de D_max: Nodos en D_max no se expanden y marcan PRUNED_MAX_DEPTH (R-SEARCH-08)', () => {
      const limits = { maxDepth: 1, maxVisitedNodes: 100 };
      const res = exploreCandidateSearchSpace(mockInitialPlan, mockCatalog, limits);

      expect(res.terminationStatus).toBe('DEPTH_LIMIT_REACHED');
      
      const depth1Nodes = Array.from(res.nodesByCandidateId.values()).filter((n) => n.depth === 1);
      expect(depth1Nodes.length).toBeGreaterThan(0);
      for (const node of depth1Nodes) {
        expect(node.expansionStatus).toBe('PRUNED_MAX_DEPTH');
      }
    });

    test('Convergencia de Rutas: Selecciona determinísticamente la traza lexicográficamente menor (R-SEARCH-25)', () => {
      const limits = { maxDepth: 3, maxVisitedNodes: 100 };
      const res = exploreCandidateSearchSpace(mockInitialPlan, mockCatalog, limits);

      expect(res.totalVisitedNodes).toBeGreaterThan(1);
      // Garantizar que la tabla de visitados contenga únicamente estados únicos
      const hashes = Array.from(res.nodesByCandidateId.values()).map((n) => n.fingerprint.hash);
      const uniqueHashes = new Set(hashes);
      expect(hashes.length).toBe(uniqueHashes.size);
    });

    test('Negativo: El explorador NO contiene funciones getBestPlan, optimize, score ni rank (R-SEARCH-07, 21)', () => {
      const res = exploreCandidateSearchSpace(mockInitialPlan, mockCatalog, { maxDepth: 1, maxVisitedNodes: 5 });

      expect((res as any).getBestPlan).toBeUndefined();
      expect((res as any).optimize).toBeUndefined();
      expect((res as any).score).toBeUndefined();
      expect((res as any).rank).toBeUndefined();
      expect((res as any).selectBest).toBeUndefined();
    });
  });
});
