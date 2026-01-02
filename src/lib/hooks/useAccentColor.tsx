'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const DEFAULT_HEADER_COLOR = '#0F4C5C';
const HEADER_COLOR_STORAGE_KEY = 'chronicles-header-color';
const BACKGROUND_IMAGE_STORAGE_KEY = 'chronicles-background-image';
const BACKGROUND_IS_LIGHT_STORAGE_KEY = 'chronicles-background-is-light';
const FALLBACK_ACCENT_COLOR = '#6b7280'; // gray-500 for when header is transparent

// Analyze image brightness by sampling the top portion (where header is)
function analyzeImageBrightness(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(false); // Default to dark if can't analyze
        return;
      }

      // Sample the top portion of the image (where header would be)
      const sampleHeight = Math.min(100, img.height * 0.15);
      canvas.width = img.width;
      canvas.height = sampleHeight;

      ctx.drawImage(img, 0, 0, img.width, sampleHeight, 0, 0, img.width, sampleHeight);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let totalBrightness = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        // Calculate perceived brightness using luminance formula
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
        totalBrightness += brightness;
      }

      const avgBrightness = totalBrightness / pixelCount;
      // If average brightness > 128 (midpoint), consider it light
      resolve(avgBrightness > 128);
    };
    img.onerror = () => {
      resolve(false); // Default to dark on error
    };
    img.src = imageUrl;
  });
}

// Get initial background brightness from localStorage
function getInitialBackgroundIsLight(): boolean {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(BACKGROUND_IS_LIGHT_STORAGE_KEY);
    if (cached) return cached === 'true';
  }
  return false;
}

// Get initial color from localStorage (runs synchronously before render)
function getInitialHeaderColor(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(HEADER_COLOR_STORAGE_KEY);
    if (cached) return cached;
  }
  return DEFAULT_HEADER_COLOR;
}

const DEFAULT_BACKGROUND_IMAGE = '/backgrounds/alvaro-serrano-hjwKMkehBco-unsplash.jpg';

// Get initial background image from localStorage
function getInitialBackgroundImage(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(BACKGROUND_IMAGE_STORAGE_KEY);
    if (cached) return cached;
  }
  return DEFAULT_BACKGROUND_IMAGE;
}

// Get the accent color - returns header color or fallback grey if transparent
function getAccentColor(headerColor: string): string {
  if (headerColor === 'transparent') {
    return FALLBACK_ACCENT_COLOR;
  }
  return headerColor;
}

// Get hover color (slightly darker)
function getHoverColor(accentColor: string): string {
  if (accentColor === FALLBACK_ACCENT_COLOR) {
    return '#4b5563'; // gray-600
  }
  // Darken the color by reducing brightness
  const hex = accentColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 20);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 20);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 20);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Get light background color for the accent
function getLightBgColor(accentColor: string): string {
  if (accentColor === FALLBACK_ACCENT_COLOR) {
    return '#f3f4f6'; // gray-100
  }
  // Create a light tint of the color
  const hex = accentColor.replace('#', '');
  const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 180);
  const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 180);
  const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 180);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface AccentColorContextValue {
  headerColor: string;
  accentColor: string;
  hoverColor: string;
  lightBgColor: string;
  isTransparent: boolean;
  backgroundImage: string;
  backgroundIsLight: boolean;
}

const AccentColorContext = createContext<AccentColorContextValue>({
  headerColor: DEFAULT_HEADER_COLOR,
  accentColor: DEFAULT_HEADER_COLOR,
  hoverColor: getHoverColor(DEFAULT_HEADER_COLOR),
  lightBgColor: getLightBgColor(DEFAULT_HEADER_COLOR),
  isTransparent: false,
  backgroundImage: DEFAULT_BACKGROUND_IMAGE,
  backgroundIsLight: false,
});

export function AccentColorProvider({ children }: { children: ReactNode }) {
  const [headerColor, setHeaderColor] = useState(getInitialHeaderColor);
  const [backgroundImage, setBackgroundImage] = useState(getInitialBackgroundImage);
  const [backgroundIsLight, setBackgroundIsLight] = useState(getInitialBackgroundIsLight);

  // Analyze background image brightness when it changes
  useEffect(() => {
    if (backgroundImage) {
      analyzeImageBrightness(backgroundImage).then((isLight) => {
        setBackgroundIsLight(isLight);
        localStorage.setItem(BACKGROUND_IS_LIGHT_STORAGE_KEY, String(isLight));
        // Dispatch event so Header can react immediately
        window.dispatchEvent(new CustomEvent('backgroundBrightnessChange', { detail: isLight }));
      });
    } else {
      setBackgroundIsLight(false);
      localStorage.setItem(BACKGROUND_IS_LIGHT_STORAGE_KEY, 'false');
    }
  }, [backgroundImage]);

  // Load settings from API
  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        if (data.settings?.headerColor) {
          setHeaderColor(data.settings.headerColor);
          localStorage.setItem(HEADER_COLOR_STORAGE_KEY, data.settings.headerColor);
        }
        if (data.settings?.backgroundImage !== undefined) {
          setBackgroundImage(data.settings.backgroundImage);
          localStorage.setItem(BACKGROUND_IMAGE_STORAGE_KEY, data.settings.backgroundImage);
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Listen for header color changes from settings
  useEffect(() => {
    const handleColorChange = (event: CustomEvent<string>) => {
      setHeaderColor(event.detail);
      localStorage.setItem(HEADER_COLOR_STORAGE_KEY, event.detail);
    };

    window.addEventListener('headerColorChange', handleColorChange as EventListener);
    return () => window.removeEventListener('headerColorChange', handleColorChange as EventListener);
  }, []);

  // Listen for background image changes from settings
  useEffect(() => {
    const handleBackgroundChange = (event: CustomEvent<string>) => {
      setBackgroundImage(event.detail);
      localStorage.setItem(BACKGROUND_IMAGE_STORAGE_KEY, event.detail);
    };

    window.addEventListener('backgroundImageChange', handleBackgroundChange as EventListener);
    return () => window.removeEventListener('backgroundImageChange', handleBackgroundChange as EventListener);
  }, []);

  const accentColor = getAccentColor(headerColor);
  const hoverColor = getHoverColor(accentColor);
  const lightBgColor = getLightBgColor(accentColor);
  const isTransparent = headerColor === 'transparent';

  const value: AccentColorContextValue = {
    headerColor,
    accentColor,
    hoverColor,
    lightBgColor,
    isTransparent,
    backgroundImage,
    backgroundIsLight,
  };

  return (
    <AccentColorContext.Provider value={value}>
      {children}
    </AccentColorContext.Provider>
  );
}

export function useAccentColor() {
  return useContext(AccentColorContext);
}

// Re-export for components that just need the provider
export { AccentColorContext };
