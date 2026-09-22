/**
 * Suite 43 & Hito: Gestión Operativa de Recursos de Ejecución v1 (RCO-01 a RCO-24)
 * Baseline: 108 suites / 852 tests
 *
 * Invariantes Obligatorios:
 * CONS-01 a CONS-08: Invariantes base de consumo físico de jornales (Suite 43).
 * RCO-01 a RCO-24: Matriz contractual completa para recursos operativos adicionales (MATERIAL, EQUIPO_MENOR, EQUIPO_MAYOR).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {
  evaluateItemResourceConsumption,
  calculateSiteResourceConsumption,
  validateOperationalResourceItem,
  MinimalExecutionRecord,
  OperationalResourceItem,
  ResourceVarianceDetail,
} from '../resourceConsumptionControlService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';

describe('Suite 43 & Hito: Gestión Operativa de Recursos de Ejecución v1', () => {
  const mockBoardId = 'board-001';

  const createMockPlanItem = (
    id: string,
    occurrenceKey: string,
    plannedQty: number,
    theoreticalJr: number,
    crewId?: string,
    machineryId?: string
  ): WeeklyPlanItem => ({
    id,
    weekly_plan_id: 'plan-001',
    board_id: mockBoardId,
    activity_key: 'ACT_CORTE',
    name: 'Corte de Césped',
    zone: 'ZV',
    unit: 'm2',
    planned_date: '2026-09-15',
    planned_qty: plannedQty,
    theoretical_jr: theoreticalJr,
    source_type: 'ROUTINE',
    routine_reference: 'ROUT_CORTE',
    occurrence_key: occurrenceKey,
    crew_id: crewId ?? 'crew-alfa',
    is_manual_override: false,
    status: 'planned',
    ...(machineryId ? ({ machinery_id: machineryId } as any) : {}),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Suite Base de Consumo Físico de Jornales (CONS-01 a CONS-08)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('CONS-01 & CONS-02: Precedencia de Alcance Físico sobre Consumo', () => {
    test('CANÓNICO: Subejecución física (600/1000 m2 con 6/10 JR) resulta en SUBEJECUCION_ALCANCE (NUNCA menor consumo)', () => {
      const planItem = createMockPlanItem('item-1', 'occ-1', 1000, 10);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-1',
          weekly_plan_item_id: 'item-1',
          occurrence_key: 'occ-1',
          executed_qty: 600,
          executed_jr: 6,
          verification_status: 'VERIFIED',
          status: 'completed',
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.scopeComplianceStatus).toBe('SUBEJECUCION_ALCANCE');
      expect(result.consumptionStatus).toBe('SUBEJECUCION_ALCANCE');
      expect(result.executedQty).toBe(600);
      expect(result.executedJr).toBe(6);
    });

    test('Eficiencia real: Alcance completo (1000/1000 m2 con 6/10 JR) resulta en MENOR_CONSUMO_JR', () => {
      const planItem = createMockPlanItem('item-1', 'occ-1', 1000, 10);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-1',
          weekly_plan_item_id: 'item-1',
          occurrence_key: 'occ-1',
          executed_qty: 1000,
          executed_jr: 6,
          verification_status: 'VERIFIED',
          status: 'completed',
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.scopeComplianceStatus).toBe('ALCANCE_COMPLETO');
      expect(result.consumptionStatus).toBe('MENOR_CONSUMO_JR');
      expect(result.deltaJr).toBe(-4);
    });

    test('Exceso de consumo: Alcance completo (1000/1000 m2 con 12/10 JR) resulta en EXCESO_CONSUMO_JR', () => {
      const planItem = createMockPlanItem('item-1', 'occ-1', 1000, 10);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-1',
          weekly_plan_item_id: 'item-1',
          occurrence_key: 'occ-1',
          executed_qty: 1000,
          executed_jr: 12,
          verification_status: 'VERIFIED',
          status: 'completed',
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.scopeComplianceStatus).toBe('ALCANCE_COMPLETO');
      expect(result.consumptionStatus).toBe('EXCESO_CONSUMO_JR');
      expect(result.deltaJr).toBe(2);
    });

    test('Consumo balanceado: Alcance completo con diferencia <= 0.05 JR resulta en CONSUMO_BALANCEADO', () => {
      const planItem = createMockPlanItem('item-1', 'occ-1', 1000, 10);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-1',
          weekly_plan_item_id: 'item-1',
          occurrence_key: 'occ-1',
          executed_qty: 1000,
          executed_jr: 10.04,
          verification_status: 'VERIFIED',
          status: 'completed',
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.scopeComplianceStatus).toBe('ALCANCE_COMPLETO');
      expect(result.consumptionStatus).toBe('CONSUMO_BALANCEADO');
    });
  });

  describe('CONS-03: Exclusión de Ejecuciones No Verificadas o Rechazadas (ADR-0011)', () => {
    test('Ignora ejecuciones en borrador, pendientes o rechazadas y acumula 0.0 JR verificados', () => {
      const planItem = createMockPlanItem('item-1', 'occ-1', 1000, 10);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-draft',
          weekly_plan_item_id: 'item-1',
          occurrence_key: 'occ-1',
          executed_qty: 500,
          executed_jr: 5,
          verification_status: 'draft',
        },
        {
          id: 'exec-rejected',
          weekly_plan_item_id: 'item-1',
          occurrence_key: 'occ-1',
          executed_qty: 500,
          executed_jr: 5,
          verification_status: 'rejected',
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.executedQty).toBe(0);
      expect(result.executedJr).toBe(0);
      expect(result.verifiedExecutionsCount).toBe(0);
      expect(result.scopeComplianceStatus).toBe('SUBEJECUCION_ALCANCE');
    });
  });

  describe('CONS-06: Separación Inequívoca por occurrence_key', () => {
    test('No mezcla ejecuciones de distintas ocurrencias de la misma actividad', () => {
      const itemWeek1 = createMockPlanItem('item-w1', 'occ-week-1', 500, 5);
      const itemWeek2 = createMockPlanItem('item-w2', 'occ-week-2', 500, 5);

      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-w1',
          weekly_plan_item_id: 'item-w1',
          occurrence_key: 'occ-week-1',
          executed_qty: 500,
          executed_jr: 4,
          verification_status: 'VERIFIED',
        },
      ];

      const res1 = evaluateItemResourceConsumption(itemWeek1, executions);
      const res2 = evaluateItemResourceConsumption(itemWeek2, executions);

      expect(res1.executedJr).toBe(4);
      expect(res1.scopeComplianceStatus).toBe('ALCANCE_COMPLETO');

      expect(res2.executedJr).toBe(0);
      expect(res2.scopeComplianceStatus).toBe('SUBEJECUCION_ALCANCE');
    });
  });

  describe('CONS-07 & CONS-08: Rotulado Consultivo y Costo Monetario Indeterminado', () => {
    test('Proyecta cuadrilla y maquinaria como asignadas y devuelve UNDETERMINED_MONETARY_COST', () => {
      const planItem = createMockPlanItem('item-1', 'occ-1', 1000, 10, 'crew-beta', 'maq-guadaña-01');
      const result = evaluateItemResourceConsumption(planItem, []);

      expect(result.assignedCrewId).toBe('crew-beta');
      expect(result.assignedMachineryId).toBe('maq-guadaña-01');
      expect(result.monetaryCostStatus).toBe('UNDETERMINED_MONETARY_COST');
    });
  });

  describe('CONS-04: Consolidado de Sitio e Invariante de Lectura Pura', () => {
    test('calculateSiteResourceConsumption acumula totales sin mutar los objetos de entrada', () => {
      const items = [
        createMockPlanItem('i1', 'occ-1', 500, 5),
        createMockPlanItem('i2', 'occ-2', 500, 5),
      ];
      const executions: MinimalExecutionRecord[] = [
        { id: 'e1', occurrence_key: 'occ-1', executed_qty: 500, executed_jr: 5, verification_status: 'VERIFIED' },
        { id: 'e2', occurrence_key: 'occ-2', executed_qty: 250, executed_jr: 3, verification_status: 'VERIFIED' },
      ];

      const summary = calculateSiteResourceConsumption(items, executions);

      expect(summary.totalPlanItemsCount).toBe(2);
      expect(summary.completedScopeItemsCount).toBe(1);
      expect(summary.subexecutionScopeItemsCount).toBe(1);
      expect(summary.totalTheoreticalJr).toBe(10);
      expect(summary.totalExecutedJrVerified).toBe(8);
      expect(summary.monetaryCostStatus).toBe('UNDETERMINED_MONETARY_COST');

      // Verificación de inmutabilidad de entrada
      expect(items[0].planned_qty).toBe(500);
      expect(executions[0].executed_qty).toBe(500);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MATRIZ CONTRACTUAL RCO-01 A RCO-24: GESTIÓN OPERATIVA DE RECURSOS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Matriz Contractual RCO-01 a RCO-24: Gestión Operativa de Recursos', () => {
    const sampleRequiredResources: OperationalResourceItem[] = [
      {
        resourceKey: 'MAT_CEMENTO',
        resourceName: 'Cemento Gris 50kg',
        category: 'MATERIAL',
        unit: 'saco',
        quantity: 20,
      },
      {
        resourceKey: 'EQM_COMPACTADORA',
        resourceName: 'Compactadora Manual',
        category: 'EQUIPO_MENOR',
        unit: 'unidad',
        quantity: 1,
      },
      {
        resourceKey: 'EQM_RETRO',
        resourceName: 'Retroexcavadora Oruga',
        category: 'EQUIPO_MAYOR',
        unit: 'unidad',
        quantity: 1,
      },
    ];

    test('RCO-01: Material utilizado correctamente (20 req vs 23 used -> EXCESO_UTILIZACION, delta +3)', () => {
      const planItem = createMockPlanItem('item-rco1', 'occ-rco1', 100, 5);
      const req: OperationalResourceItem[] = [
        {
          resourceKey: 'MAT_CEMENTO',
          resourceName: 'Cemento Gris 50kg',
          category: 'MATERIAL',
          unit: 'saco',
          quantity: 20,
        },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco1',
          weekly_plan_item_id: 'item-rco1',
          occurrence_key: 'occ-rco1',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            {
              resourceKey: 'MAT_CEMENTO',
              resourceName: 'Cemento Gris 50kg',
              category: 'MATERIAL',
              unit: 'saco',
              quantity: 23,
            },
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, req);
      const cemento = result.resourcesVariance.find((r) => r.resourceKey === 'MAT_CEMENTO');

      expect(cemento).toBeDefined();
      expect(cemento?.requiredQty).toBe(20);
      expect(cemento?.usedQty).toBe(23);
      expect(cemento?.deltaQty).toBe(3);
      expect(cemento?.varianceStatus).toBe('EXCESO_UTILIZACION');
      expect(cemento?.unit).toBe('saco');
    });

    test('RCO-02: Equipo menor utilizado correctamente (1 req vs 1 used -> BALANCEADO, delta 0)', () => {
      const planItem = createMockPlanItem('item-rco2', 'occ-rco2', 100, 5);
      const req: OperationalResourceItem[] = [
        {
          resourceKey: 'EQM_COMPACTADORA',
          resourceName: 'Compactadora Manual',
          category: 'EQUIPO_MENOR',
          unit: 'unidad',
          quantity: 1,
        },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco2',
          weekly_plan_item_id: 'item-rco2',
          occurrence_key: 'occ-rco2',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            {
              resourceKey: 'EQM_COMPACTADORA',
              resourceName: 'Compactadora Manual',
              category: 'EQUIPO_MENOR',
              unit: 'unidad',
              quantity: 1,
            },
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, req);
      const compactadora = result.resourcesVariance.find((r) => r.resourceKey === 'EQM_COMPACTADORA');

      expect(compactadora).toBeDefined();
      expect(compactadora?.requiredQty).toBe(1);
      expect(compactadora?.usedQty).toBe(1);
      expect(compactadora?.deltaQty).toBe(0);
      expect(compactadora?.varianceStatus).toBe('BALANCEADO');
    });

    test('RCO-03: Equipo mayor utilizado correctamente (1 req vs 0 used -> NO_UTILIZADO, delta -1)', () => {
      const planItem = createMockPlanItem('item-rco3', 'occ-rco3', 100, 5);
      const req: OperationalResourceItem[] = [
        {
          resourceKey: 'EQM_RETRO',
          resourceName: 'Retroexcavadora Oruga',
          category: 'EQUIPO_MAYOR',
          unit: 'unidad',
          quantity: 1,
        },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco3',
          weekly_plan_item_id: 'item-rco3',
          occurrence_key: 'occ-rco3',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [], // No se usó la retroexcavadora
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, req);
      const retro = result.resourcesVariance.find((r) => r.resourceKey === 'EQM_RETRO');

      expect(retro).toBeDefined();
      expect(retro?.requiredQty).toBe(1);
      expect(retro?.usedQty).toBe(0);
      expect(retro?.deltaQty).toBe(-1);
      expect(retro?.varianceStatus).toBe('NO_UTILIZADO');
    });

    test('RCO-04: Múltiples recursos en una misma ejecución (Material + Equipo menor + Equipo mayor)', () => {
      const planItem = createMockPlanItem('item-rco4', 'occ-rco4', 100, 5);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco4',
          weekly_plan_item_id: 'item-rco4',
          occurrence_key: 'occ-rco4',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            {
              resourceKey: 'MAT_CEMENTO',
              resourceName: 'Cemento Gris 50kg',
              category: 'MATERIAL',
              unit: 'saco',
              quantity: 23,
            },
            {
              resourceKey: 'EQM_COMPACTADORA',
              resourceName: 'Compactadora Manual',
              category: 'EQUIPO_MENOR',
              unit: 'unidad',
              quantity: 1,
            },
            // Retroexcavadora no reportada en usedResources
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, sampleRequiredResources);

      expect(result.resourcesVariance).toHaveLength(3);
      expect(result.resourcesVariance.find((r) => r.resourceKey === 'MAT_CEMENTO')?.varianceStatus).toBe('EXCESO_UTILIZACION');
      expect(result.resourcesVariance.find((r) => r.resourceKey === 'EQM_COMPACTADORA')?.varianceStatus).toBe('BALANCEADO');
      expect(result.resourcesVariance.find((r) => r.resourceKey === 'EQM_RETRO')?.varianceStatus).toBe('NO_UTILIZADO');
    });

    test('RCO-05 & RCO-06: Ejecución inexistente o recurso sin ejecución identificable aporta 0.0 usedQty', () => {
      const planItem = createMockPlanItem('item-rco5', 'occ-rco5', 100, 5);
      const req: OperationalResourceItem[] = [
        { resourceKey: 'MAT_PINTURA', resourceName: 'Pintura Vial', category: 'MATERIAL', unit: 'galon', quantity: 10 },
      ];

      // Sin ejecuciones
      const result = evaluateItemResourceConsumption(planItem, [], req);
      const pintura = result.resourcesVariance.find((r) => r.resourceKey === 'MAT_PINTURA');

      expect(pintura?.requiredQty).toBe(10);
      expect(pintura?.usedQty).toBe(0);
      expect(pintura?.varianceStatus).toBe('NO_UTILIZADO');
    });

    test('RCO-07: Ejecución perteneciente a otro plan item o semana rechazada/aislada por occurrence_key', () => {
      const planItemWeek1 = createMockPlanItem('item-w1', 'occ-week-1', 100, 5);
      const req: OperationalResourceItem[] = [
        { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento Gris 50kg', category: 'MATERIAL', unit: 'saco', quantity: 20 },
      ];

      const executionsOtherWeek: MinimalExecutionRecord[] = [
        {
          id: 'exec-w2',
          weekly_plan_item_id: 'item-w2',
          occurrence_key: 'occ-week-2', // Otra semana
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento Gris 50kg', category: 'MATERIAL', unit: 'saco', quantity: 50 },
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItemWeek1, executionsOtherWeek, req);
      const cemento = result.resourcesVariance.find((r) => r.resourceKey === 'MAT_CEMENTO');

      expect(cemento?.usedQty).toBe(0);
      expect(cemento?.varianceStatus).toBe('NO_UTILIZADO');
    });

    test('RCO-08: Cantidad inválida rechazada (quantity < 0, NaN, Infinity)', () => {
      expect(() => {
        validateOperationalResourceItem({
          resourceKey: 'MAT_ARENA',
          resourceName: 'Arena Fina',
          category: 'MATERIAL',
          unit: 'm3',
          quantity: -5,
        });
      }).toThrow(/INVALID_QUANTITY/);

      expect(() => {
        validateOperationalResourceItem({
          resourceKey: 'MAT_ARENA',
          resourceName: 'Arena Fina',
          category: 'MATERIAL',
          unit: 'm3',
          quantity: NaN,
        });
      }).toThrow(/INVALID_QUANTITY/);

      expect(() => {
        validateOperationalResourceItem({
          resourceKey: 'MAT_ARENA',
          resourceName: 'Arena Fina',
          category: 'MATERIAL',
          unit: 'm3',
          quantity: Infinity,
        });
      }).toThrow(/INVALID_QUANTITY/);
    });

    test('RCO-09: Recurso no identificable rechazado (resourceKey vacío, unit vacía, categoría inválida)', () => {
      expect(() => {
        validateOperationalResourceItem({
          resourceKey: '',
          resourceName: 'Sin Clave',
          category: 'MATERIAL',
          unit: 'unidad',
          quantity: 1,
        });
      }).toThrow(/INVALID_RESOURCE_KEY/);

      expect(() => {
        validateOperationalResourceItem({
          resourceKey: 'RES_1',
          resourceName: 'Sin Unidad',
          category: 'MATERIAL',
          unit: '',
          quantity: 1,
        });
      }).toThrow(/INVALID_UNIT/);

      expect(() => {
        validateOperationalResourceItem({
          resourceKey: 'RES_1',
          resourceName: 'Categoria Mala',
          category: 'INVALID_CAT' as any,
          unit: 'unidad',
          quantity: 1,
        });
      }).toThrow(/INVALID_CATEGORY/);
    });

    test('RCO-10: Requerimiento y utilización permanecen estrictamente separados e inmutables', () => {
      const planItem = createMockPlanItem('item-rco10', 'occ-rco10', 100, 5);
      const req: OperationalResourceItem[] = [
        { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento Gris 50kg', category: 'MATERIAL', unit: 'saco', quantity: 20 },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco10',
          weekly_plan_item_id: 'item-rco10',
          occurrence_key: 'occ-rco10',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento Gris 50kg', category: 'MATERIAL', unit: 'saco', quantity: 25 },
          ],
        },
      ];

      evaluateItemResourceConsumption(planItem, executions, req);

      // Verificación estricta de no mutación
      expect(req[0].quantity).toBe(20);
      expect(executions[0].usedResources![0].quantity).toBe(25);
    });

    test('RCO-11: Recurso no planificado utilizado correctamente identificado (req = 0 vs used = 5 -> NO_PLANIFICADO_UTILIZADO)', () => {
      const planItem = createMockPlanItem('item-rco11', 'occ-rco11', 100, 5);
      const req: OperationalResourceItem[] = []; // No se planificó aditivo
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco11',
          weekly_plan_item_id: 'item-rco11',
          occurrence_key: 'occ-rco11',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            {
              resourceKey: 'MAT_ADITIVO',
              resourceName: 'Aditivo Acelerante',
              category: 'MATERIAL',
              unit: 'galon',
              quantity: 5,
            },
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, req);
      const aditivo = result.resourcesVariance.find((r) => r.resourceKey === 'MAT_ADITIVO');

      expect(aditivo).toBeDefined();
      expect(aditivo?.requiredQty).toBe(0);
      expect(aditivo?.usedQty).toBe(5);
      expect(aditivo?.deltaQty).toBe(5);
      expect(aditivo?.varianceStatus).toBe('NO_PLANIFICADO_UTILIZADO');
    });

    test('RCO-12: Ejecución sin recursos adicionales sigue siendo 100% válida', () => {
      const planItem = createMockPlanItem('item-rco12', 'occ-rco12', 100, 5);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco12',
          weekly_plan_item_id: 'item-rco12',
          occurrence_key: 'occ-rco12',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          // Sin usedResources
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.resourcesVariance).toEqual([]);
      expect(result.executedJr).toBe(5);
      expect(result.scopeComplianceStatus).toBe('ALCANCE_COMPLETO');
      expect(result.consumptionStatus).toBe('CONSUMO_BALANCEADO');
    });

    test('RCO-13: Subejecución física no se interpreta como ahorro automático de insumos (executed_qty < planned_qty -> SUBEJECUCION_ALCANCE)', () => {
      const planItem = createMockPlanItem('item-rco13', 'occ-rco13', 100, 5);
      const req: OperationalResourceItem[] = [
        { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento Gris 50kg', category: 'MATERIAL', unit: 'saco', quantity: 20 },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco13',
          weekly_plan_item_id: 'item-rco13',
          occurrence_key: 'occ-rco13',
          executed_qty: 50, // Subejecución física (50/100)
          executed_jr: 2.5,
          verification_status: 'VERIFIED',
          usedResources: [
            { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento Gris 50kg', category: 'MATERIAL', unit: 'saco', quantity: 10 },
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, req);
      const cemento = result.resourcesVariance.find((r) => r.resourceKey === 'MAT_CEMENTO');

      expect(result.scopeComplianceStatus).toBe('SUBEJECUCION_ALCANCE');
      // Prohibición absoluta de catalogar como MENOR_UTILIZACION / ahorro cuando hay subejecución
      expect(cemento?.varianceStatus).toBe('SUBEJECUCION_ALCANCE');
      expect(cemento?.usedQty).toBe(10);
      expect(cemento?.requiredQty).toBe(20);
    });

    test('RCO-14, RCO-15, RCO-16, RCO-17: Invarianza estricta de planned_qty, executed_qty, planned_date y occurrence_key', () => {
      const planItem = createMockPlanItem('item-rco14', 'occ-rco14', 100, 5);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco14',
          weekly_plan_item_id: 'item-rco14',
          occurrence_key: 'occ-rco14',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [
            { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 20 },
          ],
        },
      ];

      evaluateItemResourceConsumption(planItem, executions);

      expect(planItem.planned_qty).toBe(100);
      expect(planItem.planned_date).toBe('2026-09-15');
      expect(planItem.occurrence_key).toBe('occ-rco14');
      expect(executions[0].executed_qty).toBe(100);
    });

    test('RCO-18: Compatibilidad total con consumidores existentes (calculateSiteResourceConsumption)', () => {
      const items = [createMockPlanItem('i1', 'occ-1', 500, 5)];
      const executions: MinimalExecutionRecord[] = [
        { id: 'e1', occurrence_key: 'occ-1', executed_qty: 500, executed_jr: 5, verification_status: 'VERIFIED' },
      ];

      const summary = calculateSiteResourceConsumption(items, executions);

      expect(summary.totalPlanItemsCount).toBe(1);
      expect(summary.totalTheoreticalJr).toBe(5);
      expect(summary.totalExecutedJrVerified).toBe(5);
      expect(summary.items[0].resourcesVariance).toBeDefined();
    });

    test('RCO-19: Ausencia total de lógica monetaria (monetaryCostStatus = UNDETERMINED_MONETARY_COST)', () => {
      const planItem = createMockPlanItem('item-rco19', 'occ-rco19', 100, 5);
      const result = evaluateItemResourceConsumption(planItem, []);

      expect(result.monetaryCostStatus).toBe('UNDETERMINED_MONETARY_COST');
      expect((result as any).totalCostCop).toBeUndefined();
      expect((result as any).unitPrice).toBeUndefined();
    });

    test('RCO-20: Aislamiento total de Solver H8 (Auditoría AST sobre resourceConsumptionControlService)', () => {
      const servicePath = path.resolve(__dirname, '../resourceConsumptionControlService.ts');
      const fileContent = fs.readFileSync(servicePath, 'utf-8');
      const sourceFile = ts.createSourceFile('resourceConsumptionControlService.ts', fileContent, ts.ScriptTarget.Latest, true);

      const forbiddenTerms = ['solver', 'optimizer', 'genetic', 'linearprogramming', 'heuristic', 'simplex', 'cplex'];
      let forbiddenFound = false;
      const detectedForbidden: string[] = [];

      function inspectNode(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).toLowerCase();
          for (const term of forbiddenTerms) {
            if (moduleSpecifier.includes(term)) {
              forbiddenFound = true;
              detectedForbidden.push(`Import: ${moduleSpecifier}`);
            }
          }
        }
        if (ts.isCallExpression(node)) {
          const callText = node.expression.getText(sourceFile).toLowerCase();
          for (const term of forbiddenTerms) {
            if (callText.includes(term)) {
              forbiddenFound = true;
              detectedForbidden.push(`Call: ${callText}`);
            }
          }
        }
        ts.forEachChild(node, inspectNode);
      }

      inspectNode(sourceFile);

      expect(forbiddenFound).toBe(false);
      expect(detectedForbidden).toHaveLength(0);
    });

    test('RCO-21 & RCO-22: Idempotencia y pureza funcional ante llamadas concurrentes', () => {
      const planItem = createMockPlanItem('item-rco21', 'occ-rco21', 100, 5);
      const req: OperationalResourceItem[] = [
        { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 20 },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-rco21',
          occurrence_key: 'occ-rco21',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'VERIFIED',
          usedResources: [{ resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 22 }],
        },
      ];

      const res1 = evaluateItemResourceConsumption(planItem, executions, req);
      const res2 = evaluateItemResourceConsumption(planItem, executions, req);

      expect(res1).toEqual(res2);
    });

    test('RCO-23: Filtrado operacional ADR-0011 (solo ejecuciones VERIFIED acumulan recursos utilizados)', () => {
      const planItem = createMockPlanItem('item-rco23', 'occ-rco23', 100, 5);
      const req: OperationalResourceItem[] = [
        { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 20 },
      ];
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-draft',
          occurrence_key: 'occ-rco23',
          executed_qty: 50,
          executed_jr: 2.5,
          verification_status: 'draft',
          usedResources: [{ resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 10 }],
        },
        {
          id: 'exec-reported',
          occurrence_key: 'occ-rco23',
          executed_qty: 50,
          executed_jr: 2.5,
          verification_status: 'reported',
          usedResources: [{ resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 10 }],
        },
        {
          id: 'exec-rejected',
          occurrence_key: 'occ-rco23',
          executed_qty: 50,
          executed_jr: 2.5,
          verification_status: 'rejected',
          usedResources: [{ resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 10 }],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions, req);
      const cemento = result.resourcesVariance.find((r) => r.resourceKey === 'MAT_CEMENTO');

      expect(result.verifiedExecutionsCount).toBe(0);
      expect(cemento?.usedQty).toBe(0);
      expect(cemento?.varianceStatus).toBe('NO_UTILIZADO');
    });

    test('RCO-24: Protección de hechos vinculados a Acta (desacoplamiento total de facturación y actas)', () => {
      const planItem = createMockPlanItem('item-rco24', 'occ-rco24', 100, 5);
      const executions: MinimalExecutionRecord[] = [
        {
          id: 'exec-acta',
          occurrence_key: 'occ-rco24',
          executed_qty: 100,
          executed_jr: 5,
          verification_status: 'confirmed', // Vinculado o confirmado
          usedResources: [
            { resourceKey: 'MAT_CEMENTO', resourceName: 'Cemento', category: 'MATERIAL', unit: 'saco', quantity: 20 },
          ],
        },
      ];

      const result = evaluateItemResourceConsumption(planItem, executions);

      expect(result.verifiedExecutionsCount).toBe(1);
      expect(result.resourcesVariance[0].usedQty).toBe(20);
      expect(result.monetaryCostStatus).toBe('UNDETERMINED_MONETARY_COST');
    });
  });
});
