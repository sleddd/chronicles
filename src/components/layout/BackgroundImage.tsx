'use client';

import { useEffect } from 'react';
import { useAccentColor } from '@/lib/hooks/useAccentColor';

export function BackgroundImage() {
  const { backgroundImage } = useAccentColor();

  // Update body background when backgroundImage changes
  useEffect(() => {
    if (backgroundImage) {
      document.body.style.background = 'transparent';
    } else {
      document.body.style.background = 'var(--background)';
    }
    return () => {
      document.body.style.background = 'var(--background)';
    };
  }, [backgroundImage]);

  if (!backgroundImage) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${backgroundImage})`,
      }}
    />
  );
}
