import {
  validateJornada, jornadaTimestamps, clockTime, executionToFormValues,
  JornadaFormValues,
} from './jornadaUtils';
import { WeeklyPlanItemExecution } from '@/types/scheduler';

const valid: JornadaFormValues = {
  execution_date: '2026-07-02',
  crew_name: 'Cuadrilla Norte',
  worker_count: 3,
  start_time: '07:00',
  end_time: '15:00',
  executed_qty: 25,
  notes: '',
};

describe('validateJornada', () => {
  it('acepta una jornada válida', () => {
    expect(validateJornada(valid)).toBeNull();
  });

  it('rechaza fecha vacía', () => {
    expect(validateJornada({ ...valid, execution_date: '' })).toMatch(/fecha/);
  });

  it('rechaza hora fin igual o anterior a la de inicio', () => {
    expect(validateJornada({ ...valid, end_time: '07:00' })).toMatch(/hora fin/i);
    expect(validateJornada({ ...valid, end_time: '06:30' })).toMatch(/hora fin/i);
  });

  it('rechaza menos de un trabajador', () => {
    expect(validateJornada({ ...valid, worker_count: 0 })).toMatch(/trabajador/);
  });

  it('rechaza cantidad negativa pero acepta cero', () => {
    expect(validateJornada({ ...valid, executed_qty: -1 })).toMatch(/cantidad/i);
    expect(validateJornada({ ...valid, executed_qty: 0 })).toBeNull();
  });
});

describe('jornadaTimestamps', () => {
  it('compone timestamps UTC con la hora del reloj tal cual', () => {
    expect(jornadaTimestamps(valid)).toEqual({
      started_at: '2026-07-02T07:00:00Z',
      finished_at: '2026-07-02T15:00:00Z',
    });
  });
});

describe('clockTime', () => {
  it('recorta la hora del reloj sin desplazamiento de zona', () => {
    expect(clockTime('2026-07-02T07:00:00+00:00')).toBe('07:00');
    expect(clockTime('2026-07-02T15:30:00Z')).toBe('15:30');
  });
});

describe('executionToFormValues', () => {
  it('reconstruye los valores del formulario desde una ejecución (roundtrip)', () => {
    const exec = {
      id: 'x',
      plan_item_id: 'y',
      execution_date: valid.execution_date,
      crew_name: valid.crew_name,
      crew_leader_id: null,
      worker_count: valid.worker_count,
      ...jornadaTimestamps(valid),
      executed_qty: valid.executed_qty,
      executed_jr: 3,
      status: 'draft',
      rejection_notes: null,
      verified_by: null,
      verified_at: null,
      notes: null,
      created_by: 'u',
      updated_by: null,
      created_at: '',
      updated_at: '',
    } as WeeklyPlanItemExecution;

    expect(executionToFormValues(exec)).toEqual({ ...valid, notes: '' });
  });

  it('convierte null en strings vacíos para el formulario', () => {
    const exec = {
      execution_date: '2026-07-02',
      crew_name: null,
      worker_count: 1,
      started_at: '2026-07-02T07:00:00Z',
      finished_at: '2026-07-02T08:00:00Z',
      executed_qty: 0,
      notes: null,
    } as WeeklyPlanItemExecution;

    const values = executionToFormValues(exec);
    expect(values.crew_name).toBe('');
    expect(values.notes).toBe('');
  });
});
