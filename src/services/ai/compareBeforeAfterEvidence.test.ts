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

import { compareBeforeAfterEvidence } from './compareBeforeAfterEvidence';

describe('compareBeforeAfterEvidence', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    mockGetExecutionAttachments.mockReset();
  });

  it('se niega sin llamar a Gemini si faltan fotos "before" y "after"', async () => {
    mockGetExecutionAttachments.mockResolvedValue([]);
    const result = await compareBeforeAfterEvidence({} as any, 'exec-1');
    expect(result.limitations[0]).toContain('no tiene ninguna fotografía clasificada como "antes" ni como "después"');
    expect(result.confidence).toBe('low');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('se niega sin llamar a Gemini si falta la fase "before" (solo hay "after")', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      { fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg', phase: 'after' },
    ]);
    const result = await compareBeforeAfterEvidence({} as any, 'exec-1');
    expect(result.limitations[0]).toContain('no tiene ninguna fotografía clasificada como "antes"');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('se niega sin llamar a Gemini si falta la fase "after" (solo hay "before")', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      { fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg', phase: 'before' },
    ]);
    const result = await compareBeforeAfterEvidence({} as any, 'exec-1');
    expect(result.limitations[0]).toContain('no tiene ninguna fotografía clasificada como "después"');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('no confunde una foto sin clasificar (phase=null) con "before" o "after"', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      { fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg', phase: null },
      { fileUrl: 'https://example.test/b.jpg', fileName: 'b.jpg', fileType: 'image/jpeg', phase: 'before' },
    ]);
    const result = await compareBeforeAfterEvidence({} as any, 'exec-1');
    // Solo hay "before" (la sin clasificar no cuenta como "after") -> debe negarse por falta de "after".
    expect(result.limitations[0]).toContain('no tiene ninguna fotografía clasificada como "después"');
  });

  it('compara cuando hay fotos de ambas fases', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      { fileUrl: 'https://example.test/before.jpg', fileName: 'before.jpg', fileType: 'image/jpeg', phase: 'before' },
      { fileUrl: 'https://example.test/after.jpg', fileName: 'after.jpg', fileType: 'image/jpeg', phase: 'after' },
    ]);
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: 'Se observa césped recortado en la foto de después.',
                  changesObserved: ['La vegetación está más corta en la foto de después.'],
                  unchangedAreas: ['La zona pavimentada se ve igual en ambas fotos.'],
                  limitations: ['No es posible verificar la fecha exacta de cada foto.'],
                  confidence: 'medium',
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await compareBeforeAfterEvidence({} as any, 'exec-1');

    expect(result).toEqual({
      summary: 'Se observa césped recortado en la foto de después.',
      changesObserved: ['La vegetación está más corta en la foto de después.'],
      unchangedAreas: ['La zona pavimentada se ve igual en ambas fotos.'],
      limitations: ['No es posible verificar la fecha exacta de cada foto.'],
      confidence: 'medium',
    });
  });
});
