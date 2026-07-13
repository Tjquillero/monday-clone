import { GoogleGenAI } from '@google/genai';
import type { ImportValidationError } from '@/lib/poaImport/types';
import { generateWithModelFallback } from './geminiFallback';
import { buildExplainImportErrorsPrompt } from './explainImportErrorsPrompt';

// Análisis documental (Fase 4) — primera pieza, la de menor riesgo: explicar
// en lenguaje natural errores de validación de un import de POA que YA se
// calcularon en el navegador (validateParsedPoa). No hay tool, no hay Tool
// Registry, no hay RPC: por diseño (ADR-0004, "todo o nada") un import
// inválido nunca toca la base de datos, así que no hay nada persistido que
// consultar — esto no es un tool del copiloto de dominio, es una traducción
// puntual de datos que ya están completos y correctos frente al usuario.
// Gemini NUNCA inventa una causa ni una fila: solo recibe los errores reales
// y los redacta de forma más clara — mismo principio de "nunca calcula,
// nunca inventa" que el resto del copiloto, aplicado sin tool-calling.

const SYSTEM_INSTRUCTION =
  'Eres un asistente que explica errores de validación de una importación de POA ' +
  '(Plan Operativo Anual) a un usuario no técnico (supervisor de mantenimiento, no ' +
  'programador). Se te da la lista REAL y COMPLETA de errores — nunca inventes una ' +
  'fila, actividad, zona o causa que no esté en los datos, y no omitas ninguno. ' +
  'Traduce cada código técnico a una frase clara sobre qué pasó y qué debe corregir ' +
  'el usuario en el Excel. Puedes agrupar errores del mismo tipo si eso ayuda a la ' +
  'claridad. Responde en español, tono profesional y directo, sin jerga técnica.';

export async function explainImportErrors(errors: ImportValidationError[]): Promise<string> {
  if (errors.length === 0) return 'No hay errores que explicar: la importación es válida.';

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  const client = new GoogleGenAI({ apiKey });
  const prompt = buildExplainImportErrorsPrompt(errors);

  const { response } = await generateWithModelFallback(client, (model) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    })
  );

  return (
    response.candidates?.[0]?.content?.parts?.[0]?.text ||
    response.text ||
    'No se pudo generar una explicación. Intenta de nuevo.'
  );
}
