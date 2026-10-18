/**
 * Client-side image downscaling — produces the full-size JPEG and a small
 * thumbnail before encryption. JPEG everywhere: Safari's WebP encoder is
 * unreliable, and the bytes are ciphertext in transit anyway.
 */

const FULL_MAX_EDGE = 2560;   // long edge of the stored full image
const THUMB_MAX_EDGE = 400;   // long edge of the thumbnail
const FULL_QUALITY = 0.85;
const THUMB_QUALITY = 0.8;
const MAX_FULL_BYTES = 10 * 1024 * 1024; // matches server presign limit

export interface ProcessedImage {
  full: Blob;
  thumb: Blob;
  width: number;   // dimensions of the stored full image
  height: number;
  mimeType: string; // always image/jpeg
}

/** The only image types that can be added: no SVG (it can carry script) and no
 *  GIF. Every image is redrawn and saved as a new JPEG anyway, so nothing
 *  hidden inside a file survives. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

function scaleToFit(width: number, height: number, maxEdge: number): { w: number; h: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { w: width, h: height };
  const scale = maxEdge / longEdge;
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

function drawToJpeg(bitmap: ImageBitmap, w: number, h: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available'));
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Decode, downscale, and re-encode an image file into a full-size JPEG
 * (long edge ≤ 2560px) plus a thumbnail (long edge ≤ 400px).
 * Rejects non-image files and images that stay over 10 MB after downscaling.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Only JPG, PNG, WebP or AVIF images can be added');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This file could not be read as an image');
  }

  try {
    const fullDims = scaleToFit(bitmap.width, bitmap.height, FULL_MAX_EDGE);
    const thumbDims = scaleToFit(bitmap.width, bitmap.height, THUMB_MAX_EDGE);

    const [full, thumb] = await Promise.all([
      drawToJpeg(bitmap, fullDims.w, fullDims.h, FULL_QUALITY),
      drawToJpeg(bitmap, thumbDims.w, thumbDims.h, THUMB_QUALITY),
    ]);

    if (full.size > MAX_FULL_BYTES) {
      throw new Error('Image is too large even after compression (max 10 MB)');
    }

    return { full, thumb, width: fullDims.w, height: fullDims.h, mimeType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}
