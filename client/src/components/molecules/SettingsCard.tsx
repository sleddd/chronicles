import styled from 'styled-components';
import type { ReactNode } from 'react';
import { filledInputs } from '../../styles/filledInputs.js';

/* Settings inputs use the same filled boxes as every other form */
const Card = styled.div`
  background: transparent;
  overflow: hidden;
  padding: 0;
  ${filledInputs}
`;

const Row = styled.div<{ $noBorder?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: ${({ $noBorder, theme }) => $noBorder ? 'none' : `1px solid ${theme.colors.border}`};
  gap: 16px;

  &:last-child {
    border-bottom: none;
  }
`;

const RowContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const RowTitle = styled.div`
  font-size: 16px;
  font-weight: 400;
  font-style: italic;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 14px;
`;

const RowDescription = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const RowAction = styled.div`
  flex-shrink: 0;
`;

interface SettingsRowProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  noBorder?: boolean;
}

function SettingsRow({ title, description, action, children, noBorder }: SettingsRowProps) {
  return (
    <Row $noBorder={noBorder}>
      <RowContent>
        <RowTitle>{title}</RowTitle>
        {description && <RowDescription>{description}</RowDescription>}
        {children}
      </RowContent>
      {action && <RowAction>{action}</RowAction>}
    </Row>
  );
}

export { Card as SettingsCard, SettingsRow };
