import { GoogleGenAI, createPartFromUri, Type } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExecutionAttachments, type ExecutionAttachmentRef } from './domainTools/evidence';
import { generateWithModelFallback } from './geminiFallback';

// v2.4b de Fase 5 (visión por computador) — duplicados VISUALES posibles
// (misma escena, fotos distintas), a diferencia de v2.4 (duplicados
// EXACTOS, mismo archivo byte a byte, sin Gemini). Contrato congelado con
// el usuario antes de escribir esto:
//
//   A diferencia de v2.4, aquí NO hay verdad objetiva. Un hash responde
//   "son idénticas"; Gemini solo puede responder "parecen muy similares".
//   Nunca "duplicados" — el campo se llama posibleVisualDuplicates.
//
//   Gemini puede decir: parecen la misma escena, mismo punto de vista,
//   mismo objeto fotografiado, diferencias mínimas, posible repetición de
//   evidencia. NUNCA: cuál foto es "correcta", cuál debe eliminarse, que
//   hubo fraude, que intentaron inflar evidencia, que la ejecución está
//   mal certificada — decisiones humanas.
//
//   Sin porcentaje inventado, sin embeddings, sin distancia numérica
//   ficticia — solo confidence: low/medium/high y una razón en texto.
//
//   Optimización: los duplicados EXACTOS (mismo file_hash) ya los resolvió
//   v2.4 sin Gemini — aquí solo se envían fotos con hash DISTINTO (una
//   representante por hash, más las fotos sin hash que no se pueden
//   descartar así). Alcance: una sola ejecución (no board completo) — evita
//   la explosión combinatoria de comparar todo contra todo a nivel de
//   board. Límite duro de MAX_PHOTOS_TO_COMPARE por llamada — si se supera,
//   se niega explícitamente en vez de comparar solo un subconjunto arbitrario.

const MAX_PHOTOS_TO_COMPARE = 12;

export interface PossibleVisualDuplicate {
  fileNameA: string;
  fileNameB: string;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
}

export interface VisualDuplicateAssessment {
  possibleVisualDuplicates: PossibleVisualDuplicate[];
  limitations: string[];
}

// Una representante por file_hash (los duplicados exactos ya los reportó
// v2.4, no hace falta que Gemini los vea de nuevo) + todas las fotos sin
// hash (históricas), que no se pueden descartar así.
function dedupeByHash(attachments: ExecutionAttachmentRef[]): ExecutionAttachmentRef[] {
  const seenHashes = new Set<string>();
  const result: ExecutionAttachmentRef[] = [];
  for (const a of attachments) {
    if (!a.fileHash) {
      result.push(a);
      continue;
    }
    if (seenHashes.has(a.fileHash)) continue;
    seenHashes.add(a.fileHash);
    result.push(a);
  }
  return result;
}

const SYSTEM_INSTRUCTION =
  'Eres un asistente que compara fotos de evidencia de mantenimiento para detectar POSIBLES duplicados ' +
  'visuales — nunca un evaluador de cumplimiento contractual. Estas fotos ya NO son duplicados exactos ' +
  '(eso se descartó antes con un hash); tu única tarea es señalar pares que parezcan la misma escena o el ' +
  'mismo punto de vista, con diferencias mínimas — posible repetición de evidencia. Puedes decir: parecen ' +
  'la misma escena, mismo punto de vista, mismo objeto fotografiado, diferencias mínimas. NUNCA digas cuál ' +
  'foto es "correcta", cuál debe eliminarse, que hubo fraude, que intentaron inflar evidencia, ni que la ' +
  'ejecución está mal certificada — esas son decisiones humanas que no te corresponden. "confidence" es ' +
  'solo sobre qué tan parecidas se ven, nunca sobre la validez de la evidencia. Si no encuentras ningún par ' +
  'parecido, devuelve una lista vacía — no inventes coincidencias.';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    possibleVisualDuplicates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileNameA: { type: Type.STRING },
          fileNameB: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
          reason: { type: Type.STRING, description: 'Ej. "Mismo encuadre con diferencias mínimas".' },
        },
        required: ['fileNameA', 'fileNameB', 'confidence', 'reason'],
      },
    },
  },
  required: ['possibleVisualDuplicates'],
};

export async function findPossibleVisualDuplicates(
  supabase: SupabaseClient,
  executionId: string
): Promise<VisualDuplicateAssessment> {
  const attachments = await getExecutionAttachments(supabase, executionId);
  const candidates = dedupeByHash(attachments);

  if (candidates.length < 2) {
    return {
      possibleVisualDuplicates: [],
      limitations: ['Esta ejecución no tiene suficientes fotos con contenido distinto para comparar (mínimo 2).'],
    };
  }

  if (candidates.length > MAX_PHOTOS_TO_COMPARE) {
    return {
      possibleVisualDuplicates: [],
      limitations: [
        `Esta ejecución tiene ${candidates.length} fotos con contenido distinto, más del máximo de ` +
          `${MAX_PHOTOS_TO_COMPARE} que se pueden comparar en una sola consulta.`,
      ],
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  const client = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: 'Estas son las fotos a comparar, en el mismo orden que sus nombres:' }];
  for (const c of candidates) {
    parts.push({ text: `Foto "${c.fileName}":` });
    parts.push(createPartFromUri(c.fileUrl, c.fileType || 'image/jpeg'));
  }
  parts.push({ text: 'Señala solo los pares que parezcan la misma escena o el mismo punto de vista.' });

  const { response } = await generateWithModelFallback(client, (model) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })
  );

  const text: string = response.candidates?.[0]?.content?.parts?.[0]?.text || response.text || '';
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed.possibleVisualDuplicates) ? parsed.possibleVisualDuplicates : [];
    return {
      possibleVisualDuplicates: list.map((d: any) => ({
        fileNameA: String(d.fileNameA || ''),
        fileNameB: String(d.fileNameB || ''),
        confidence: ['low', 'medium', 'high'].includes(d.confidence) ? d.confidence : 'low',
        reason: String(d.reason || ''),
      })),
      limitations: [],
    };
  } catch {
    throw new Error('No se pudo interpretar la comparación de posibles duplicados visuales del modelo.');
  }
}
