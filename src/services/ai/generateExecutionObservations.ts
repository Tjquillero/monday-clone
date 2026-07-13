import type { SupabaseClient } from '@supabase/supabase-js';
import { getExecutionAttachments, getDuplicateAttachments } from './domainTools/evidence';
import { evaluateExecutionEvidence } from './evaluateExecutionEvidence';
import { findPossibleVisualDuplicates } from './findPossibleVisualDuplicates';

// v2.5 de Fase 5 — última pieza. Contrato congelado con el usuario antes
// de escribir código: genera OBSERVACIONES para ayudar al supervisor,
// nunca conclusiones ni decisiones. Reutiliza tools ya existentes en vez
// de pedirle a Gemini que redescubra algo que otra tool ya sabe:
//   - phase (v2.3, dato de dominio) -> missing_before / missing_after
//   - evaluateExecutionEvidence (v2.2) -> poor_evidence / visual_limitation
//   - getDuplicateAttachments (v2.4, hash) -> possible_duplicate (exacto)
//   - findPossibleVisualDuplicates (v2.4b) -> possible_duplicate (visual)
//
// La lista de observaciones se ENSAMBLA en código, determinísticamente —
// no se le pide a Gemini una tercera vez que "resuma todo esto". Cada
// observación es trazable 1:1 a su fuente por construcción: no existe
// ninguna observación "porque el modelo tuvo una impresión".
//
// Severidad limitada a 'info' | 'warning' — a propósito SIN 'critical' ni
// 'error'. Categorías cerradas, SIN aprobar/rechazar. Nunca produce frases
// como "fraudulenta", "debe rechazarse", "certificación inválida", "el
// trabajo no fue realizado" — eso no puede sostenerse solo con imágenes,
// y sigue siendo decisión humana del flujo de negocio.

export type ObservationSeverity = 'info' | 'warning';

export type ObservationCategory =
  | 'missing_before'
  | 'missing_after'
  | 'poor_evidence'
  | 'possible_duplicate'
  | 'visual_limitation';

export interface ExecutionObservation {
  severity: ObservationSeverity;
  category: ObservationCategory;
  message: string;
}

export interface ExecutionObservationsResult {
  observations: ExecutionObservation[];
}

export async function generateExecutionObservations(
  supabase: SupabaseClient,
  executionId: string,
  boardId: string
): Promise<ExecutionObservationsResult> {
  const observations: ExecutionObservation[] = [];

  // Dato de dominio puro (phase, v2.3) — sin Gemini.
  const attachments = await getExecutionAttachments(supabase, executionId);
  const hasBefore = attachments.some((a) => a.phase === 'before');
  const hasAfter = attachments.some((a) => a.phase === 'after');

  if (!hasBefore) {
    observations.push({
      severity: 'warning',
      category: 'missing_before',
      message: 'No se encontró evidencia clasificada como "antes".',
    });
  }
  if (!hasAfter) {
    observations.push({
      severity: 'warning',
      category: 'missing_after',
      message: 'No se encontró evidencia clasificada como "después".',
    });
  }

  // Los tres sub-resultados son independientes entre sí — se piden en
  // paralelo para no sumar latencias de Gemini innecesariamente.
  const [evidenceAssessment, exactDuplicates, visualDuplicates] = await Promise.all([
    evaluateExecutionEvidence(supabase, executionId), // v2.2 (Gemini, o decline sin fotos)
    getDuplicateAttachments(supabase, boardId), // v2.4 (SQL, sin Gemini)
    findPossibleVisualDuplicates(supabase, executionId), // v2.4b (Gemini, o decline)
  ]);

  if (attachments.length === 0) {
    observations.push({
      severity: 'warning',
      category: 'poor_evidence',
      message: 'No hay evidencia fotográfica para evaluar.',
    });
  } else {
    for (const limitation of evidenceAssessment.limitations) {
      observations.push({ severity: 'info', category: 'visual_limitation', message: limitation });
    }
  }

  for (const group of exactDuplicates) {
    const occurrencesHere = group.occurrences.filter((occ) => occ.executionId === executionId);
    if (occurrencesHere.length === 0) continue;
    // "en otra jornada" solo es cierto si el hash aparece en una ejecución
    // DISTINTA a esta — si el grupo entero vive dentro de la misma jornada
    // (ej. la misma foto subida dos veces aquí), decirlo sería un dato falso.
    const existsElsewhere = group.occurrences.some((occ) => occ.executionId !== executionId);
    for (const occ of occurrencesHere) {
      observations.push({
        severity: 'info',
        category: 'possible_duplicate',
        message: existsElsewhere
          ? `El archivo "${occ.fileName}" ya existe idéntico (mismo archivo, byte a byte) en otra jornada de esta actividad.`
          : `El archivo "${occ.fileName}" se subió más de una vez a esta misma jornada (mismo archivo, byte a byte).`,
      });
    }
  }

  for (const dup of visualDuplicates.possibleVisualDuplicates) {
    observations.push({
      severity: 'info',
      category: 'possible_duplicate',
      message: `Posible duplicado visual entre "${dup.fileNameA}" y "${dup.fileNameB}" (confianza ${dup.confidence}): ${dup.reason}`,
    });
  }

  return { observations };
}
