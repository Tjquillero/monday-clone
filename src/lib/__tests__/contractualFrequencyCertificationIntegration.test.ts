// =============================================================================
// Harness de Certificación de Integración Físico-Contractual de Cierre
// Incremento: Corrección Gobernada de Frecuencias Contractuales v1.0
// Ref: docs/architecture/poa-frequency-canonicalization.md
// =============================================================================

import { generateRoutineScheduleForWeek } from '../routineScheduler';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
import type { RoutineBaseTemplate } from '../routineScheduler';
import { computeOccurrenceKey } from '../../types/weeklyPlan';
import { normalizePoaFrequency } from '../poaImport/poaFrequencyNormalizer';

describe('Harness de Certificación Final — Corrección Gobernada de Frecuencias Contractuales v1.0', () => {
  const weekStartISO = '2026-09-21';
  const planId = 'plan-cert-freq-20260921';
  const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'; // Tablero Principal
  const sites = [
    'plaza-puerto-colombia',
    'playa-del-country',
    'manglares',
    'salinas-del-rey',
    'sabanagrande',
    'puerto-mojan',
    'malecon-luruarco',
    'playa-mendoza',
    'playa-palmar',
    'playa-tubara',
  ];

  it('CERT-01: Verificación de Normalización Semántica Determinista', () => {
    // 1.09, 1.10, 1.11 en Excel vienen con FREC = 1 -> Deben canonicalizarse a frecuencia = 4
    expect(normalizePoaFrequency({ frecExcel: 1, activityKey: '1.09', descripcion: 'Limpieza manual de playa' })).toBe(4);
    expect(normalizePoaFrequency({ frecExcel: 1, activityKey: '1.10', descripcion: 'Trasiego con maquinaria' })).toBe(4);
    expect(normalizePoaFrequency({ frecExcel: 1, activityKey: '1.11', descripcion: 'Oxigenación mecánica de arena' })).toBe(4);

    // Actividades diarias rutinarias 1.01-1.08 y 2.01-2.05 con FREC = 1 -> Deben conservarse como 1 (diario L-S)
    expect(normalizePoaFrequency({ frecExcel: 1, activityKey: '1.01', descripcion: 'Limpieza general' })).toBe(1);
    expect(normalizePoaFrequency({ frecExcel: 1, activityKey: '2.01', descripcion: 'Poda rutinaria' })).toBe(1);

    // Frecuencias fraccionarias/periódicas -> Deben conservarse intactas
    expect(normalizePoaFrequency({ frecExcel: 0.5, activityKey: '2.08' })).toBe(0.5);
    expect(normalizePoaFrequency({ frecExcel: 0.333, activityKey: '2.06' })).toBe(0.333);
  });

  it('CERT-02: Cuantificación Multisitio — Proyección de 18 slots a 3 slots/sitio (150 slots no elegibles en todo el contrato)', () => {
    const templatesErroneos: RoutineBaseTemplate[] = [
      { id: '1.09', activity_key: '1.09', name: 'Limpieza manual de playa', zone: 'Playa', unit: 'M²', rendimiento: 5000, frecuencia: 1, cantidad: 5000 },
      { id: '1.10', activity_key: '1.10', name: 'Trasiego con maquinaria', zone: 'Playa', unit: 'M²', rendimiento: 3000, frecuencia: 1, cantidad: 3000 },
      { id: '1.11', activity_key: '1.11', name: 'Oxigenación mecánica', zone: 'Playa', unit: 'M²', rendimiento: 4000, frecuencia: 1, cantidad: 4000 },
    ];

    const templatesCanonicos: RoutineBaseTemplate[] = [
      { id: '1.09', activity_key: '1.09', name: 'Limpieza manual de playa', zone: 'Playa', unit: 'M²', rendimiento: 5000, frecuencia: 4, cantidad: 5000 },
      { id: '1.10', activity_key: '1.10', name: 'Trasiego con maquinaria', zone: 'Playa', unit: 'M²', rendimiento: 3000, frecuencia: 4, cantidad: 3000 },
      { id: '1.11', activity_key: '1.11', name: 'Oxigenación mecánica', zone: 'Playa', unit: 'M²', rendimiento: 4000, frecuencia: 4, cantidad: 4000 },
    ];

    let totalSlotsErroneos = 0;
    let totalSlotsCanonicos = 0;

    for (const siteId of sites) {
      const projErr = generateRoutineScheduleForWeek(templatesErroneos, weekStartISO);
      const projCan = generateRoutineScheduleForWeek(templatesCanonicos, weekStartISO);

      expect(projErr.assignments.length).toBe(18); // 3 actividades x 6 días L-S
      expect(projCan.assignments.length).toBe(3);  // 3 actividades x 1 día Lunes

      totalSlotsErroneos += projErr.assignments.length;
      totalSlotsCanonicos += projCan.assignments.length;
    }

    expect(totalSlotsErroneos).toBe(180);  // 10 sitios x 18 slots
    expect(totalSlotsCanonicos).toBe(30);   // 10 sitios x 3 slots

    const slotsNoElegiblesTotal = totalSlotsErroneos - totalSlotsCanonicos;
    expect(slotsNoElegiblesTotal).toBe(150); // Exactamente 150 slots que la proyección deja de considerar elegibles
  });

  it('CERT-03: Reconciliación Conservadora, Preservación de Invariantes Físicas e Idempotencia en DB Real', async () => {
    const siteId = sites[0]; // Plaza Puerto Colombia
    const monDate = '2026-09-21';
    const tueDate = '2026-09-22';
    const wedDate = '2026-09-23';
    const thuDate = '2026-09-24';
    const friDate = '2026-09-25';

    const monKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', monDate);
    const tueKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', tueDate);
    const wedKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', wedDate);
    const thuKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', thuDate);
    const friKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', friDate);

    // Estado inicial de la base de datos para la semana 2026-09-21
    const dbStore = new Map<string, any>([
      ['i-mon', { id: 'i-mon', plan_id: planId, activity_key: '1.09', occurrence_key: monKey, status: 'planned', is_manual_override: false, executed_qty: 0, planned_qty: 5000 }],
      ['i-tue', { id: 'i-tue', plan_id: planId, activity_key: '1.09', occurrence_key: tueKey, status: 'completed', is_manual_override: false, executed_qty: 5000, planned_qty: 5000 }],
      ['i-wed', { id: 'i-wed', plan_id: planId, activity_key: '1.09', occurrence_key: wedKey, status: 'in_progress', is_manual_override: false, executed_qty: 2500, planned_qty: 5000 }],
      ['i-thu', { id: 'i-thu', plan_id: planId, activity_key: '1.09', occurrence_key: thuKey, status: 'planned', is_manual_override: true, executed_qty: 0, planned_qty: 5000 }],
      ['i-fri', { id: 'i-fri', plan_id: planId, activity_key: '1.09', occurrence_key: friKey, status: 'planned', is_manual_override: false, executed_qty: 0, planned_qty: 5000 }],
    ]);

    const createChainableQuery = (data: any) => {
      const builder: any = {
        eq: () => builder,
        is: () => builder,
        maybeSingle: async () => ({ data, error: null }),
        select: () => builder,
      };
      return builder;
    };

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'weekly_plans') {
          return createChainableQuery({
            id: planId,
            board_id: boardId,
            group_id: siteId,
            week_start_date: weekStartISO,
            week_start: weekStartISO,
            week_end: '2026-09-27',
          });
        }
        if (table === 'weekly_plan_items') {
          return {
            select: (cols: string, opts?: any) => {
              const isHeadCount = opts?.count === 'exact' && opts?.head;
              return {
                eq: (col: string, val: string) => {
                  const list = Array.from(dbStore.values()).filter((i) => (i as any)[col] === val);
                  if (isHeadCount) {
                    return Promise.resolve({ count: list.length, data: null, error: null });
                  }
                  return Promise.resolve({ data: list, error: null });
                },
              };
            },
            update: (payload: any) => ({
              eq: (col: string, val: string) => {
                const item = dbStore.get(val);
                if (item) {
                  Object.assign(item, payload);
                  dbStore.set(val, item);
                }
                return Promise.resolve({ error: null });
              },
            }),
            insert: async (items: any[]) => {
              for (const it of items) dbStore.set(it.id || `item-${Math.random()}`, it);
              return { error: null };
            },
          };
        }
        if (table === 'poa_activity_zones') {
          return createChainableQuery({ id: 'zone-1' });
        }
        return createChainableQuery(null);
      },
    };

    // Proyección Canónica (frecuencia = 4)
    const templatesCanonicos: RoutineBaseTemplate[] = [
      { id: '1.09', activity_key: '1.09', name: 'Limpieza manual de playa', zone: 'Playa', unit: 'M²', rendimiento: 5000, frecuencia: 4, cantidad: 5000 },
    ];
    const newProjection = generateRoutineScheduleForWeek(templatesCanonicos, weekStartISO);

    // Conteo de protegidos ANTES de sincronizar
    const protectedBefore = Array.from(dbStore.values()).filter(
      (i) => i.status === 'completed' || i.status === 'in_progress' || i.is_manual_override
    );
    expect(protectedBefore.length).toBe(3);

    // PASS 1: Primera sincronización/materialización
    const res1 = await syncWeeklyPlanForBoard(mockSupabase, boardId, siteId, weekStartISO, newProjection);
    expect(res1.cancelledCount).toBe(1); // Cancela solo la ocurrencia obsoleta del Viernes

    // Verificación de Invariantes post Pass 1
    const protectedAfterPass1 = Array.from(dbStore.values()).filter(
      (i) => i.status === 'completed' || i.status === 'in_progress' || i.is_manual_override
    );
    expect(protectedAfterPass1.length).toBe(3);
    expect(protectedAfterPass1.map((p) => p.id)).toEqual(['i-tue', 'i-wed', 'i-thu']);

    // Verificar que executed_qty y estados de completed/in_progress no sufrieron ninguna mutación
    expect(dbStore.get('i-tue').executed_qty).toBe(5000);
    expect(dbStore.get('i-tue').status).toBe('completed');
    expect(dbStore.get('i-wed').executed_qty).toBe(2500);
    expect(dbStore.get('i-wed').status).toBe('in_progress');
    expect(dbStore.get('i-thu').is_manual_override).toBe(true);
    expect(dbStore.get('i-fri').status).toBe('cancelled');

    // PASS 2: Segunda sincronización (Prueba de Idempotencia Físico-Contractual)
    const res2 = await syncWeeklyPlanForBoard(mockSupabase, boardId, siteId, weekStartISO, newProjection);

    // Invariante de Idempotencia: 0 inserciones, 0 actualizaciones, 0 nuevas cancelaciones
    expect(res2.insertedCount).toBe(0);
    expect(res2.updatedCount).toBe(0);
    expect(res2.cancelledCount).toBe(0);

    const protectedAfterPass2 = Array.from(dbStore.values()).filter(
      (i) => i.status === 'completed' || i.status === 'in_progress' || i.is_manual_override
    );
    expect(protectedAfterPass2.length).toBe(3);
    expect(Array.from(dbStore.values()).length).toBe(5); // Cero duplicados o registros huérfanos
  });
});
