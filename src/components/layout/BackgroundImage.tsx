'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const DEFAULT_BACKGROUND_IMAGE = '/backgrounds/alvaro-serrano-hjwKMkehBco-unsplash.jpg';
const BACKGROUND_IMAGE_STORAGE_KEY = 'chronicles-background-image';

// Use useSyncExternalStore for proper SSR/hydration handling
function getSnapshot(): string {
  return localStorage.getItem(BACKGROUND_IMAGE_STORAGE_KEY) || DEFAULT_BACKGROUND_IMAGE;
}

function getServerSnapshot(): string {
  return DEFAULT_BACKGROUND_IMAGE;
}

function subscribe(callback: () => void): () => void {
  const handleBackgroundChange = () => callback();
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === BACKGROUND_IMAGE_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener('backgroundImageChange', handleBackgroundChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener('backgroundImageChange', handleBackgroundChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}

export function BackgroundImage() {
  const currentImage = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mounted, setMounted] = useState(false);

  // Track when component is mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update body background when currentImage changes
  useEffect(() => {
    if (mounted && currentImage) {
      document.body.style.background = 'transparent';
    } else {
      document.body.style.background = 'var(--background)';
    }
    return () => {
      document.body.style.background = 'var(--background)';
    };
  }, [currentImage, mounted]);

  // Don't render until mounted to use client-side localStorage value
  if (!mounted || !currentImage) {
    return null;
  }

  return (
    <div
      key={currentImage}
      className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${currentImage})`,
      }}
    />
  );
}
