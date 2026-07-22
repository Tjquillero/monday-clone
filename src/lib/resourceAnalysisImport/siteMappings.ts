// =============================================================================
// Mapeo congelado sitio → group_id para el Resource Analysis de Tablero
// Principal. Fuente de verdad y justificación de cada fila:
// docs/architecture/resource-analysis-site-mapping.md.
//
// NO se recalcula ni se infiere del nombre de hoja/bloque en tiempo de
// ejecución — el discovery encontró que ninguno de los dos es confiable por
// sí solo (docs/discovery/resource-analysis-sheet-mapping-gaps.md, Casos 1-4,
// todos resueltos por el dueño del proceso el 2026-07-21).
// =============================================================================

/** board_id de Tablero Principal — todos los group_id de este mapeo pertenecen a este board. */
export const RESOURCE_ANALYSIS_BOARD_ID = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';

/** Clave `${sheetName}#${blockIndex}` → group_id. Ver ValidateResourceAnalysisContext.siteMappings (types.ts). */
export const RESOURCE_ANALYSIS_SITE_MAPPINGS: ReadonlyMap<string, string> = new Map([
  ['PLAZA PUERTO COLOMBIA#0', '98153f4c-18b9-4bff-abda-39d62db8a931'],
  ['PLAZA PUERTO COLOMBIA#1', '98153f4c-18b9-4bff-abda-39d62db8a931'],
  ['PLAYA MANGLARES#0', '662748a7-7731-4e90-9782-527ba0caacc4'],
  ['PLAYA MANGLARES#1', '662748a7-7731-4e90-9782-527ba0caacc4'],
  ['CENTRO GASTRONOMICO#0', 'e45851b6-73f7-46ad-b6dd-ea4f5920d747'],
  ['MERCADO DE LA SAZON#0', '55d65880-8a87-4c7d-be45-0d26821194cc'],
  ['PLAYA MIRAMAR#0', '0230dceb-1ea2-4273-9a44-a5ff19da7ad9'],
  ['COUNTRY 1#0', '6366520a-d981-4c7c-8d4d-72fbf06bb7f3'],
  ['COUNTRY 1#1', '6366520a-d981-4c7c-8d4d-72fbf06bb7f3'],
  // La hoja "COUNTRY 2" completa pertenece a Playa de Sabanilla 2 -- su
  // bloque de Zona de Playa quedo con la etiqueta interna de "COUNTRY 1"
  // pegada por error al construir el Excel (Caso 1 del discovery,
  // confirmado por el dueno del proceso, 2026-07-21). NUNCA leer el label
  // interno de este bloque para resolver el sitio.
  ['COUNTRY 2#0', 'a59b5a16-30f1-4e83-aa68-342d791e2d97'],
  ['COUNTRY 2#1', 'a59b5a16-30f1-4e83-aa68-342d791e2d97'],
  ['SALINAS DEL REY#0', 'b050df1c-161a-435e-9f82-e1fb537a6376'],
  ['SALINAS DEL REY#1', 'b050df1c-161a-435e-9f82-e1fb537a6376'],
  ['SANTA VERONICA#0', '0b846b6a-e9f7-4df4-a2ac-89fcefab164d'],
  // Este bloque no tiene ninguna cantidad en el Excel real (todas las
  // celdas de cantidad estan vacias) -- mapeo valido igual, simplemente no
  // aporta scope_data hoy.
  ['SANTA VERONICA#1', '0b846b6a-e9f7-4df4-a2ac-89fcefab164d'],
]);

/**
 * Sitios reales de Tablero Principal sin hoja en este Excel — deliberadamente
 * NO tienen entrada en RESOURCE_ANALYSIS_SITE_MAPPINGS. Se documentan aparte
 * para que quien lea el mapeo entienda por qué faltan, sin tener que releer
 * el discovery completo.
 */
export const RESOURCE_ANALYSIS_UNMAPPED_SITES = {
  /** Sitio real, pendiente de dato — no existe otra fuente de Resource Analysis todavía. */
  pendienteDeDato: ['dd03bed4-cf5e-4d52-876f-ba906d371174'], // Playa Punta Astilleros
  /** No son sitios operativos reales — excluidos permanentemente del barrido de factibilidad. */
  excluidoPermanente: [
    '7e31e486-82ca-498e-8cb1-f845456f3a1f', // Presupuesto General
    '41bdd7d8-f199-45da-b781-5a00e5ccde05', // Presupuesto General
  ],
} as const;
