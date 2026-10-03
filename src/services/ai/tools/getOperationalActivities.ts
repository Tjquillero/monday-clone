import type { AiToolDefinition } from './types';
import {
  getOperationalActivities,
  type OperationalActivityDto,
} from '../domainTools/operationalActivities';

export interface GetOperationalActivitiesParams {
  group_id?: string;
  search?: string;
  include_inactive?: boolean;
}

export const getOperationalActivitiesTool: AiToolDefinition<
  GetOperationalActivitiesParams,
  OperationalActivityDto[]
> = {
  name: 'get_operational_activities',
  description:
    'Obtiene las actividades con alcance contractual operativo real en el board, preservando la genealogía contractual (POA activo → poa_activities → poa_activity_zones → sitio/grupo → weekly_plans → weekly_plan_items). ' +
    'Permite consultar qué actividades están contratadas por sitio, buscar por código (ej. "2.19") o texto (ej. "muro vertical"), y contrastar la cantidad contratada (contractualQty) con la planificada (plannedQty). ' +
    'Por defecto excluye slots con demanda cero o sin alcance contractual asignado en el POA activo. Úsalo para responder preguntas como "¿qué actividades tiene este sitio?", "¿dónde está contratada la actividad X?" o "¿por qué aparece una actividad en un sitio?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      group_id: {
        type: 'string',
        description: 'UUID opcional de la zona o sitio para filtrar exclusivamente sus actividades.',
      },
      search: {
        type: 'string',
        description: 'Término opcional de búsqueda (ej. código "2.19" o texto "muro vertical") para filtrar actividades.',
      },
      include_inactive: {
        type: 'boolean',
        description: 'Si es true, incluye actividades del catálogo o slots con demanda cero (contractual_qty = 0). Por defecto es false (solo actividades operativas activas con demanda contractual > 0).',
      },
    },
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params, ctx) => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }
    return getOperationalActivities(supabase, ctx.boardId, {
      groupId: params.group_id || ctx.groupId || undefined,
      search: params.search,
      includeInactive: params.include_inactive,
    });
  },
};
