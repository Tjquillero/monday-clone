import { parsePoaExcel } from './parseExcel';
import { validateParsedPoa, type ValidatePoaImportContext } from './validate';
import { realWorkbookArrayBuffer, realWorkbookWithMutation } from './testFixtures';
import type { ParseResult } from './types';

const REAL_ZONE_NAMES = [
  'PLAZA DE PTO COLOMBIA',
  'PLAYA MANGLARES',
  'SALGAR PLAYAS DEL COUNTRY 1',
  'SALGAR PLAYAS DE SABANAILLA 2',
  'PLAYAS DE MIRAMAR SECTOR EL FARO',
  'CENTRO GASTRONOMICO',
  'MERCADO LA SAZÓN',
  'SENDERO SANTA VERÓNICA',
  'PLAYA PUNTA ASTILLEROS',
];

// Las 14 actividades con FREC. no constante entre zonas — 13 realmente
// inconsistentes (pendientes de regla de negocio) + 3.1 con un valor
// faltante (error de dato, no ambigüedad de negocio). Ver
// docs/discovery/poa-frequency-per-zone.md.
const PENDING_BUSINESS_RULE_CODES = [
  '1.12', '1.13', '1.15',
  '2.04', '2.05', '2.06', '2.07', '2.08', '2.09', '2.10', '2.11', '2.14',
  '3.04',
];
const MISSING_VALUE_CODE = '3.1';

function fullyMappedZones(): ValidatePoaImportContext['zoneMappings'] {
  const map: ValidatePoaImportContext['zoneMappings'] = new Map();
  REAL_ZONE_NAMES.forEach((name, i) => map.set(name, `group-${i}`));
  return map;
}

function realParseResult(): ParseResult {
  return parsePoaExcel(realWorkbookArrayBuffer());
}

describe('validateParsedPoa — archivo real completo', () => {
  it('reporta exactamente 13 actividades pendientes de regla de negocio y 1 con valor faltante (3.1)', () => {
    const parseResult = realParseResult();
    const knownActivityKeys = new Set(parseResult.actividades.map((a) => a.activityKey));
    const context: ValidatePoaImportContext = { zoneMappings: fullyMappedZones(), knownActivityKeys };

    const result = validateParsedPoa(parseResult, context);

    expect(result.valid).toBe(false);
    expect(result.activities).toHaveLength(0); // todo o nada

    const pendingErrors = result.errors.filter((e) => e.code === 'frecuencia_pendiente_regla_negocio');
    expect(pendingErrors.map((e) => e.activityKey).sort()).toEqual([...PENDING_BUSINESS_RULE_CODES].sort());

    const missingValueErrors = result.errors.filter(
      (e) => e.code === 'campo_requerido_vacio' && e.activityKey === MISSING_VALUE_CODE,
    );
    expect(missingValueErrors).toHaveLength(1);
    expect(missingValueErrors[0].zona).toBe('MERCADO LA SAZÓN');
  });

  it('no reporta ningún error de zona sin mapeo ni de catálogo cuando el contexto está completo', () => {
    const parseResult = realParseResult();
    const knownActivityKeys = new Set(parseResult.actividades.map((a) => a.activityKey));
    const context: ValidatePoaImportContext = { zoneMappings: fullyMappedZones(), knownActivityKeys };

    const result = validateParsedPoa(parseResult, context);

    expect(result.errors.some((e) => e.code === 'zona_sin_mapeo')).toBe(false);
    expect(result.errors.some((e) => e.code === 'activity_key_inexistente')).toBe(false);
    expect(result.errors.some((e) => e.code === 'codigo_actividad_duplicado')).toBe(false);
  });
});

describe('validateParsedPoa — subconjunto limpio (sin las actividades con FREC. ambigua o faltante)', () => {
  it('valida correctamente las 35 actividades restantes con al menos una zona con cantidad contratada', () => {
    const full = realParseResult();
    // 3.14 es un hallazgo adicional descubierto por esta suite, distinto de
    // los 14 documentados en docs/discovery/poa-frequency-per-zone.md: tiene
    // FREC. vacío en el 100% de sus zonas con cantidad contratada (Centro
    // Gastronómico y Mercado La Sazón), no solo en una — ver nota al final
    // de este archivo.
    //
    // De las 92 actividades restantes (107 - 13 - 1 - 1), 57 tienen CANT. = 0
    // en las 9 zonas (toda la categoría "4.xx" de arborización más "1.02") —
    // existen en el catálogo contractual pero no están asignadas a ningún
    // sitio en esta versión del POA. validateActivity() las excluye del
    // resultado sin error (no es un dato inválido, es una actividad sin
    // cobertura actual). Ver la nota grande al final de este archivo: esto
    // es un hallazgo de diseño pendiente, no solo un detalle de test.
    const excluded = new Set([...PENDING_BUSINESS_RULE_CODES, MISSING_VALUE_CODE, '3.14']);
    const cleanParseResult: ParseResult = {
      ...full,
      actividades: full.actividades.filter((a) => !excluded.has(a.activityKey)),
    };
    const knownActivityKeys = new Set(cleanParseResult.actividades.map((a) => a.activityKey));
    const context: ValidatePoaImportContext = { zoneMappings: fullyMappedZones(), knownActivityKeys };

    const result = validateParsedPoa(cleanParseResult, context);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.activities).toHaveLength(35);
    for (const act of result.activities) {
      expect(act.frecuencia).toBeGreaterThan(0);
      expect(act.zonas.length).toBeGreaterThan(0);
      for (const z of act.zonas) {
        expect(z.groupId).toMatch(/^group-\d$/);
      }
    }
  });
});

// Hallazgo adicional durante la construcción de esta suite (no estaba en
// docs/discovery/poa-frequency-per-zone.md): la actividad 3.14 (mantenimiento
// preventivo de planta eléctrica) tiene CANT. > 0 solo en dos zonas (Centro
// Gastronómico, Mercado La Sazón) y en AMBAS el campo FREC. está vacío. El
// script exploratorio original de la sesión anterior no lo detectó porque
// comparaba `String(frec)` entre zonas: cuando el valor es "null" en TODAS
// las zonas con cantidad contratada, no hay ningún valor distinto con el que
// contrastar, así que no se marcaba como inconsistente — un punto ciego
// distinto del caso de 3.1 (que sí tenía un valor real en la mayoría de sus
// zonas). Este validador lo detecta correctamente como campo_requerido_vacio
// porque no depende de comparar contra otras zonas, sino de exigir el valor
// en cada zona con cantidad contratada.
describe('validateParsedPoa — 3.14: FREC. vacío en el 100% de sus zonas contratadas', () => {
  it('reporta campo_requerido_vacio en ambas zonas, no frecuencia_pendiente_regla_negocio', () => {
    const full = realParseResult();
    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(full, { zoneMappings: fullyMappedZones(), knownActivityKeys });

    const errors314 = result.errors.filter((e) => e.activityKey === '3.14');
    expect(errors314).toHaveLength(2);
    expect(errors314.every((e) => e.code === 'campo_requerido_vacio')).toBe(true);
    expect(errors314.map((e) => e.zona).sort()).toEqual(['CENTRO GASTRONOMICO', 'MERCADO LA SAZÓN']);
  });
});

describe('validateParsedPoa — TC-02: zona sin mapeo', () => {
  it('aborta la importación completa (todo o nada) cuando falta el mapeo de una sola zona', () => {
    const full = realParseResult();
    const zoneMappings = fullyMappedZones();
    zoneMappings.delete('MERCADO LA SAZÓN'); // simula zona nunca vista / sin resolver

    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(full, { zoneMappings, knownActivityKeys });

    expect(result.valid).toBe(false);
    expect(result.activities).toHaveLength(0);
    const zoneErrors = result.errors.filter((e) => e.code === 'zona_sin_mapeo');
    expect(zoneErrors).toHaveLength(1);
    expect(zoneErrors[0].zona).toBe('MERCADO LA SAZÓN');
  });

  it('un mapeo explícitamente pendiente (group_id null) se trata igual que ausente', () => {
    const full = realParseResult();
    const zoneMappings = fullyMappedZones();
    zoneMappings.set('MERCADO LA SAZÓN', null);

    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(full, { zoneMappings, knownActivityKeys });

    expect(result.errors.some((e) => e.code === 'zona_sin_mapeo' && e.zona === 'MERCADO LA SAZÓN')).toBe(true);
  });
});

describe('validateParsedPoa — TC-03: activity_key inexistente', () => {
  it('reporta el código exacto que falta en el catálogo y no lo incluye en las actividades validadas', () => {
    const full = realParseResult();
    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    knownActivityKeys.delete('1.01'); // simula que el catálogo técnico no reconoce este código

    const result = validateParsedPoa(full, { zoneMappings: fullyMappedZones(), knownActivityKeys });

    const catalogErrors = result.errors.filter((e) => e.code === 'activity_key_inexistente');
    expect(catalogErrors).toHaveLength(1);
    expect(catalogErrors[0].activityKey).toBe('1.01');
    expect(result.valid).toBe(false);
  });
});

describe('validateParsedPoa — TC-07: campo obligatorio vacío (unidad)', () => {
  it('la actividad 1.01 sin unidad produce campo_requerido_vacio y no bloquea el resto del catálogo', () => {
    const arrayBuffer = realWorkbookWithMutation('D4', null); // fila 4 = actividad 1.01 (primera fila de datos); D = unidad
    const parseResult = parsePoaExcel(arrayBuffer);
    const act = parseResult.actividades.find((a) => a.activityKey === '1.01');
    expect(act?.unidad).toBeNull();

    const knownActivityKeys = new Set(parseResult.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(parseResult, { zoneMappings: fullyMappedZones(), knownActivityKeys });

    const fieldErrors = result.errors.filter(
      (e) => e.code === 'campo_requerido_vacio' && e.activityKey === '1.01' && e.message.includes('unidad'),
    );
    expect(fieldErrors).toHaveLength(1);

    // 1.01 no pertenece a las 14 actividades ambiguas — su único problema es
    // la unidad; no debería aparecer con frecuencia pendiente ni valor faltante.
    expect(
      result.errors.some((e) => e.activityKey === '1.01' && e.code === 'frecuencia_pendiente_regla_negocio'),
    ).toBe(false);
  });
});

describe('validateParsedPoa — TC-09: nombre de zona con variación de formato', () => {
  it('una variante con mayúsculas/espacio distinto NO coincide con el mapeo existente (comparación literal, sin normalizar)', () => {
    const zoneMappings = fullyMappedZones();
    zoneMappings.delete('PLAZA DE PTO COLOMBIA');
    zoneMappings.set('Plaza de Pto Colombia ', 'group-0'); // variante, no el nombre exacto

    const full = realParseResult();
    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(full, { zoneMappings, knownActivityKeys });

    const zoneErrors = result.errors.filter((e) => e.code === 'zona_sin_mapeo');
    expect(zoneErrors.some((e) => e.zona === 'PLAZA DE PTO COLOMBIA')).toBe(true);
  });
});

describe('validateParsedPoa — código de actividad duplicado dentro del archivo', () => {
  it('detecta un activity_key repetido y cita ambas filas', () => {
    const full = realParseResult();
    const duplicated: ParseResult = {
      ...full,
      actividades: [...full.actividades, { ...full.actividades[0], excelRow: 9999 }],
    };
    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(duplicated, { zoneMappings: fullyMappedZones(), knownActivityKeys });

    const dupErrors = result.errors.filter((e) => e.code === 'codigo_actividad_duplicado');
    expect(dupErrors).toHaveLength(1);
    expect(dupErrors[0].message).toContain('9999');
  });
});

// =============================================================================
// REGLA DE NEGOCIO RESUELTA — actividades sin ninguna zona con cantidad
// contratada (CANT. = 0 en las 9 zonas)
//
// 57 de las 107 actividades reales (toda la categoría "4.xx" de arborización,
// más "1.02") no tienen cantidad contratada en ninguna zona de este archivo.
// Existen en el catálogo TÉCNICO (board_activity_standards), pero no forman
// parte del catálogo CONTRACTUAL de esta versión del POA.
//
// docs/domain/poa-domain.md distingue explícitamente ambos conceptos:
// "Catálogo Técnico" = identidad técnica permanente, sin condiciones
// económicas ni cantidades contratadas; "Catálogo Contractual" = "conjunto
// de Actividades del POA pertenecientes a una versión específica... el
// universo de actividades que pueden programarse y facturarse". Una
// actividad con CANT.=0 en las 9 zonas simplemente no pertenece al universo
// contratado de esta versión — sigue siendo válida en el catálogo técnico.
//
// Regla: poa_activities representa lo CONTRATADO en una versión, no el
// catálogo técnico completo. Una actividad solo genera una fila en
// poa_activities cuando tiene al menos una zona con CANT. > 0. Esto también
// resuelve por qué no hay conflicto con `frecuencia NOT NULL`: sin ninguna
// zona con datos no hay ninguna actividad contractual que importar, así que
// no hay ningún valor de frecuencia que derivar ni que falte.
// =============================================================================
describe('validateParsedPoa — actividades sin ninguna zona con cantidad contratada', () => {
  it('no generan poa_activities y se reportan en noContratadas, sin error', () => {
    // Se aísla del resto de actividades ambiguas (todo o nada haría que
    // result.activities fuera [] de cualquier forma si se usa el archivo
    // completo) para que el resultado muestre además actividades sí
    // contratadas, no solo la ausencia de error.
    const full = realParseResult();
    const excluded = new Set([...PENDING_BUSINESS_RULE_CODES, MISSING_VALUE_CODE, '3.14']);
    const partial: ParseResult = {
      ...full,
      actividades: full.actividades.filter((a) => !excluded.has(a.activityKey)),
    };
    const knownActivityKeys = new Set(partial.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(partial, { zoneMappings: fullyMappedZones(), knownActivityKeys });

    expect(result.valid).toBe(true);
    // 4.01 es representativa de las 57 actividades sin cobertura.
    expect(result.errors.some((e) => e.activityKey === '4.01')).toBe(false);
    expect(result.activities.some((a) => a.activityKey === '4.01')).toBe(false);
    expect(result.noContratadas.some((n) => n.activityKey === '4.01')).toBe(true);
    // En cambio, una actividad con cobertura real sí queda incluida y no
    // aparece en noContratadas.
    expect(result.activities.some((a) => a.activityKey === '1.01')).toBe(true);
    expect(result.noContratadas.some((n) => n.activityKey === '1.01')).toBe(false);
  });

  it('las 57 actividades reales sin cobertura quedan en noContratadas incluso cuando el archivo completo es inválido (no depende de todo o nada)', () => {
    // noContratadas es informativo, no bloqueante — a diferencia de
    // `activities`, debe seguir poblado aunque el resto del archivo tenga
    // errores (ej. las 14 actividades con frecuencia ambigua).
    const full = realParseResult();
    const knownActivityKeys = new Set(full.actividades.map((a) => a.activityKey));
    const result = validateParsedPoa(full, { zoneMappings: fullyMappedZones(), knownActivityKeys });

    expect(result.valid).toBe(false);
    expect(result.noContratadas).toHaveLength(57);
  });
});
