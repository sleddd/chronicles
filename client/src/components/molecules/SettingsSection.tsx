import styled from 'styled-components';

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
`;

/* The page's name — hidden on phones and tablets, where the top bar shows it (GlobalStyle) */
export const Title = styled.h1.attrs({ className: 'view-title' })`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
`;

export const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 15px;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.text};
  margin: 56px 0 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
`;

export const SectionDescription = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: 12px;
`;

export const DangerTitle = styled.h2`
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.textMuted};
  margin: 56px 0 12px;
`;

export const CollapsibleHeader = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 16px;
  background: var(--paper-surface);
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  cursor: pointer;
  text-align: left;
`;

export const CollapsibleTitle = styled.div`
  font-size: 16px;
  font-weight: 400;
  font-style: italic;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 14px;
`;

export const CollapsibleDesc = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

export const CollapsibleBody = styled.div`
  padding: 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-top: none;
  border-radius: 0 0 ${({ theme }) => theme.borderRadius.xl}px ${({ theme }) => theme.borderRadius.xl}px;
  background: var(--paper-surface);
  font-size: 16px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const PrivacyCard = styled.div`
  padding: 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  background: var(--paper-surface);
  font-size: 16px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.text};
`;

export const DangerCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  background: var(--paper-surface);
  overflow: hidden;
  padding: 0 16px;
`;

export const PasswordForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
`;

export const SessionsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 0 16px;
`;

export const SessionItem = styled.div`
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child { border-bottom: none; }
`;

export const ColorSection = styled.div`
  padding: 16px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

export const ColorSectionTitle = styled.div`
  font-size: 17px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`;

export const ColorSectionDesc = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: 12px;
`;
