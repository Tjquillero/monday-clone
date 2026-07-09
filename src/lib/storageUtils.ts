import { supabase } from '@/lib/supabaseClient';

// Bucket físico único para adjuntos de cualquier entidad del sistema.
// La integridad referencial vive en las tablas (attachments, execution_attachments,
// futuras acta_attachments/report_attachments), no en el bucket — un bucket,
// varias tablas. Ver docs/architecture/execution-certification-design.md.
export const ATTACHMENT_BUCKET = 'attachments';

// Carpetas de primer nivel dentro de ATTACHMENT_BUCKET, una por tabla de
// adjuntos. Tipado para que un typo (ej. 'executions' en vez de 'execution')
// falle en compilación en vez de crear silenciosamente una carpeta distinta.
export type AttachmentScope = 'execution' | 'actas' | 'reports';

/**
 * Construye la ruta de Storage para el adjunto de una entidad, dentro del
 * scope que le corresponde. Centraliza la convención para que cambiarla no
 * requiera tocar cada hook.
 */
export function buildAttachmentPath(scope: AttachmentScope, entityId: string, fileName: string): string {
  const fileExt = fileName.split('.').pop();
  return `${scope}/${entityId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
}

/**
 * Extrae la ruta relativa dentro del bucket a partir de una Public URL de
 * Supabase Storage, para poder borrar el archivo con storage.remove().
 */
export function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string = ATTACHMENT_BUCKET): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
}

/**
 * Uploads a file to Supabase Storage and returns the Public URL.
 * @param file The file to upload
 * @param bucket The storage bucket name (default: 'attachments')
 * @param path The path within the bucket (optional, auto-generated if not provided)
 */
export const uploadFileToStorage = async (file: File, bucket: string = 'attachments', path?: string): Promise<string> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = path || `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    
    // Upload
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (uploadError) {
      console.error('Supabase Storage Upload Error:', JSON.stringify(uploadError, null, 2));
      throw uploadError;
    }

    // Get URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};

/**
 * Uploads an evidence photo for a specific item.
 * Stores in 'attachments' bucket under 'evidence/{itemId}/{filename}'.
 */
export const uploadEvidencePhoto = async (file: File, itemId: string | number): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const filePath = `evidence/${itemId}/${Date.now()}.${fileExt}`;
  return uploadFileToStorage(file, 'attachments', filePath);
};
