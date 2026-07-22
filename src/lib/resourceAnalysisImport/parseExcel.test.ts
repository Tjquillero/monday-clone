import { parseResourceAnalysisExcel } from './parseExcel';
import { realWorkbookArrayBuffer } from './testFixtures';

// Conteos y valores reales verificados contra el archivo real
// (COSTOS GENERALES (V2).xlsx, copia en la raíz del repo) — documentados en
// docs/architecture/resource-analysis-import-design.md, Sección 2. Si el
// Excel oficial cambia, estos números deben re-verificarse deliberadamente,
// no ajustarse a ciegas para que el test pase.
const EXPECTED_SITE_SHEET_COUNT = 9;

describe('parseResourceAnalysisExcel — archivo real', () => {
  const result = parseResourceAnalysisExcel(realWorkbookArrayBuffer());

  it('lee las 9 hojas de sitio, excluyendo "DETALLE DE GRUPO"', () => {
    expect(result.sheets).toHaveLength(EXPECTED_SITE_SHEET_COUNT);
    expect(result.sheets.map((s) => s.sheetName)).not.toContain('DETALLE DE GRUPO');
  });

  it('detecta 2 bloques (Zona Verde + Zona de Playa) en los sitios con frente de playa', () => {
    const conDosBloques = ['PLAZA PUERTO COLOMBIA', 'PLAYA MANGLARES', 'COUNTRY 1', 'COUNTRY 2', 'SALINAS DEL REY', 'SANTA VERONICA'];
    for (const name of conDosBloques) {
      const sheet = result.sheets.find((s) => s.sheetName === name);
      expect(sheet?.blocks).toHaveLength(2);
    }
  });

  it('detecta 1 solo bloque (Zona Verde) en los sitios sin frente de playa', () => {
    const conUnBloque = ['CENTRO GASTRONOMICO', 'MERCADO DE LA SAZON', 'PLAYA MIRAMAR'];
    for (const name of conUnBloque) {
      const sheet = result.sheets.find((s) => s.sheetName === name);
      expect(sheet?.blocks).toHaveLength(1);
    }
  });

  describe('cantidades reales (PLAZA PUERTO COLOMBIA)', () => {
    const sheet = result.sheets.find((s) => s.sheetName === 'PLAZA PUERTO COLOMBIA')!;

    it('bloque Zona Verde: 6 cantidades reconocidas', () => {
      const q = sheet.blocks[0].quantities;
      expect(q).toHaveLength(6);
      expect(q.find((x) => x.scopeKey === 'total_paisajismo')?.cantidad).toBe(2620);
      expect(q.find((x) => x.scopeKey === 'zona_dura')?.cantidad).toBe(17150);
      expect(q.find((x) => x.scopeKey === 'grama')?.cantidad).toBeCloseTo(544.68, 2);
      expect(q.find((x) => x.scopeKey === 'limpieza_marmol')?.cantidad).toBe(1192);
      expect(q.find((x) => x.scopeKey === 'arbustos')?.cantidad).toBe(1850);
      expect(q.find((x) => x.scopeKey === 'arboles')?.cantidad).toBe(225);
    });

    it('bloque Zona de Playa: 4 cantidades reconocidas', () => {
      const q = sheet.blocks[1].quantities;
      expect(q).toHaveLength(4);
      expect(q.find((x) => x.scopeKey === 'zona_playa')?.cantidad).toBe(7887);
      expect(q.find((x) => x.scopeKey === 'trasiego_playa')?.cantidad).toBe(1183);
      expect(q.find((x) => x.scopeKey === 'limpieza_manual')?.cantidad).toBe(620);
      expect(q.find((x) => x.scopeKey === 'corte_troncos')?.cantidad).toBe(350);
    });
  });

  it('COUNTRY 1: cantidades coinciden EXACTO con resource_analysis.scope_data ya cargado en producción para PLAYA DEL COUNTRY (verificación cruzada 2026-07-21)', () => {
    const sheet = result.sheets.find((s) => s.sheetName === 'COUNTRY 1')!;
    const zv = sheet.blocks[0].quantities;
    const playa = sheet.blocks[1].quantities;
    expect(zv.find((x) => x.scopeKey === 'total_paisajismo')?.cantidad).toBe(2295);
    expect(zv.find((x) => x.scopeKey === 'zona_dura')?.cantidad).toBe(3852);
    expect(zv.find((x) => x.scopeKey === 'arbustos')?.cantidad).toBe(2295);
    expect(zv.find((x) => x.scopeKey === 'arboles')?.cantidad).toBe(111);
    expect(playa.find((x) => x.scopeKey === 'zona_playa')?.cantidad).toBe(19287);
    expect(playa.find((x) => x.scopeKey === 'trasiego_playa')?.cantidad).toBe(9644);
    expect(playa.find((x) => x.scopeKey === 'limpieza_manual')?.cantidad).toBe(1470);
    expect(playa.find((x) => x.scopeKey === 'corte_troncos')?.cantidad).toBe(350);
  });

  it('COUNTRY 2: el bloque de Zona de Playa (etiqueta interna "PLAYAS DEL COUNTRY", en realidad de PLAYA DE SABANILLA 2 — ver discovery) trae cantidades distintas a COUNTRY 1, no una copia', () => {
    const sheet = result.sheets.find((s) => s.sheetName === 'COUNTRY 2')!;
    const playa = sheet.blocks[1].quantities;
    expect(playa.find((x) => x.scopeKey === 'zona_playa')?.cantidad).toBe(18070);
    expect(playa.find((x) => x.scopeKey === 'trasiego_playa')?.cantidad).toBe(9035);
  });

  it('bloques sin cantidad real (Zona de Playa de PLAYA MIRAMAR y SANTA VERONICA) devuelven quantities=[] en vez de fallar', () => {
    const miramar = result.sheets.find((s) => s.sheetName === 'PLAYA MIRAMAR')!;
    // PLAYA MIRAMAR solo tiene 1 bloque detectado (Zona Verde) — el bloque de
    // Zona de Playa existe en el Excel pero con todas las cantidades vacías,
    // así que ninguna fila pasa el filtro de "cantidad numérica" (Sección 2
    // del diseño: no es un error, el sitio no tiene frente de playa).
    expect(miramar.blocks).toHaveLength(1);

    const santaVeronica = result.sheets.find((s) => s.sheetName === 'SANTA VERONICA')!;
    expect(santaVeronica.blocks[1].quantities).toEqual([]);
  });

  describe('rendimiento/frecuencia crudos — informativos, nunca se persisten', () => {
    it('captura Corte de troncos con valores distintos por sitio (evidencia de la Regla de Gobierno de Datos)', () => {
      const casos: [string, number, number, number][] = [
        ['PLAZA PUERTO COLOMBIA', 15, 4, 350],
        ['COUNTRY 1', 10, 4, 350],
        ['SALINAS DEL REY', 10, 4, 450],
      ];
      for (const [sheetName, rendimiento, frecuencia, cantidad] of casos) {
        const sheet = result.sheets.find((s) => s.sheetName === sheetName)!;
        const playaBlock = sheet.blocks[sheet.blocks.length - 1];
        const troncos = playaBlock.activityStandardsRaw.find((a) => a.actividad === 'Corte de troncos');
        expect(troncos).toBeDefined();
        expect(troncos!.rendimiento).toBe(rendimiento);
        expect(troncos!.frecuencia).toBe(frecuencia);
        expect(troncos!.cantidad).toBe(cantidad);
      }
    });

    it('ninguno de estos valores coincide con el rendimiento vigente en board_activity_standards (30) — discrepancia documentada, no corregida por el parser', () => {
      const country1 = result.sheets.find((s) => s.sheetName === 'COUNTRY 1')!;
      const troncos = country1.blocks[1].activityStandardsRaw.find((a) => a.actividad === 'Corte de troncos');
      expect(troncos!.rendimiento).not.toBe(30);
    });
  });

  describe('warnings — descripciones no reconocidas', () => {
    it('reporta "ARBOLES FUERA DE CAMASIEMBRA" como no reconocida en las 3 hojas donde aparece, sin lanzar error', () => {
      const noReconocidas = result.warnings.filter((w) => w.tipo === 'descripcion_no_reconocida');
      expect(noReconocidas).toHaveLength(3);
      expect(noReconocidas.every((w) => w.detalle === 'ARBOLES FUERA DE CAMASIEMBRA')).toBe(true);
      expect(noReconocidas.map((w) => w.sheetName).sort()).toEqual(
        ['CENTRO GASTRONOMICO', 'MERCADO DE LA SAZON', 'PLAYA MIRAMAR'].sort(),
      );
    });

    it('no reporta ninguna cantidad negativa (no existen en el archivo real)', () => {
      expect(result.warnings.filter((w) => w.tipo === 'cantidad_negativa')).toHaveLength(0);
    });

    it('no reporta ninguna hoja sin bloques (las 9 hojas de sitio tienen al menos un bloque)', () => {
      expect(result.warnings.filter((w) => w.tipo === 'hoja_sin_bloques')).toHaveLength(0);
    });
  });
});
