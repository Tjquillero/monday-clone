// =============================================================================
// Incremento 2 (Parser) del importador de Resource Analysis: lectura pura del
// Excel a un modelo intermedio. No valida reglas de negocio, no resuelve a
// qué group_id pertenece cada bloque, no escribe en la base de datos.
//
// Ref: docs/domain/resource-analysis-domain.md,
//      docs/architecture/resource-analysis-import-design.md, Secciones 2-6.
// Estructura verificada contra el archivo real (COSTOS GENERALES (V2).xlsx):
//   - 9 hojas de sitio + "DETALLE DE GRUPO" (excluida, no es un sitio).
//   - Cada hoja tiene hasta 2 bloques, cada uno con el patrón:
//       fila "NOMBRE DEL PROYECTO:" | (vacío) | "<texto libre> - ZONA X"
//       fila vacía
//       fila encabezado "ITEM"/"DESCRIPCION"/"UND"/"CANTIDAD"
//       filas de cantidad (hasta que aparece una fila totalmente vacía)
//       fila(s) vacías
//       fila con el nombre del bloque repetido (informativo, se ignora)
//       fila encabezado "ITEM"/"ACTIVIDAD"/"UNIDAD"/"RENDIMIENTO"/"FRECUENCIA"/
//         "FACTOR"/"CANTIDAD"/"CANT JORNALES MES" (tabla de rendimiento/frecuencia,
//         fuera de alcance de importación — solo se conserva para el reporte
//         de discrepancias, Sección 6 del diseño)
//       filas de actividad (hasta la siguiente fila totalmente vacía)
// =============================================================================

import * as XLSX from 'xlsx';
import type {
  ParsedActivityStandardRaw,
  ParsedBlock,
  ParsedQuantity,
  ParsedSheet,
  ParseResult,
  ParseWarning,
  ScopeKey,
} from './types';

const EXCLUDED_SHEETS = new Set(['DETALLE DE GRUPO']);
const PROJECT_MARKER = 'NOMBRE DEL PROYECTO:';

/** Mapeo verificado — ver docs/domain/resource-analysis-domain.md Sección 3. */
const SCOPE_KEY_MAP: Record<string, ScopeKey> = {
  'TOTAL PAISAJISMO': 'total_paisajismo',
  'ZONA DURA': 'zona_dura',
  GRAMA: 'grama',
  'LIMPIEZA MARMOL': 'limpieza_marmol',
  'ARBUSTOS Y CUBRE SUELOS': 'arbustos',
  'ARBOLES TOTALES': 'arboles',
  'ZONA DE PLAYA': 'zona_playa',
  'TRASIEGO DE PLAYA': 'trasiego_playa',
  'LIMPIEZA MANUAL': 'limpieza_manual',
  'CORTE DE TRONCOS': 'corte_troncos',
};

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isRowBlank(row: unknown[] | undefined): boolean {
  return !row || row.every((c) => c === null || c === undefined || c === '');
}

/** Lee la tabla de cantidades de un bloque, desde `start` hasta la primera fila vacía. */
function parseQuantityTable(
  rows: unknown[][],
  start: number,
  sheetName: string,
  warnings: ParseWarning[],
): { quantities: ParsedQuantity[]; nextIndex: number } {
  const quantities: ParsedQuantity[] = [];
  let i = start;
  while (i < rows.length && !isRowBlank(rows[i])) {
    const row = rows[i];
    const excelRow = i + 1;
    const descripcion = normalizeLabel(row[1]);
    const cantidadRaw = row[3];
    if (descripcion !== null) {
      const scopeKey = SCOPE_KEY_MAP[descripcion.toUpperCase()];
      if (!scopeKey) {
        warnings.push({
          tipo: 'descripcion_no_reconocida',
          sheetName,
          excelRow,
          detalle: descripcion,
        });
      } else if (typeof cantidadRaw === 'number') {
        if (cantidadRaw < 0) {
          warnings.push({
            tipo: 'cantidad_negativa',
            sheetName,
            excelRow,
            detalle: `${descripcion}: ${cantidadRaw}`,
          });
        } else {
          quantities.push({ scopeKey, cantidad: cantidadRaw, excelRow });
        }
      }
      // cantidadRaw no numérico (null/undefined): slot vacío del template del
      // Excel (ej. ítems 5/6 sin llenar) — no es un error, se ignora en silencio.
    }
    i++;
  }
  return { quantities, nextIndex: i };
}

/**
 * Lee la tabla de rendimiento/frecuencia que sigue a la de cantidades.
 * Puramente informativa (Sección 6 del diseño, reporte de discrepancias) —
 * nunca se persiste ni se usa para resolver `board_activity_standards`.
 */
function parseActivityStandardsTable(
  rows: unknown[][],
  afterQuantityTableIndex: number,
): { activityStandardsRaw: ParsedActivityStandardRaw[]; nextIndex: number } {
  let k = afterQuantityTableIndex;
  while (k < rows.length && isRowBlank(rows[k])) k++;
  // rows[k] = nombre del bloque repetido (informativo); rows[k+1] = encabezado esperado.
  const headerRow = rows[k + 1];
  const looksLikeHeader =
    headerRow && normalizeLabel(headerRow[1])?.toUpperCase() === 'ACTIVIDAD';
  if (!looksLikeHeader) {
    return { activityStandardsRaw: [], nextIndex: k };
  }

  const activityStandardsRaw: ParsedActivityStandardRaw[] = [];
  let m = k + 2;
  while (m < rows.length && !isRowBlank(rows[m])) {
    const row = rows[m];
    const actividad = normalizeLabel(row[1]);
    if (actividad !== null) {
      const unidad = normalizeLabel(row[2]);
      const rendimiento = typeof row[3] === 'number' ? row[3] : null;
      const frecuencia = typeof row[4] === 'number' ? row[4] : null;
      const cantidad = typeof row[6] === 'number' ? row[6] : null;
      activityStandardsRaw.push({
        actividad,
        unidad,
        rendimiento,
        frecuencia,
        cantidad,
        excelRow: m + 1,
      });
    }
    m++;
  }
  return { activityStandardsRaw, nextIndex: m };
}

function parseSheet(rows: unknown[][], sheetName: string, warnings: ParseWarning[]): ParsedSheet {
  const blocks: ParsedBlock[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (normalizeLabel(row?.[0]) === PROJECT_MARKER) {
      const blockLabel = normalizeLabel(row[2]) ?? '';
      const excelRow = i + 1;
      const { quantities, nextIndex: afterQuantities } = parseQuantityTable(
        rows,
        i + 3,
        sheetName,
        warnings,
      );
      const { activityStandardsRaw, nextIndex } = parseActivityStandardsTable(rows, afterQuantities);
      blocks.push({ blockLabel, excelRow, quantities, activityStandardsRaw });
      i = Math.max(nextIndex, i + 1);
    } else {
      i++;
    }
  }
  if (blocks.length === 0) {
    warnings.push({ tipo: 'hoja_sin_bloques', sheetName, excelRow: 1 });
  }
  return { sheetName, blocks };
}

/**
 * Parsea todas las hojas de sitio del Excel de Resource Analysis (excluye
 * "DETALLE DE GRUPO", que no es un sitio — ver dominio Sección 4). No lanza
 * error si una hoja no tiene el patrón esperado: lo reporta como warning,
 * porque cada sitio es independiente (a diferencia del POA, no existe aquí
 * el concepto de "todo o nada" a nivel de archivo completo).
 */
export function parseResourceAnalysisExcel(fileData: ArrayBuffer | Uint8Array): ParseResult {
  const bytes = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const workbook = XLSX.read(bytes, { type: 'array' });

  const warnings: ParseWarning[] = [];
  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (EXCLUDED_SHEETS.has(sheetName.trim())) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    sheets.push(parseSheet(rows, sheetName, warnings));
  }

  return { sheets, warnings };
}
