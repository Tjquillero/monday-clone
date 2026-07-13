import type { AiToolDefinition } from './types';
import { getDuplicateAttachments, type DuplicateAttachmentGroup } from '../domainTools/evidence';

export const getDuplicateAttachmentsTool: AiToolDefinition<{ board_id: string }, DuplicateAttachmentGroup[]> = {
  name: 'get_duplicate_attachments',
  description:
    'Obtiene fotos de evidencia que son EXACTAMENTE el mismo archivo (mismo hash, byte a byte) subido más ' +
    'de una vez en el board — ya sea dentro de la misma jornada o reutilizado entre jornadas distintas. ' +
    'Determinístico: no evalúa si dos fotos distintas se ven parecidas, solo si son el mismo archivo. Usa ' +
    'esto para responder "¿hay fotos de evidencia duplicadas?" o "¿algún archivo se subió dos veces?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      board_id: { type: 'string', description: 'UUID del board.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => getDuplicateAttachments(supabase, params.board_id),
};
