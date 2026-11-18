import styled from 'styled-components';
import { glassControl } from '../../styles/wallpaper.js';
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
  ${glassControl}
  /* Light, on the photo: smoked glass like the page's buttons and the section tabs — a dark
     see-through fill with a blur, white text */
  html[data-wallpaper][data-theme='light'] & {
    background: rgba(18, 20, 26, 0.5);
    border-color: transparent;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    --text-primary: #fff;
    --text-secondary: rgba(255, 255, 255, 0.9);
    --text-muted: rgba(255, 255, 255, 0.78);
    --text-hint: rgba(255, 255, 255, 0.72);
    --text-placeholder: rgba(255, 255, 255, 0.72);
    --border-subtle: rgba(255, 255, 255, 0.18);
    --border-card: rgba(255, 255, 255, 0.18);
    --bg-tab-active: rgba(255, 255, 255, 0.16);
    color: #fff;
    & input, & select { color: #fff; }
    & input::placeholder { color: rgba(255, 255, 255, 0.72); }
  }
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
