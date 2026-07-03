// Lógica pura del formulario de jornada — separada de los componentes para
// poder probarla sin renderizar. Los jornales (executed_jr) los calcula la
// base de datos; aquí solo se componen timestamps y se valida entrada.

import { WeeklyPlanItemExecution } from '@/types/scheduler';

export interface JornadaFormValues {
  execution_date: string; // ISO date
  crew_name: string;
  worker_count: number;
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  executed_qty: number;
  notes: string;
}

// Mensaje de error o null si la jornada es válida.
export function validateJornada(v: JornadaFormValues): string | null {
  if (!v.execution_date) return 'Indica la fecha de la jornada.';
  if (v.end_time <= v.start_time) return 'La hora fin debe ser posterior a la hora inicio.';
  if (v.worker_count < 1) return 'Debe haber al menos un trabajador.';
  if (v.executed_qty < 0) return 'La cantidad ejecutada no puede ser negativa.';
  return null;
}

// Las horas se guardan como `${fecha}T${HH:MM}:00Z`: la hora del reloj se
// conserva tal cual en UTC. executed_jr depende solo de la DURACIÓN
// (finished - started), así que el desplazamiento de zona se cancela.
export function jornadaTimestamps(v: Pick<JornadaFormValues, 'execution_date' | 'start_time' | 'end_time'>) {
  return {
    started_at: `${v.execution_date}T${v.start_time}:00Z`,
    finished_at: `${v.execution_date}T${v.end_time}:00Z`,
  };
}

// Hora del reloj de un timestamptz almacenado — recorte de string a propósito:
// usar Date la desplazaría a la zona local del navegador.
export function clockTime(timestamptz: string): string {
  return timestamptz.slice(11, 16);
}

// Prellenar el formulario para editar un borrador existente.
export function executionToFormValues(exec: WeeklyPlanItemExecution): JornadaFormValues {
  return {
    execution_date: exec.execution_date,
    crew_name: exec.crew_name ?? '',
    worker_count: exec.worker_count,
    start_time: clockTime(exec.started_at),
    end_time: clockTime(exec.finished_at),
    executed_qty: exec.executed_qty,
    notes: exec.notes ?? '',
  };
}
