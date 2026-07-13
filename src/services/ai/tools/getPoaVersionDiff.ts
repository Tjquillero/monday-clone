import type { AiToolDefinition } from './types';
import { getPoaVersionDiff, type PoaVersionDiffDto } from '../domainTools/poaVersions';

export const getPoaVersionDiffTool: AiToolDefinition<
  { poa_id: string; from_version: number; to_version: number },
  PoaVersionDiffDto
> = {
  name: 'get_poa_version_diff',
  description:
    'Obtiene qué cambió entre dos versiones del POA de un board: actividades agregadas, eliminadas, ' +
    'cambios de cantidad contratada (por zona) y cambios de precio unitario (por actividad). Un cambio ' +
    'de precio entre versiones es normal, NO es un error — el precio unitario solo puede cambiar ' +
    'publicando una nueva versión del POA. Usa esto para responder "¿qué cambió entre la versión X y la ' +
    'Y?". No incluye impacto en ejecución ni facturación — para eso usa get_board_summary o ' +
    'get_pending_billable_work por separado.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      poa_id: { type: 'string', description: 'UUID del POA (el instrumento contractual del board).' },
      from_version: { type: 'number', description: 'Número de la versión de origen.' },
      to_version: { type: 'number', description: 'Número de la versión de destino.' },
    },
    required: ['poa_id', 'from_version', 'to_version'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) =>
    getPoaVersionDiff(supabase, params.poa_id, params.from_version, params.to_version),
};
