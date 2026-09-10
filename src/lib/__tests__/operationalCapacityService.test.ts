/**
 * Test Suite 39 — Módulo 3: Capacidad Operativa, Carga y Brecha de Personal
 * Baseline: 2386465 + ADR-0007..ADR-0012 + Módulo 2 (CLOSED & CERTIFIED)
 *
 * Certifica los cálculos determinísticos de:
 * 1. Análisis Macro: Personal Requerido (X) vs Personal Asignado (Y) = Brecha Operativa.
 * 2. Protección contra doble conteo de identidades físicas reales.
 * 3. Análisis Micro: Carga de Planificación por Cuadrilla (Normal vs Sobrecarga).
 * 4. Prevención de falsos positivos en traslapes.
 */

import {
  calculateOperationalGap,
  calculateCrewWorkloads,
  MinimalActivityStandard,
} from '../operationalCapacityService';
import { ScopeMapping } from '@/types/scheduler';
import { PersonnelSiteAssignment, Crew } from '@/types/crew';
import { WeeklyPlanItem } from '@/types/weeklyPlan';

describe('Test Suite 39 — Módulo 3: Capacidad Operativa, Carga y Brecha de Personal', () => {
  const siteId = 'site_puerto_colombia';
  const siteName = 'Plaza Puerto Colombia';

  // Standards de prueba (Catálogo Técnico)
  const standards: MinimalActivityStandard[] = [
    {
      activity_key: 'corte_grama',
      category: 'ZONA VERDE',
      rendimiento: 500, // 500 m2 / jornal
      frecuencia: 25, // Diaria (25 días)
      requiere_rendimiento: true,
    },
    {
      activity_key: 'limpieza_zona_dura',
      category: 'ZONA DURA',
      rendimiento: 1000, // 1000 m2 / jornal
      frecuencia: 25,
      requiere_rendimiento: true,
    },
    {
      activity_key: 'trasiego_playa',
      category: 'ZONA DE PLAYA',
      rendimiento: 200, // 200 m2 / jornal
      frecuencia: 25,
      requiere_rendimiento: true,
    },
  ];

  // Scope Mappings
  const scopeMappings: ScopeMapping[] = [
    { activity_key: 'corte_grama', scope_key: 'grama', weight: 1 },
    { activity_key: 'limpieza_zona_dura', scope_key: 'zona_dura', weight: 1 },
    { activity_key: 'trasiego_playa', scope_key: 'zona_playa', weight: 1 },
  ];

  // Scope Data (Cantidades del sitio)
  // grama = 25,000 m2 -> JR_mes = 25000 / (500 * (25/25)) = 50 jornales -> X_ZV = 50 / 25 = 2.0 trabajadores
  // zona_dura = 50,000 m2 -> JR_mes = 50000 / (1000 * 1) = 50 jornales -> X_ZD = 50 / 25 = 2.0 trabajadores
  // zona_playa = 10,000 m2 -> JR_mes = 10000 / (200 * 1) = 50 jornales -> X_ZP = 50 / 25 = 2.0 trabajadores
  // Total X = (50 + 50 + 50) / 25 = 6.0 trabajadores requeridos
  const scopeData: Record<string, number> = {
    grama: 25000,
    zona_dura: 50000,
    zona_playa: 10000,
  };

  describe('1. Análisis Macro: Brecha Operativa (X vs Y)', () => {
    it('debe calcular correctamente el personal requerido (X = JR_mes / 25) por sitio y zona', () => {
      const siteAssignments: PersonnelSiteAssignment[] = []; // Y = 0

      const result = calculateOperationalGap(siteId, siteName, scopeData, standards, scopeMappings, siteAssignments);

      expect(result.siteId).toBe(siteId);
      expect(result.totalMonthlyJournals).toBe(150); // 50 + 50 + 50
      expect(result.totalRequiredWorkers).toBe(6.0); // 150 / 25
      expect(result.totalAssignedWorkers).toBe(0);
      expect(result.netDeficit).toBe(6.0);
      expect(result.netExcedente).toBe(0);
      expect(result.status).toBe('DEFICIT');

      // Verificación por zonas
      const zv = result.zoneDetails.find((z) => z.zoneKey === 'ZV');
      expect(zv?.requiredWorkers).toBe(2.0);
      expect(zv?.assignedWorkers).toBe(0);
      expect(zv?.deficit).toBe(2.0);

      const zd = result.zoneDetails.find((z) => z.zoneKey === 'ZD');
      expect(zd?.requiredWorkers).toBe(2.0);

      const zp = result.zoneDetails.find((z) => z.zoneKey === 'ZP');
      expect(zp?.requiredWorkers).toBe(2.0);
    });

    it('debe calcular la Brecha Operativa correctamente cuando hay personal asignado (Y)', () => {
      const siteAssignments: PersonnelSiteAssignment[] = [
        { id: 'asgn_1', version_id: 'v1', personnel_id: 'p1', zone: 'ZV', dedication_percentage: 100 },
        { id: 'asgn_2', version_id: 'v1', personnel_id: 'p2', zone: 'ZV', dedication_percentage: 100 },
        { id: 'asgn_3', version_id: 'v1', personnel_id: 'p3', zone: 'ZD', dedication_percentage: 100 },
        { id: 'asgn_4', version_id: 'v1', personnel_id: 'p4', zone: 'ZD', dedication_percentage: 100 },
        { id: 'asgn_5', version_id: 'v1', personnel_id: 'p5', zone: 'ZD', dedication_percentage: 100 }, // ZD tiene 3 (X=2, Y=3 -> excedente 1)
      ];

      const result = calculateOperationalGap(siteId, siteName, scopeData, standards, scopeMappings, siteAssignments);

      expect(result.totalRequiredWorkers).toBe(6.0);
      expect(result.totalAssignedWorkers).toBe(5);
      expect(result.netDeficit).toBe(1.0); // 6.0 - 5.0

      const zv = result.zoneDetails.find((z) => z.zoneKey === 'ZV');
      expect(zv?.requiredWorkers).toBe(2.0);
      expect(zv?.assignedWorkers).toBe(2);
      expect(zv?.deficit).toBe(0);
      expect(zv?.status).toBe('BALANCED');

      const zd = result.zoneDetails.find((z) => z.zoneKey === 'ZD');
      expect(zd?.requiredWorkers).toBe(2.0);
      expect(zd?.assignedWorkers).toBe(3);
      expect(zd?.excedente).toBe(1.0);
      expect(zd?.status).toBe('EXCEDENTE');

      const zp = result.zoneDetails.find((z) => z.zoneKey === 'ZP');
      expect(zp?.requiredWorkers).toBe(2.0);
      expect(zp?.assignedWorkers).toBe(0);
      expect(zp?.deficit).toBe(2.0);
      expect(zp?.status).toBe('DEFICIT');
    });

    it('debe proteger contra el doble conteo de identidades físicas reales con adscripción dividida', () => {
      // Mismo trabajador 'p1' adscrito a ZV y a ZD en el mismo sitio
      const siteAssignments: PersonnelSiteAssignment[] = [
        { id: 'asgn_1', version_id: 'v1', personnel_id: 'p1', personnel_document_id: '12345', zone: 'ZV', dedication_percentage: 80 },
        { id: 'asgn_2', version_id: 'v1', personnel_id: 'p1', personnel_document_id: '12345', zone: 'ZD', dedication_percentage: 20 },
      ];

      const result = calculateOperationalGap(siteId, siteName, scopeData, standards, scopeMappings, siteAssignments);

      expect(result.totalAssignedWorkers).toBe(2); // 2 asignaciones adscritas en el sitio
      expect(result.uniquePhysicalWorkersCount).toBe(1); // 1 sola persona física real (document_id '12345')
    });
  });

  describe('2. Análisis Micro: Carga de Planificación por Cuadrilla', () => {
    const crews: Crew[] = [
      { id: 'crew_zv', board_id: 'b1', name: 'Cuadrilla ZV', is_active: true },
      { id: 'crew_zd', board_id: 'b1', name: 'Cuadrilla ZD', is_active: true },
    ];

    it('debe marcar SOBRECARGA cuando la suma de jornales teóricos para una fecha supera la capacidad diaria', () => {
      const planItems: WeeklyPlanItem[] = [
        {
          id: 'item_1',
          weekly_plan_id: 'wp1',
          board_id: 'b1',
          activity_key: 'corte_grama',
          name: 'Corte de Grama',
          zone: 'ZV',
          unit: 'M2',
          planned_date: '2026-09-08',
          planned_qty: 500,
          theoretical_jr: 0.8,
          source_type: 'ROUTINE',
          routine_reference: 'r1',
          occurrence_key: 'o1',
          crew_id: 'crew_zv',
          is_manual_override: false,
          status: 'planned',
        },
        {
          id: 'item_2',
          weekly_plan_id: 'wp1',
          board_id: 'b1',
          activity_key: 'poda_arbustos',
          name: 'Poda de Arbustos',
          zone: 'ZV',
          unit: 'M2',
          planned_date: '2026-09-08',
          planned_qty: 300,
          theoretical_jr: 0.5,
          source_type: 'ROUTINE',
          routine_reference: 'r2',
          occurrence_key: 'o2',
          crew_id: 'crew_zv', // Mismo día (2026-09-08), misma cuadrilla -> suma = 0.8 + 0.5 = 1.3 JR (> 1.0)
          is_manual_override: false,
          status: 'planned',
        },
      ];

      const workloads = calculateCrewWorkloads(planItems, crews, { crew_zv: 1.0 });

      expect(workloads).toHaveLength(1);
      expect(workloads[0].crewId).toBe('crew_zv');
      expect(workloads[0].plannedDate).toBe('2026-09-08');
      expect(workloads[0].totalPlannedJournals).toBe(1.3);
      expect(workloads[0].applicableDailyCapacity).toBe(1.0);
      expect(workloads[0].status).toBe('SOBRECARGA');
    });

    it('NO debe generar sobrecarga (falsos positivos) cuando múltiples tareas no superan la capacidad diaria', () => {
      const planItems: WeeklyPlanItem[] = [
        {
          id: 'item_1',
          weekly_plan_id: 'wp1',
          board_id: 'b1',
          activity_key: 'corte_grama',
          name: 'Corte de Grama Corto',
          zone: 'ZV',
          unit: 'M2',
          planned_date: '2026-09-08',
          planned_qty: 200,
          theoretical_jr: 0.4,
          source_type: 'ROUTINE',
          routine_reference: 'r1',
          occurrence_key: 'o1',
          crew_id: 'crew_zv',
          is_manual_override: false,
          status: 'planned',
        },
        {
          id: 'item_2',
          weekly_plan_id: 'wp1',
          board_id: 'b1',
          activity_key: 'limpieza_marmol',
          name: 'Limpieza Mármol',
          zone: 'ZV',
          unit: 'M2',
          planned_date: '2026-09-08',
          planned_qty: 100,
          theoretical_jr: 0.4,
          source_type: 'ROUTINE',
          routine_reference: 'r2',
          occurrence_key: 'o2',
          crew_id: 'crew_zv', // Mismo día, 2 tareas -> suma = 0.4 + 0.4 = 0.8 JR (<= 1.0)
          is_manual_override: false,
          status: 'planned',
        },
      ];

      const workloads = calculateCrewWorkloads(planItems, crews, { crew_zv: 1.0 });

      expect(workloads).toHaveLength(1);
      expect(workloads[0].totalPlannedJournals).toBe(0.8);
      expect(workloads[0].status).toBe('NORMAL'); // Sin falso positivo
    });
  });
});
