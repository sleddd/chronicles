'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const DEFAULT_HEADER_COLOR = '#003d73';
const HEADER_COLOR_STORAGE_KEY = 'chronicles-header-color';

// Get initial color from localStorage (runs synchronously before render)
function getInitialHeaderColor(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(HEADER_COLOR_STORAGE_KEY);
    if (cached) return cached;
  }
  return DEFAULT_HEADER_COLOR;
}

export function Header() {
  const router = useRouter();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showHealthSubmenu, setShowHealthSubmenu] = useState(false);
  const [headerColor, setHeaderColor] = useState(getInitialHeaderColor);
  const healthRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Load header color from settings and sync with localStorage
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

  // Close health submenu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (healthRef.current && !healthRef.current.contains(event.target as Node)) {
        setShowHealthSubmenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => pathname === path;
  const isHealthActive = pathname?.startsWith('/health');

  // Use white text on all header colors - lighter for inactive, bold white for active
  const textColor = 'text-white/70 font-medium';
  const textColorHover = 'hover:text-white';
  const textColorActive = 'text-white font-black';
  const logoFilter = 'brightness-0 invert';

  const healthTabs = [
    { key: 'medications', label: 'Meds. List' },
    { key: 'schedule', label: 'Meds. Schedule' },
    { key: 'food', label: 'Food' },
    { key: 'symptoms', label: 'Symptoms' },
    { key: 'exercise', label: 'Exercise' },
    { key: 'reporting', label: 'Reporting' },
  ];

  return (
    <header className="px-4 py-3" style={{ backgroundColor: headerColor }}>
      <div className="flex items-center justify-between">
        {/* Logo and New Entry Button */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/chronicles-logo.png"
              alt="Chronicles"
              className={`h-11 w-auto ${logoFilter}`}
            />
          </Link>
          <div className="w-px h-6 bg-border" />
          <button
            onClick={() => router.push('/?new=true')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${textColor} ${textColorHover}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Entry</span>
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-end">
          <Link
            href="/"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/')
                ? `${textColorActive} font-bold`
                : `${textColor} ${textColorHover}`
            }`}
          >
            Journal
          </Link>
          <Link
            href="/calendar"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/calendar')
                ? `${textColorActive} font-bold`
                : `${textColor} ${textColorHover}`
            }`}
          >
            Calendar
          </Link>
          <Link
            href="/goals"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/goals')
                ? `${textColorActive} font-bold`
                : `${textColor} ${textColorHover}`
            }`}
          >
            Goals
          </Link>

          {/* Health with submenu */}
          <div className="relative" ref={healthRef}>
            <button
              onClick={() => setShowHealthSubmenu(!showHealthSubmenu)}
              className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
                isHealthActive
                  ? `${textColorActive} font-bold`
                  : `${textColor} ${textColorHover}`
              }`}
            >
              Health
              <svg
                className={`w-4 h-4 transition-transform ${showHealthSubmenu ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showHealthSubmenu && (
              <div className="absolute top-full left-0 mt-1 w-40 backdrop-blur-xl bg-white/90 border border-border rounded-md shadow-lg z-50">
                {healthTabs.map((tab) => (
                  <Link
                    key={tab.key}
                    href={`/health?tab=${tab.key}`}
                    onClick={() => setShowHealthSubmenu(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:backdrop-blur-sm bg-white/40 first:rounded-t-md last:rounded-b-md"
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/topics"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/topics')
                ? `${textColorActive} font-bold`
                : `${textColor} ${textColorHover}`
            }`}
          >
            Topics
          </Link>
          <Link
            href="/settings"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/settings')
                ? `${textColorActive} font-bold`
                : `${textColor} ${textColorHover}`
            }`}
          >
            Settings
          </Link>

          <div className="w-px h-6 bg-border mx-2" />

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${textColor} ${textColorHover}`}
          >
            Logout
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="md:hidden p-2 rounded-full hover:bg-white/20"
        >
          <svg className={`w-6 h-6 ${textColorActive}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden mt-3 pt-3 border-t border-border">
          <nav className="space-y-1">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/') ? `${textColorActive} font-bold` : `${textColor} ${textColorHover}`
              }`}
            >
              Journal
            </Link>
            <Link
              href="/calendar"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/calendar') ? `${textColorActive} font-bold` : `${textColor} ${textColorHover}`
              }`}
            >
              Calendar
            </Link>
            <Link
              href="/goals"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/goals') ? `${textColorActive} font-bold` : `${textColor} ${textColorHover}`
              }`}
            >
              Goals
            </Link>
            <Link
              href="/health"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isHealthActive ? `${textColorActive} font-bold` : `${textColor} ${textColorHover}`
              }`}
            >
              Health
            </Link>
            <Link
              href="/topics"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/topics') ? `${textColorActive} font-bold` : `${textColor} ${textColorHover}`
              }`}
            >
              Topics
            </Link>
            <Link
              href="/settings"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/settings') ? `${textColorActive} font-bold` : `${textColor} ${textColorHover}`
              }`}
            >
              Settings
            </Link>
            <hr className="my-2 border-border" />
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className={`w-full text-left px-3 py-2 text-sm rounded-md ${textColor} ${textColorHover}`}
            >
              Logout
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
