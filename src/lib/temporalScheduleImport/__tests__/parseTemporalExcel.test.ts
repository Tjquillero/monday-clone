import * as fs from 'fs';
import * as path from 'path';
import {
  parseTemporalScheduleExcel,
  colLetter,
  excelSerialToISO,
  determineResourceType,
  RECONCILIATION_TOLERANCE,
} from '../parseTemporalExcel';
import type { ParsedTemporalActivityRow, ParsedTemporalAllocation } from '../types';

describe('FASE 2 Hito 1: Parser Fiel de Matriz Temporal K:AOA', () => {
  const xlsbPath = path.join(process.cwd(), 'CRONOGRAMA OPERACION 2025 V-2 SEGUIMIENTO EJECUCION.xlsb');
  let xlsbBuffer: Uint8Array;

  beforeAll(() => {
    if (fs.existsSync(xlsbPath)) {
      const buffer = fs.readFileSync(xlsbPath);
      xlsbBuffer = new Uint8Array(buffer);
    }
  });

  test('1. colLetter y excelSerialToISO calculan correctamente encabezados de Excel y fechas ISO', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(10)).toBe('K');
    expect(colLetter(11)).toBe('L');
    expect(colLetter(26)).toBe('AA');
    expect(colLetter(702)).toBe('AAA');

    // Date serial 45180 -> 2023-09-11
    expect(excelSerialToISO(45180)).toBe('2023-09-11');
    expect(excelSerialToISO(45999)).toBe('2025-12-08');
    expect(excelSerialToISO(0)).toBeNull();
  });

  test('2. R-TEMP-03 & R-TEMP-05: determineResourceType distingue correctamente Operador vs Maquinaria', () => {
    expect(determineResourceType('ACOPIO Y LIMPIEZA MANUAL CON PERSONAL')).toBe('operator');
    expect(determineResourceType('ARRUME CON TRACTOR EN SITIO ESTRATEGICO')).toBe('machinery');
    expect(determineResourceType('SUMINISTRO DE PERSONAL Y TRACTOR')).toBe('mixed');
    expect(determineResourceType('ACTIVIDAD GENERICA', 'Op')).toBe('operator');
    expect(determineResourceType('ACTIVIDAD GENERICA', 'Maq')).toBe('machinery');
  });

  test('3. Cobertura Estructural sobre Excel Real (CRONOGRAMA POR SITIO)', () => {
    if (!xlsbBuffer) {
      console.warn('XLSB file not present, skipping real file test');
      return;
    }

    const result = parseTemporalScheduleExcel(xlsbBuffer);

    expect(result.sheetName).toBe('CRONOGRAMA POR SITIO');
    expect(result.totalActivities).toBeGreaterThan(140);
    expect(result.dateHeaders.length).toBe(478);
    expect(result.sites).toEqual(
      expect.arrayContaining([
        'PLAYA DEL COUNTRY',
        'PUERTO COLOMBIA',
        'SALINAS DEL REY',
        'MANGLARES',
        'MIRAMAR SECTOR EL FARO',
        'CENTRO GASTRONÓMICO',
        'SENDERO SANTA VERÓNICA',
      ])
    );

    // Verificar primera fecha y última fecha
    expect(result.dateHeaders[0].isoDate).toBe('2023-09-11');
    expect(result.dateHeaders[result.dateHeaders.length - 1].isoDate).toBe('2025-12-31');
  });

  test('4. R-TEMP-04: Trazabilidad de origen y resguardo de celdas vacías vs 0 vs parciales', () => {
    if (!xlsbBuffer) return;

    const result = parseTemporalScheduleExcel(xlsbBuffer);
    const countryActivity = result.activities.find((a: ParsedTemporalActivityRow) => a.siteName === 'PLAYA DEL COUNTRY' && a.np === 1);

    expect(countryActivity).toBeDefined();
    expect(countryActivity?.allocations.length).toBe(478);

    const firstAllocation = countryActivity!.allocations[0];
    expect(firstAllocation.origin.sourceSheet).toBe('CRONOGRAMA POR SITIO');
    expect(firstAllocation.origin.sourceRow).toBe(9);
    expect(firstAllocation.origin.siteName).toBe('PLAYA DEL COUNTRY');
    expect(firstAllocation.origin.np).toBe(1);
    expect(firstAllocation.date).toBe('2023-09-11');

    // Verificar parciales preservados (ej. 5.94 jornales en el primer día activo)
    const activeAllocations = countryActivity!.allocations.filter((a: ParsedTemporalAllocation) => !a.isEmptyCell && a.jornales > 0);
    expect(activeAllocations.length).toBeGreaterThan(0);
    expect(activeAllocations[0].jornales).toBe(5.94);
    expect(activeAllocations[0].quantity).toBe(17820);
  });

  test('5. R-TEMP-01, R-TEMP-02 & R-TEMP-06: No optimización, conservación y reconciliación explícita', () => {
    if (!xlsbBuffer) return;

    const result = parseTemporalScheduleExcel(xlsbBuffer);

    // Verificar que existen reconciliaciones con EXACT_MATCH o RECONCILIATION_MISMATCH
    expect(result.summary.tolerance).toBe(RECONCILIATION_TOLERANCE);

    // Verificar que ninguna actividad fue auto-completada o alterada
    for (const act of result.activities) {
      let manualSumCant = 0;
      let manualSumJornales = 0;

      for (const alloc of act.allocations) {
        manualSumCant += alloc.quantity;
        manualSumJornales += alloc.jornales;
      }

      // La suma manual debe coincidir exactamente con las sumas registradas en el resultado
      expect(act.sumQuantity).toBeCloseTo(manualSumCant, 6);
      expect(act.sumJornales).toBeCloseTo(manualSumJornales, 6);

      // Si existe discrepancia con el header, DEBE reportarse como RECONCILIATION_MISMATCH y NUNCA auto-rellenarse
      if (Math.abs(act.headers.cantHeader - act.sumQuantity) > RECONCILIATION_TOLERANCE) {
        expect(act.reconciliation.cantMatched).toBe(false);
        expect(act.reconciliation.status).toBe('RECONCILIATION_MISMATCH');
      }
    }
  });
});
