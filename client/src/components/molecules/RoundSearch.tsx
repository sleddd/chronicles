import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';

/* A rounded outlined search box ("Search books", "Search topics") — a search
   icon and the input in one pill. Escape clears it. Props only. */

const Box = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 20px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  color: var(--text-muted);
  &:focus-within { border-color: var(--control-border); }
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-secondary);
  }
  input::placeholder { color: var(--text-hint); }
  input::-webkit-search-cancel-button { display: none; }
`;

interface RoundSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}

export function RoundSearch({ value, onChange, placeholder, ariaLabel, className }: RoundSearchProps) {
  return (
    <Box className={className}>
      <Icon name="search" size={16} strokeWidth={2} />
      <input type="search" aria-label={ariaLabel} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }} />
    </Box>
  );
}
