import styled from 'styled-components';
import { passwordStrength } from '@chronicles/shared';

/* Under a new-password field: four short rules filling up as the password gets
   harder to guess (red → amber → accent), the word for it on the right, and
   the most useful tip under them. Nothing shows until something is typed.
   Worked out in the browser (passwordStrength); the password never leaves it. Props only. */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
`;

const Top = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Bars = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
`;

const Bar = styled.i<{ $on: boolean; $tone: string }>`
  height: 4px;
  border-radius: 2px;
  background: ${({ $on, $tone }) => ($on ? $tone : 'var(--progress-track, var(--border-subtle))')};
  transition: background 150ms ease;
`;

const Word = styled.span<{ $tone: string }>`
  flex: none;
  min-width: 64px;
  text-align: right;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: ${({ $tone }) => $tone};
`;

const Tip = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const TONES = ['var(--color-danger)', 'var(--color-danger)', 'var(--chart-amber)', 'var(--color-accent-fill)', 'var(--color-accent-fill)'];
const WORD_TONES = ['var(--color-danger)', 'var(--color-danger)', 'var(--chart-amber)', 'var(--color-accent-link)', 'var(--color-accent-link)'];

export function PasswordStrengthMeter({ password, email, username }: { password: string; email?: string; username?: string }) {
  if (!password) return null;
  const s = passwordStrength(password, { email, username });
  const filled = Math.max(1, s.score);
  return (
    <Wrap role="status" aria-label={`Password strength: ${s.label}`}>
      <Top>
        <Bars aria-hidden="true">
          {[1, 2, 3, 4].map(n => <Bar key={n} $on={n <= filled} $tone={TONES[s.score]} />)}
        </Bars>
        <Word $tone={WORD_TONES[s.score]}>{s.label}</Word>
      </Top>
      {s.tip && s.score < 4 && <Tip>{s.tip}</Tip>}
    </Wrap>
  );
}
