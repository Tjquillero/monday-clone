import * as fs from 'fs';
import * as path from 'path';
import { parseTemporalScheduleExcel } from '../parseTemporalExcel';
import { resolveSiteIdentity, mapTemporalScheduleToDomain } from '../mapper';

describe('FASE 2 Hito 2: Mapeador Semántico y Modelo Intermedio Temporal', () => {
  const xlsbPath = path.join(process.cwd(), 'CRONOGRAMA OPERACION 2025 V-2 SEGUIMIENTO EJECUCION.xlsb');
  let xlsbBuffer: Uint8Array;

  // Mock de catálogo maestro de groups (26 sitios de producción en Mantenix)
  const mockAvailableGroups = [
    { id: 'group_country_001', title: 'PLAYA DEL COUNTRY' },
    { id: 'group_sabanilla_002', title: 'PLAYA DE SABANILLA 2' },
    { id: 'group_puerto_003', title: 'PLAZA PUERTO COLOMBIA' },
    { id: 'group_salinas_004', title: 'SALINAS DEL REY' },
    { id: 'group_manglares_005', title: 'PLAYA MANGLARES' },
    { id: 'group_miramar_006', title: 'MIRAMAR SECTOR EL FARO' },
    { id: 'group_sazon_007', title: 'MERCADO LA SAZÓN' },
    { id: 'group_veronica_008', title: 'SENDERO SANTA VERÓNICA' },
    { id: 'group_salgar_009', title: 'CASTILLO DE SALGAR' },
  ];

  beforeAll(() => {
    if (fs.existsSync(xlsbPath)) {
      const buffer = fs.readFileSync(xlsbPath);
      xlsbBuffer = new Uint8Array(buffer);
    }
  });

  test('1. resolveSiteIdentity resuelve por groups.id o genera UNRESOLVED/EXCLUDED_FINANCIAL sin aliasing silencioso', () => {
    // Coincidencia exacta
    const res1 = resolveSiteIdentity('PLAYA DEL COUNTRY', mockAvailableGroups);
    expect(res1.resolutionStatus).toBe('RESOLVED');
    expect(res1.groupId).toBe('group_country_001');

    // Alias oficial reconocido
    const res2 = resolveSiteIdentity('CENTRO GASTRONÓMICO', mockAvailableGroups);
    expect(res2.resolutionStatus).toBe('RESOLVED');
    expect(res2.groupId).toBe('group_sazon_007');

    // Entidad Financiera / Equipamiento
    const res3 = resolveSiteIdentity('TRACTOR', mockAvailableGroups);
    expect(res3.resolutionStatus).toBe('EXCLUDED_FINANCIAL');
    expect(res3.groupId).toBeNull();

    // Sitio Desconocido: UNRESOLVED (cero aliasing o invención de group.id)
    const res4 = resolveSiteIdentity('SITIO_DESCONOCIDO_99', mockAvailableGroups);
    expect(res4.resolutionStatus).toBe('UNRESOLVED');
    expect(res4.groupId).toBeNull();
    expect(res4.matchedTitle).toBeNull();
  });

  test('2. mapTemporalScheduleToDomain mapea el resultado de parseTemporalExcel preservando invariantes y trazabilidad', () => {
    if (!xlsbBuffer) {
      console.warn('XLSB file not present, skipping mapper test');
      return;
    }

    const parsedResult = parseTemporalScheduleExcel(xlsbBuffer);
    const mapped = mapTemporalScheduleToDomain(parsedResult, mockAvailableGroups);

    expect(mapped.sheetName).toBe('CRONOGRAMA POR SITIO');
    expect(mapped.activities.length).toBe(parsedResult.activities.length);
    expect(mapped.resolvedSitesCount).toBeGreaterThan(0);

    // Verificar primera actividad mapeada
    const act1 = mapped.activities[0];
    expect(act1.site.groupId).toBe('group_country_001');
    expect(act1.site.resolutionStatus).toBe('RESOLVED');
    expect(act1.activityKey).toBe('1');
    expect(act1.activityDescription).toBe('ACOPIO Y LIMPIEZA MANUAL CON PERSONAL');

    // Trazabilidad de origen y fechas ISO
    const alloc1 = act1.allocations[0];
    expect(alloc1.site.groupId).toBe('group_country_001');
    expect(alloc1.date).toBe('2023-09-11');
    expect(alloc1.origin.sourceSheet).toBe('CRONOGRAMA POR SITIO');
    expect(alloc1.origin.sourceRow).toBe(9);

    // Separación de Recursos (Operador vs Maquinaria)
    expect(alloc1.resourceType).toBe('operator');
    expect(alloc1.operatorJornales).toBe(5.94);
    expect(alloc1.machineryJornales).toBe(0);
    expect(alloc1.quantity).toBe(17820);
  });

  test('3. Conservación exacta de cantidades y jornales sin redistribución ni alteración', () => {
    if (!xlsbBuffer) return;

    const parsedResult = parseTemporalScheduleExcel(xlsbBuffer);
    const mapped = mapTemporalScheduleToDomain(parsedResult, mockAvailableGroups);

    for (let i = 0; i < parsedResult.activities.length; i++) {
      const pAct = parsedResult.activities[i];
      const mAct = mapped.activities[i];

      // La cantidad total mapeada debe ser exactamente idéntica a la suma devuelta por el parser
      expect(mAct.sumQuantity).toBeCloseTo(pAct.sumQuantity, 6);
      expect(mAct.sumTotalJornales).toBeCloseTo(pAct.sumJornales, 6);

      // Cada asignación individual debe conservar su fecha, cantidad y trazabilidad intactas
      for (let j = 0; j < pAct.allocations.length; j++) {
        const pAlloc = pAct.allocations[j];
        const mAlloc = mAct.allocations[j];

        expect(mAlloc.date).toBe(pAlloc.date);
        expect(mAlloc.quantity).toBe(pAlloc.quantity);
        expect(mAlloc.totalJornales).toBe(pAlloc.jornales);
        expect(mAlloc.isEmptyCell).toBe(pAlloc.isEmptyCell);
        expect(mAlloc.isZeroValue).toBe(pAlloc.isZeroValue);
      }
    }
  });

  test('4. Detección explícita de sitios no resueltos y advertencias semánticas', () => {
    if (!xlsbBuffer) return;

    const parsedResult = parseTemporalScheduleExcel(xlsbBuffer);
    // Invocación con lista vacía de grupos para forzar UNRESOLVED en todos los sitios
    const mappedUnresolved = mapTemporalScheduleToDomain(parsedResult, []);

    expect(mappedUnresolved.unresolvedSitesCount).toBeGreaterThan(0);
    expect(mappedUnresolved.resolvedSitesCount).toBe(0);
    expect(mappedUnresolved.warnings.length).toBeGreaterThan(0);

    for (const s of mappedUnresolved.sites) {
      if (s.resolutionStatus !== 'EXCLUDED_FINANCIAL') {
        expect(s.resolutionStatus).toBe('UNRESOLVED');
        expect(s.groupId).toBeNull();
      }
    }
  });
});
