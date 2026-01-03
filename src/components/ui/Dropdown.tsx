'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = 'left',
  className = '',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  const alignClass = align === 'right' ? 'dropdown-right' : 'dropdown-left';

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div className={`dropdown ${alignClass} ${className}`}>
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  danger?: boolean;
}

export function DropdownItem({
  active,
  danger,
  className = '',
  children,
  ...props
}: DropdownItemProps) {
  const baseClass = active
    ? 'dropdown-item-active'
    : danger
    ? 'dropdown-item-danger'
    : 'dropdown-item';

  return (
    <button className={`${baseClass} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="dropdown-divider" />;
}

export function DropdownHeader({ children }: { children: React.ReactNode }) {
  return <div className="dropdown-header">{children}</div>;
}
