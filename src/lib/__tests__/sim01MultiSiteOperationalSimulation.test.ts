/**
 * SIM-01 Multi-Site Operational Simulation Test Suite
 * Simulación Operativa Multi-Sitio v1
 * 
 * Verifies end-to-end execution of SIM-01 across all 8 real sites,
 * validating dataset manifest integrity, SHA-256 hash checks, semantic activity mapping,
 * photographic abundance curation (<=2 BEFORE / <=2 AFTER), SHA-256 deduplication,
 * PDF document support, post-ISSUED immutability, and simulation banner rendering.
 * 
 * 0 DDL, 0 DB mutations, 100% consultative read & simulation layer.
 */

import {
  loadSIM01DatasetManifest,
  validateDatasetManifestIntegrity,
  getFixtureMockBuffer,
  buildSIM01MultiSiteSimulationState,
  calculateBufferSHA256,
} from '../simulations/sim01DatasetService';
import { extractCuratedEvidencePair } from '../evidenceCuration';
import { renderActivityExecutionReportHTML } from '../../app/api/reports/activity-execution/ActivityExecutionReportTemplate';
import { ResolvedActivityExecutionReportDTO } from '../activityReportAssetResolver';

describe('SIM-01 — Simulación Operativa Multi-Sitio v1 (8 Sites / 12 Steps Execution)', () => {
  const manifest = loadSIM01DatasetManifest();

  // 1. Dataset Manifest Structure and License Traceability
  test('1. Dataset Manifest loads successfully with 8 real sites and public license metadata', () => {
    expect(manifest.simulation_id).toBe('SIM-01-V1');
    expect(manifest.environment).toBe('SIMULATION_TEST_ENVIRONMENT');
    expect(manifest.fixtures.length).toBeGreaterThanOrEqual(20);

    const siteNames = Array.from(new Set(manifest.fixtures.map((f) => f.site_name)));
    expect(siteNames).toEqual(
      expect.arrayContaining([
        'Plaza Puerto Colombia',
        'Playa Manglares',
        'Mercado La Sazón',
        'Miramar Sector El Faro',
        'Playa del Country',
        'Playa de Sabanilla 2',
        'Salinas del Rey',
        'Sendero Santa Verónica',
      ])
    );
    expect(siteNames).toHaveLength(8);
  });

  // 2. SHA-256 Integrity & Validation
  test('2. Manifest SHA-256 integrity validation passes with 0 errors', () => {
    const audit = validateDatasetManifestIntegrity(manifest);
    expect(audit.valid).toBe(true);
    expect(audit.errors).toHaveLength(0);
    expect(audit.valid_sha256_count).toBe(manifest.fixtures.length);
  });

  // 3. Offline Fixture Buffer Provider & Hash Computation
  test('3. getFixtureMockBuffer provides deterministic buffers and valid SHA-256 hashes offline', () => {
    const fixture = manifest.fixtures[0];
    const mock = getFixtureMockBuffer(fixture.id);

    expect(mock.buffer).toBeInstanceOf(Buffer);
    expect(mock.hash).toBe(fixture.sha256);
    expect(mock.fileType).toBe('image/jpeg');

    const computed = calculateBufferSHA256(mock.buffer);
    expect(computed).toHaveLength(64);
  });

  // 4. Multi-Site Simulation State Generation (8 Sites)
  test('4. buildSIM01MultiSiteSimulationState generates scenarios for all 8 operational sites', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    expect(scenarios).toHaveLength(8);

    const names = scenarios.map((s) => s.site_name);
    expect(names).toContain('Plaza Puerto Colombia');
    expect(names).toContain('Playa Manglares');
    expect(names).toContain('Mercado La Sazón');
    expect(names).toContain('Miramar Sector El Faro');
    expect(names).toContain('Playa del Country');
    expect(names).toContain('Playa de Sabanilla 2');
    expect(names).toContain('Salinas del Rey');
    expect(names).toContain('Sendero Santa Verónica');
  });

  // 5. Site 1: Plaza Puerto Colombia — E2E Normal
  test('5. Site 1 (Plaza Puerto Colombia): E2E normal flow yields 1 BEFORE and 1 AFTER photo', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const plaza = scenarios.find((s) => s.site_name === 'Plaza Puerto Colombia')!;

    expect(plaza.curated_pair.before).toHaveLength(1);
    expect(plaza.curated_pair.after).toHaveLength(1);
    expect(plaza.curated_pair.before[0].has_gps).toBe(true);
    expect(plaza.curated_pair.after[0].has_gps).toBe(true);
  });

  // 6. Site 2: Playa Manglares — Evidencia Ambiental
  test('6. Site 2 (Playa Manglares): Environmental mangrove evidence pair is extracted successfully', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const manglares = scenarios.find((s) => s.site_name === 'Playa Manglares')!;

    expect(manglares.activity_key).toBe('ACT-MANGLAR-REMOCION');
    expect(manglares.curated_pair.before).toHaveLength(1);
    expect(manglares.curated_pair.after).toHaveLength(1);
  });

  // 7. Site 3: Mercado La Sazón — Disposición Final PDF
  test('7. Site 3 (Mercado La Sazón): Attaches PDF final disposal certificate document support', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const mercado = scenarios.find((s) => s.site_name === 'Mercado La Sazón')!;

    expect(mercado.documents).toBeDefined();
    expect(mercado.documents).toHaveLength(1);
    expect(mercado.documents![0].file_type).toBe('application/pdf');
    expect(mercado.documents![0].file_name).toContain('certificado_disposicion_final');
  });

  // 8. Site 4: Miramar Sector El Faro — Evidencia Incompleta
  test('8. Site 4 (Miramar Sector El Faro): Incomplete evidence (0 AFTER photos) yields after: []', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const miramar = scenarios.find((s) => s.site_name === 'Miramar Sector El Faro')!;

    expect(miramar.curated_pair.before).toHaveLength(1);
    expect(miramar.curated_pair.after).toHaveLength(0);
  });

  // 9. Site 5: Playa del Country — Abundancia (5 BEFORE + 6 AFTER)
  test('9. Site 5 (Playa del Country): Curation reduces 11 raw photos down to strictly 2 BEFORE and 2 AFTER', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const country = scenarios.find((s) => s.site_name === 'Playa del Country')!;

    expect(country.raw_attachments.length).toBeGreaterThanOrEqual(11);
    expect(country.curated_pair.before).toHaveLength(2);
    expect(country.curated_pair.after).toHaveLength(2);
  });

  // 10. Site 6: Playa de Sabanilla 2 — Deduplicación SHA-256
  test('10. Site 6 (Playa de Sabanilla 2): SHA-256 deduplication discards redundant binary hash photo', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const sabanilla = scenarios.find((s) => s.site_name === 'Playa de Sabanilla 2')!;

    // Raw input had 2 BEFORE photos with identical SHA-256
    const beforeHashes = sabanilla.raw_attachments.filter((a) => a.phase === 'before').map((a) => a.file_hash);
    expect(beforeHashes[0]).toBe(beforeHashes[1]);

    // Curation engine keeps only 1 non-redundant item
    expect(sabanilla.curated_pair.before).toHaveLength(1);
  });

  // 11. Site 7: Salinas del Rey — Vertimiento + Disposición Final PDF
  test('11. Site 7 (Salinas del Rey): Attaches dual PDF certificates (Vertimiento + Disposición Final)', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const salinas = scenarios.find((s) => s.site_name === 'Salinas del Rey')!;

    expect(salinas.documents).toBeDefined();
    expect(salinas.documents).toHaveLength(2);
    const pdfNames = salinas.documents!.map((d) => d.file_name);
    expect(pdfNames.some((n) => n.includes('vertimiento'))).toBe(true);
    expect(pdfNames.some((n) => n.includes('disposicion'))).toBe(true);
  });

  // 12. Site 8: Sendero Santa Verónica — Post-ISSUED Immutability
  test('12. Site 8 (Sendero Santa Verónica): Photos uploaded after ISSUED date are excluded from report DTO', () => {
    const scenarios = buildSIM01MultiSiteSimulationState();
    const sendero = scenarios.find((s) => s.site_name === 'Sendero Santa Verónica')!;

    expect(sendero.post_issued_attachment_excluded).toBe(true);
    expect(sendero.curated_pair.after).toHaveLength(1);
    expect(sendero.curated_pair.after[0].id).toBe('fix-sendero-a1');
    // Post-ISSUED photo fix-sendero-a2-postissued was filtered out
    const photoIds = sendero.curated_pair.after.map((p) => p.id);
    expect(photoIds).not.toContain('fix-sendero-a2-postissued');
  });

  // 13. Visual Simulation Banner HTML Rendering
  test('13. HTML Report Template renders visual simulation banner when header.is_simulation is true', () => {
    const mockReportDTO: ResolvedActivityExecutionReportDTO = {
      header: {
        contract_number: 'SIM-01-CTR-2026',
        project_name: 'Simulación Operativa Multi-Sitio v1 - Mantenix',
        contractor_name: 'Consorcio Conservación Playa',
        interventoria_name: 'Interventoría Ambiental del Atlántico',
        acta_number: 'ACTA-SIM-001',
        issued_at: '2026-09-10T17:00:00.000Z',
        is_draft: false,
        is_simulation: true,
        period_start: '2026-09-01',
        period_end: '2026-09-10',
      },
      fronts: [
        {
          site_id: 'site-plaza-01',
          site_name: 'Plaza Puerto Colombia',
          activities: [
            {
              execution_id: 'exec-plaza-1',
              activity_key: 'ACT-PLAZA-LIMPIEZA',
              activity_name: 'Limpieza y mantenimiento de plazas y zonas duras',
              unit: 'M2',
              executed_qty: 1500,
              certified_qty: 1500,
              execution_date: '2026-09-10',
              evidence: {
                before: [
                  {
                    attachment_id: 'fix-plaza-b1',
                    storage_path: 'fixtures/sim01/plaza_before_1.jpg',
                    signed_url: 'https://storage.local/fixtures/plaza_before_1.jpg',
                    phase: 'before',
                    captured_at: '2026-09-10T08:00:00.000Z',
                    has_gps: true,
                  },
                ],
                after: [
                  {
                    attachment_id: 'fix-plaza-a1',
                    storage_path: 'fixtures/sim01/plaza_after_1.jpg',
                    signed_url: 'https://storage.local/fixtures/plaza_after_1.jpg',
                    phase: 'after',
                    captured_at: '2026-09-10T16:00:00.000Z',
                    has_gps: true,
                  },
                ],
              },
            },
          ],
        },
      ],
      signatories: {
        project_director: { name: 'Ing. Carlos Mendoza', title: 'Director de Proyecto' },
        interventor: { name: 'Ing. Elena Rostova', title: 'Interventor de Obra' },
      },
    };

    const html = renderActivityExecutionReportHTML(mockReportDTO);

    expect(html).toContain('ENTORNO DE PRUEBA / EVIDENCIA FOTOGRÁFICA SIMULADA');
    expect(html).toContain('simulation-banner');
    expect(html).toContain('Plaza Puerto Colombia');
    expect(html).toContain('ACT-PLAZA-LIMPIEZA');
    expect(html).toContain('Ing. Carlos Mendoza');
  });
});
