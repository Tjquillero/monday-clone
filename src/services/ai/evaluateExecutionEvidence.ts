import { GoogleGenAI, createPartFromUri, Type } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExecutionAttachments } from './domainTools/evidence';
import { generateWithModelFallback } from './geminiFallback';

// v2.2 de Fase 5 (visión por computador) — PRIMERA tool del copiloto cuyo
// execute() llama a Gemini internamente (con imágenes), no solo a una RPC
// determinística. Contrato congelado con el usuario antes de escribir esto:
//
//   Responde ÚNICAMENTE "¿qué muestran estas fotos y qué tan útiles parecen
//   como evidencia?" — NUNCA "¿está bien ejecutado?", "¿cumple el
//   contrato?", "¿debe aprobarse/certificarse?", "¿hay fraude?". Esas siguen
//   siendo decisiones humanas. `confidence` es SOLO sobre la calidad de la
//   observación visual (fotos claras/nítidas/suficientes en cantidad),
//   nunca sobre si la ejecución del contrato es correcta.
//
// Si la ejecución no tiene ninguna foto, se responde determinísticamente
// SIN llamar a Gemini — no hay nada que observar, y no tiene sentido gastar
// una llamada multimodal para decir "no hay fotos" (mismo principio que las
// sugerencias proactivas: si se puede resolver en código, no se le confía
// al modelo).

export interface EvidenceAssessment {
  summary: string;
  observations: string[];
  limitations: string[];
  confidence: 'low' | 'medium' | 'high';
}

const NO_EVIDENCE_ASSESSMENT: EvidenceAssessment = {
  summary: 'No hay evidencia fotográfica para evaluar.',
  observations: [],
  limitations: ['No se subió ninguna fotografía para esta jornada.'],
  confidence: 'low',
};

const SYSTEM_INSTRUCTION =
  'Eres un asistente que describe evidencia fotográfica de jornadas de mantenimiento — nunca un ' +
  'evaluador de cumplimiento contractual. Tu única tarea es describir qué se ve en las fotos y qué tan ' +
  'útiles parecen como evidencia (claridad, cantidad, ángulos). NUNCA opines sobre si el trabajo está bien ' +
  'ejecutado, si cumple el contrato, si debe aprobarse o certificarse, ni sugieras fraude — esas son ' +
  'decisiones humanas que no te corresponden. "confidence" es SOLO sobre la calidad de tu observación ' +
  'visual (fotos claras y suficientes vs. borrosas/oscuras/escasas), nunca sobre la ejecución del ' +
  'contrato. Si no puedes determinar algo (ubicación, fecha, identidad), dilo como limitación explícita en ' +
  'vez de asumirlo.';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'Descripción breve de lo observado en las fotos.' },
    observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Hechos visibles en las fotos, uno por elemento.',
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Incertidumbres explícitas (ej. "no es posible verificar la ubicación").',
    },
    confidence: {
      type: Type.STRING,
      enum: ['low', 'medium', 'high'],
      description: 'Calidad de la observación visual únicamente — nunca sobre la ejecución del contrato.',
    },
  },
  required: ['summary', 'observations', 'limitations', 'confidence'],
};

export async function evaluateExecutionEvidence(
  supabase: SupabaseClient,
  executionId: string
): Promise<EvidenceAssessment> {
  const attachments = await getExecutionAttachments(supabase, executionId);
  if (attachments.length === 0) return NO_EVIDENCE_ASSESSMENT;

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  const client = new GoogleGenAI({ apiKey });
  const imageParts = attachments.map((a) => createPartFromUri(a.fileUrl, a.fileType || 'image/jpeg'));

  const { response } = await generateWithModelFallback(client, (model) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'Describe esta evidencia fotográfica.' }, ...imageParts] }],
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
      observations: Array.isArray(parsed.observations) ? parsed.observations.map(String) : [],
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map(String) : [],
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    };
  } catch {
    throw new Error('No se pudo interpretar la evaluación de evidencia del modelo.');
  }
}
