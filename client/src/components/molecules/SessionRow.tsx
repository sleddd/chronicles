import styled from 'styled-components';
import { Button } from '../atoms/Button.js';

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid var(--accent-stroke, ${({ theme }) => theme.colors.border});
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
`;

const Info = styled.div`
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.text};
`;

const Meta = styled.div`
  font-size: ${({ theme }) => theme.fontSize.xs}px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CurrentBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSize.xs}px;
  color: ${({ theme }) => theme.colors.success};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  margin-left: 6px;
`;

interface SessionRowProps {
  deviceInfo: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
  /** How this session signed in ("a passkey", "your password") */
  signedInWith?: string | null;
  onRevoke?: () => void;
}

/** What the server recorded when the session was made, in words */
export function signInMethodLabel(method: string | null | undefined): string | null {
  switch (method) {
    case 'passkey': return 'a passkey';
    case 'password': return 'your password';
    case 'trusted': return 'your password, on a trusted browser';
    case 'recovery': return 'your recovery key';
    default: return null;
  }
}

export function SessionRow({ deviceInfo, ipAddress, lastActiveAt, isCurrent, signedInWith, onRevoke }: SessionRowProps) {
  return (
    <Row>
      <div>
        <Info>
          {deviceInfo || 'Unknown device'}
          {isCurrent && <CurrentBadge>(Current)</CurrentBadge>}
        </Info>
        <Meta>
          {ipAddress || 'Unknown IP'} · Last active {new Date(lastActiveAt).toLocaleDateString()}
          {signedInWith ? ` · Signed in with ${signedInWith}` : ''}
        </Meta>
      </div>
      {!isCurrent && onRevoke && (
        <Button variant="danger" onClick={onRevoke}>Revoke</Button>
      )}
    </Row>
  );
}
