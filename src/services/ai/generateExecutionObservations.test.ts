// generateExecutionObservations no llama a @google/genai directamente —
// reutiliza evaluateExecutionEvidence y findPossibleVisualDuplicates, que
// sí lo hacen. Se mockean esos módulos completos (no el SDK), consistente
// con el principio del propio tool: no redescubrir lo que otro tool ya
// resolvió, ni siquiera en el test.

const mockGetExecutionAttachments = jest.fn();
const mockGetDuplicateAttachments = jest.fn();
jest.mock('./domainTools/evidence', () => ({
  getExecutionAttachments: (...args: unknown[]) => mockGetExecutionAttachments(...args),
  getDuplicateAttachments: (...args: unknown[]) => mockGetDuplicateAttachments(...args),
}));

const mockEvaluateExecutionEvidence = jest.fn();
jest.mock('./evaluateExecutionEvidence', () => ({
  evaluateExecutionEvidence: (...args: unknown[]) => mockEvaluateExecutionEvidence(...args),
}));

const mockFindPossibleVisualDuplicates = jest.fn();
jest.mock('./findPossibleVisualDuplicates', () => ({
  findPossibleVisualDuplicates: (...args: unknown[]) => mockFindPossibleVisualDuplicates(...args),
}));

import { generateExecutionObservations } from './generateExecutionObservations';

function attachment(phase: 'before' | 'after' | null) {
  return { fileUrl: 'https://example.test/x.jpg', fileName: 'x.jpg', fileType: 'image/jpeg', phase, fileHash: 'h' };
}

describe('generateExecutionObservations', () => {
  beforeEach(() => {
    mockGetExecutionAttachments.mockReset();
    mockGetDuplicateAttachments.mockReset();
    mockEvaluateExecutionEvidence.mockReset();
    mockFindPossibleVisualDuplicates.mockReset();
    // Defaults neutros — cada test sobreescribe lo que le importa.
    mockGetDuplicateAttachments.mockResolvedValue([]);
    mockFindPossibleVisualDuplicates.mockResolvedValue({ possibleVisualDuplicates: [], limitations: [] });
  });

  it('reporta poor_evidence + missing_before + missing_after cuando no hay ninguna foto', async () => {
    mockGetExecutionAttachments.mockResolvedValue([]);
    mockEvaluateExecutionEvidence.mockResolvedValue({
      summary: 'No hay evidencia fotográfica para evaluar.',
      observations: [],
      limitations: ['No se subió ninguna fotografía para esta jornada.'],
      confidence: 'low',
    });

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    expect(result.observations).toEqual(
      expect.arrayContaining([
        { severity: 'warning', category: 'missing_before', message: 'No se encontró evidencia clasificada como "antes".' },
        { severity: 'warning', category: 'missing_after', message: 'No se encontró evidencia clasificada como "después".' },
        { severity: 'warning', category: 'poor_evidence', message: 'No hay evidencia fotográfica para evaluar.' },
      ])
    );
    expect(result.observations).toHaveLength(3);
  });

  it('no reporta missing_before/missing_after cuando ambas fases están cubiertas', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('before'), attachment('after')]);
    mockEvaluateExecutionEvidence.mockResolvedValue({
      summary: 'Se observa la actividad.',
      observations: ['Se ve césped recortado.'],
      limitations: [],
      confidence: 'high',
    });

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    expect(result.observations.find((o) => o.category === 'missing_before')).toBeUndefined();
    expect(result.observations.find((o) => o.category === 'missing_after')).toBeUndefined();
    expect(result.observations.find((o) => o.category === 'poor_evidence')).toBeUndefined();
  });

  it('mapea cada limitación de evaluateExecutionEvidence a una observación visual_limitation trazable', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('before'), attachment('after')]);
    mockEvaluateExecutionEvidence.mockResolvedValue({
      summary: '...',
      observations: [],
      limitations: ['Las fotos están borrosas.', 'No es posible verificar la ubicación.'],
      confidence: 'low',
    });

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    const visualLimitations = result.observations.filter((o) => o.category === 'visual_limitation');
    expect(visualLimitations).toEqual([
      { severity: 'info', category: 'visual_limitation', message: 'Las fotos están borrosas.' },
      { severity: 'info', category: 'visual_limitation', message: 'No es posible verificar la ubicación.' },
    ]);
  });

  it('reporta possible_duplicate a partir de un duplicado exacto (v2.4) que involucra esta ejecución', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('before'), attachment('after')]);
    mockEvaluateExecutionEvidence.mockResolvedValue({ summary: '', observations: [], limitations: [], confidence: 'high' });
    mockGetDuplicateAttachments.mockResolvedValue([
      {
        fileHash: 'hash-x',
        occurrences: [
          { executionId: 'exec-1', activityKey: 'A', activityName: 'A', executionDate: '2026-11-02', fileName: 'foto.jpg' },
          { executionId: 'exec-OTRA', activityKey: 'A', activityName: 'A', executionDate: '2026-11-09', fileName: 'foto2.jpg' },
        ],
      },
    ]);

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    const dupObservations = result.observations.filter((o) => o.category === 'possible_duplicate');
    expect(dupObservations).toHaveLength(1); // solo la ocurrencia de exec-1, no la de exec-OTRA
    expect(dupObservations[0].message).toContain('foto.jpg');
    expect(dupObservations[0].message).toContain('idéntico');
  });

  // Reproduce el bug de la revisión: si el mismo archivo se subió DOS veces
  // a esta misma ejecución (mismo file_hash, ambas ocurrencias con
  // executionId === executionId), el mensaje no puede decir "en otra
  // jornada" -- ambas copias están aquí mismo.
  it('no afirma "en otra jornada" cuando el duplicado exacto está dentro de esta misma ejecución', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('before'), attachment('after')]);
    mockEvaluateExecutionEvidence.mockResolvedValue({ summary: '', observations: [], limitations: [], confidence: 'high' });
    mockGetDuplicateAttachments.mockResolvedValue([
      {
        fileHash: 'hash-y',
        occurrences: [
          { executionId: 'exec-1', activityKey: 'A', activityName: 'A', executionDate: '2026-11-02', fileName: 'foto.jpg' },
          { executionId: 'exec-1', activityKey: 'A', activityName: 'A', executionDate: '2026-11-02', fileName: 'foto.jpg' },
        ],
      },
    ]);

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    const dupObservations = result.observations.filter((o) => o.category === 'possible_duplicate');
    expect(dupObservations).toHaveLength(2);
    for (const obs of dupObservations) {
      expect(obs.message).not.toContain('otra jornada');
      expect(obs.message).toContain('esta misma jornada');
    }
  });

  it('reporta possible_duplicate a partir de un posible duplicado visual (v2.4b)', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('before'), attachment('after')]);
    mockEvaluateExecutionEvidence.mockResolvedValue({ summary: '', observations: [], limitations: [], confidence: 'high' });
    mockFindPossibleVisualDuplicates.mockResolvedValue({
      possibleVisualDuplicates: [
        { fileNameA: 'a.jpg', fileNameB: 'b.jpg', confidence: 'medium', reason: 'Mismo encuadre.' },
      ],
      limitations: [],
    });

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    const dupObservations = result.observations.filter((o) => o.category === 'possible_duplicate');
    expect(dupObservations).toHaveLength(1);
    expect(dupObservations[0].message).toContain('a.jpg');
    expect(dupObservations[0].message).toContain('b.jpg');
    expect(dupObservations[0].message).toContain('medium');
  });

  // Reproduce el bug de la revisión: las 3 sub-tools se piden con Promise.all
  // ("todo o nada"). Si findPossibleVisualDuplicates falla (ej. Gemini 429),
  // se perdían hasta los hechos deterministas YA calculados antes del
  // Promise.all (missing_before/missing_after) porque la función entera
  // rechazaba en vez de degradar con lo que sí se pudo obtener.
  it('no pierde missing_before/missing_after si findPossibleVisualDuplicates falla', async () => {
    mockGetExecutionAttachments.mockResolvedValue([]); // sin fotos -> se sabe de antemano que faltan ambas fases
    mockEvaluateExecutionEvidence.mockResolvedValue({ summary: '', observations: [], limitations: [], confidence: 'low' });
    mockFindPossibleVisualDuplicates.mockRejectedValue(new Error('429 quota exceeded'));

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    expect(result.observations).toEqual(
      expect.arrayContaining([
        { severity: 'warning', category: 'missing_before', message: 'No se encontró evidencia clasificada como "antes".' },
        { severity: 'warning', category: 'missing_after', message: 'No se encontró evidencia clasificada como "después".' },
      ])
    );
  });

  it('no pierde missing_before/missing_after si getDuplicateAttachments falla', async () => {
    mockGetExecutionAttachments.mockResolvedValue([]);
    mockEvaluateExecutionEvidence.mockResolvedValue({ summary: '', observations: [], limitations: [], confidence: 'low' });
    mockGetDuplicateAttachments.mockRejectedValue(new Error('conexión interrumpida'));

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    expect(result.observations).toEqual(
      expect.arrayContaining([
        { severity: 'warning', category: 'missing_before', message: 'No se encontró evidencia clasificada como "antes".' },
        { severity: 'warning', category: 'missing_after', message: 'No se encontró evidencia clasificada como "después".' },
      ])
    );
  });

  it('nunca produce severidades ni categorías fuera del contrato cerrado', async () => {
    mockGetExecutionAttachments.mockResolvedValue([attachment('before'), attachment('after')]);
    mockEvaluateExecutionEvidence.mockResolvedValue({ summary: '', observations: [], limitations: ['x'], confidence: 'low' });
    mockGetDuplicateAttachments.mockResolvedValue([
      { fileHash: 'h', occurrences: [{ executionId: 'exec-1', activityKey: 'A', activityName: 'A', executionDate: '2026-11-02', fileName: 'f.jpg' }] },
    ]);
    mockFindPossibleVisualDuplicates.mockResolvedValue({
      possibleVisualDuplicates: [{ fileNameA: 'a.jpg', fileNameB: 'b.jpg', confidence: 'high', reason: 'r' }],
      limitations: [],
    });

    const result = await generateExecutionObservations({} as any, 'exec-1', 'board-1');

    const allowedSeverities = ['info', 'warning'];
    const allowedCategories = ['missing_before', 'missing_after', 'poor_evidence', 'possible_duplicate', 'visual_limitation'];
    for (const obs of result.observations) {
      expect(allowedSeverities).toContain(obs.severity);
      expect(allowedCategories).toContain(obs.category);
    }
  });
});
