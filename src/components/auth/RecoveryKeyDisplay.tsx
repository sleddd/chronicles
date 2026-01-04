'use client';

import { useState } from 'react';
import { useAccentColor } from '@/lib/hooks/useAccentColor';

interface RecoveryKeyDisplayProps {
  recoveryKey: string; // formatted key with dashes
  onConfirmed: () => void;
}

export function RecoveryKeyDisplay({ recoveryKey, onConfirmed }: RecoveryKeyDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { accentColor, hoverColor } = useAccentColor();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = recoveryKey;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center backdrop-blur-sm bg-white/30">
      <div className="max-w-lg w-full space-y-6 p-8 backdrop-blur-sm bg-white/30 rounded-lg shadow-md">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chronicles-logo.png"
            alt="Chronicles"
            className="h-16 w-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900">Save Your Recovery Key</h1>
        </div>

        <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold text-amber-800">IMPORTANT - SAVE THIS KEY NOW</h3>
              <div className="mt-2 text-sm text-amber-700">
                <p>
                  This recovery key is the <strong>ONLY WAY</strong> to recover your account if you forget your password.
                </p>
                <p className="mt-2">
                  Write it down or store it securely. You will <strong>NOT</strong> see this key again.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-sm bg-white/40 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-2 text-center">Your Recovery Key:</p>
          <div className="font-mono text-sm text-center backdrop-blur-sm bg-white/30 border border-border rounded p-3 break-all select-all">
            {recoveryKey}
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 "
              style={{ backgroundColor: copied ? '#059669' : accentColor }}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy to Clipboard
                </>
              )}
            </button>
          </div>
        </div>

        <div className="backdrop-blur-sm bg-white/30 border border-border rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-800 mb-2">Best practices for storing your recovery key:</h4>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Write it down on paper and store in a safe place</li>
            <li>Save it in a password manager</li>
            <li>Store it in an encrypted file on a USB drive</li>
            <li>Keep a copy in a safety deposit box</li>
          </ul>
        </div>

        <div className="border-t border-border pt-4">
          <label className="flex items-start">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="h-4 w-4 mt-0.5 text-gray-600  border-border rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              I have saved my recovery key in a secure location. I understand that without this key,
              I cannot recover my account if I forget my password.
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={onConfirmed}
          disabled={!confirmed}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2  disabled:bg-gray-400 disabled:cursor-not-allowed"
          style={{ backgroundColor: confirmed ? accentColor : undefined }}
          onMouseOver={(e) => { if (confirmed) e.currentTarget.style.backgroundColor = hoverColor; }}
          onMouseOut={(e) => { if (confirmed) e.currentTarget.style.backgroundColor = accentColor; }}
        >
          Continue to Login
        </button>
      </div>
    </div>
  );
}
