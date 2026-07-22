// =============================================================================
// Fixtures de prueba derivadas del Excel real del Resource Analysis — mismo
// patrón que src/lib/poaImport/testFixtures.ts.
//
// El archivo en la raíz del repo es una versión SANEADA del documento
// original (tarifa salarial y un nombre propio reemplazados por valores
// ficticios, totales recalculados para seguir siendo coherentes) — nunca el
// Excel real sin editar. Ver docs/testing/fixtures-policy.md.
// =============================================================================

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const REAL_FILE_PATH = path.join(process.cwd(), 'COSTOS GENERALES (V2).xlsx');

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
