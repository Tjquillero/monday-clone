import { MissingEvidenceError, MISSING_EVIDENCE_ERRCODE, MissingTechnicalConfigError, MISSING_TECHNICAL_CONFIG_ERRCODE } from './scheduler';

describe('MissingEvidenceError.fromSupabaseError', () => {
  it('construye la excepción cuando code === MEVID, parseando DETAIL', () => {
    const raw = {
      code: MISSING_EVIDENCE_ERRCODE,
      message: 'Faltan evidencias en 2 jornada(s): A y B.',
      details: JSON.stringify([
        { execution_id: 'e1', activity_key: 'A_KEY', activity_name: 'A', execution_date: '2026-08-10' },
        { execution_id: 'e2', activity_key: 'B_KEY', activity_name: 'B', execution_date: '2026-08-11' },
      ]),
    };

    const err = MissingEvidenceError.fromSupabaseError(raw);

    expect(err).not.toBeNull();
    expect(err).toBeInstanceOf(MissingEvidenceError);
    expect(err!.message).toBe('Faltan evidencias en 2 jornada(s): A y B.');
    expect(err!.executions).toHaveLength(2);
    expect(err!.executions[0].activity_name).toBe('A');
  });

  it('devuelve null para cualquier otro código de error', () => {
    const err = MissingEvidenceError.fromSupabaseError({ code: '42501', message: 'permission denied', details: null });
    expect(err).toBeNull();
  });

  it('devuelve null cuando error es null', () => {
    expect(MissingEvidenceError.fromSupabaseError(null)).toBeNull();
  });

  it('no revienta si DETAIL no es JSON válido — executions queda vacío', () => {
    const err = MissingEvidenceError.fromSupabaseError({
      code: MISSING_EVIDENCE_ERRCODE,
      message: 'Faltan evidencias.',
      details: 'no es json',
    });
    expect(err).not.toBeNull();
    expect(err!.executions).toEqual([]);
  });

  it('usa un mensaje por defecto si message viene vacío', () => {
    const err = MissingEvidenceError.fromSupabaseError({ code: MISSING_EVIDENCE_ERRCODE });
    expect(err!.message).toBe('Faltan evidencias fotográficas.');
  });
});

describe('MissingTechnicalConfigError.fromSupabaseError', () => {
  it('construye la excepción cuando code === MTCFG, parseando DETAIL', () => {
    const raw = {
      code: MISSING_TECHNICAL_CONFIG_ERRCODE,
      message: 'No es posible confirmar el plan porque faltan 2 actividad(es) contratada(s) por configurar en el Catálogo Técnico.',
      details: JSON.stringify([
        { activity_key: '2.04', description: 'Herbicida grama', unit: 'M2-MES' },
        { activity_key: '2.05', description: 'Herbicida árboles', unit: 'UND-MES' },
      ]),
    };

    const err = MissingTechnicalConfigError.fromSupabaseError(raw);

    expect(err).not.toBeNull();
    expect(err).toBeInstanceOf(MissingTechnicalConfigError);
    expect(err!.activities).toHaveLength(2);
    expect(err!.activities[0].activity_key).toBe('2.04');
  });

  it('devuelve null para cualquier otro código de error (ej. MEVID, para no confundir los dos gates)', () => {
    const err = MissingTechnicalConfigError.fromSupabaseError({ code: MISSING_EVIDENCE_ERRCODE, message: 'x', details: null });
    expect(err).toBeNull();
  });

  it('devuelve null cuando error es null', () => {
    expect(MissingTechnicalConfigError.fromSupabaseError(null)).toBeNull();
  });

  it('no revienta si DETAIL no es JSON válido — activities queda vacío', () => {
    const err = MissingTechnicalConfigError.fromSupabaseError({
      code: MISSING_TECHNICAL_CONFIG_ERRCODE,
      message: 'Faltan actividades.',
      details: 'no es json',
    });
    expect(err).not.toBeNull();
    expect(err!.activities).toEqual([]);
  });
});
