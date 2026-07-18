import { AgendaSemaphoreColor } from '@/types/scheduler';

// Compartido entre AgendaOperativaView (Hoy) y AgendaSemanaBlock (Semana) —
// mismos umbrales/colores en los dos bloques de semáforo de la Agenda.
export const SEMAPHORE_STYLE: Record<AgendaSemaphoreColor, string> = {
  green: 'text-[#10B981] fill-[#10B981]',
  amber: 'text-amber-400 fill-amber-400',
  red:   'text-red-400 fill-red-400',
};
