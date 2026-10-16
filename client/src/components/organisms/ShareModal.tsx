import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { Icon } from '../atoms/core/Icon.jsx';
import { Modal } from '../atoms/Modal.js';
import { shares as sharesApi, type ShareRecord } from '../../services/api.js';

function buildShareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

// =============================================================================
// Styled components
// =============================================================================

const UrlRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
`;

const UrlInput = styled.input`
  flex: 1;
  padding: 8px 10px;
  font-size: 15px;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  outline: none;
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CopyBtn = styled.button<{ $copied?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  background: ${({ $copied, theme }) => $copied ? theme.colors.success : theme.colors.accent};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
  flex-shrink: 0;
`;

const CreateBtn = styled.button`
  width: 100%;
  padding: 10px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  background: ${({ theme }) => theme.colors.accent};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  cursor: pointer;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.accentHover}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Notice = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin: 8px 0 0;
  line-height: 1.5;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.border};
  margin: 16px 0;
`;

const SharesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ShareItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 15px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid var(--accent-stroke, ${({ theme }) => theme.colors.border});
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const ShareMeta = styled.span`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const RevokeBtn = styled.button`
  color: ${({ theme }) => theme.colors.danger};
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 15px;
  transition: opacity 0.15s;
  &:hover { opacity: 0.7; }
`;

const SectionLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 8px;
`;

const ErrorText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.danger};
  margin: 8px 0 0;
`;

// =============================================================================
// Component
// =============================================================================

interface ShareModalProps {
  entryId: number;
  entryContent: string; // plaintext (already decrypted) — stored as-is on the server; sharing opts this entry out of zero-knowledge
  onClose: () => void;
}

export function ShareModal({ entryId, entryContent, onClose }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingShares, setExistingShares] = useState<ShareRecord[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);

  useEffect(() => {
    sharesApi.list()
      .then(all => setExistingShares(all.filter(s => s.entryId === entryId)))
      .catch(() => {})
      .finally(() => setLoadingShares(false));
  }, [entryId]);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const share = await sharesApi.create({ content: entryContent, entryId });
      setShareUrl(buildShareUrl(share.token));
      setExistingShares(prev => [share, ...prev]);
    } catch {
      setError('Failed to create share link. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [entryContent, entryId]);

  const handleCopy = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleRevoke = useCallback(async (token: string) => {
    try {
      await sharesApi.revoke(token);
      setExistingShares(prev => prev.filter(s => s.token !== token));
      if (shareUrl?.includes(token)) setShareUrl(null);
    } catch {
      setError('Failed to revoke share.');
    }
  }, [shareUrl]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Share Entry"
    >
      {/* New share */}
      <SectionLabel>Create share link</SectionLabel>
      <Notice>
        Anyone with the link can read this entry. A shared copy is stored unencrypted on the server until you revoke the link.
      </Notice>

      {shareUrl ? (
        <UrlRow>
          <UrlInput readOnly value={shareUrl} onClick={e => (e.target as HTMLInputElement).select()} />
          <CopyBtn $copied={copied} onClick={handleCopy} aria-label={copied ? 'Link copied' : 'Copy share link'}>
            <Icon name={copied ? 'check' : 'repeat'} size={14} strokeWidth={2} />
            {copied ? 'Copied!' : 'Copy'}
          </CopyBtn>
        </UrlRow>
      ) : (
        <CreateBtn onClick={handleCreate} disabled={isCreating}>
          {isCreating
            ? <><FontAwesomeIcon icon={faSpinner} spin /> Generating link…</>
            : <><Icon name="repeat" size={14} strokeWidth={2} /> Create share link</>}
        </CreateBtn>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      {/* Existing links for this entry only */}
      {!loadingShares && existingShares.length > 0 && (
        <>
          <Divider />
          <SectionLabel>Active links for this entry ({existingShares.length})</SectionLabel>
          <SharesList>
            {existingShares.map(s => (
              <ShareItem key={s.token}>
                <Icon name="repeat" size={11} strokeWidth={2} />
                <ShareMeta>
                  Created {new Date(s.createdAt).toLocaleDateString()}
                  {s.expiresAt && ` · Expires ${new Date(s.expiresAt).toLocaleDateString()}`}
                </ShareMeta>
                <RevokeBtn onClick={() => handleRevoke(s.token)} aria-label="Revoke share link">
                  <Icon name="trash" size={14} strokeWidth={2} />
                </RevokeBtn>
              </ShareItem>
            ))}
          </SharesList>
        </>
      )}
    </Modal>
  );
}
