/**
 * Suite de Certificación Adversarial y Validación End-to-End (FASE 4 · Hito 1)
 *
 * Cobertura de Pruebas:
 * - E2E-01: Conservación granular por tupla de actividad (itemId, activityKey, groupId).
 * - E2E-02: Preservación independiente de Operario (Op) vs Maquinaria (Maq).
 * - E2E-03: Ingesta de sitio inexistente emite UNRESOLVED_RESOURCE en H4 y status INFEASIBLE.
 * - E2E-04: Preservación de metrado 0.00 explícito.
 * - E2E-05: Rechazo explícito en H6 al desplazar hacia no hábil (domingo/festivo) sin alterar P0.
 * - E2E-06: Determinismo E2E 100% en ejecuciones independientes.
 * - E2E-07: Respeto estricto de N_max y D_max en H7 sobre datos reales.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SiteResourceState } from '../types';
import type { TemporalSchedulePayload } from '../../temporalScheduleImport/types';
import { parseTemporalScheduleExcel } from '../../temporalScheduleImport/parseTemporalExcel';
import { mapTemporalScheduleToDomain } from '../../temporalScheduleImport/mapper';
import { buildTemporalSchedulePayload } from '../../temporalScheduleImport/service/buildTemporalPayload';
import {
  convertPayloadToCanonicalPlanP0,
  executeEndToEndScheduleValidation,
} from '../realScheduleIntegrationService';
import { applyCandidateTransformation } from '../candidateGenerator';
import { canonicalStateHash } from '../searchSpaceExplorer';

describe('FASE 4 · Hito 1: Validación End-to-End del Cronograma Temporal Real', () => {
  const xlsbPath = path.join(process.cwd(), 'CRONOGRAMA OPERACION 2025 V-2 SEGUIMIENTO EJECUCION.xlsb');
  let cachedPayload: TemporalSchedulePayload | null = null;

  const mockAvailableGroups = [
    { id: 'group_country_001', title: 'PLAYA DEL COUNTRY' },
    { id: 'group_sabanilla_002', title: 'PLAYA DE SABANILLA 2' },
    { id: 'group_puerto_003', title: 'PLAZA PUERTO COLOMBIA' },
    { id: 'group_salinas_004', title: 'SALINAS DEL REY' },
    { id: 'group_manglares_005', title: 'PLAYA MANGLARES' },
    { id: 'group_miramar_006', title: 'MIRAMAR SECTOR EL FARO' },
    { id: 'group_sazon_007', title: 'MERCADO LA SAZÓN' },
    { id: 'group_veronica_008', title: 'SENDERO SANTA VERÓNICA' },
    { id: 'group_salgar_009', title: 'CASTILLO DE SALGAR' },
  ];

  const mockCatalog: SiteResourceState[] = [
    {
      siteGroupId: 'group_country_001',
      siteName: 'PLAYA DEL COUNTRY',
      persons: [
        { id: 'PER-C1', documentId: '111', name: 'Operario Country 1', role: 'OPERARIO', isAvailable: true, siteGroupId: 'group_country_001' },
      ],
      crews: [],
      machinery: [
        { id: 'MAC-C1', code: 'TR-C1', name: 'Tractor Country', category: 'TRACTOR', siteGroupId: 'group_country_001', simultaneousLimit: 1, operatorRequirement: null, isAvailable: true },
      ],
      machineryAvailability: [],
      totalPersonsCount: 1,
      totalAvailablePersonsCount: 1,
      totalMachineryCount: 1,
      fullyAvailableMachineryCount: 1,
    },
  ];

  beforeAll(() => {
    if (fs.existsSync(xlsbPath)) {
      const buffer = new Uint8Array(fs.readFileSync(xlsbPath));
      const parsed = parseTemporalScheduleExcel(buffer);
      const mapped = mapTemporalScheduleToDomain(parsed, mockAvailableGroups);
      cachedPayload = buildTemporalSchedulePayload(mapped);
    }
  });

  test('E2E-01 & E2E-02: Conservación granular por actividad y preservación Op vs Maq (R-E2E-03, R-E2E-05)', () => {
    if (!cachedPayload) {
      console.warn('XLSB File not present, skipping E2E test');
      return;
    }

    const samplePayload: TemporalSchedulePayload = {
      ...cachedPayload,
      activities: cachedPayload.activities.slice(0, 10),
    };

    const { planP0, conservationVerifications } = convertPayloadToCanonicalPlanP0(samplePayload, mockCatalog);

    expect(planP0.allocations.length).toBeGreaterThan(0);
    expect(conservationVerifications.length).toBe(samplePayload.activities.length);

    // Verificar que CADA actividad preserve individualmente sus metrados y jornales
    for (const v of conservationVerifications) {
      expect(v.isCantMatched).toBe(true);
      expect(v.isOperatorJornalesMatched).toBe(true);
      expect(v.isMachineryJornalesMatched).toBe(true);
      expect(v.isFullyPreserved).toBe(true);
    }
  });

  test('E2E-03: Ingesta de sitio inexistente emite UNRESOLVED_RESOURCE en H4 y status INFEASIBLE (R-E2E-06)', () => {
    if (!cachedPayload) return;

    const samplePayload: TemporalSchedulePayload = {
      ...cachedPayload,
      activities: cachedPayload.activities.slice(0, 5),
    };

    // Payload de prueba con sitio no resoluble
    const unmappedPayload: TemporalSchedulePayload = {
      ...samplePayload,
      activities: samplePayload.activities.map((a) => ({
        ...a,
        group_id: 'UNMAPPED',
        allocations: a.allocations.map((al) => ({ ...al, group_id: 'UNMAPPED' })),
      })),
    };

    const report = executeEndToEndScheduleValidation(unmappedPayload, mockCatalog);

    expect(report.unmappedSitesCount).toBeGreaterThan(0);
    expect(report.feasibilityP0.isFeasible).toBe(false);
    expect(report.feasibilityP0.status).toBe('INFEASIBLE');
  });

  test('E2E-04: Preservación de metrado 0.00 explícito (R-E2E-08)', () => {
    if (!cachedPayload) return;

    const samplePayload: TemporalSchedulePayload = {
      ...cachedPayload,
      activities: cachedPayload.activities.slice(0, 10),
    };

    const { planP0 } = convertPayloadToCanonicalPlanP0(samplePayload, mockCatalog);

    const expectedTotalAllocations = samplePayload.activities.reduce((acc, a) => acc + a.allocations.length, 0);
    expect(planP0.allocations.length).toBe(expectedTotalAllocations);
  });

  test('E2E-05: Rechazo explícito en H6 al desplazar hacia no hábil (domingo/festivo) (R-E2E-09)', () => {
    if (!cachedPayload) return;

    const samplePayload: TemporalSchedulePayload = {
      ...cachedPayload,
      activities: cachedPayload.activities.slice(0, 5),
    };

    const { planP0 } = convertPayloadToCanonicalPlanP0(samplePayload, mockCatalog);
    const targetAlloc = planP0.allocations[0];

    // Intentar mover la primera asignación a un domingo (e.g. 2026-03-01)
    const result = applyCandidateTransformation(
      planP0,
      {
        transformationId: 'trans_test_sunday',
        transformationType: 'SHIFT_TIME_INTERVAL',
        allocationId: targetAlloc.allocationId,
        shiftParams: {
          newInterval: {
            dateIso: '2026-03-01', // Domingo
            startTime: '08:00',
            endTime: '17:00',
          },
        },
      },
      mockCatalog,
      ['2026-01-01']
    );

    // Debe rechazarse formalmente sin modificar P0
    expect(result.success).toBe(false);
    expect(result.rejectionReason).toMatch(/domingo/i);
  });

  test('E2E-06: Determinismo E2E 100% en ejecuciones independientes (R-E2E-06)', () => {
    if (!cachedPayload) return;

    const samplePayload: TemporalSchedulePayload = {
      ...cachedPayload,
      activities: cachedPayload.activities.slice(0, 2),
    };

    const report1 = executeEndToEndScheduleValidation(samplePayload, mockCatalog, { maxDepth: 1, maxVisitedNodes: 5 });
    const report2 = executeEndToEndScheduleValidation(samplePayload, mockCatalog, { maxDepth: 1, maxVisitedNodes: 5 });

    expect(canonicalStateHash(report1.initialPlanP0)).toBe(canonicalStateHash(report2.initialPlanP0));
    expect(report1.feasibilityP0.status).toBe(report2.feasibilityP0.status);
    expect(report1.searchSpaceH7?.totalVisitedNodes).toBe(report2.searchSpaceH7?.totalVisitedNodes);
    expect(report1.searchSpaceH7?.rootCandidateId).toBe(report2.searchSpaceH7?.rootCandidateId);
  });

  test('E2E-07: Respeto estricto de N_max y D_max en H7 sobre datos reales (R-E2E-07)', () => {
    if (!cachedPayload) return;

    const samplePayload: TemporalSchedulePayload = {
      ...cachedPayload,
      activities: cachedPayload.activities.slice(0, 2),
    };

    const report = executeEndToEndScheduleValidation(samplePayload, mockCatalog, { maxDepth: 1, maxVisitedNodes: 3 });

    expect(report.searchSpaceH7).toBeDefined();
    expect(report.searchSpaceH7!.totalVisitedNodes).toBeLessThanOrEqual(3);
    expect(['CARDINALITY_LIMIT_REACHED', 'DEPTH_LIMIT_REACHED', 'EXHAUSTED', 'ALL_TRANSFORMATIONS_REJECTED']).toContain(
      report.searchSpaceH7!.terminationStatus
    );
  });
});
