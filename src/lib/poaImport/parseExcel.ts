// =============================================================================
// Capas 1+2 del importador del Excel del POA: lectura de la hoja y extracción
// a un modelo intermedio (ParsedActivity). No valida ni decide nada — eso es
// responsabilidad de validate.ts. No escribe en la base de datos.
//
// Ref: docs/architecture/poa-excel-import-design.md, Secciones 2-4.
// Estructura verificada contra el archivo real (POA 2026 V.02 Ene.26-2026.xlsx):
//   - Nombre real de la hoja tiene un espacio final ("POA INICIAL 2026 ").
//   - Fila 2 del Excel (índice 1): nombres de zona, sufijo "(presupuesto mes)".
//   - Fila 3 del Excel (índice 2): subencabezados (CANT./FREC./PRECIO TOTAL...).
//   - Fila 4 en adelante (índice 3+): datos.
//   - Columna B: código contractual (patrón "N.NN"); filas con columna B no
//     vacía que no cumplen el patrón son cierre financiero (TOTAL COSTOS
//     DIRECTOS, etc.), no actividades — ver docs/discovery hallazgo adicional.
// =============================================================================

import * as XLSX from 'xlsx';
import type {
  ParseResult,
  ParsedActivity,
  ParsedZoneAllocation,
  ParsedZoneHeader,
  ParseWarning,
  ZoneFrecuenciaRaw,
} from './types';

const SHEET_NAME = 'POA INICIAL 2026';
const ZONE_HEADER_SUFFIX = '(presupuesto mes)';
const ACTIVITY_CODE_PATTERN = /^\d+\.\d+$/;

const ZONE_ROW_INDEX = 1;
const SUBHEADER_ROW_INDEX = 2;
const DATA_START_INDEX = 3;

const COL_ACTIVITY_KEY = 1;
const COL_DESCRIPCION = 2;
const COL_UNIDAD = 3;
const COL_VR_UNITARIO_VIGENTE = 6; // "Vr. UNITARIO 2026"

const ZONE_BLOCK_SEARCH_SPAN = 6;

export class PoaExcelStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoaExcelStructureError';
  }
}

function colLetter(col: number): string {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function findColByLabel(
  subHeaderRow: unknown[],
  zoneColStart: number,
  label: string,
): number | null {
  for (let c = zoneColStart; c < zoneColStart + ZONE_BLOCK_SEARCH_SPAN; c++) {
    const cell = subHeaderRow[c];
    if (typeof cell === 'string' && cell.toUpperCase().includes(label)) return c;
  }
  return null;
}

interface ZoneColumns extends ParsedZoneHeader {
  cantCol: number;
  frecCol: number;
}

function locateZoneColumns(zoneRow: unknown[], subHeaderRow: unknown[]): ZoneColumns[] {
  const zonas: ParsedZoneHeader[] = [];
  zoneRow.forEach((cell, idx) => {
    if (typeof cell === 'string' && cell.includes(ZONE_HEADER_SUFFIX)) {
      zonas.push({
        excelZoneName: cell.replace(ZONE_HEADER_SUFFIX, '').trim(),
        startColumn: idx,
      });
    }
  });

  if (zonas.length === 0) {
    throw new PoaExcelStructureError(
      `No se detectó ningún bloque de zona (se esperaba el sufijo "${ZONE_HEADER_SUFFIX}" en la fila de zonas).`,
    );
  }

  return zonas.map((z) => {
    const cantCol = findColByLabel(subHeaderRow, z.startColumn, 'CANT');
    const frecCol = findColByLabel(subHeaderRow, z.startColumn, 'FREC');
    if (cantCol === null || frecCol === null) {
      throw new PoaExcelStructureError(
        `No se encontraron las columnas CANT./FREC. esperadas para la zona "${z.excelZoneName}".`,
      );
    }
    return { ...z, cantCol, frecCol };
  });
}

/**
 * Parsea el Excel oficial del POA (hoja "POA INICIAL 2026") a un modelo
 * intermedio. Lanza PoaExcelStructureError si el layout no es reconocible —
 * nunca produce datos parcialmente desalineados en silencio.
 */
export function parsePoaExcel(fileData: ArrayBuffer | Uint8Array): ParseResult {
  const bytes = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames.find((n) => n.trim() === SHEET_NAME);
  if (!sheetName) {
    throw new PoaExcelStructureError(
      `No se encontró la hoja "${SHEET_NAME}" en el archivo. Hojas disponibles: ${workbook.SheetNames.join(', ')}`,
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  if (rows.length <= DATA_START_INDEX) {
    throw new PoaExcelStructureError('La hoja no tiene suficientes filas para contener datos de actividad.');
  }

  const zoneRow = rows[ZONE_ROW_INDEX];
  const subHeaderRow = rows[SUBHEADER_ROW_INDEX];
  if (!zoneRow || !subHeaderRow) {
    throw new PoaExcelStructureError(
      'No se pudieron leer las filas de encabezado esperadas (nombres de zona / subencabezados).',
    );
  }

  const zoneCols = locateZoneColumns(zoneRow, subHeaderRow);

  const actividades: ParsedActivity[] = [];
  const warnings: ParseWarning[] = [];

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = i + 1;

    const isFullyEmpty = !row || row.every((c) => c === null || c === '');
    if (isFullyEmpty) {
      warnings.push({ tipo: 'fila_vacia', excelRow });
      continue;
    }

    const rawKey = row[COL_ACTIVITY_KEY];
    if (rawKey === null || rawKey === '') {
      warnings.push({ tipo: 'fila_cierre_financiero', excelRow, detalle: 'Columna B (código) vacía' });
      continue;
    }

    const activityKey = String(rawKey).trim();
    if (!ACTIVITY_CODE_PATTERN.test(activityKey)) {
      warnings.push({
        tipo: 'fila_cierre_financiero',
        excelRow,
        detalle: `"${activityKey}" no coincide con el patrón de código contractual (N.NN)`,
      });
      continue;
    }

    const descripcionRaw = row[COL_DESCRIPCION];
    const descripcion = descripcionRaw !== null ? String(descripcionRaw).trim() : '';

    const unidadRaw = row[COL_UNIDAD];
    const unidad = unidadRaw !== null && unidadRaw !== '' ? String(unidadRaw).trim() : null;

    const precioRaw = row[COL_VR_UNITARIO_VIGENTE];
    const precioUnitario = typeof precioRaw === 'number' ? precioRaw : null;

    const zonas: ParsedZoneAllocation[] = [];
    const frecuenciasPorZona: ZoneFrecuenciaRaw[] = [];

    for (const z of zoneCols) {
      const cant = row[z.cantCol];
      if (typeof cant !== 'number' || cant <= 0) continue;

      const frecRaw = row[z.frecCol];
      const frecuencia = typeof frecRaw === 'number' ? frecRaw : null;
      const excelFrecCell = `${colLetter(z.frecCol)}${excelRow}`;

      zonas.push({
        excelZoneName: z.excelZoneName,
        cantidadContratada: cant,
        excelRow,
        excelCantCell: `${colLetter(z.cantCol)}${excelRow}`,
        excelFrecCell,
      });
      frecuenciasPorZona.push({ excelZoneName: z.excelZoneName, frecuencia, excelFrecCell });
    }

    actividades.push({
      activityKey,
      descripcion,
      unidad,
      precioUnitario,
      zonas,
      frecuenciasPorZona,
      excelRow,
    });
  }

  return { sheetName: sheetName.trim(), zonas: zoneCols, actividades, warnings };
}
