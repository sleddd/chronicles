import styled from 'styled-components';
import DOMPurify from 'dompurify';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Spinner } from '../atoms/Spinner.js';

const Card = styled.div`
  width: 100%;
  max-width: 680px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid var(--rule, ${({ theme }) => theme.colors.border});
  border-left: 3px solid var(--accent, ${({ theme }) => theme.colors.accent});
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
`;

const Header = styled.div`
  padding: var(--s-4, 16px) var(--s-6, 24px);
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  gap: var(--s-3, 12px);
`;

const AppName = styled.span`
  font-size: 17px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  letter-spacing: -0.02em;
`;

const SharedBadge = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-left: auto;
`;

const Body = styled.div`
  padding: calc(var(--s-6, 24px) + 4px) var(--s-7, 32px);
  font-size: 17px;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.text};

  h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; }
  h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
  blockquote {
    border-left: 3px solid ${({ theme }) => theme.colors.border};
    padding-left: 1em;
    color: ${({ theme }) => theme.colors.textSecondary};
    margin: 0.5em 0;
  }
  code {
    background: rgba(0,0,0,0.05);
    padding: var(--s-1, 4px) var(--s-2, 8px);
    border-radius: var(--r-md, 1px);
    font-size: 0.9em;
  }
  pre {
    background: rgba(0,0,0,0.05);
    padding: var(--s-3, 12px);
    border-radius: var(--r-lg, 2px);
    code { background: none; padding: 0; }
  }
  p { margin: 0 0 0.75em; }
  p:last-child { margin-bottom: 0; }
`;

const Footer = styled.div`
  padding: var(--s-3, 12px) var(--s-6, 24px);
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  align-items: center;
  gap: var(--s-2, 8px);
`;

const StatusMessage = styled.div<{ $error?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  color: ${({ $error, theme }) => $error ? theme.colors.danger : theme.colors.textMuted};
  font-size: 17px;
  text-align: center;
`;

interface SharedEntryCardProps {
  status: 'loading' | 'error' | 'done';
  errorMsg?: string;
  content?: string | null;
  createdAt?: string | null;
}

export function SharedEntryCard({ status, errorMsg, content, createdAt }: SharedEntryCardProps) {
  return (
    <Card>
      <Header>
        <AppName>Chronicles</AppName>
        <SharedBadge>Shared entry</SharedBadge>
      </Header>

      {status === 'loading' && (
        <StatusMessage>
          <Spinner size={32} />
          Decrypting entry…
        </StatusMessage>
      )}

      {status === 'error' && (
        <StatusMessage $error>
          <MaterialIcon $size={32} aria-hidden="true">error</MaterialIcon>
          {errorMsg}
        </StatusMessage>
      )}

      {status === 'done' && content != null && (
        <>
          <Body dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr'], ALLOWED_ATTR: [] }) }} />
          <Footer>
            {createdAt && <>Originally written {new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</>}
          </Footer>
        </>
      )}
    </Card>
  );
}
