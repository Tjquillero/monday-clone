import { parsePoaExcel, PoaExcelStructureError } from './parseExcel';
import { realWorkbookArrayBuffer, realWorkbookWithMutation } from './testFixtures';

// Conteos reales verificados y documentados en
// docs/architecture/poa-excel-import-test-matrix.md ("Conteos reales de
// referencia"). Si el Excel oficial cambia, estos números deben
// re-verificarse deliberadamente, no ajustarse a ciegas para que el test pase.
const EXPECTED_ACTIVITY_COUNT = 107;
const EXPECTED_ZONE_COUNT = 9;
const EXPECTED_EMPTY_ROWS = 6;
const EXPECTED_CLOSURE_ROWS = 5; // TOTAL COSTOS DIRECTOS, ADMINISTRACION 20%, etc.

describe('parsePoaExcel — TC-06 (archivo real)', () => {
  const result = parsePoaExcel(realWorkbookArrayBuffer());

  it('detecta el nombre real de la hoja, sin el espacio final', () => {
    expect(result.sheetName).toBe('POA INICIAL 2026');
  });

  it('detecta las 9 zonas reales', () => {
    expect(result.zonas).toHaveLength(EXPECTED_ZONE_COUNT);
    expect(result.zonas.map((z) => z.excelZoneName)).toContain('SENDERO SANTA VERÓNICA');
  });

  it('extrae exactamente 107 actividades reales (código N.NN válido)', () => {
    expect(result.actividades).toHaveLength(EXPECTED_ACTIVITY_COUNT);
  });

  it('ignora las filas vacías finales como warning, no como actividad', () => {
    const vacias = result.warnings.filter((w) => w.tipo === 'fila_vacia');
    expect(vacias).toHaveLength(EXPECTED_EMPTY_ROWS);
  });

  it('ignora las filas de cierre financiero (columna B sin patrón N.NN) como warning', () => {
    const cierre = result.warnings.filter((w) => w.tipo === 'fila_cierre_financiero');
    expect(cierre).toHaveLength(EXPECTED_CLOSURE_ROWS);
    expect(cierre.map((w) => w.detalle).join(' ')).toMatch(/TOTAL COSTOS DIRECTOS|no coincide/);
  });

  it('ninguna actividad extraída tiene un código que no cumpla el patrón N.NN', () => {
    for (const act of result.actividades) {
      expect(act.activityKey).toMatch(/^\d+\.\d+$/);
    }
  });

  it('la actividad 1.01 tiene el precio unitario y la cantidad esperados (valores reales de referencia)', () => {
    const act = result.actividades.find((a) => a.activityKey === '1.01');
    expect(act).toBeDefined();
    expect(act!.precioUnitario).toBeCloseTo(1412.8795648795647, 6);
    const zonaPlaza = act!.zonas.find((z) => z.excelZoneName === 'PLAZA DE PTO COLOMBIA');
    expect(zonaPlaza?.cantidadContratada).toBe(7887);
  });

  it('la actividad 1.12 (frecuencia real distinta entre zonas) conserva el valor crudo de cada zona, sin decidir nada', () => {
    const act = result.actividades.find((a) => a.activityKey === '1.12');
    expect(act).toBeDefined();
    const salgar = act!.frecuenciasPorZona.find((f) => f.excelZoneName === 'SALGAR PLAYAS DEL COUNTRY 1');
    const plaza = act!.frecuenciasPorZona.find((f) => f.excelZoneName === 'PLAZA DE PTO COLOMBIA');
    expect(salgar?.frecuencia).toBe(6);
    expect(plaza?.frecuencia).toBe(4);
  });

  it('la actividad 3.1 conserva la celda FREC. vacía como null, no como error', () => {
    const act = result.actividades.find((a) => a.activityKey === '3.1');
    expect(act).toBeDefined();
    const mercado = act!.frecuenciasPorZona.find((f) => f.excelZoneName === 'MERCADO LA SAZÓN');
    expect(mercado?.frecuencia).toBeNull();
  });
});

describe('parsePoaExcel — estructura no reconocida', () => {
  it('lanza PoaExcelStructureError si la hoja "POA INICIAL 2026" no existe', () => {
    const wb = require('xlsx').utils.book_new();
    const emptySheet = require('xlsx').utils.aoa_to_sheet([['x']]);
    require('xlsx').utils.book_append_sheet(wb, emptySheet, 'Otra Hoja');
    const buf: Buffer = require('xlsx').write(wb, { type: 'buffer', bookType: 'xlsx' });
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    expect(() => parsePoaExcel(arrayBuffer as ArrayBuffer)).toThrow(PoaExcelStructureError);
    expect(() => parsePoaExcel(arrayBuffer as ArrayBuffer)).toThrow(/No se encontró la hoja/);
  });

  it('tolera que falte el nombre de una sola zona (celda I2, fila real de zonas) — detecta 8 en vez de 9, sin lanzar', () => {
    const arrayBuffer = realWorkbookWithMutation('I2', null);
    expect(() => parsePoaExcel(arrayBuffer)).not.toThrow();
    const result = parsePoaExcel(arrayBuffer);
    expect(result.zonas).toHaveLength(EXPECTED_ZONE_COUNT - 1);
    expect(result.zonas.map((z) => z.excelZoneName)).not.toContain('PLAZA DE PTO COLOMBIA');
  });

  it('lanza PoaExcelStructureError si ninguna celda de la fila de zonas tiene el sufijo "(presupuesto mes)"', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const rows = [
      ['nota'],
      ['SIN SUFIJO DE ZONA AQUÍ'],
      ['CAT', 'ÍTEM', 'DESCRIPCIÓN', 'UNID', 'CANT', 'VU25', 'VU26'],
      ['X', '1.01', 'Actividad', 'M2', 1, 1, 1],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, 'POA INICIAL 2026');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    expect(() => parsePoaExcel(arrayBuffer as ArrayBuffer)).toThrow(PoaExcelStructureError);
    expect(() => parsePoaExcel(arrayBuffer as ArrayBuffer)).toThrow(/ningún bloque de zona/);
  });
});
