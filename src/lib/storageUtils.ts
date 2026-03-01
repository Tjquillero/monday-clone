import { supabase } from '@/lib/supabaseClient';

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
