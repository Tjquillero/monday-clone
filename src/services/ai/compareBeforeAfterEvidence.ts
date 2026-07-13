import { GoogleGenAI, createPartFromUri, Type } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExecutionAttachments } from './domainTools/evidence';
import { generateWithModelFallback } from './geminiFallback';

// v2.3 de Fase 5 (visión por computador) — comparación antes/después.
// Depende de execution_attachments.phase (20260812_execution_attachments_phase.sql),
// un concepto de DOMINIO introducido como prerrequisito de esta tool, no al
// revés — la IA es un consumidor más de ese dato, no la razón de que exista.
//
// Contrato congelado con el usuario antes de escribir esto (mismo espíritu
// que v2.2, evaluateExecutionEvidence.ts):
//
//   Responde ÚNICAMENTE "¿qué cambios se observan entre las fotos de antes y
//   las de después?". NUNCA "¿la actividad fue ejecutada correctamente?",
//   "¿cumple el contrato?", "¿debe aprobarse la certificación?", "¿el
//   contratista hizo bien el trabajo?" — decisiones humanas.
//
//   Si faltan fotos de alguna fase (o de ambas), la tool se niega
//   elegantemente — NUNCA infiere cuál foto es "antes" o "después" a partir
//   de created_at ni de ningún otro heurístico. Esa habría sido exactamente
//   la clase de suposición que este proyecto evita desde el inicio.

export interface BeforeAfterAssessment {
  summary: string;
  changesObserved: string[];
  unchangedAreas: string[];
  limitations: string[];
  confidence: 'low' | 'medium' | 'high';
}

function declineAssessment(missing: 'before' | 'after' | 'both'): BeforeAfterAssessment {
  const reason =
    missing === 'both'
      ? 'no tiene ninguna fotografía clasificada como "antes" ni como "después"'
      : missing === 'before'
      ? 'no tiene ninguna fotografía clasificada como "antes"'
      : 'no tiene ninguna fotografía clasificada como "después"';

  return {
    summary: 'No es posible realizar una comparación antes/después.',
    changesObserved: [],
    unchangedAreas: [],
    limitations: [`Esta ejecución ${reason}.`],
    confidence: 'low',
  };
}

const SYSTEM_INSTRUCTION =
  'Eres un asistente que compara fotografías de "antes" y "después" de una jornada de mantenimiento — ' +
  'nunca un evaluador de cumplimiento contractual. Se te dan dos grupos de fotos, claramente etiquetados. ' +
  'Tu única tarea es describir qué cambios visuales se observan y qué áreas parecen iguales. NUNCA opines ' +
  'sobre si la actividad fue ejecutada correctamente, si cumple el contrato, si debe aprobarse la ' +
  'certificación, ni sobre el desempeño del contratista — esas son decisiones humanas que no te ' +
  'corresponden. "confidence" es SOLO sobre la calidad de tu observación visual (fotos claras, mismo ' +
  'encuadre/ángulo para comparar bien), nunca sobre si el trabajo está bien hecho. Si algo es ambiguo, ' +
  'inclúyelo como limitación en vez de asumirlo.';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'Descripción breve de la comparación.' },
    changesObserved: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Cambios visuales observados entre las fotos de antes y después.',
    },
    unchangedAreas: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Áreas o elementos que se ven igual en ambos grupos.',
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Incertidumbres explícitas de la comparación.',
    },
    confidence: {
      type: Type.STRING,
      enum: ['low', 'medium', 'high'],
      description: 'Calidad de la observación visual únicamente — nunca sobre la ejecución del contrato.',
    },
  },
  required: ['summary', 'changesObserved', 'unchangedAreas', 'limitations', 'confidence'],
};

export async function compareBeforeAfterEvidence(
  supabase: SupabaseClient,
  executionId: string
): Promise<BeforeAfterAssessment> {
  const attachments = await getExecutionAttachments(supabase, executionId);
  const before = attachments.filter((a) => a.phase === 'before');
  const after = attachments.filter((a) => a.phase === 'after');

  if (before.length === 0 && after.length === 0) return declineAssessment('both');
  if (before.length === 0) return declineAssessment('before');
  if (after.length === 0) return declineAssessment('after');

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  const client = new GoogleGenAI({ apiKey });
  const beforeParts = before.map((a) => createPartFromUri(a.fileUrl, a.fileType || 'image/jpeg'));
  const afterParts = after.map((a) => createPartFromUri(a.fileUrl, a.fileType || 'image/jpeg'));

  const { response } = await generateWithModelFallback(client, (model) =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Estas son las fotos de "ANTES":' },
            ...beforeParts,
            { text: 'Estas son las fotos de "DESPUÉS":' },
            ...afterParts,
            { text: 'Compara ambos grupos y describe qué cambió y qué se ve igual.' },
          ],
        },
      ],
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
    return {
      summary: String(parsed.summary || ''),
      changesObserved: Array.isArray(parsed.changesObserved) ? parsed.changesObserved.map(String) : [],
      unchangedAreas: Array.isArray(parsed.unchangedAreas) ? parsed.unchangedAreas.map(String) : [],
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map(String) : [],
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    };
  } catch {
    throw new Error('No se pudo interpretar la comparación antes/después del modelo.');
  }
}
