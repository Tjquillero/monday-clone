import { supabase } from '@/lib/supabaseClient';
import { GoogleGenAI } from '@google/genai';

/**
 * Función que usa la NUEVA librería de Google y Gemini 3 (Basado en tu "Get Code")
 */
async function llamarAI(prompt: string): Promise<string> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  
  if (!apiKey) return "Error: API Key faltante.";

  console.log(`[Optimizer] Conectando con el motor Gemini 3 Flash (Next-Gen)...`);

  try {
      // 1. Configuramos el cliente con la nueva clase de Google
      const client = new GoogleGenAI({ apiKey });

      // 2. Usamos el modelo exacto que te dio el Playground
      const modelId = 'gemini-3-flash-preview';

      // 3. Ejecutamos la petición con la nueva sintaxis
      const response = await client.models.generateContent({
        model: modelId,
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }]
      });

      // 4. Extraemos la respuesta (Gemini 3 usa una estructura similar pero limpia)
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
          throw new Error("El modelo Gemini 3 no devolvió texto.");
      }

      console.log(`[Optimizer] ÉXITO: Respuesta recibida de Gemini 3.`);
      return text;

  } catch (error: any) {
      console.error('[Optimizer] FALLO EN EL MOTOR GEMINI 3:', error.message);
      
      // Fallback a 1.5 en caso de que el Preview falle (usando fetch directo para no depender de librerías viejas)
      if (error.message.includes("404") || error.message.includes("not found")) {
          console.warn("[Optimizer] Gemini 3 no detectado. Reintentando con 1.5 manual...");
          try {
              const res = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                  {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                      })
                  }
              );
              const data = await res.json();
              return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error final.";
          } catch (e) {
              return `Error en la mejora dinámica: [${error.message}]`;
          }
      }
      
      return `Error en la mejora dinámica: [${error.message}]`;
  }
}

// Este es el "Cerebro Reconstructor" (Optimizador)
export async function autoMejorarSkill(errorDetectado: string, skillActual: string, nombreSkill: string = 'mantenix_manager') {
  console.log(`[Optimizer] Iniciando corrección para: ${nombreSkill}`);

  const metaPrompt = `
    Eres un Ingeniero de Prompts de Mantenix. 
    Escribe una versión mejorada de estas instrucciones:
    ${skillActual}
    ERROR: ${errorDetectado}
    Responde ÚNICAMENTE con el prompt final mejorado.
  `;

  try {
    const nuevaInstruccion = await llamarAI(metaPrompt); 

    const { data: latest } = await supabase
      .from('ai_skills')
      .select('version')
      .eq('name', nombreSkill)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latest?.version || 0) + 1;

    const { error } = await supabase
      .from('ai_skills')
      .insert([{ 
          name: nombreSkill, 
          instructions: nuevaInstruccion,
          version: nextVersion,
          active: true
      }]);

    if (error) throw error;
    
    console.log(`¡HITO: v${nextVersion} de '${nombreSkill}' generada vía GEMINI 3!`);
    return { success: true, version: nextVersion };
  } catch (e: any) {
    console.error("[Optimizer] Problema en flujo:", e.message);
    return { success: false, error: e.message };
  }
}
