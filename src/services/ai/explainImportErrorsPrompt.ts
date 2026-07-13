import type { ImportValidationError } from '@/lib/poaImport/types';

// Construcción del prompt — sin dependencias de @google/genai, para poder
// testearla sin que Jest intente transformar el SDK (mismo problema que
// obligó a separar proactiveSummary.ts de useAiProactiveSummary.ts).
export function buildExplainImportErrorsPrompt(errors: ImportValidationError[]): string {
  const list = errors
    .map((e, i) => {
      const parts = [`#${i + 1} [${e.code}] ${e.message}`];
      if (e.activityKey) parts.push(`actividad: ${e.activityKey}`);
      if (e.excelRow != null) parts.push(`fila Excel: ${e.excelRow}`);
      if (e.excelCell) parts.push(`celda: ${e.excelCell}`);
      if (e.zona) parts.push(`zona: ${e.zona}`);
      if (e.motivo) parts.push(`motivo: ${e.motivo}`);
      return parts.join(' | ');
    })
    .join('\n');

  return (
    `Estos son los errores reales de la validación (${errors.length} en total):\n\n${list}\n\n` +
    'Explica qué significa cada uno y qué debe corregir el usuario en el Excel.'
  );
}
