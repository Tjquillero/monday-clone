/**
 * SIM-01 Dataset Service
 * Simulación Operativa Multi-Sitio v1
 * 
 * Consultative dataset & simulation service for SIM-01.
 * 0 DDL, 0 DB mutations, 100% pure read/simulation service.
 */

import crypto from 'crypto';
import manifestJson from './sim01DatasetManifest.json';
import { ExecutionAttachmentItem, extractCuratedEvidencePair } from '../evidenceCuration';

export interface SIM01FixtureEntry {
  id: string;
  site_name: string;
  activity_key: string;
  activity_description: string;
  phase: 'before' | 'after' | 'document';
  source_platform: string;
  source_url: string;
  license: string;
  attribution: string;
  downloaded_at: string;
  local_fixture: string;
  sha256: string;
  simulated_created_at: string;
  simulated_latitude: number;
  simulated_longitude: number;
  curation_role?: string;
}

export interface SIM01DatasetManifest {
  simulation_id: string;
  created_at: string;
  description: string;
  environment: string;
  fixtures: SIM01FixtureEntry[];
}

export function loadSIM01DatasetManifest(): SIM01DatasetManifest {
  return manifestJson as SIM01DatasetManifest;
}

export function calculateBufferSHA256(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function validateDatasetManifestIntegrity(manifest: SIM01DatasetManifest = loadSIM01DatasetManifest()): {
  valid: boolean;
  total_fixtures: number;
  valid_sha256_count: number;
  errors: string[];
} {
  const errors: string[] = [];
  let validShaCount = 0;

  for (const fix of manifest.fixtures) {
    if (!fix.sha256 || !/^[a-f0-9]{64}$/i.test(fix.sha256)) {
      errors.push(`Fixture ${fix.id} has invalid SHA-256 hash format: ${fix.sha256}`);
    } else {
      validShaCount++;
    }

    if (!fix.site_name || !fix.activity_key || !fix.license || !fix.attribution) {
      errors.push(`Fixture ${fix.id} is missing required metadata (site, key, license or attribution)`);
    }
  }

  return {
    valid: errors.length === 0,
    total_fixtures: manifest.fixtures.length,
    valid_sha256_count: validShaCount,
    errors,
  };
}

/**
 * Returns deterministic mock buffer for a given fixture ID.
 */
export function getFixtureMockBuffer(fixtureId: string): { buffer: Buffer; fileType: string; hash: string } {
  const manifest = loadSIM01DatasetManifest();
  const fixture = manifest.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) {
    throw new Error(`Fixture not found in SIM-01 manifest: ${fixtureId}`);
  }

  const fileType = fixture.phase === 'document' ? 'application/pdf' : 'image/jpeg';
  // Deterministic seed buffer based on fixture ID & sha256 to allow offline execution
  const seedString = `SIM01_FIXTURE_BUFFER_${fixture.id}_${fixture.sha256}`;
  const buffer = Buffer.from(seedString, 'utf-8');
  const computedHash = calculateBufferSHA256(buffer);

  return {
    buffer,
    fileType,
    hash: fixture.sha256, // Stable SHA-256 invariant from manifest
  };
}

export interface SIM01SiteScenarioResult {
  site_id: string;
  site_name: string;
  activity_key: string;
  activity_name: string;
  scenario_description: string;
  raw_attachments: ExecutionAttachmentItem[];
  documents?: { id: string; file_name: string; file_type: string; storage_path: string; uploaded_at: string }[];
  curated_pair: {
    before: ExecutionAttachmentItem[];
    after: ExecutionAttachmentItem[];
  };
  human_override_applied: boolean;
  acta_issued: boolean;
  post_issued_attachment_excluded: boolean;
}

/**
 * Generates all 8 multi-site operational simulation scenarios.
 */
export function buildSIM01MultiSiteSimulationState(): SIM01SiteScenarioResult[] {
  const manifest = loadSIM01DatasetManifest();

  // 1. Plaza Puerto Colombia - E2E normal
  const plazaFixBefore = manifest.fixtures.find((f) => f.id === 'fix-plaza-b1')!;
  const plazaFixAfter = manifest.fixtures.find((f) => f.id === 'fix-plaza-a1')!;
  const plazaRaw: ExecutionAttachmentItem[] = [
    {
      id: plazaFixBefore.id,
      execution_id: 'exec-plaza-1',
      storage_path: plazaFixBefore.local_fixture,
      file_hash: plazaFixBefore.sha256,
      phase: 'before',
      captured_at: plazaFixBefore.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.9,
    },
    {
      id: plazaFixAfter.id,
      execution_id: 'exec-plaza-1',
      storage_path: plazaFixAfter.local_fixture,
      file_hash: plazaFixAfter.sha256,
      phase: 'after',
      captured_at: plazaFixAfter.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.92,
    },
  ];
  const plazaCurated = extractCuratedEvidencePair(plazaRaw, 2);

  // 2. Playa Manglares - Evidencia ambiental
  const manglaresFixBefore = manifest.fixtures.find((f) => f.id === 'fix-manglares-b1')!;
  const manglaresFixAfter = manifest.fixtures.find((f) => f.id === 'fix-manglares-a1')!;
  const manglaresRaw: ExecutionAttachmentItem[] = [
    {
      id: manglaresFixBefore.id,
      execution_id: 'exec-manglares-1',
      storage_path: manglaresFixBefore.local_fixture,
      file_hash: manglaresFixBefore.sha256,
      phase: 'before',
      captured_at: manglaresFixBefore.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.88,
    },
    {
      id: manglaresFixAfter.id,
      execution_id: 'exec-manglares-1',
      storage_path: manglaresFixAfter.local_fixture,
      file_hash: manglaresFixAfter.sha256,
      phase: 'after',
      captured_at: manglaresFixAfter.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.94,
    },
  ];
  const manglaresCurated = extractCuratedEvidencePair(manglaresRaw, 2);

  // 3. Mercado La Sazón - Disposición final PDF
  const mercadoFixBefore = manifest.fixtures.find((f) => f.id === 'fix-mercado-b1')!;
  const mercadoFixAfter = manifest.fixtures.find((f) => f.id === 'fix-mercado-a1')!;
  const mercadoFixDoc = manifest.fixtures.find((f) => f.id === 'fix-mercado-doc1')!;
  const mercadoRaw: ExecutionAttachmentItem[] = [
    {
      id: mercadoFixBefore.id,
      execution_id: 'exec-mercado-1',
      storage_path: mercadoFixBefore.local_fixture,
      file_hash: mercadoFixBefore.sha256,
      phase: 'before',
      captured_at: mercadoFixBefore.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.85,
    },
    {
      id: mercadoFixAfter.id,
      execution_id: 'exec-mercado-1',
      storage_path: mercadoFixAfter.local_fixture,
      file_hash: mercadoFixAfter.sha256,
      phase: 'after',
      captured_at: mercadoFixAfter.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.91,
    },
  ];
  const mercadoCurated = extractCuratedEvidencePair(mercadoRaw, 2);

  // 4. Miramar Sector El Faro - Evidencia incompleta (0 AFTER photos)
  const miramarFixBefore = manifest.fixtures.find((f) => f.id === 'fix-miramar-b1')!;
  const miramarRaw: ExecutionAttachmentItem[] = [
    {
      id: miramarFixBefore.id,
      execution_id: 'exec-miramar-1',
      storage_path: miramarFixBefore.local_fixture,
      file_hash: miramarFixBefore.sha256,
      phase: 'before',
      captured_at: miramarFixBefore.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.87,
    },
  ];
  const miramarCurated = extractCuratedEvidencePair(miramarRaw, 2);

  // 5. Playa del Country - Abundancia (5 BEFORE + 6 AFTER)
  const country1BeforeFixes = manifest.fixtures.filter((f) => f.site_name === 'Playa del Country' && f.phase === 'before');
  const country1AfterFixes = manifest.fixtures.filter((f) => f.site_name === 'Playa del Country' && f.phase === 'after');
  const country1Raw: ExecutionAttachmentItem[] = [
    ...country1BeforeFixes.map((f, idx) => ({
      id: f.id,
      execution_id: 'exec-country1-1',
      storage_path: f.local_fixture,
      file_hash: f.sha256,
      phase: 'before' as const,
      captured_at: f.simulated_created_at,
      has_gps: f.curation_role === 'valid_gps_candidate',
      sharpness_score: f.curation_role === 'low_sharpness_candidate' ? 0.3 : 0.8 + idx * 0.02,
    })),
    ...country1AfterFixes.map((f, idx) => ({
      id: f.id,
      execution_id: 'exec-country1-1',
      storage_path: f.local_fixture,
      file_hash: f.sha256,
      phase: 'after' as const,
      captured_at: f.simulated_created_at,
      has_gps: f.curation_role === 'valid_gps_candidate',
      sharpness_score: 0.75 + idx * 0.03,
    })),
  ];
  const country1Curated = extractCuratedEvidencePair(country1Raw, 2);

  // 6. Playa de Sabanilla 2 - Deduplicación SHA-256
  const sabanillaBefore1 = manifest.fixtures.find((f) => f.id === 'fix-country2-b1')!;
  const sabanillaBefore2Dup = manifest.fixtures.find((f) => f.id === 'fix-country2-b2-dup')!;
  const sabanillaAfter1 = manifest.fixtures.find((f) => f.id === 'fix-country2-a1')!;
  const sabanillaRaw: ExecutionAttachmentItem[] = [
    {
      id: sabanillaBefore1.id,
      execution_id: 'exec-sabanilla-1',
      storage_path: sabanillaBefore1.local_fixture,
      file_hash: sabanillaBefore1.sha256,
      phase: 'before',
      captured_at: sabanillaBefore1.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.9,
    },
    {
      id: sabanillaBefore2Dup.id,
      execution_id: 'exec-sabanilla-1',
      storage_path: sabanillaBefore2Dup.local_fixture,
      file_hash: sabanillaBefore2Dup.sha256, // IDÉNTICO SHA-256 A b1
      phase: 'before',
      captured_at: sabanillaBefore2Dup.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.9,
    },
    {
      id: sabanillaAfter1.id,
      execution_id: 'exec-sabanilla-1',
      storage_path: sabanillaAfter1.local_fixture,
      file_hash: sabanillaAfter1.sha256,
      phase: 'after',
      captured_at: sabanillaAfter1.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.92,
    },
  ];
  const sabanillaCurated = extractCuratedEvidencePair(sabanillaRaw, 2);

  // 7. Salinas del Rey - Vertimiento + disposición final PDF
  const salinasFixBefore = manifest.fixtures.find((f) => f.id === 'fix-salinas-b1')!;
  const salinasFixAfter = manifest.fixtures.find((f) => f.id === 'fix-salinas-a1')!;
  const salinasFixDoc1 = manifest.fixtures.find((f) => f.id === 'fix-salinas-doc1')!;
  const salinasFixDoc2 = manifest.fixtures.find((f) => f.id === 'fix-salinas-doc2')!;
  const salinasRaw: ExecutionAttachmentItem[] = [
    {
      id: salinasFixBefore.id,
      execution_id: 'exec-salinas-1',
      storage_path: salinasFixBefore.local_fixture,
      file_hash: salinasFixBefore.sha256,
      phase: 'before',
      captured_at: salinasFixBefore.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.89,
    },
    {
      id: salinasFixAfter.id,
      execution_id: 'exec-salinas-1',
      storage_path: salinasFixAfter.local_fixture,
      file_hash: salinasFixAfter.sha256,
      phase: 'after',
      captured_at: salinasFixAfter.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.93,
    },
  ];
  const salinasCurated = extractCuratedEvidencePair(salinasRaw, 2);

  // 8. Sendero Santa Verónica - Post-ISSUED
  const senderoFixBefore = manifest.fixtures.find((f) => f.id === 'fix-sendero-b1')!;
  const senderoFixAfterValid = manifest.fixtures.find((f) => f.id === 'fix-sendero-a1')!;
  const senderoFixAfterPostIssued = manifest.fixtures.find((f) => f.id === 'fix-sendero-a2-postissued')!;
  const issuedTimestamp = '2026-09-10T17:00:00.000Z';

  const senderoRawAll: ExecutionAttachmentItem[] = [
    {
      id: senderoFixBefore.id,
      execution_id: 'exec-sendero-1',
      storage_path: senderoFixBefore.local_fixture,
      file_hash: senderoFixBefore.sha256,
      phase: 'before',
      captured_at: senderoFixBefore.simulated_created_at,
      has_gps: true,
      sharpness_score: 0.86,
    },
    {
      id: senderoFixAfterValid.id,
      execution_id: 'exec-sendero-1',
      storage_path: senderoFixAfterValid.local_fixture,
      file_hash: senderoFixAfterValid.sha256,
      phase: 'after',
      captured_at: senderoFixAfterValid.simulated_created_at, // 16:45:00 <= 17:00:00
      has_gps: true,
      sharpness_score: 0.90,
    },
    {
      id: senderoFixAfterPostIssued.id,
      execution_id: 'exec-sendero-1',
      storage_path: senderoFixAfterPostIssued.local_fixture,
      file_hash: senderoFixAfterPostIssued.sha256,
      phase: 'after',
      captured_at: senderoFixAfterPostIssued.simulated_created_at, // 18:30:00 > 17:00:00 (POST-ISSUED)
      has_gps: true,
      sharpness_score: 0.95,
    },
  ];

  // Filtering attachments created_at <= issuedTimestamp
  const senderoRawValid = senderoRawAll.filter((a) => a.captured_at <= issuedTimestamp);
  const senderoCurated = extractCuratedEvidencePair(senderoRawValid, 2);

  return [
    {
      site_id: 'site-plaza-01',
      site_name: 'Plaza Puerto Colombia',
      activity_key: plazaFixBefore.activity_key,
      activity_name: plazaFixBefore.activity_description,
      scenario_description: 'E2E normal con 1 foto ANTES y 1 foto DESPUÉS',
      raw_attachments: plazaRaw,
      curated_pair: plazaCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-manglares-02',
      site_name: 'Playa Manglares',
      activity_key: manglaresFixBefore.activity_key,
      activity_name: manglaresFixBefore.activity_description,
      scenario_description: 'Evidencia ambiental en zona protegida de manglar',
      raw_attachments: manglaresRaw,
      curated_pair: manglaresCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-mercado-03',
      site_name: 'Mercado La Sazón',
      activity_key: mercadoFixBefore.activity_key,
      activity_name: mercadoFixBefore.activity_description,
      scenario_description: 'Evidencia con certificado PDF de disposición final',
      raw_attachments: mercadoRaw,
      documents: [
        {
          id: mercadoFixDoc.id,
          file_name: 'certificado_disposicion_final_mercado.pdf',
          file_type: 'application/pdf',
          storage_path: mercadoFixDoc.local_fixture,
          uploaded_at: mercadoFixDoc.simulated_created_at,
        },
      ],
      curated_pair: mercadoCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-miramar-04',
      site_name: 'Miramar Sector El Faro',
      activity_key: miramarFixBefore.activity_key,
      activity_name: miramarFixBefore.activity_description,
      scenario_description: 'Evidencia incompleta (0 fotos DESPUÉS)',
      raw_attachments: miramarRaw,
      curated_pair: miramarCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-country-05',
      site_name: 'Playa del Country',
      activity_key: country1BeforeFixes[0].activity_key,
      activity_name: country1BeforeFixes[0].activity_description,
      scenario_description: 'Abundancia fotográfica (5 ANTES + 6 DESPUÉS) reducida a exactamente 2 ANTES y 2 DESPUÉS',
      raw_attachments: country1Raw,
      curated_pair: country1Curated,
      human_override_applied: true, // Simulates human decision review
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-sabanilla-06',
      site_name: 'Playa de Sabanilla 2',
      activity_key: sabanillaBefore1.activity_key,
      activity_name: sabanillaBefore1.activity_description,
      scenario_description: 'Deduplicación SHA-256 excluye foto idéntica',
      raw_attachments: sabanillaRaw,
      curated_pair: sabanillaCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-salinas-07',
      site_name: 'Salinas del Rey',
      activity_key: salinasFixBefore.activity_key,
      activity_name: salinasFixBefore.activity_description,
      scenario_description: 'Vertimiento + disposición final con 2 certificados PDF',
      raw_attachments: salinasRaw,
      documents: [
        {
          id: salinasFixDoc1.id,
          file_name: 'certificado_vertimiento_salinas.pdf',
          file_type: 'application/pdf',
          storage_path: salinasFixDoc1.local_fixture,
          uploaded_at: salinasFixDoc1.simulated_created_at,
        },
        {
          id: salinasFixDoc2.id,
          file_name: 'certificado_disposicion_salinas.pdf',
          file_type: 'application/pdf',
          storage_path: salinasFixDoc2.local_fixture,
          uploaded_at: salinasFixDoc2.simulated_created_at,
        },
      ],
      curated_pair: salinasCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: false,
    },
    {
      site_id: 'site-sendero-08',
      site_name: 'Sendero Santa Verónica',
      activity_key: senderoFixBefore.activity_key,
      activity_name: senderoFixBefore.activity_description,
      scenario_description: 'Evidencia posterior a ISSUED queda excluida del Acta',
      raw_attachments: senderoRawAll,
      curated_pair: senderoCurated,
      human_override_applied: false,
      acta_issued: true,
      post_issued_attachment_excluded: true,
    },
  ];
}
