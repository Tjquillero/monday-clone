// El Registry importa transitivamente evaluate_execution_evidence, que
// importa @google/genai (paquete ESM-only que Jest no puede transformar).
// Este test no necesita Gemini real — solo los nombres de las tools — así
// que se mockea mínimamente, mismo patrón que orchestrator.test.ts.
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
  createPartFromUri: jest.fn(),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
}));

import { AI_TOOL_REGISTRY } from './registry';
import { TOOL_DISPLAY_NAMES } from './displayNames';

// Guarda contra desincronización: cada tool que el modelo puede invocar
// debe tener un rótulo de presentación, o la cita en la UI cae al nombre
// técnico (get_acta_totals en vez de "Resumen financiero del acta"). No
// rompe nada si falta, pero degrada la experiencia sin que nadie lo note.
describe('Diccionario de presentación de citas (displayNames.ts)', () => {
  it('tiene un rótulo para cada tool del Registry', () => {
    const missing = Object.keys(AI_TOOL_REGISTRY).filter((name) => !(name in TOOL_DISPLAY_NAMES));
    expect(missing).toEqual([]);
  });
});
