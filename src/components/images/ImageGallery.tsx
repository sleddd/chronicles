'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { ImageUpload } from './ImageUpload';

interface ImageData {
  id: string;
  entryId: string | null;
  encryptedFilename: string;
  filenameIv: string;
  encryptedData: string;
  dataIv: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface DecryptedImage {
  id: string;
  entryId: string | null;
  filename: string;
  dataUrl: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface Props {
  entryId?: string;
  editable?: boolean;
  onImagesChange?: (images: DecryptedImage[]) => void;
}

export function ImageGallery({ entryId, editable = true, onImagesChange }: Props) {
  const [images, setImages] = useState<DecryptedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<DecryptedImage | null>(null);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchAndDecryptImages = useCallback(async () => {
    if (!isKeyReady) return;

    setLoading(true);
    try {
      const url = entryId ? `/api/images?entryId=${entryId}` : '/api/images';
      const response = await fetch(url);
      const data = await response.json();

      const decryptedImages: DecryptedImage[] = [];

      for (const img of data.images || []) {
        try {
          const filename = await decryptData(img.encryptedFilename, img.filenameIv);
          const dataUrl = await decryptData(img.encryptedData, img.dataIv);

          decryptedImages.push({
            id: img.id,
            entryId: img.entryId,
            filename,
            dataUrl,
            mimeType: img.mimeType,
            size: img.size,
            createdAt: img.createdAt,
          });
        } catch (err) {
          console.error('Failed to decrypt image:', img.id, err);
        }
      }

      setImages(decryptedImages);
      onImagesChange?.(decryptedImages);
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setLoading(false);
    }
  }, [entryId, isKeyReady, decryptData, onImagesChange]);

  useEffect(() => {
    fetchAndDecryptImages();
  }, [fetchAndDecryptImages]);

  const handleImageUploaded = (image: { id: string; entryId: string | null; mimeType: string; size: number; createdAt: string; decryptedUrl?: string; decryptedFilename?: string }) => {
    if (image.decryptedUrl && image.decryptedFilename) {
      const newImage: DecryptedImage = {
        id: image.id,
        entryId: image.entryId,
        filename: image.decryptedFilename,
        dataUrl: image.decryptedUrl,
        mimeType: image.mimeType,
        size: image.size,
        createdAt: image.createdAt,
      };
      setImages(prev => [newImage, ...prev]);
      onImagesChange?.([...images, newImage]);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Delete this image?')) return;

    try {
      const response = await fetch(`/api/images/${imageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setImages(prev => prev.filter(img => img.id !== imageId));
        onImagesChange?.(images.filter(img => img.id !== imageId));
        if (selectedImage?.id === imageId) {
          setSelectedImage(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 mt-2">Loading images...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {editable && (
        <ImageUpload entryId={entryId} onImageUploaded={handleImageUploaded} />
      )}

      {images.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {editable ? 'No images yet. Upload some images above.' : 'No images attached.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden"
            >
              <img
                src={image.dataUrl}
                alt={image.filename}
                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setSelectedImage(image)}
              />

              {editable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteImage(image.id);
                  }}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="Delete image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs truncate">{image.filename}</p>
                <p className="text-white/70 text-xs">{formatFileSize(image.size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-lg"
            onClick={() => setSelectedImage(null)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className="max-w-4xl max-h-[90vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.dataUrl}
              alt={selectedImage.filename}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
              <p className="text-white font-medium">{selectedImage.filename}</p>
              <p className="text-white/70 text-sm">
                {formatFileSize(selectedImage.size)} • {new Date(selectedImage.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
