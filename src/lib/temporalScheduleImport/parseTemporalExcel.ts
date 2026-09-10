/**
 * Parser Fiel de la Matriz Temporal K:AOA (FASE 2 Hito 1)
 *
 * Lee la grilla de programación temporal del Excel `CRONOGRAMA POR SITIO`
 * y extrae las asignaciones operacionales diarias sin redistribución ni optimización.
 *
 * Invariantes Estrictas:
 * - R-TEMP-01: Conservación temporal (sumas exactas).
 * - R-TEMP-02: No optimización durante ingesta (sin alteración de datos).
 * - R-TEMP-03: Identidad de fecha ISO (vía seriales de Excel).
 * - R-TEMP-04: Conservación de origen (trazabilidad completa).
 * - R-TEMP-05: Cero != ausencia (distinción celda vacía vs 0 vs parcial).
 * - R-TEMP-06: No redondeo destructivo (tolerancia 1e-4).
 */

import * as XLSX from 'xlsx';
import type {
  TemporalScheduleParseResult,
  ParsedTemporalActivityRow,
  ParsedTemporalAllocation,
  TemporalDateColumnHeader,
  TemporalParseWarning,
  TemporalResourceType,
  ReconciliationStatus,
} from './types';

export const TARGET_SHEET_NAME = 'CRONOGRAMA POR SITIO';
export const RECONCILIATION_TOLERANCE = 1e-4;

export class TemporalExcelStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemporalExcelStructureError';
  }
}

/**
 * Convierte un número de columna 0-indexed a letra de Excel (0 -> 'A', 10 -> 'K', 26 -> 'AA')
 */
export function colLetter(colIndex: number): string {
  let s = '';
  let n = colIndex + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Convierte un número serial de Excel a string ISO 'YYYY-MM-DD' (R-TEMP-03)
 */
export function excelSerialToISO(serial: number): string | null {
  if (typeof serial !== 'number' || isNaN(serial) || serial < 10000) return null;
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  const y = String(parsed.y).padStart(4, '0');
  const m = String(parsed.m).padStart(2, '0');
  const d = String(parsed.d).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Determina el tipo de recurso (Op vs Maq) según el nombre de la actividad o los subencabezados
 */
export function determineResourceType(activityDescription: string, subHeaderOp?: string | null): TemporalResourceType {
  const desc = activityDescription.toLowerCase();
  const sub = (subHeaderOp || '').toLowerCase();

  const isMachineryInDesc = desc.includes('tractor') || desc.includes('volqueta') || desc.includes('minicargador') || desc.includes('guadaña') || desc.includes('mecanic');
  const isOperatorInDesc = desc.includes('personal') || desc.includes('operario') || desc.includes('oficial') || desc.includes('limpieza manual');

  if (isMachineryInDesc && isOperatorInDesc) return 'mixed';
  if (isMachineryInDesc) return 'machinery';
  if (isOperatorInDesc) return 'operator';

  if (sub.includes('maq')) return 'machinery';
  if (sub.includes('op')) return 'operator';

  return 'operator';
}

/**
 * Función Principal: Parsea la matriz temporal K:AOA sin pérdida ni invención de datos.
 */
export function parseTemporalScheduleExcel(
  fileBuffer: ArrayBuffer | Uint8Array,
  options?: { targetSheet?: string; tolerance?: number }
): TemporalScheduleParseResult {
  const bytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);
  const workbook = XLSX.read(bytes, { type: 'array' });

  const targetSheetName = options?.targetSheet || TARGET_SHEET_NAME;
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === targetSheetName.toUpperCase()
  );

  if (!sheetName) {
    throw new TemporalExcelStructureError(
      `No se encontró la hoja "${targetSheetName}" en el libro. Hojas disponibles: ${workbook.SheetNames.join(', ')}`
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  if (rows.length < 8) {
    throw new TemporalExcelStructureError(
      `La hoja "${sheetName}" no contiene suficientes filas de encabezado y datos temporal.`
    );
  }

  const rowDayNum = rows[4]; // Fila 5 (Día 73...)
  const rowDayName = rows[5]; // Fila 6 (LUNES...)
  const rowDateSerial = rows[6]; // Fila 7 (Seriales 45180...)
  const rowSubHeader = rows[7]; // Fila 8 (Subencabezados Op / Maq, Cant.)

  if (!rowDateSerial || !Array.isArray(rowDateSerial)) {
    throw new TemporalExcelStructureError('No se pudo localizar la fila 7 de fechas seriales en el Excel.');
  }

  // 1. Identificar columnas de fecha (R-TEMP-03)
  const dateHeaders: TemporalDateColumnHeader[] = [];
  const tolerance = options?.tolerance ?? RECONCILIATION_TOLERANCE;

  rowDateSerial.forEach((cell, colIdx) => {
    if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
      const isoDate = excelSerialToISO(cell);
      if (isoDate) {
        const colOpLetter = colLetter(colIdx);
        const colCantLetter = colLetter(colIdx + 1);
        const dayLabel = rowDayNum && rowDayNum[colIdx] ? String(rowDayNum[colIdx]).trim() : null;
        const dayName = rowDayName && rowDayName[colIdx] ? String(rowDayName[colIdx]).trim() : null;
        const subHeaderOp = rowSubHeader && rowSubHeader[colIdx] ? String(rowSubHeader[colIdx]).trim() : null;
        const subHeaderCant = rowSubHeader && rowSubHeader[colIdx + 1] ? String(rowSubHeader[colIdx + 1]).trim() : null;

        dateHeaders.push({
          colOpIndex: colIdx,
          colCantIndex: colIdx + 1,
          colOpLetter,
          colCantLetter,
          excelSerialDate: cell,
          isoDate,
          dayLabel,
          dayName,
          subHeaderOp,
          subHeaderCant,
        });
      }
    }
  });

  if (dateHeaders.length === 0) {
    throw new TemporalExcelStructureError(
      'No se detectaron columnas de fechas válidas en la fila 7 del Excel.'
    );
  }

  const activities: ParsedTemporalActivityRow[] = [];
  const warnings: TemporalParseWarning[] = [];
  const sitesSet = new Set<string>();

  let totalAllocationsParsed = 0;
  let totalActiveAllocations = 0;
  let reconciledCantCount = 0;
  let reconciledJornalesCount = 0;
  let discrepancyCount = 0;

  // 2. Iterar filas de datos (a partir de fila 9, índice 8)
  for (let r = 8; r < rows.length; r++) {
    const row = rows[r];
    const excelRow = r + 1;

    if (!row || !Array.isArray(row) || row.every((c) => c === null || c === '')) {
      warnings.push({
        excelRow,
        type: 'empty_row',
        message: `Fila ${excelRow} completamente vacía.`,
      });
      continue;
    }

    const rawSite = row[1];
    const rawNp = row[2];
    const rawActivity = row[3];
    const rawUnit = row[4];
    const rawCant = row[5];
    const rawRend = row[6];
    const rawFrec = row[8];
    const rawJornales = row[9];

    if (!rawSite || typeof rawSite !== 'string' || !rawActivity || typeof rawActivity !== 'string') {
      continue;
    }

    const siteName = rawSite.trim().toUpperCase();
    const activityDescription = rawActivity.trim();
    const np = typeof rawNp === 'number' ? rawNp : (parseInt(String(rawNp), 10) || null);
    const unit = rawUnit !== null && rawUnit !== undefined ? String(rawUnit).trim() : null;

    const cantHeader = typeof rawCant === 'number' ? rawCant : (parseFloat(String(rawCant)) || 0);
    const rendHeader = typeof rawRend === 'number' ? rawRend : (parseFloat(String(rawRend)) || 0);
    const frecHeader = typeof rawFrec === 'number' ? rawFrec : (parseFloat(String(rawFrec)) || 0);
    const jornalesHeader = typeof rawJornales === 'number' ? rawJornales : (parseFloat(String(rawJornales)) || 0);

    sitesSet.add(siteName);

    const allocations: ParsedTemporalAllocation[] = [];
    let sumQuantity = 0;
    let sumJornales = 0;
    let activeAllocationsCount = 0;

    // 3. Extraer asignaciones diarias sin redistribución (R-TEMP-02, R-TEMP-04, R-TEMP-05, R-TEMP-06)
    dateHeaders.forEach((dh) => {
      const valOpRaw = row[dh.colOpIndex];
      const valCantRaw = row[dh.colCantIndex];

      const isEmptyCell = (valOpRaw === null || valOpRaw === undefined || valOpRaw === '') &&
                          (valCantRaw === null || valCantRaw === undefined || valCantRaw === '');
      
      const valOpNum = typeof valOpRaw === 'number' ? valOpRaw : (parseFloat(String(valOpRaw)) || 0);
      const valCantNum = typeof valCantRaw === 'number' ? valCantRaw : (parseFloat(String(valCantRaw)) || 0);

      const isZeroValue = !isEmptyCell && valOpNum === 0 && valCantNum === 0;
      const isActive = valOpNum > 0 || valCantNum > 0;

      totalAllocationsParsed++;

      if (isActive) {
        activeAllocationsCount++;
        totalActiveAllocations++;
        sumJornales += valOpNum;
        sumQuantity += valCantNum;
      }

      const resourceType = determineResourceType(activityDescription, dh.subHeaderOp);

      const allocation: ParsedTemporalAllocation = {
        id: `r${excelRow}_${siteName}_np${np ?? '0'}_${dh.isoDate}`,
        origin: {
          sourceSheet: sheetName,
          sourceRow: excelRow,
          colOpLetter: dh.colOpLetter,
          colCantLetter: dh.colCantLetter,
          siteName,
          np,
          activityDescription,
        },
        date: dh.isoDate,
        resourceType,
        jornales: valOpNum,
        quantity: valCantNum,
        isEmptyCell,
        isZeroValue,
      };

      allocations.push(allocation);
    });

    // 4. Reconciliación con tolerancia explícita (R-TEMP-01, R-TEMP-06)
    const cantDiff = Math.abs(cantHeader - sumQuantity);
    const jornalesDiff = Math.abs(jornalesHeader - sumJornales);
    const cantMatched = cantDiff <= tolerance;
    const jornalesMatched = jornalesDiff <= tolerance;
    const isExactMatch = cantMatched && jornalesMatched;

    if (cantMatched) reconciledCantCount++;
    if (jornalesMatched) reconciledJornalesCount++;
    if (!isExactMatch) {
      discrepancyCount++;
      warnings.push({
        excelRow,
        type: 'reconciliation_discrepancy',
        message: `Fila ${excelRow} (${siteName} NP ${np}): Discrepancia entre encabezado y suma temporal. CANT diff = ${cantDiff.toFixed(4)}, JORNALES diff = ${jornalesDiff.toFixed(4)}.`,
        details: { siteName, np, activityDescription, cantHeader, sumQuantity, jornalesHeader, sumJornales },
      });
    }

    const reconciliation: ReconciliationStatus = {
      cantMatched,
      jornalesMatched,
      cantDiff,
      jornalesDiff,
      toleranceUsed: tolerance,
      status: isExactMatch ? 'EXACT_MATCH' : 'RECONCILIATION_MISMATCH',
      details: isExactMatch
        ? 'Suma temporal coincide exactamente con los valores declarados en el encabezado.'
        : `Discrepancia detectada: Suma CANT = ${sumQuantity.toFixed(4)} vs Header CANT = ${cantHeader}, Suma JORNALES = ${sumJornales.toFixed(4)} vs Header JORNALES = ${jornalesHeader}.`,
    };

    activities.push({
      excelRow,
      siteName,
      np,
      activityDescription,
      unit,
      headers: {
        cantHeader,
        jornalesHeader,
        rendimientoHeader: rendHeader,
        frecuenciaHeader: frecHeader,
      },
      allocations,
      activeAllocationsCount,
      sumQuantity,
      sumJornales,
      reconciliation,
    });
  }

  return {
    sheetName,
    totalRowsProcessed: rows.length,
    totalActivities: activities.length,
    totalAllocationsParsed,
    totalActiveAllocations,
    dateHeaders,
    activities,
    sites: Array.from(sitesSet),
    warnings,
    summary: {
      reconciledCantCount,
      reconciledJornalesCount,
      discrepancyCount,
      tolerance,
    },
  };
}
