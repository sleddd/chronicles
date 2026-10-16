import { useState, type InputHTMLAttributes } from 'react';
import styled from 'styled-components';
import { Input as DSInput } from '../../../../design-system/components/core/Input.jsx';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: boolean | string;
  label?: string;
  hint?: string;
}

const ToggleButton = styled.button`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;

  &:hover { color: var(--text-primary); }
`;

const Wrapper = styled.div`
  position: relative;
  width: 100%;

  /* Room for Show/Hide — !important beats the filled-input padding that
     form containers apply (styles/filledInputs) */
  input {
    padding-right: 64px !important;
  }
`;

export function PasswordInput({ error, label, hint, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const errorMessage = typeof error === 'string' ? error : error ? 'Error' : undefined;

  return (
    <Wrapper>
      <DSInput
        type={visible ? 'text' : 'password'}
        label={label}
        hint={hint}
        error={errorMessage}
        {...props}
      />
      <ToggleButton type="button" onClick={() => setVisible(!visible)}>
        {visible ? 'Hide' : 'Show'}
      </ToggleButton>
    </Wrapper>
  );
}
