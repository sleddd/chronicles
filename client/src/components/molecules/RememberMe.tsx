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

interface RememberMeProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** "Remember me" opt-in with an honest note on what it does. */
export function RememberMe({ checked, onChange }: RememberMeProps) {
  return (
    <Wrap>
      <Checkbox checked={checked} onChange={onChange} label="Remember me" />
      {checked && (
        <Hint>
          Stay unlocked across tabs and reloads until you close your browser (an hour idle or 12 hours at most).
          Don’t use this on a shared or public computer.
        </Hint>
      )}
    </Wrap>
  );
}
