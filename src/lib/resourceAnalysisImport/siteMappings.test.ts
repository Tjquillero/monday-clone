import { parseResourceAnalysisExcel } from './parseExcel';
import { validateResourceAnalysis } from './validate';
import { realWorkbookArrayBuffer } from './testFixtures';
import { RESOURCE_ANALYSIS_SITE_MAPPINGS } from './siteMappings';

// Prueba de consistencia entre el mapeo congelado
// (docs/architecture/resource-analysis-site-mapping.md) y el archivo real.
// Si el Excel cambia de estructura (nueva hoja, bloque nuevo, hoja
// renombrada), este test falla ANTES de que el Incremento 4 intente
// importar con un mapeo desactualizado.
describe('RESOURCE_ANALYSIS_SITE_MAPPINGS — consistencia contra el archivo real', () => {
  const parsed = parseResourceAnalysisExcel(realWorkbookArrayBuffer());
  const result = validateResourceAnalysis(parsed, { siteMappings: RESOURCE_ANALYSIS_SITE_MAPPINGS });

  it('la tabla congelada resuelve los 15 bloques reales sin ningún error', () => {
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toEqual({
      totalSheets: 9,
      totalBlocks: 15,
      validBlocks: 15,
      blockedBlocks: 0,
    });
  });

  it('cubre exactamente las claves que el parser detecta hoy — ni de más ni de menos', () => {
    const clavesReales = new Set<string>();
    for (const sheet of parsed.sheets) {
      sheet.blocks.forEach((_, blockIndex) => clavesReales.add(`${sheet.sheetName}#${blockIndex}`));
    }
    const clavesDelMapeo = new Set(RESOURCE_ANALYSIS_SITE_MAPPINGS.keys());
    expect(clavesDelMapeo).toEqual(clavesReales);
  });
});
