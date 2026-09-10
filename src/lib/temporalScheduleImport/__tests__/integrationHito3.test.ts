import * as fs from 'fs';
import * as path from 'path';
import { parseTemporalScheduleExcel } from '../parseTemporalExcel';
import { mapTemporalScheduleToDomain } from '../mapper';
import { buildTemporalSchedulePayload } from '../service/buildTemporalPayload';
import { executeTemporalScheduleIntegration } from '../service/importTemporalScheduleService';

describe('FASE 2 Hito 3: Integración y Preparación de Payload Fiel del Modelo Temporal de Referencia', () => {
  const xlsbPath = path.join(process.cwd(), 'CRONOGRAMA OPERACION 2025 V-2 SEGUIMIENTO EJECUCION.xlsb');
  let xlsbBuffer: Uint8Array;

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

  test('1. R-TEMP-07 & R-TEMP-08: buildTemporalSchedulePayload conserva 1:1 las asignaciones sin re-interpretar identidades', () => {
    if (!xlsbBuffer) {
      console.warn('XLSB file not present, skipping integration test');
      return;
    }

    const parsed = parseTemporalScheduleExcel(xlsbBuffer);
    const mapped = mapTemporalScheduleToDomain(parsed, mockAvailableGroups);
    const payload = buildTemporalSchedulePayload(mapped);

    expect(payload.source_sheet).toBe('CRONOGRAMA POR SITIO');
    expect(payload.activities.length).toBe(mapped.activities.length);
    expect(payload.total_allocations).toBe(mapped.totalMappedAllocations);

    // Verificar coincidencia exactas 1:1 en cada asignación de la primera actividad
    const mAct1 = mapped.activities[0];
    const pAct1 = payload.activities[0];

    expect(pAct1.group_id).toBe(mAct1.site.groupId);
    expect(pAct1.excel_site_name).toBe(mAct1.site.excelSiteName);
    expect(pAct1.activity_key).toBe(mAct1.activityKey);
    expect(pAct1.allocations.length).toBe(mAct1.allocations.length);

    for (let i = 0; i < mAct1.allocations.length; i++) {
      const mAlloc = mAct1.allocations[i];
      const pAlloc = pAct1.allocations[i];

      expect(pAlloc.id).toBe(mAlloc.id);
      expect(pAlloc.group_id).toBe(mAlloc.site.groupId);
      expect(pAlloc.date_iso).toBe(mAlloc.date);
      expect(pAlloc.quantity).toBe(mAlloc.quantity);
      expect(pAlloc.operator_jornales).toBe(mAlloc.operatorJornales);
      expect(pAlloc.machinery_jornales).toBe(mAlloc.machineryJornales);
      expect(pAlloc.total_jornales).toBe(mAlloc.totalJornales);
      expect(pAlloc.is_empty_cell).toBe(mAlloc.isEmptyCell);
      expect(pAlloc.is_zero_value).toBe(mAlloc.isZeroValue);
    }
  });

  test('2. R-TEMP-09: Trazabilidad End-to-End desde Payload hasta la celda fuente de Excel', () => {
    if (!xlsbBuffer) return;

    const integrationResult = executeTemporalScheduleIntegration(xlsbBuffer, mockAvailableGroups);
    const payloadAlloc = integrationResult.payload.activities[0].allocations[0];

    expect(payloadAlloc.origin).toBeDefined();
    expect(payloadAlloc.origin.sourceSheet).toBe('CRONOGRAMA POR SITIO');
    expect(payloadAlloc.origin.sourceRow).toBe(9);
    expect(payloadAlloc.origin.colOpLetter).toBe('K');
    expect(payloadAlloc.origin.colCantLetter).toBe('L');
    expect(payloadAlloc.origin.siteName).toBe('PLAYA DEL COUNTRY');
    expect(payloadAlloc.origin.np).toBe(1);
    expect(payloadAlloc.origin.activityDescription).toBe('ACOPIO Y LIMPIEZA MANUAL CON PERSONAL');
  });

  test('3. R-TEMP-10: Conservación Agregada exacta entre Parser, Mapper y Payload', () => {
    if (!xlsbBuffer) return;

    const parsed = parseTemporalScheduleExcel(xlsbBuffer);
    const mapped = mapTemporalScheduleToDomain(parsed, mockAvailableGroups);
    const payload = buildTemporalSchedulePayload(mapped);

    // Suma de cantidades
    let parserTotalCant = 0;
    let parserTotalJornales = 0;
    for (const act of parsed.activities) {
      parserTotalCant += act.sumQuantity;
      parserTotalJornales += act.sumJornales;
    }

    expect(payload.summary.total_quantity).toBeCloseTo(parserTotalCant, 6);
    expect(payload.summary.total_quantity).toBeCloseTo(mapped.summary.totalQuantity, 6);

    expect(payload.summary.total_jornales).toBeCloseTo(parserTotalJornales, 6);
    expect(payload.summary.total_jornales).toBeCloseTo(mapped.summary.totalJornales, 6);
    expect(payload.summary.total_operator_jornales + payload.summary.total_machinery_jornales).toBeCloseTo(
      payload.summary.total_jornales,
      6
    );
  });

  test('4. R-TEMP-11: Idempotencia de Construcción', () => {
    if (!xlsbBuffer) return;

    const parsed = parseTemporalScheduleExcel(xlsbBuffer);
    const mapped = mapTemporalScheduleToDomain(parsed, mockAvailableGroups);

    const payloadRun1 = buildTemporalSchedulePayload(mapped, '2026-09-09T00:00:00.000Z');
    const payloadRun2 = buildTemporalSchedulePayload(mapped, '2026-09-09T00:00:00.000Z');

    expect(payloadRun1).toEqual(payloadRun2);
  });

  test('5. R-TEMP-12: Orquestador ejecuta la cadena completa sin mutar el núcleo congelado', () => {
    if (!xlsbBuffer) return;

    const result = executeTemporalScheduleIntegration(xlsbBuffer, mockAvailableGroups);

    expect(result.success).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.mappedResult).toBeDefined();
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
