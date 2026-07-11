// =============================================================================
// Fixtures de prueba derivadas del Excel real del POA — no un archivo .test.ts.
// Ref: docs/architecture/poa-excel-import-test-matrix.md, sección "Fixtures
// necesarias": cada caso negativo se genera mutando una celda puntual del
// archivo real en memoria, en vez de mantener binarios casi idénticos en el
// repo.
// =============================================================================

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const REAL_FILE_PATH = path.join(process.cwd(), 'POA 2026 V.02 Ene.26-2026.xlsx');
export const REAL_SHEET_NAME_WITH_SPACE = 'POA INICIAL 2026 ';

export function loadRealWorkbook(): XLSX.WorkBook {
  const buffer = fs.readFileSync(REAL_FILE_PATH);
  return XLSX.read(buffer, { type: 'buffer' });
}

export function workbookToArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Devuelve el ArrayBuffer del archivo real, sin ninguna modificación. */
export function realWorkbookArrayBuffer(): ArrayBuffer {
  return workbookToArrayBuffer(loadRealWorkbook());
}

/**
 * Muta una celda puntual (dirección A1, ej. "D18") de la hoja principal y
 * devuelve un nuevo ArrayBuffer. `value: null` borra la celda (simula una
 * celda vacía). Cada llamada relee el archivo real desde disco — no comparte
 * estado mutable entre pruebas.
 */
export function realWorkbookWithMutation(
  cellAddress: string,
  value: string | number | null,
): ArrayBuffer {
  const wb = loadRealWorkbook();
  const sheet = wb.Sheets[REAL_SHEET_NAME_WITH_SPACE];
  if (!sheet) {
    throw new Error(
      `No se encontró la hoja "${REAL_SHEET_NAME_WITH_SPACE}" en el archivo real — ¿cambió el nombre?`,
    );
  }
  if (value === null) {
    delete sheet[cellAddress];
  } else {
    sheet[cellAddress] = { t: typeof value === 'number' ? 'n' : 's', v: value };
  }
  return workbookToArrayBuffer(wb);
}
