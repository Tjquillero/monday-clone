import type { SupabaseClient } from '@supabase/supabase-js';

// Contrato de un tool de IA. Un tool representa una intención de negocio
// ("¿cuánto vale el borrador del Acta?"), nunca una tabla ni una consulta
// técnica ("dame las filas de acta_items"). Regla congelada: los tools
// llaman RPCs oficiales, nunca tablas directamente — misma frontera que ya
// protege al subsistema del Acta (ver useCertifiedActas.ts).
export interface AiToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  /** JSON Schema (OpenAPI-style) — pasado tal cual a Gemini como parametersJsonSchema. */
  parametersJsonSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /**
   * false en toda la Fase 1 (solo lectura). Cuando existan tools que
   * modifiquen el dominio (generar borrador, emitir acta, etc.), esta
   * propiedad activa el requisito de confirmación explícita del usuario
   * antes de ejecutar — el Orchestrator no necesita rediseñarse para eso,
   * solo revisar esta bandera.
   */
  sideEffects: boolean;
  /** Implícito en sideEffects=true hoy; campo propio para el día en que
   *  una acción de solo lectura sensible también requiera confirmación. */
  requiresConfirmation: boolean;
  execute: (supabase: SupabaseClient, params: TParams) => Promise<TResult>;
}
