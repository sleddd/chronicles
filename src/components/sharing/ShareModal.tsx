'use client';

import { useState, useEffect } from 'react';
import { useAccentColor } from '@/lib/hooks/useAccentColor';

interface ShareModalProps {
  entryId: string;
  plaintextContent: string; // Decrypted content from parent
  onClose: () => void;
}

interface ShareData {
  shareUrl: string | null;
  activeShare: {
    id: string;
    shareToken: string;
    expiresAt: string | null;
    viewCount: number;
    createdAt: string;
  } | null;
}

export function ShareModal({ entryId, plaintextContent, onClose }: ShareModalProps) {
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [confirmed, setConfirmed] = useState(false);
  const { accentColor, hoverColor, lightBgColor } = useAccentColor();

  // Build full URL from relative path if needed
  const getFullUrl = (url: string | null): string => {
    if (!url) return '';
    // If URL is already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Build full URL using window.location.origin
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${url}`;
    }
    return url;
  };

  useEffect(() => {
    fetchShareStatus();
  }, [entryId]);

  const fetchShareStatus = async () => {
    try {
      const response = await fetch(`/api/entries/${entryId}/share`);
      if (response.ok) {
        const data = await response.json();
        setShareData(data);
      }
    } catch (error) {
      console.error('Failed to fetch share status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShare = async () => {
    if (!confirmed) return;

    setCreating(true);
    try {
      const response = await fetch(`/api/entries/${entryId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresInDays,
          plaintextContent, // Send decrypted content
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShareData({
          shareUrl: data.shareUrl,
          activeShare: data.share,
        });
      }
    } catch (error) {
      console.error('Failed to create share:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!confirm('Are you sure you want to revoke this share link? The entry content will be removed from the database and the link will stop working.')) {
      return;
    }

    setRevoking(true);
    try {
      const response = await fetch(`/api/entries/${entryId}/share`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShareData({ shareUrl: null, activeShare: null });
        setConfirmed(false);
      }
    } catch (error) {
      console.error('Failed to revoke share:', error);
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareData?.shareUrl) return;

    try {
      await navigator.clipboard.writeText(getFullUrl(shareData.shareUrl));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="backdrop-blur-sm bg-white/30 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Share Entry</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : shareData?.activeShare ? (
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: lightBgColor, borderColor: accentColor, borderWidth: 1 }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: hoverColor }}>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">Share link active</span>
                </div>
                <div className="text-sm" style={{ color: accentColor }}>
                  {shareData.activeShare.viewCount} view
                  {shareData.activeShare.viewCount !== 1 ? 's' : ''}
                  {shareData.activeShare.expiresAt && (
                    <>
                      {' '}
                      &middot; Expires{' '}
                      {formatDate(shareData.activeShare.expiresAt)}
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={getFullUrl(shareData.shareUrl)}
                  readOnly
                  className="flex-1 px-3 py-2 backdrop-blur-sm bg-white/30 border border-border rounded-md text-sm text-gray-600"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  style={copied ? { backgroundColor: lightBgColor, color: hoverColor } : { backgroundColor: accentColor, color: 'white' }}
                  onMouseOver={(e) => { if (!copied) e.currentTarget.style.backgroundColor = hoverColor; }}
                  onMouseOut={(e) => { if (!copied) e.currentTarget.style.backgroundColor = accentColor; }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Public Link:</strong> Anyone with this link can view
                this entry without logging in. The content is stored as
                plain text and is publicly accessible.
              </div>

              <button
                onClick={handleRevokeShare}
                disabled={revoking}
                className="w-full py-2 text-red-600 hover:bg-red-50 rounded-md text-sm disabled:opacity-50"
              >
                {revoking ? 'Revoking...' : 'Revoke Share Link'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Warning box */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-red-800">
                      Privacy Warning
                    </h3>
                    <p className="text-sm text-red-700 mt-1">
                      Sharing this entry will make it <strong>publicly viewable</strong>.
                      The content will be stored as plain text in the database and
                      anyone with the link can view it without needing your password.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link expires in
                </label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 "
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>

              {/* Confirmation checkbox */}
              <label className="flex items-start gap-3 p-3 backdrop-blur-sm bg-white/30 rounded-lg cursor-pointer hover:backdrop-blur-sm bg-white/40">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-border text-gray-600 "
                />
                <span className="text-sm text-gray-700">
                  I understand that this entry will be publicly visible to anyone
                  with the link and stored as unencrypted text.
                </span>
              </label>

              <button
                onClick={handleCreateShare}
                disabled={creating || !confirmed}
                className="w-full py-2 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: (creating || !confirmed) ? undefined : accentColor }}
                onMouseOver={(e) => { if (!creating && confirmed) e.currentTarget.style.backgroundColor = hoverColor; }}
                onMouseOut={(e) => { if (!creating && confirmed) e.currentTarget.style.backgroundColor = accentColor; }}
              >
                {creating ? 'Creating...' : 'Create Public Share Link'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
