/**
 * Activity Report Asset Resolver
 * Presentation Asset Resolution Layer
 * 
 * Takes a ActivityExecutionReportDTO containing stable storage_path references
 * and resolves temporary Signed URLs for rendering in HTML/Puppeteer.
 * 
 * 0 DDL, 0 DB mutations, 100% presentation layer.
 */

import { ActivityExecutionReportDTO } from './activityReportReadModelService';

export interface ResolvedEvidenceDTO {
  attachment_id: string;
  storage_path: string;
  signed_url: string;
  phase: 'before' | 'after';
  captured_at: string;
  has_gps: boolean;
}

export interface ResolvedDocumentSupportDTO {
  attachment_id: string;
  file_name: string;
  storage_path: string;
  signed_url: string;
  file_type: string;
  uploaded_at: string;
}

export interface ResolvedActivityReportItemDTO {
  execution_id: string;
  activity_key: string;
  activity_name: string;
  unit: string;
  executed_qty: number;
  certified_qty?: number;
  execution_date: string;
  evidence: {
    before: ResolvedEvidenceDTO[];
    after: ResolvedEvidenceDTO[];
  };
  documents?: ResolvedDocumentSupportDTO[];
}

export interface ResolvedFrontGroupDTO {
  site_id: string;
  site_name: string;
  front_name?: string;
  activities: ResolvedActivityReportItemDTO[];
}

export interface ResolvedActivityExecutionReportDTO {
  header: ActivityExecutionReportDTO['header'];
  fronts: ResolvedFrontGroupDTO[];
  signatories: ActivityExecutionReportDTO['signatories'];
}

/**
 * Resolves Signed URLs for all evidence images and PDF support documents in the DTO.
 */
export async function resolveReportAssetUrls(
  dto: ActivityExecutionReportDTO,
  supabaseClient?: any,
  expiresInSeconds = 3600
): Promise<ResolvedActivityExecutionReportDTO> {
  const resolvedFronts: ResolvedFrontGroupDTO[] = [];

  for (const front of dto.fronts) {
    const resolvedActivities: ResolvedActivityReportItemDTO[] = [];

    for (const act of front.activities) {
      const resolveBefore: ResolvedEvidenceDTO[] = [];
      const resolveAfter: ResolvedEvidenceDTO[] = [];
      const resolveDocs: ResolvedDocumentSupportDTO[] = [];

      for (const ev of act.evidence.before) {
        const url = await getSignedUrlForPath(ev.storage_path, supabaseClient, expiresInSeconds);
        resolveBefore.push({ ...ev, signed_url: url });
      }

      for (const ev of act.evidence.after) {
        const url = await getSignedUrlForPath(ev.storage_path, supabaseClient, expiresInSeconds);
        resolveAfter.push({ ...ev, signed_url: url });
      }

      for (const doc of act.documents || []) {
        const url = await getSignedUrlForPath(doc.storage_path, supabaseClient, expiresInSeconds);
        resolveDocs.push({ ...doc, signed_url: url });
      }

      resolvedActivities.push({
        ...act,
        evidence: {
          before: resolveBefore,
          after: resolveAfter,
        },
        documents: resolveDocs.length > 0 ? resolveDocs : undefined,
      });
    }

    resolvedFronts.push({
      ...front,
      activities: resolvedActivities,
    });
  }

  return {
    header: dto.header,
    fronts: resolvedFronts,
    signatories: dto.signatories,
  };
}

async function getSignedUrlForPath(
  storagePath: string,
  supabaseClient?: any,
  expiresInSeconds = 3600
): Promise<string> {
  // If path is already an absolute HTTP URL, return as is
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }

  if (!supabaseClient) {
    return storagePath; // Fallback for pure unit tests
  }

  try {
    const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
    const { data, error } = await supabaseClient.storage
      .from('attachments')
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return storagePath;
    }
    return data.signedUrl;
  } catch {
    return storagePath;
  }
}
