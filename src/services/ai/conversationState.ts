import type { Content } from '@google/genai';

// Estado de conversación del copiloto — completamente opaco. Ni el cliente
// ni el servidor interpretan qué hay dentro de `contents` (roles, parts,
// function calls, thought_signature): se almacena y se reenvía tal cual.
//
// Hoy vive en memoria de React (AgentControlCenter.tsx). El día que se
// necesite persistencia (sobrevivir a un reload, sincronizar entre
// dispositivos), la migración es reemplazar el `useRef` por una consulta a
// Postgres que devuelva el mismo shape — el Orchestrator no cambia una
// línea, porque ya recibe/devuelve `ConversationState`, no un array suelto.
export interface ConversationState {
  contents: Content[];
}

export const EMPTY_CONVERSATION: ConversationState = { contents: [] };

// Ventana deslizante simple: conserva las últimas N entradas CRUDAS de
// `contents` — no "los últimos N turnos". Contar turnos exigiría inspeccionar
// qué parte de cada entrada es una pregunta real del usuario vs. un
// functionResponse fabricado por el Orchestrator, y eso ya es interpretar
// la estructura opaca. N=40 cubre de sobra varios turnos con tool-calling
// (cada turno con tool ocupa 3-4 entradas: user, model/functionCall,
// user/functionResponse, model/texto final).
const MAX_CONTENTS = 40;

// Único punto donde se mira la forma de una entrada (no su contenido): si el
// corte por conteo crudo cae justo entre el functionCall del modelo y su
// functionResponse, la ventana quedaría empezando por una respuesta de
// función huérfana — un historial que Gemini nunca produjo, y que puede
// fallar con INVALID_ARGUMENT en el siguiente turno. Se descarta esa entrada
// en vez de reconstruir la llamada perdida (reconstruirla arrastraría de
// vuelta la pregunta que la originó, y esa cascada nunca converge).
function isOrphanFunctionResponse(content: Content): boolean {
  return !!content.parts?.some((p) => 'functionResponse' in p);
}

export function trimConversationState(state: ConversationState): ConversationState {
  if (state.contents.length <= MAX_CONTENTS) return state;
  let trimmed = state.contents.slice(-MAX_CONTENTS);
  while (trimmed.length > 0 && isOrphanFunctionResponse(trimmed[0])) {
    trimmed = trimmed.slice(1);
  }
  return { contents: trimmed };
}
