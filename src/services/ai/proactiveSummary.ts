// Lógica pura de la sugerencia proactiva — sin dependencias de Supabase ni
// React, para poder testearla sin mockear nada. Ver useAiProactiveSummary.ts
// para dónde se llama con datos reales.

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function buildProactiveSummaryMessage(args: {
  delayedPlanCount: number;
  pendingActivities: number;
  estimatedValue: number;
  currency: string;
}): string | null {
  const { delayedPlanCount, pendingActivities, estimatedValue, currency } = args;
  const parts: string[] = [];

  if (delayedPlanCount > 0) {
    parts.push(
      `${delayedPlanCount} ${pluralize(delayedPlanCount, 'plan semanal vencido', 'planes semanales vencidos')}`
    );
  }
  if (pendingActivities > 0) {
    parts.push(
      `${pendingActivities} ${pluralize(pendingActivities, 'actividad certificable', 'actividades certificables')} ` +
        `(~${currency} ${estimatedValue.toLocaleString('es-CO')})`
    );
  }

  if (parts.length === 0) return null;
  return `Detecté ${parts.join(' y ')}.`;
}
