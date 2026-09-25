/**
 * Test Suite: MyWork Temporal Projection (UX-01)
 *
 * Cobertura Completa de Casos UX01-01 a UX01-20:
 * - UX01-01: Hoy con actividades
 * - UX01-02: Hoy sin actividades
 * - UX01-03: Hoy + Resagadas
 * - UX01-04: Solo resagadas
 * - UX01-05: Actividades futuras no visibles en home
 * - UX01-06: Actividad histórica completada no aparece como resagada
 * - UX01-07: Ejecución parcial anterior aparece como resagada
 * - UX01-08: Ejecución reportada anterior pendiente de verificación aparece como resagada
 * - UX01-09: Ejecución rechazada anterior aparece como resagada
 * - UX01-10: Sobrecumplimiento histórico o de hoy
 * - UX01-11: Cambio de día determinista en America/Bogota
 * - UX01-12: Cambio de semana
 * - UX01-13: Múltiples sitios
 * - UX01-14: Semana futura (sin planes de hoy)
 * - UX01-15: Semana anterior (sin planes de hoy)
 * - UX01-16: Datos vacíos / null
 * - UX01-17: Estado sin ítems en plan existente
 * - UX01-18: Agrupación ordenada de resagadas por fecha
 * - UX01-19: Actividad con fecha ISO válida vs fallback
 * - UX01-20: Preservación total de inmutabilidad en DTOs originales
 */

import {
  classifyItemTemporalStatus,
  isActivityOperationallyFinalized,
  projectMyWorkTemporalView,
  calculateDaysDifference,
  formatFriendlyDate,
} from '../myWorkTemporalProjection';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';

describe('MyWork Temporal Projection Service (UX-01)', () => {
  const TODAY_BOGOTA = '2026-09-24'; // Jueves 24 de Septiembre de 2026

  const createMockItem = (overrides: Partial<PublishedWeekPlanItem> & { status?: string }): PublishedWeekPlanItem =>
    ({
      id: 'item-1',
      plan_id: 'plan-1',
      poa_activity_zone_id: 'paz-1',
      planned_sequence: 1,
      activity_key: '1.01',
      name: 'Actividad de Prueba',
      unit: 'ML',
      planned_qty: 100,
      planned_rendimiento: 50,
      planned_frecuencia: 1,
      planned_jr: 2,
      executed_qty: 0,
      executed_jr: 0,
      planned_date: TODAY_BOGOTA,
      priority: 'must_execute',
      created_at: '2026-09-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
      standard: {
        name: 'Actividad de Prueba',
        category: 'Zona 1',
        unit: 'ML',
      },
      crew: {
        id: 'crew-1',
        name: 'Cuadrilla Alfa',
      },
      ...overrides,
    } as PublishedWeekPlanItem);

  const createMockPlan = (items: PublishedWeekPlanItem[]): PublishedWeekPlan => ({
    id: 'plan-1',
    board_id: 'board-1',
    group_id: 'group-1',
    week_start: '2026-09-21',
    period_number: 1,
    status: 'published',
    published_by: null,
    published_at: null,
    confirmed_by: null,
    confirmed_at: null,
    closed_by: null,
    closed_at: null,
    created_by: 'user-1',
    updated_by: null,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
    group: { title: 'Sitio Central', color: '#3B7EF8' },
    board: { name: 'Tablero Operativo' },
    items,
  });

  test('UX01-01: Hoy con actividades (planned_date == today)', () => {
    const item = createMockItem({ planned_date: '2026-09-24', planned_qty: 50, executed_qty: 0 });
    const plan = createMockPlan([item]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.todayTotal).toBe(1);
    expect(res.counts.todayPending).toBe(1);
    expect(res.bucket.todayItems[0].id).toBe('item-1');
    expect(res.counts.overdueTotal).toBe(0);
    expect(res.counts.futureTotal).toBe(0);
  });

  test('UX01-02: Hoy sin actividades (plan no tiene items de hoy)', () => {
    const itemFuture = createMockItem({ id: 'item-fut', planned_date: '2026-09-25' });
    const plan = createMockPlan([itemFuture]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.todayTotal).toBe(0);
    expect(res.counts.futureTotal).toBe(1);
    expect(res.counts.overdueTotal).toBe(0);
  });

  test('UX01-03: Hoy + Resagadas (coexistencia de items de hoy y pendientes anteriores)', () => {
    const itemToday = createMockItem({ id: 'item-today', planned_date: '2026-09-24' });
    const itemOverdue = createMockItem({ id: 'item-past', planned_date: '2026-09-23', executed_qty: 0 });
    const plan = createMockPlan([itemToday, itemOverdue]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.todayTotal).toBe(1);
    expect(res.counts.overdueTotal).toBe(1);
    expect(res.overdueGroups.length).toBe(1);
    expect(res.overdueGroups[0].dateIso).toBe('2026-09-23');
    expect(res.overdueGroups[0].daysAgo).toBe(1);
  });

  test('UX01-04: Solo resagadas (hoy vacío pero con backlog)', () => {
    const item1 = createMockItem({ id: 'item-22', planned_date: '2026-09-22', executed_qty: 0 });
    const item2 = createMockItem({ id: 'item-23', planned_date: '2026-09-23', executed_qty: 10, planned_qty: 50 });
    const plan = createMockPlan([item1, item2]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.todayTotal).toBe(0);
    expect(res.counts.overdueTotal).toBe(2);
    expect(res.overdueGroups.length).toBe(2);
    expect(res.overdueGroups[0].dateIso).toBe('2026-09-23'); // Más reciente primero
    expect(res.overdueGroups[1].dateIso).toBe('2026-09-22');
  });

  test('UX01-05: Actividades futuras no visibles en home (planned_date > today)', () => {
    const itemFri = createMockItem({ id: 'item-fri', planned_date: '2026-09-25' });
    const itemSat = createMockItem({ id: 'item-sat', planned_date: '2026-09-26' });
    const plan = createMockPlan([itemFri, itemSat]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.bucket.futureItems.length).toBe(2);
    expect(res.bucket.todayItems.length).toBe(0);
    expect(res.bucket.overdueItems.length).toBe(0);
  });

  test('UX01-06: Actividad histórica completada no aparece como resagada', () => {
    const itemPastCompleted = createMockItem({
      id: 'item-done',
      planned_date: '2026-09-22',
      planned_qty: 100,
      executed_qty: 100,
      status: 'completed',
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'verified',
        evidencePreview: { before: [], after: [] },
      },
    });
    const plan = createMockPlan([itemPastCompleted]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.overdueTotal).toBe(0);
    expect(res.counts.historicalCompletedTotal).toBe(1);
    expect(res.bucket.historicalCompletedItems[0].id).toBe('item-done');
  });

  test('UX01-07: Ejecución parcial anterior aparece como resagada', () => {
    const itemPartial = createMockItem({
      id: 'item-partial',
      planned_date: '2026-09-23',
      planned_qty: 100,
      executed_qty: 40,
      status: 'in_progress',
    });
    const plan = createMockPlan([itemPartial]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.overdueTotal).toBe(1);
    expect(res.bucket.overdueItems[0].id).toBe('item-partial');
  });

  test('UX01-08: Ejecución reportada anterior pendiente de verificación aparece como resagada', () => {
    const itemReported = createMockItem({
      id: 'item-reported',
      planned_date: '2026-09-23',
      planned_qty: 100,
      executed_qty: 100,
      status: 'reported',
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-23',
        verificationStatus: 'reported', // No verificado ni confirmado aún
        evidencePreview: { before: [], after: [] },
      },
    });
    const plan = createMockPlan([itemReported]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    // Requiere atención operacional de supervisión / cierre
    expect(res.counts.overdueTotal).toBe(1);
  });

  test('UX01-09: Ejecución rechazada anterior aparece como resagada', () => {
    const itemRejected = createMockItem({
      id: 'item-rejected',
      planned_date: '2026-09-22',
      planned_qty: 100,
      executed_qty: 100,
      status: 'rejected',
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'rejected',
        latestRejectionNotes: 'Evidencia fotográfica insuficiente',
        evidencePreview: { before: [], after: [] },
      },
    });
    const plan = createMockPlan([itemRejected]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.overdueTotal).toBe(1);
    expect(res.bucket.overdueItems[0].id).toBe('item-rejected');
  });

  test('UX01-10: Sobrecumplimiento histórico o de hoy (executed_qty > planned_qty)', () => {
    const itemOverdelivered = createMockItem({
      id: 'item-over',
      planned_date: '2026-09-22',
      planned_qty: 100,
      executed_qty: 150,
      status: 'completed',
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'verified',
        evidencePreview: { before: [], after: [] },
      },
    });
    const cat = classifyItemTemporalStatus(itemOverdelivered, TODAY_BOGOTA);
    expect(cat).toBe('HISTORICAL_COMPLETED');
  });

  test('UX01-11: Cambio de día determinista en America/Bogota (corte exacto YYYY-MM-DD)', () => {
    const item24 = createMockItem({ planned_date: '2026-09-24' });

    // Cuando hoy es 24:
    expect(classifyItemTemporalStatus(item24, '2026-09-24')).toBe('TODAY');

    // Cuando hoy avanza a 25:
    expect(classifyItemTemporalStatus(item24, '2026-09-25')).toBe('OVERDUE');

    // Cuando hoy retrocede a 23:
    expect(classifyItemTemporalStatus(item24, '2026-09-23')).toBe('FUTURE');
  });

  test('UX01-12: Cambio de semana (planes de semanas anteriores o futuras)', () => {
    const pastWeekItem = createMockItem({ planned_date: '2026-09-15', executed_qty: 0 });
    const plan = createMockPlan([pastWeekItem]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.overdueTotal).toBe(1);
    expect(res.overdueGroups[0].daysAgo).toBe(9);
  });

  test('UX01-13: Múltiples sitios consolidados en la misma proyección temporal', () => {
    const planA = createMockPlan([
      createMockItem({ id: 'a1', planned_date: '2026-09-24' }),
    ]);
    const planB: PublishedWeekPlan = {
      ...createMockPlan([
        createMockItem({ id: 'b1', planned_date: '2026-09-24' }),
        createMockItem({ id: 'b2', planned_date: '2026-09-23', executed_qty: 0 }),
      ]),
      id: 'plan-2',
      group_id: 'site-b',
      group: { title: 'Sitio Norte', color: '#10B981' },
    };

    const res = projectMyWorkTemporalView([planA, planB], TODAY_BOGOTA);
    expect(res.counts.todayTotal).toBe(2);
    expect(res.counts.overdueTotal).toBe(1);
    expect(res.counts.allWeekTotal).toBe(3);
  });

  test('UX01-14: Semana futura (todos los items son posteriores a hoy)', () => {
    const plan = createMockPlan([
      createMockItem({ planned_date: '2026-09-28' }),
      createMockItem({ planned_date: '2026-09-29' }),
    ]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.todayTotal).toBe(0);
    expect(res.counts.overdueTotal).toBe(0);
    expect(res.counts.futureTotal).toBe(2);
  });

  test('UX01-15: Semana anterior (todos los items son anteriores a hoy)', () => {
    const plan = createMockPlan([
      createMockItem({
        planned_date: '2026-09-14',
        status: 'completed',
        executionsSummary: {
          totalExecutions: 1,
          lastExecutionDate: '2026-09-14',
          verificationStatus: 'confirmed',
          evidencePreview: { before: [], after: [] },
        },
      }),
      createMockItem({ planned_date: '2026-09-15', executed_qty: 0 }),
    ]);
    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);

    expect(res.counts.todayTotal).toBe(0);
    expect(res.counts.overdueTotal).toBe(1);
    expect(res.counts.historicalCompletedTotal).toBe(1);
  });

  test('UX01-16: Datos vacíos o null retornan estructura segura', () => {
    const resNull = projectMyWorkTemporalView(null, TODAY_BOGOTA);
    expect(resNull.hasPlanLoaded).toBe(false);
    expect(resNull.counts.todayTotal).toBe(0);
    expect(resNull.bucket.todayItems).toEqual([]);

    const resEmpty = projectMyWorkTemporalView([], TODAY_BOGOTA);
    expect(resEmpty.hasPlanLoaded).toBe(false);
    expect(resEmpty.counts.todayTotal).toBe(0);
  });

  test('UX01-17: Estado sin ítems en plan existente', () => {
    const planEmpty = createMockPlan([]);
    const res = projectMyWorkTemporalView([planEmpty], TODAY_BOGOTA);
    expect(res.hasPlanLoaded).toBe(true);
    expect(res.counts.todayTotal).toBe(0);
    expect(res.counts.allWeekTotal).toBe(0);
  });

  test('UX01-18: Agrupación y formateo amigable de fechas de resagadas', () => {
    expect(formatFriendlyDate('2026-09-23')).toBe('Miércoles 23 Sep');
    expect(formatFriendlyDate('2026-09-21')).toBe('Lunes 21 Sep');
    expect(calculateDaysDifference('2026-09-20', '2026-09-24')).toBe(4);
  });

  test('UX01-19: Actividad con fecha ISO válida vs fallback', () => {
    const itemWithDate = createMockItem({ planned_date: '2026-09-24T15:00:00Z' });
    expect(classifyItemTemporalStatus(itemWithDate, TODAY_BOGOTA)).toBe('TODAY');

    const itemWithoutDate = createMockItem({ planned_date: undefined });
    expect(classifyItemTemporalStatus(itemWithoutDate, TODAY_BOGOTA)).toBe('TODAY');
  });

  test('UX01-20: Preservación de inmutabilidad en DTOs originales', () => {
    const item = createMockItem({ planned_date: '2026-09-24', planned_qty: 120 });
    const plan = createMockPlan([item]);

    const res = projectMyWorkTemporalView([plan], TODAY_BOGOTA);
    expect(res.bucket.todayItems[0].planned_qty).toBe(120);
    expect(res.bucket.todayItems[0]).toBe(item); // Referencia preservada sin clonación destructiva
  });
});
