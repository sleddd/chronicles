import styled from 'styled-components';
import { Checkbox } from '../atoms/Checkbox.js';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
`;

const Hint = styled.p`
  margin: 0 0 0 28px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-tertiary);
`;

interface TrustBrowserProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * "Don't ask for a code on this browser for 30 days" — on the 2FA code screen.
 * It skips the code only: the password is asked every time, and nothing that
 * opens the journal is stored.
 */
export function TrustBrowser({ checked, onChange }: TrustBrowserProps) {
  return (
    <Wrap>
      <Checkbox checked={checked} onChange={onChange} label="Don’t ask for a code on this browser for 30 days" />
      {checked && (
        <Hint>
          You’ll still enter your password every time. Don’t use this on a shared or public computer.
        </Hint>
      )}
    </Wrap>
  );
}
