/**
 * Compresses a base64 image using HTML5 Canvas.
 * @param base64Str The original base64 string (including data:image/...).
 * @param maxWidth Maximum width in pixels (default 1024).
 * @param quality JPEG quality 0-1 (default 0.7).
 * @returns Promise resolving to the compressed base64 string.
 */
export const compressImage = (base64Str: string, maxWidth: number = 1024, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    // If not an image or empty, return original
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    
    // TEMPORARY DEBUG: Bypass compression REMOVED. Re-enabling logic.
    // resolve(base64Str);
    // return;

    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw resized image
      ctx.drawImage(img, 0, 0, width, height);

      // Export as JPEG with reduce quality
      // Force JPEG for better compression of photos
      const newBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(newBase64);
    };

    img.onerror = (err) => {
      console.error('Image compression error:', err);
      // Fallback: return original if compression fails
      resolve(base64Str);
    };
  });
};
