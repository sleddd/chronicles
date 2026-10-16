import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--paper-surface, ${({ theme }) => theme.colors.surface});
  border: 1px solid var(--rule, ${({ theme }) => theme.colors.border});
  border-radius: var(--r-md, ${({ theme }) => theme.borderRadius.md}px);
  padding: 8px 12px;
  transition: border-color 150ms ease, box-shadow 150ms ease;

  &:focus-within {
    border-color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
    box-shadow: var(--focus, 0 0 0 2px rgba(78,110,126,0.28));
  }
`;

const SearchIcon = styled.span`
  color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
  font-size: 13px;
  flex-shrink: 0;
`;

const Input = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--sans, ${({ theme }) => theme.fontFamily.sans});
  font-size: 14px;
  color: var(--ink, ${({ theme }) => theme.colors.text});

  &::placeholder {
    color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
    font-style: italic;
  }
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
  border-radius: var(--r-sm, ${({ theme }) => theme.borderRadius.sm}px);
  transition: color 120ms ease;
  &:hover { color: var(--ink, ${({ theme }) => theme.colors.text}); }
`;

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', debounceMs = 200 }: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (val: string) => {
    setLocal(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(val), debounceMs);
  };

  return (
    <Wrapper>
      <SearchIcon aria-hidden="true"><Icon name="search" size={13} strokeWidth={2} /></SearchIcon>
      <Input
        type="text"
        value={local}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search entries"
      />
      {local && (
        <ClearButton onClick={() => { setLocal(''); onChange(''); }} aria-label="Clear search">
          <Icon name="x" size={12} strokeWidth={2} />
        </ClearButton>
      )}
    </Wrapper>
  );
}
