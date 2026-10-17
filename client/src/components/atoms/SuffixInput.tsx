import styled from 'styled-components';
import { TextInput } from './TextInput.js';

/* A text input with its unit inside the box on the right ("0.5   mg"). */
const Wrap = styled.div`
  position: relative;
  input { padding-right: 44px !important; }
  /* No browser spinners — they cover the unit */
  input[type='number'] { -moz-appearance: textfield; appearance: textfield; }
  input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
`;

const Suffix = styled.span`
  position: absolute;
  right: 16px;
  top: 24px; /* centre of the 48px box, even when a hint sits below */
  transform: translateY(-50%);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  pointer-events: none;
`;

type SuffixInputProps = Parameters<typeof TextInput>[0] & { suffix?: string };

export function SuffixInput({ suffix, ...props }: SuffixInputProps) {
  return (
    <Wrap>
      <TextInput {...props} />
      {suffix && <Suffix aria-hidden="true">{suffix}</Suffix>}
    </Wrap>
  );
}
