'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

const DEFAULT_HEADER_COLOR = '#4281a4';
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

const DEFAULT_BACKGROUND_IMAGE = '';

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
  settingsLoaded: boolean;
}

const AccentColorContext = createContext<AccentColorContextValue>({
  headerColor: DEFAULT_HEADER_COLOR,
  accentColor: DEFAULT_HEADER_COLOR,
  hoverColor: getHoverColor(DEFAULT_HEADER_COLOR),
  lightBgColor: getLightBgColor(DEFAULT_HEADER_COLOR),
  isTransparent: false,
  backgroundImage: DEFAULT_BACKGROUND_IMAGE,
  backgroundIsLight: false,
  settingsLoaded: false,
});

export function AccentColorProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  // Use defaults for SSR, then load from API on client
  const [headerColor, setHeaderColor] = useState(DEFAULT_HEADER_COLOR);
  const [backgroundImage, setBackgroundImage] = useState(DEFAULT_BACKGROUND_IMAGE);
  const [backgroundIsLight, setBackgroundIsLight] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Analyze background image brightness when it changes (only after settings loaded)
  useEffect(() => {
    if (!settingsLoaded) return;

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
  }, [backgroundImage, settingsLoaded]);

  // Load settings from API
  const loadSettings = useCallback(async () => {
    setSettingsLoaded(false);
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();

        // Use || to treat empty string as falsy and fall back to defaults
        const newHeaderColor = data.settings?.headerColor || DEFAULT_HEADER_COLOR;
        const newBackgroundImage = data.settings?.backgroundImage || DEFAULT_BACKGROUND_IMAGE;

        setHeaderColor(newHeaderColor);
        localStorage.setItem(HEADER_COLOR_STORAGE_KEY, newHeaderColor);

        setBackgroundImage(newBackgroundImage);
        localStorage.setItem(BACKGROUND_IMAGE_STORAGE_KEY, newBackgroundImage);
        // Dispatch event so BackgroundImage component updates
        window.dispatchEvent(new CustomEvent('backgroundImageChange', { detail: newBackgroundImage }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  // Load settings when authenticated, clear on logout
  useEffect(() => {
    if (status === 'authenticated') {
      loadSettings();
    } else if (status === 'unauthenticated') {
      // Clear localStorage so next login loads fresh from DB
      localStorage.removeItem(HEADER_COLOR_STORAGE_KEY);
      localStorage.removeItem(BACKGROUND_IMAGE_STORAGE_KEY);
      localStorage.removeItem(BACKGROUND_IS_LIGHT_STORAGE_KEY);
      // Reset to defaults
      setHeaderColor(DEFAULT_HEADER_COLOR);
      setBackgroundImage(DEFAULT_BACKGROUND_IMAGE);
      setBackgroundIsLight(false);
      // Mark as loaded (unauthenticated users use defaults)
      setSettingsLoaded(true);
    }
  }, [status, loadSettings]);


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

  // Update CSS custom properties when accent color changes
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    document.documentElement.style.setProperty('--accent-hover', hoverColor);
    document.documentElement.style.setProperty('--accent-light', lightBgColor);
  }, [accentColor, hoverColor, lightBgColor]);

  const value: AccentColorContextValue = {
    headerColor,
    accentColor,
    hoverColor,
    lightBgColor,
    isTransparent,
    backgroundImage,
    backgroundIsLight,
    settingsLoaded,
  };

  // Show a blank screen until settings are loaded to prevent flicker
  if (!settingsLoaded && status !== 'loading') {
    return (
      <AccentColorContext.Provider value={value}>
        <div className="fixed inset-0 bg-[#e8e5df]" />
      </AccentColorContext.Provider>
    );
  }

  // Also hide during session loading to prevent flicker
  if (status === 'loading') {
    return (
      <AccentColorContext.Provider value={value}>
        <div className="fixed inset-0 bg-[#e8e5df]" />
      </AccentColorContext.Provider>
    );
  }

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
