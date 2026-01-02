'use client';

import { useState, useEffect, use } from 'react';
import { format, parseISO } from 'date-fns';

interface SharedEntryData {
  entry: {
    content: string; // Plaintext HTML content
    entryDate: string;
  };
  share: {
    viewCount: number;
    expiresAt: string | null;
    createdAt: string;
  };
}

export default function SharedEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedEntryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSharedEntry();
  }, [token]);

  const fetchSharedEntry = async () => {
    try {
      const response = await fetch(`/api/share/${token}`);
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load shared entry');
        return;
      }
      const result = await response.json();
      setData(result);
    } catch {
      setError('Failed to load shared entry');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen backdrop-blur-sm bg-white/30 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen backdrop-blur-sm bg-white/30 flex items-center justify-center p-4">
        <div className="backdrop-blur-sm bg-white/30 rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-600"
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
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Unable to Load Entry
          </h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen backdrop-blur-sm bg-white/30 flex items-center justify-center">
        <div className="text-gray-500">Entry not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen backdrop-blur-sm bg-white/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="backdrop-blur-sm bg-white/30 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900">
              Shared Journal Entry
            </h1>
            <div className="text-sm text-gray-500">
              {data.share.viewCount} view{data.share.viewCount !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>
                Shared {format(parseISO(data.share.createdAt), 'MMMM d, yyyy')}
              </span>
            </div>
            {data.share.expiresAt && (
              <div className="flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  Expires {format(parseISO(data.share.expiresAt), 'MMM d, yyyy')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Entry content - now plaintext, no decryption needed */}
        <div className="backdrop-blur-sm bg-white/30 rounded-lg shadow-md p-6">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: data.entry.content }}
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Shared via{' '}
            <a href="/" className="hover:underline" style={{ color: '#1aaeae' }}>
              Chronicles
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
