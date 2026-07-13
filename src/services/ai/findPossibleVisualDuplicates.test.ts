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

import { findPossibleVisualDuplicates } from './findPossibleVisualDuplicates';

function attachment(fileName: string, fileHash: string | null) {
  return { fileUrl: `https://example.test/${fileName}`, fileName, fileType: 'image/jpeg', phase: null, fileHash };
}

describe('findPossibleVisualDuplicates', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    mockGetExecutionAttachments.mockReset();
  });

  it('se niega sin llamar a Gemini si hay menos de 2 fotos con contenido distinto', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('a.jpg', 'hash-a')]);
    const result = await findPossibleVisualDuplicates({} as any, 'exec-1');
    expect(result.possibleVisualDuplicates).toEqual([]);
    expect(result.limitations[0]).toContain('no tiene suficientes fotos');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('descarta duplicados exactos (mismo file_hash) antes de llamar a Gemini — si solo queda 1 foto única, se niega', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      attachment('a1.jpg', 'hash-a'),
      attachment('a2.jpg', 'hash-a'), // mismo hash que a1 -> ya lo resolvió v2.4, se descarta
    ]);
    const result = await findPossibleVisualDuplicates({} as any, 'exec-1');
    expect(result.limitations[0]).toContain('no tiene suficientes fotos');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('se niega sin llamar a Gemini si hay más de 12 fotos con contenido distinto', async () => {
    const attachments = Array.from({ length: 13 }, (_, i) => attachment(`f${i}.jpg`, `hash-${i}`));
    mockGetExecutionAttachments.mockResolvedValue(attachments);
    const result = await findPossibleVisualDuplicates({} as any, 'exec-1');
    expect(result.possibleVisualDuplicates).toEqual([]);
    expect(result.limitations[0]).toContain('13 fotos');
    expect(result.limitations[0]).toContain('máximo de 12');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('compara solo las fotos con hash distinto (más las sin hash) cuando hay 2-12', async () => {
    mockGetExecutionAttachments.mockResolvedValue([
      attachment('a1.jpg', 'hash-a'),
      attachment('a2.jpg', 'hash-a'), // duplicado exacto de a1 -> se descarta antes de llamar a Gemini
      attachment('b.jpg', 'hash-b'),
      attachment('historica.jpg', null), // sin hash -> siempre se incluye
    ]);
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  possibleVisualDuplicates: [
                    { fileNameA: 'a1.jpg', fileNameB: 'b.jpg', confidence: 'medium', reason: 'Mismo encuadre con diferencias mínimas.' },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await findPossibleVisualDuplicates({} as any, 'exec-1');

    expect(result).toEqual({
      possibleVisualDuplicates: [
        { fileNameA: 'a1.jpg', fileNameB: 'b.jpg', confidence: 'medium', reason: 'Mismo encuadre con diferencias mínimas.' },
      ],
      limitations: [],
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('devuelve una lista vacía cuando Gemini no encuentra ningún par parecido', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('a.jpg', 'hash-a'), attachment('b.jpg', 'hash-b')]);
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ possibleVisualDuplicates: [] }) }] } }],
    });

    const result = await findPossibleVisualDuplicates({} as any, 'exec-1');
    expect(result.possibleVisualDuplicates).toEqual([]);
  });
});
