'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const DEFAULT_BACKGROUND_IMAGE = '';
const AUTH_PATHS = ['/login', '/register', '/forgot-password'];
const BACKGROUND_IMAGE_STORAGE_KEY = 'chronicles-background-image';

export function BackgroundImage() {
  const [currentImage, setCurrentImage] = useState(DEFAULT_BACKGROUND_IMAGE);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some(path => pathname?.startsWith(path));

  // Initialize from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(BACKGROUND_IMAGE_STORAGE_KEY);
    if (stored) {
      setCurrentImage(stored);
    }
  }, []);

  // Listen for background image changes
  useEffect(() => {
    const handleBackgroundChange = (event: CustomEvent<string>) => {
      setCurrentImage(event.detail || '');
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === BACKGROUND_IMAGE_STORAGE_KEY) {
        setCurrentImage(event.newValue || '');
      }
    };

    window.addEventListener('backgroundImageChange', handleBackgroundChange as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('backgroundImageChange', handleBackgroundChange as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Update body background when currentImage changes
  useEffect(() => {
    if (mounted && currentImage && !isAuthPage) {
      document.body.style.background = 'transparent';
    } else {
      document.body.style.background = 'var(--background)';
    }
    return () => {
      document.body.style.background = 'var(--background)';
    };
  }, [currentImage, mounted, isAuthPage]);

  // Don't render on auth pages or until mounted
  if (!mounted || isAuthPage) {
    return null;
  }

  // Render empty div if no image (maintains DOM structure)
  if (!currentImage) {
    return <div className="fixed inset-0 -z-10" style={{ background: 'var(--background)' }} />;
  }

  return (
    <div
      className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat transition-opacity duration-200"
      style={{
        backgroundImage: `url(${currentImage})`,
      }}
    />
  );
}
