'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const DEFAULT_HEADER_COLOR = '#2d2c2a';
const HEADER_COLOR_STORAGE_KEY = 'chronicles-header-color';
const FALLBACK_ACCENT_COLOR = '#6b7280'; // gray-500 for when header is transparent

// Get initial color from localStorage (runs synchronously before render)
function getInitialHeaderColor(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(HEADER_COLOR_STORAGE_KEY);
    if (cached) return cached;
  }
  return DEFAULT_HEADER_COLOR;
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
}

const AccentColorContext = createContext<AccentColorContextValue>({
  headerColor: DEFAULT_HEADER_COLOR,
  accentColor: DEFAULT_HEADER_COLOR,
  hoverColor: getHoverColor(DEFAULT_HEADER_COLOR),
  lightBgColor: getLightBgColor(DEFAULT_HEADER_COLOR),
  isTransparent: false,
});

export function AccentColorProvider({ children }: { children: ReactNode }) {
  const [headerColor, setHeaderColor] = useState(getInitialHeaderColor);

  // Load header color from settings
  const loadHeaderColor = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        if (data.settings?.headerColor) {
          setHeaderColor(data.settings.headerColor);
          localStorage.setItem(HEADER_COLOR_STORAGE_KEY, data.settings.headerColor);
        }
      }
    } catch (error) {
      console.error('Failed to load header color:', error);
    }
  }, []);

  useEffect(() => {
    loadHeaderColor();
  }, [loadHeaderColor]);

  // Listen for header color changes from settings
  useEffect(() => {
    const handleColorChange = (event: CustomEvent<string>) => {
      setHeaderColor(event.detail);
      localStorage.setItem(HEADER_COLOR_STORAGE_KEY, event.detail);
    };

    window.addEventListener('headerColorChange', handleColorChange as EventListener);
    return () => window.removeEventListener('headerColorChange', handleColorChange as EventListener);
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
