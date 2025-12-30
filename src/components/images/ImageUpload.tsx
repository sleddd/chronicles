'use client';

import { useState, useRef, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface UploadedImage {
  id: string;
  entryId: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  decryptedUrl?: string;
  decryptedFilename?: string;
}

interface Props {
  entryId?: string;
  onImageUploaded?: (image: UploadedImage) => void;
  maxFiles?: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function ImageUpload({ entryId, onImageUploaded, maxFiles = 10 }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { encryptData, isKeyReady } = useEncryption();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!isKeyReady) {
      setError('Encryption key not ready. Please unlock your vault.');
      return;
    }

    setUploading(true);
    setError(null);

    const filesToUpload = Array.from(files).slice(0, maxFiles);

    for (const file of filesToUpload) {
      try {
        // Validate file
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`Invalid file type: ${file.type}. Only JPEG, PNG, GIF, and WebP are allowed.`);
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          setError(`File too large: ${file.name}. Maximum size is 5MB.`);
          continue;
        }

        // Read file as base64
        const base64Data = await fileToBase64(file);

        // Encrypt filename
        const { ciphertext: encryptedFilename, iv: filenameIv } = await encryptData(file.name);

        // Encrypt file data
        const { ciphertext: encryptedData, iv: dataIv } = await encryptData(base64Data);

        // Upload encrypted image
        const response = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedFilename,
            filenameIv,
            encryptedData,
            dataIv,
            mimeType: file.type,
            size: file.size,
            entryId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const { image } = await response.json();

        // Add decrypted URL for preview
        image.decryptedUrl = URL.createObjectURL(file);
        image.decryptedFilename = file.name;

        onImageUploaded?.(image);
      } catch (err) {
        console.error('Upload error:', err);
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [entryId, isKeyReady, encryptData, onImageUploaded, maxFiles]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      <div
        onClick={handleClick}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Encrypting and uploading...</p>
          </div>
        ) : (
          <>
            <svg
              className="w-12 h-12 mx-auto text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-600 mb-1">
              <span className="text-blue-500 font-medium">Click to upload</span> or drag and drop
            </p>
            <p className="text-sm text-gray-500">
              JPEG, PNG, GIF, or WebP (max 5MB)
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
