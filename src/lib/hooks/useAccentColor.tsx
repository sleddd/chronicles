'use client';

import { useEffect, useMemo } from 'react';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';

const DEFAULT_HEADER_COLOR = '#4281a4';
const FALLBACK_ACCENT_COLOR = '#6b7280'; // gray-500 for when header is transparent

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

// Cache for brightness analysis results to avoid re-analyzing the same image
const brightnessCache = new Map<string, boolean>();

// Analyze image brightness by sampling the top portion (where header is)
// Uses downsampling for better performance
function analyzeImageBrightness(imageUrl: string): Promise<boolean> {
  // Check cache first
  const cached = brightnessCache.get(imageUrl);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        brightnessCache.set(imageUrl, false);
        resolve(false); // Default to dark if can't analyze
        return;
      }

      // Downsample to a small canvas for faster analysis (max 100x20)
      const sampleWidth = Math.min(100, img.width);
      const sampleHeight = Math.min(20, Math.ceil(img.height * 0.15));
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;

      // Draw scaled-down version of the top portion
      ctx.drawImage(img, 0, 0, img.width, Math.ceil(img.height * 0.15), 0, 0, sampleWidth, sampleHeight);

      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
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
      const isLight = avgBrightness > 128;
      brightnessCache.set(imageUrl, isLight);
      resolve(isLight);
    };
    img.onerror = () => {
      brightnessCache.set(imageUrl, false);
      resolve(false); // Default to dark on error
    };
    img.src = imageUrl;
  });
}

export interface AccentColorValue {
  headerColor: string;
  accentColor: string;
  hoverColor: string;
  lightBgColor: string;
  isTransparent: boolean;
  backgroundImage: string;
  backgroundIsLight: boolean;
  settingsLoaded: boolean;
}

export function useAccentColor(): AccentColorValue {
  const { settings, isInitialized } = useEntriesCache();

  const headerColor = settings.headerColor || DEFAULT_HEADER_COLOR;
  const backgroundImage = settings.backgroundImage || '';

  // Compute derived values
  const derived = useMemo(() => {
    const accent = getAccentColor(headerColor);
    return {
      accentColor: accent,
      hoverColor: getHoverColor(accent),
      lightBgColor: getLightBgColor(accent),
      isTransparent: headerColor === 'transparent',
    };
  }, [headerColor]);

  // Update CSS custom properties when accent color changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--accent-color', derived.accentColor);
      document.documentElement.style.setProperty('--accent-hover', derived.hoverColor);
      document.documentElement.style.setProperty('--accent-light', derived.lightBgColor);
    }
  }, [derived.accentColor, derived.hoverColor, derived.lightBgColor]);

  // Analyze background image brightness and dispatch event when it changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;

    if (backgroundImage) {
      analyzeImageBrightness(backgroundImage).then((isLight) => {
        window.dispatchEvent(new CustomEvent('backgroundBrightnessChange', { detail: isLight }));
      });
    } else {
      window.dispatchEvent(new CustomEvent('backgroundBrightnessChange', { detail: false }));
    }
  }, [backgroundImage, isInitialized]);

  return {
    headerColor,
    ...derived,
    backgroundImage,
    backgroundIsLight: false, // This is computed async, consumers should listen to event if needed
    settingsLoaded: isInitialized,
  };
}
