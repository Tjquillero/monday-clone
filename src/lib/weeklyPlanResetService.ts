/**
 * Servicio de Reprogramación Gobernada de Planes Semanales (GATE PLAN-REDO-01)
 *
 * Permite vaciar los ítems de un plan semanal futuro (sin ejecuciones) para
 * re-materializarlo con la configuración operativa vigente.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export class WeeklyPlanResetError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WeeklyPlanResetError';
    this.code = code;
  }
}

/**
 * Traduce códigos de error del RPC reset_weekly_plan_items a mensajes claros para el usuario.
 */
export function translateResetErrorCode(errorMessage: string): { code: string; message: string } {
  const msg = errorMessage || '';

  if (msg.includes('RESET_DENIED: no autenticado')) {
    return {
      code: 'RESET_DENIED',
      message: 'No autenticado: debes iniciar sesión para reprogramar el plan semanal.',
    };
  }

  if (msg.includes('RESET_DENIED')) {
    return {
      code: 'RESET_DENIED',
      message: 'Acceso denegado: no tienes permisos para gestionar o reprogramar planes en este tablero.',
    };
  }

  if (msg.includes('RESET_REASON_REQUIRED')) {
    return {
      code: 'RESET_REASON_REQUIRED',
      message: 'El motivo de reprogramación es obligatorio y debe tener al menos 10 caracteres.',
    };
  }

  if (msg.includes('RESET_PLAN_NOT_FOUND')) {
    return {
      code: 'RESET_PLAN_NOT_FOUND',
      message: 'El plan semanal no existe o no fue encontrado.',
    };
  }

  if (msg.includes('RESET_INVALID_STATUS')) {
    const statusMatch = msg.match(/RESET_INVALID_STATUS:\s*([a-zA-Z0-9_-]+)/);
    const status = statusMatch ? statusMatch[1] : '';
    return {
      code: 'RESET_INVALID_STATUS',
      message: status
        ? `Solo se pueden reprogramar planes en borrador o publicados. El plan actual se encuentra en estado: ${status}.`
        : 'Solo se pueden reprogramar planes en estado borrador o publicado.',
    };
  }

  if (msg.includes('RESET_WEEK_STARTED')) {
    return {
      code: 'RESET_WEEK_STARTED',
      message: 'No se puede reprogramar una semana que ya ha iniciado o que pertenece a fechas pasadas.',
    };
  }

  if (msg.includes('RESET_HAS_EXECUTIONS')) {
    return {
      code: 'RESET_HAS_EXECUTIONS',
      message: 'No se puede reprogramar este plan porque ya cuenta con registros de ejecución en campo.',
    };
  }

  return {
    code: 'RESET_UNEXPECTED',
    message: msg || 'Error inesperado al reprogramar el plan semanal.',
  };
}

/**
 * Ejecuta el reseteo transaccional de los ítems de un plan semanal mediante RPC en PostgreSQL.
 *
 * @param supabase Cliente de Supabase autenticado
 * @param planId Identificador UUID del plan
 * @param reason Motivo obligatorio del reset (mínimo 10 caracteres)
 * @returns Número de ítems borrados
 */
export async function resetWeeklyPlan(
  supabase: SupabaseClient | any,
  planId: string,
  reason: string
): Promise<number> {
  const { data, error } = await supabase.rpc('reset_weekly_plan_items', {
    p_plan_id: planId,
    p_reason: reason,
  });

  if (error) {
    const { code, message } = translateResetErrorCode(error.message);
    throw new WeeklyPlanResetError(code, message);
  }

  return typeof data === 'number' ? data : Number(data) || 0;
}
