// Mockea @google/genai por completo (sin red, sin cuota) y el lookup de
// adjuntos, para probar el contrato: sin fotos no se llama a Gemini; con
// fotos, se parsea la salida estructurada; una respuesta no-JSON falla
// explícitamente en vez de devolver algo inventado.

const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  createPartFromUri: (uri: string, mimeType: string) => ({ fileData: { fileUri: uri, mimeType } }),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
}));

const mockGetExecutionAttachments = jest.fn();
jest.mock('./domainTools/evidence', () => ({
  getExecutionAttachments: (...args: unknown[]) => mockGetExecutionAttachments(...args),
}));

import { evaluateExecutionEvidence } from './evaluateExecutionEvidence';

describe('evaluateExecutionEvidence', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    mockGetExecutionAttachments.mockReset();
  });

  it('no llama a Gemini y responde determinísticamente si no hay fotos', async () => {
    mockGetExecutionAttachments.mockResolvedValue([]);

    const result = await evaluateExecutionEvidence({} as any, 'exec-1');

    expect(result).toEqual({
      summary: 'No hay evidencia fotográfica para evaluar.',
      observations: [],
      limitations: ['No se subió ninguna fotografía para esta jornada.'],
      confidence: 'low',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('parsea la evaluación estructurada cuando sí hay fotos', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      { fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg' },
    ]);
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: 'Se observa poda de césped en una zona verde.',
                  observations: ['Hay una fotografía desde un ángulo frontal.'],
                  limitations: ['No es posible verificar la fecha exacta.'],
                  confidence: 'medium',
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await evaluateExecutionEvidence({} as any, 'exec-1');

    expect(result).toEqual({
      summary: 'Se observa poda de césped en una zona verde.',
      observations: ['Hay una fotografía desde un ángulo frontal.'],
      limitations: ['No es posible verificar la fecha exacta.'],
      confidence: 'medium',
    });
  });

  it('lanza un error explícito si la respuesta no es JSON válido (no inventa un resultado)', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      { fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg' },
    ]);
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'esto no es json' }] } }],
    });

    await expect(evaluateExecutionEvidence({} as any, 'exec-1')).rejects.toThrow(
      'No se pudo interpretar la evaluación de evidencia del modelo.'
    );
  });
});
