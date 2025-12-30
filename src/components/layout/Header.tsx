'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMedicalSubmenu, setShowMedicalSubmenu] = useState(false);
  const medicalRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close medical submenu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (medicalRef.current && !medicalRef.current.contains(event.target as Node)) {
        setShowMedicalSubmenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => pathname === path;
  const isMedicalActive = pathname?.startsWith('/medical');

  const medicalTabs = [
    { key: 'medications', label: 'Medications' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'food', label: 'Food' },
    { key: 'symptoms', label: 'Symptoms' },
    { key: 'reporting', label: 'Reporting' },
  ];

  return (
    <header className="px-4 py-3" style={{ backgroundColor: '#1aaeae' }}>
      <div className="flex items-center justify-between">
        {/* Logo and New Entry Button */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/chronicles-logo.png"
              alt="Chronicles"
              className="h-11 w-auto brightness-0 invert"
            />
          </Link>
          <div className="w-px h-6 bg-teal-600" />
          <button
            onClick={() => router.push('/?new=true')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-teal-100 hover:text-white"
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
                ? 'text-white font-bold'
                : 'text-teal-100 hover:text-white'
            }`}
          >
            Journal
          </Link>
          <Link
            href="/calendar"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/calendar')
                ? 'text-white font-bold'
                : 'text-teal-100 hover:text-white'
            }`}
          >
            Calendar
          </Link>
          <Link
            href="/goals"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/goals')
                ? 'text-white font-bold'
                : 'text-teal-100 hover:text-white'
            }`}
          >
            Goals
          </Link>

          {/* Medical with submenu */}
          <div className="relative" ref={medicalRef}>
            <button
              onClick={() => setShowMedicalSubmenu(!showMedicalSubmenu)}
              className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
                isMedicalActive
                  ? 'text-white font-bold'
                  : 'text-teal-100 hover:text-white'
              }`}
            >
              Medical
              <svg
                className={`w-4 h-4 transition-transform ${showMedicalSubmenu ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showMedicalSubmenu && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-white border rounded-md shadow-lg z-50">
                {medicalTabs.map((tab) => (
                  <Link
                    key={tab.key}
                    href={`/medical?tab=${tab.key}`}
                    onClick={() => setShowMedicalSubmenu(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-md last:rounded-b-md"
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
                ? 'text-white font-bold'
                : 'text-teal-100 hover:text-white'
            }`}
          >
            Topics
          </Link>
          <Link
            href="/settings"
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              isActive('/settings')
                ? 'text-white font-bold'
                : 'text-teal-100 hover:text-white'
            }`}
          >
            Settings
          </Link>

          <div className="w-px h-6 bg-teal-600 mx-2" />

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 text-sm text-teal-100 hover:text-white rounded-md transition-colors"
          >
            Logout
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="md:hidden p-2 hover:bg-teal-600 rounded-full"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden mt-3 pt-3 border-t border-teal-600">
          <nav className="space-y-1">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/') ? 'text-white font-bold' : 'text-teal-100 hover:text-white'
              }`}
            >
              Journal
            </Link>
            <Link
              href="/calendar"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/calendar') ? 'text-white font-bold' : 'text-teal-100 hover:text-white'
              }`}
            >
              Calendar
            </Link>
            <Link
              href="/goals"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/goals') ? 'text-white font-bold' : 'text-teal-100 hover:text-white'
              }`}
            >
              Goals
            </Link>
            <Link
              href="/medical"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isMedicalActive ? 'text-white font-bold' : 'text-teal-100 hover:text-white'
              }`}
            >
              Medical
            </Link>
            <Link
              href="/topics"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/topics') ? 'text-white font-bold' : 'text-teal-100 hover:text-white'
              }`}
            >
              Topics
            </Link>
            <Link
              href="/settings"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 text-sm rounded-md ${
                isActive('/settings') ? 'text-white font-bold' : 'text-teal-100 hover:text-white'
              }`}
            >
              Settings
            </Link>
            <hr className="my-2 border-teal-600" />
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full text-left px-3 py-2 text-sm text-teal-100 hover:text-white rounded-md"
            >
              Logout
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
