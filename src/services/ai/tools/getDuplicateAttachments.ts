import type { AiToolDefinition } from './types';
import { getDuplicateAttachments, type DuplicateAttachmentGroup } from '../domainTools/evidence';

export const getDuplicateAttachmentsTool: AiToolDefinition<Record<string, never>, DuplicateAttachmentGroup[]> = {
  name: 'get_duplicate_attachments',
  description:
    'Obtiene fotos de evidencia que son EXACTAMENTE el mismo archivo (mismo hash, byte a byte) subido más ' +
    'de una vez en el board — ya sea dentro de la misma jornada o reutilizado entre jornadas distintas. ' +
    'Determinístico: no evalúa si dos fotos distintas se ven parecidas, solo si son el mismo archivo. Usa ' +
    'esto para responder "¿hay fotos de evidencia duplicadas?" o "¿algún archivo se subió dos veces?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {},
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, _params, ctx) => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }
    return getDuplicateAttachments(supabase, ctx.boardId);
  },
};
