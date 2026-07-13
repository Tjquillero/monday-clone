import { trimConversationState, EMPTY_CONVERSATION, type ConversationState } from './conversationState';
import type { Content } from '@google/genai';

describe('trimConversationState', () => {
  it('deja el estado intacto cuando no supera el límite', () => {
    const state: ConversationState = {
      contents: [{ role: 'user', parts: [{ text: 'hola' }] }] as Content[],
    };
    expect(trimConversationState(state)).toEqual(state);
  });

  it('no recorta EMPTY_CONVERSATION', () => {
    expect(trimConversationState(EMPTY_CONVERSATION)).toEqual(EMPTY_CONVERSATION);
  });

  // Reproduce el corte descrito en la revisión: la ventana desliza por
  // ENTRADAS crudas (no por turnos), así que puede caer justo entre el
  // functionCall del modelo y el functionResponse que le responde. Este
  // test construye deliberadamente esa condición de borde (largo total 42,
  // primer turno de 4 entradas) para confirmar el mecanismo por reproducción
  // real, no solo por inspección del algoritmo, y probar que se descarta la
  // respuesta huérfana en vez de conservarla.
  it('descarta el functionResponse huérfano (sin su functionCall) cuando el corte cae a mitad de un turno con tool-calling', () => {
    const turn0: Content[] = [
      { role: 'user', parts: [{ text: 'pregunta original' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_board_summary', args: {} } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_board_summary', response: { output: {} } } }] },
      { role: 'model', parts: [{ text: 'respuesta final turno 0' }] },
    ];
    // Relleno para llegar exactamente a 42 entradas: fuerza slice(-40) a
    // cortar en el índice 2 (el functionResponse de turn0), dejando su
    // functionCall (índice 1) fuera de la ventana.
    const filler: Content[] = Array.from({ length: 38 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      parts: [{ text: `filler-${i}` }],
    })) as Content[];

    const contents = [...turn0, ...filler];
    expect(contents.length).toBe(42);

    const trimmed = trimConversationState({ contents });

    const first = trimmed.contents[0] as any;
    const firstIsOrphanFunctionResponse = first.role === 'user' && !!first.parts?.[0]?.functionResponse;

    expect(firstIsOrphanFunctionResponse).toBe(false);
    // La entrada índice 2 (el functionResponse huérfano) se descarta junto
    // con las 2 que ya caían fuera de la ventana -> quedan 39, no 40.
    expect(trimmed.contents.length).toBe(39);
    expect((trimmed.contents[0] as any).parts[0].text).toBe('respuesta final turno 0');
  });

  it('conserva el par functionCall/functionResponse cuando el corte cae justo antes del par (no lo parte)', () => {
    // 5 entradas de relleno que SÍ deben descartarse, luego el par intacto,
    // luego 38 más -> total 45, corte en índice 5 (justo el inicio del par).
    const prefix: Content[] = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      parts: [{ text: `prefix-${i}` }],
    })) as Content[];
    const pair: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'get_board_summary', args: {} } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_board_summary', response: { output: {} } } }] },
    ];
    const suffix: Content[] = Array.from({ length: 38 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      parts: [{ text: `suffix-${i}` }],
    })) as Content[];

    const contents = [...prefix, ...pair, ...suffix];
    expect(contents.length).toBe(45);

    const trimmed = trimConversationState({ contents });

    expect(trimmed.contents.length).toBe(40);
    expect((trimmed.contents[0] as any).parts[0].functionCall).toBeDefined();
    expect((trimmed.contents[1] as any).parts[0].functionResponse).toBeDefined();
  });
});
