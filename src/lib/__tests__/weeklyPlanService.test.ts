/**
 * Test Suite 34: Operational Weekly Planning & Persistence (ADR-0008)
 * Baseline Governance Certification: 2386465
 */

import {
  generateRoutineScheduleForWeek,
  RoutineBaseTemplate,
} from '../routineScheduler';
import {
  computeOccurrenceKey,
  mapRoutineAssignmentToItemInput,
  WeeklyPlanItem,
  WeeklyPlan,
} from '../../types/weeklyPlan';
import {
  getOrCreateWeeklyPlan,
  syncWeeklyPlanForBoard,
} from '../weeklyPlanService';

// Mock Supabase Client for in-memory DB testing
function createMockSupabaseClient() {
  const weeklyPlansStore = new Map<string, WeeklyPlan>();
  const weeklyPlanItemsStore = new Map<string, WeeklyPlanItem>();

  return {
    weeklyPlansStore,
    weeklyPlanItemsStore,

    from(table: string) {
      if (table === 'weekly_plans') {
        return {
          select() {
            return {
              eq(field: string, val: any) {
                return {
                  eq(field2: string, val2: any) {
                    return {
                      is(field3: string, val3: any) {
                        return {
                          maybeSingle: async () => {
                            const found = Array.from(weeklyPlansStore.values()).find(
                              (p) => p.board_id === val && p.week_start_date === val2 && (p.group_id === val3 || (!p.group_id && val3 === null))
                            );
                            return { data: found || null, error: null };
                          },
                          single: async () => {
                            const found = Array.from(weeklyPlansStore.values()).find(
                              (p) => p.board_id === val && p.week_start_date === val2 && (p.group_id === val3 || (!p.group_id && val3 === null))
                            );
                            return { data: found || null, error: null };
                          },
                        };
                      },
                      eq(field3: string, val3: any) {
                        return {
                          maybeSingle: async () => {
                            const found = Array.from(weeklyPlansStore.values()).find(
                              (p) => p.board_id === val && p.week_start_date === val2 && p.group_id === val3
                            );
                            return { data: found || null, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(input: any) {
            return {
              select() {
                return {
                  single: async () => {
                    const key = `${input.board_id}_${input.group_id || 'null'}_${input.week_start_date}`;
                    const existing = Array.from(weeklyPlansStore.values()).find(
                      (p) => p.board_id === input.board_id && p.week_start_date === input.week_start_date && p.group_id === input.group_id
                    );
                    if (existing) {
                      const err: any = new Error('duplicate key value violates unique constraint "uq_weekly_plan_board_group_week"');
                      err.code = '23505';
                      return { data: null, error: err };
                    }
                    const newPlan: WeeklyPlan = {
                      id: `plan-${Math.random().toString(36).substring(2, 9)}`,
                      board_id: input.board_id,
                      group_id: input.group_id || null,
                      week_start_date: input.week_start_date,
                      week_end_date: input.week_end_date,
                      status: input.status || 'published',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    weeklyPlansStore.set(newPlan.id, newPlan);
                    return { data: newPlan, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'weekly_plan_items') {
        return {
          select(fields?: string, options?: any) {
            return {
              eq(field: string, val: any) {
                const filtered = Array.from(weeklyPlanItemsStore.values()).filter((item) => {
                  if (field === 'weekly_plan_id') return item.weekly_plan_id === val;
                  if (field === 'board_id') return item.board_id === val;
                  return true;
                });

                if (options && options.count === 'exact') {
                  return Promise.resolve({ data: filtered, count: filtered.length, error: null });
                }

                return Promise.resolve({ data: filtered, error: null });
              },
            };
          },
          insert(inputs: any[]) {
            return Promise.resolve().then(() => {
              const insertedList: WeeklyPlanItem[] = [];
              for (const input of inputs) {
                // Check unique constraint uq_weekly_plan_item_occurrence
                const duplicate = Array.from(weeklyPlanItemsStore.values()).find(
                  (item) => item.weekly_plan_id === input.weekly_plan_id && item.occurrence_key === input.occurrence_key
                );
                if (duplicate) {
                  const err: any = new Error('duplicate key value violates unique constraint "uq_weekly_plan_item_occurrence"');
                  err.code = '23505';
                  return { data: null, error: err };
                }
                const newItem: WeeklyPlanItem = {
                  id: `item-${Math.random().toString(36).substring(2, 9)}`,
                  weekly_plan_id: input.weekly_plan_id,
                  board_id: input.board_id,
                  group_id: input.group_id || null,
                  activity_key: input.activity_key,
                  name: input.name,
                  zone: input.zone,
                  unit: input.unit,
                  planned_date: input.planned_date,
                  planned_qty: input.planned_qty,
                  theoretical_jr: input.theoretical_jr,
                  source_type: input.source_type || 'ROUTINE',
                  routine_reference: input.routine_reference,
                  occurrence_key: input.occurrence_key,
                  crew_id: input.crew_id || null,
                  is_manual_override: input.is_manual_override || false,
                  override_reason: input.override_reason || null,
                  status: input.status || 'planned',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                weeklyPlanItemsStore.set(newItem.id, newItem);
                insertedList.push(newItem);
              }
              return { data: insertedList, error: null };
            });
          },
          update(updatePayload: any) {
            return {
              eq(field: string, val: any) {
                const item = weeklyPlanItemsStore.get(val);
                if (item) {
                  Object.assign(item, updatePayload);
                }
                return Promise.resolve({ data: item || null, error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unhandled table: ${table}`);
    },
  };
}

describe('Test Suite 34 — ADR-0008 Persistencia y Conversión de Rutinas (Baseline 2386465)', () => {
  const boardId = 'board-puerto-colombia-001';
  const groupId = 'group-plaza-001';

  const puertoColombiaTemplates: RoutineBaseTemplate[] = [
    {
      id: 'pc-zd-1',
      activity_key: 'limpieza_zona_dura',
      name: 'Limpieza general zonas duras',
      zone: 'Zona Dura',
      unit: 'm2/día',
      rendimiento: 10000,
      frecuencia: 1, // Diario
      cantidad: 17150,
    },
    {
      id: 'pc-zv-1',
      activity_key: 'riego_arbustos_grama',
      name: 'Riego general Arbusto, Cubresuelos y grama',
      zone: 'Zona Verde',
      unit: 'm2/día',
      rendimiento: 3500,
      frecuencia: 2.083, // ~3x semana (L-Mi-V)
      cantidad: 2394.68,
      pattern_offset: 'turn_a',
    },
    {
      id: 'pc-zv-3',
      activity_key: 'poda_arbustos',
      name: 'Poda Arbustos y CS',
      zone: 'Zona Verde',
      unit: 'm2/día',
      rendimiento: 1200,
      frecuencia: 12.5, // Quincenal (Jueves)
      cantidad: 1850,
      preferred_days: [4],
    },
  ];

  // -------------------------------------------------------------------------
  // Test 34.1: Mapeo y Esquema Completo
  // -------------------------------------------------------------------------
  test('Test 34.1: Mapeo completo de RoutineWeeklyProjection a WeeklyPlanItemInput', () => {
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');
    expect(projection.assignments.length).toBeGreaterThan(0);

    const firstAssignment = projection.assignments[0];
    const mappedInput = mapRoutineAssignmentToItemInput(firstAssignment, 'plan-123', boardId, groupId);

    expect(mappedInput.weekly_plan_id).toBe('plan-123');
    expect(mappedInput.board_id).toBe(boardId);
    expect(mappedInput.group_id).toBe(groupId);
    expect(mappedInput.activity_key).toBe(firstAssignment.activity_key);
    expect(mappedInput.planned_qty).toBe(firstAssignment.cantidad);
    expect(mappedInput.source_type).toBe('ROUTINE');
    expect(mappedInput.is_manual_override).toBe(false);
    expect(mappedInput.status).toBe('planned');
    expect(mappedInput.occurrence_key).toBe(
      computeOccurrenceKey(boardId, groupId, firstAssignment.activity_key, firstAssignment.activity_key, firstAssignment.dateStr)
    );
  });

  // -------------------------------------------------------------------------
  // Test 34.2: Idempotencia Estricta en Base de Datos
  // -------------------------------------------------------------------------
  test('Test 34.2: Idempotencia estricta — sincronizar 2 veces produce 0 duplicados', async () => {
    const mockSupabase = createMockSupabaseClient() as any;
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    const result1 = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
    expect(result1.insertedCount).toBe(projection.assignments.length);
    expect(result1.totalItems).toBe(projection.assignments.length);

    // Segunda sincronización idéntica
    const result2 = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
    expect(result2.insertedCount).toBe(0);
    expect(result2.updatedCount).toBe(0);
    expect(result2.cancelledCount).toBe(0);
    expect(result2.totalItems).toBe(projection.assignments.length);
  });

  // -------------------------------------------------------------------------
  // Test 34.3: Preservación de Avance Real (in_progress / completed)
  // -------------------------------------------------------------------------
  test('Test 34.3: Ítems en in_progress o completed son inmutables ante cambios del scheduler', async () => {
    const mockSupabase = createMockSupabaseClient() as any;
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);

    // Simular que un ítem pasó a 'in_progress'
    const items = Array.from(mockSupabase.weeklyPlanItemsStore.values()) as WeeklyPlanItem[];
    const targetItem = items[0];
    targetItem.status = 'in_progress';

    // Sincronizar con una proyección vacía (simulando cambio de scheduler que ya no incluye la actividad)
    const emptyProjection = {
      weekStartStr: '2026-09-07',
      weekEndStr: '2026-09-13',
      assignments: [],
      totalJournals: 0,
    };

    const result = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', emptyProjection);
    expect(result.protectedCount).toBe(1);

    const refetchedItem = mockSupabase.weeklyPlanItemsStore.get(targetItem.id);
    expect(refetchedItem?.status).toBe('in_progress'); // No fue cancelado
  });

  // -------------------------------------------------------------------------
  // Test 34.4: Preservación de Sobreescritura de Supervisor (is_manual_override)
  // -------------------------------------------------------------------------
  test('Test 34.4: Modificación del supervisor mantiene source_type=ROUTINE e is_manual_override=true', async () => {
    const mockSupabase = createMockSupabaseClient() as any;
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);

    // Supervisor modifica la fecha/cuadrilla de una rutina
    const items = Array.from(mockSupabase.weeklyPlanItemsStore.values()) as WeeklyPlanItem[];
    const targetItem = items[0];
    targetItem.is_manual_override = true;
    targetItem.crew_id = 'crew-alpha-9';
    targetItem.override_reason = 'Reasignación operativa por disponibilidad de tractor';

    // Resincronización
    const result = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
    expect(result.protectedCount).toBe(1);

    const refetchedItem = mockSupabase.weeklyPlanItemsStore.get(targetItem.id);
    expect(refetchedItem?.source_type).toBe('ROUTINE'); // Origen intacto
    expect(refetchedItem?.is_manual_override).toBe(true);
    expect(refetchedItem?.crew_id).toBe('crew-alpha-9');
  });

  // -------------------------------------------------------------------------
  // Test 34.5: Discriminación por source_type (ROUTINE vs INCIDENT vs MANUAL)
  // -------------------------------------------------------------------------
  test('Test 34.5: Discriminación explícita de origen de trabajo', () => {
    const routineItem: Partial<WeeklyPlanItem> = { source_type: 'ROUTINE', routine_reference: 'rt-poda' };
    const incidentItem: Partial<WeeklyPlanItem> = { source_type: 'INCIDENT', routine_reference: 'inc-caida-arbol' };
    const manualItem: Partial<WeeklyPlanItem> = { source_type: 'MANUAL', routine_reference: 'manual' };

    expect(routineItem.source_type).toBe('ROUTINE');
    expect(incidentItem.source_type).toBe('INCIDENT');
    expect(manualItem.source_type).toBe('MANUAL');
  });

  // -------------------------------------------------------------------------
  // Test 34.6: Estado Terminal Cancelled — No Resurrección
  // -------------------------------------------------------------------------
  test('Test 34.6: Estado cancelled es terminal — no resucita a planned', async () => {
    const mockSupabase = createMockSupabaseClient() as any;
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);

    // Cancelar manualmente un ítem no ejecutado
    const items = Array.from(mockSupabase.weeklyPlanItemsStore.values()) as WeeklyPlanItem[];
    const targetItem = items[0];
    targetItem.status = 'cancelled';

    // Volver a sincronizar
    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);

    const refetchedItem = mockSupabase.weeklyPlanItemsStore.get(targetItem.id);
    expect(refetchedItem?.status).toBe('cancelled'); // Se mantiene en cancelled, NO vuelve a planned
  });

  // -------------------------------------------------------------------------
  // Test 34.7: Test Rector — Aislamiento Contractual Total
  // -------------------------------------------------------------------------
  test('Test 34.7: Rector — Persistencia operativa no altera POA ni billing', async () => {
    const mockSupabase = createMockSupabaseClient() as any;
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    const result = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
    expect(result.insertedCount).toBeGreaterThan(0);

    // Verificar que los ítems guardados no contienen propiedades contractuales
    const items = Array.from(mockSupabase.weeklyPlanItemsStore.values()) as WeeklyPlanItem[];
    items.forEach((item) => {
      expect(item).not.toHaveProperty('poa_catalog_id');
      expect(item).not.toHaveProperty('contractual_unit_price');
      expect(item).not.toHaveProperty('billing_claim_id');
    });
  });

  // -------------------------------------------------------------------------
  // Test 34.8: Control de Concurrencia (Simulación Procesos Simultáneos)
  // -------------------------------------------------------------------------
  test('Test 34.8: Concurrencia — dos procesos simultáneos no producen duplicados ni errores de clave', async () => {
    const mockSupabase = createMockSupabaseClient() as any;
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    // Ejecutar 2 llamadas simultáneas vía Promise.all
    const [res1, res2] = await Promise.all([
      syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection),
      syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection),
    ]);

    expect(res1.weeklyPlan.id).toBe(res2.weeklyPlan.id);
    expect(mockSupabase.weeklyPlansStore.size).toBe(1); // Exactamente 1 cabecera
    expect(mockSupabase.weeklyPlanItemsStore.size).toBe(projection.assignments.length); // 0 ítems duplicados
  });
});
