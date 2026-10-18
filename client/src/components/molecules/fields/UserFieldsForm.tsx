import { useId } from 'react';
import styled from 'styled-components';
import type { UserFieldDef } from '../../../types/userFields.js';
import { Toggle } from '../../atoms/Toggle.js';
import { FormWrap, Section, SectionHead, SectionLabel, TitleInput, BoxInput, BoxText } from './formKit.js';

/* A topic's user-defined custom fields, in the same outlined style as the
   built-in field forms: a leading Title / Name field becomes the big borderless
   title; long-text fields (quote, notes, review, description, thoughts, lyrics)
   get an outlined multi-line box; others an outlined one-line box with a
   sentence-case label above; URLs show "https://" inside the box; yes/no fields
   are a row with a switch. Props only. */

const TITLE_LABEL = /^(title|name|book|song|track|album|artist name)$/i;
const LONG_LABEL = /quote|note|review|description|thought|lyric|summary|comment|excerpt/i;

/* Outlined box with a muted prefix ("https://") before a bare input */
const Adorned = styled.label`
  display: flex;
  align-items: center;
  gap: 2px;
  height: 48px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-muted);
  cursor: text;
  &:focus-within { border-color: var(--color-accent); }
`;

const BareInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
  &::placeholder { color: var(--text-hint); }
`;

/* Yes/no: label on the left, switch on the right, in an outlined row */
const SwitchRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 0 18px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
`;

const DateBox = styled(BoxInput)`
  &&&&& { max-width: 260px; color-scheme: light dark; }
`;

const QuoteBox = styled(BoxText)`
  && { font-style: italic; font-size: 18px; }
`;

interface UserFieldsFormProps {
  fieldDefs: UserFieldDef[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function UserFieldsForm({ fieldDefs, values, onChange }: UserFieldsFormProps) {
  const set = (id: string, value: unknown) => onChange({ ...values, [id]: value });
  const baseId = useId();
  const str = (v: unknown) => (typeof v === 'string' ? v : v != null ? String(v) : '');

  return (
    <FormWrap>
      {fieldDefs.map((f, i) => {
        const val = values[f.id];
        const id = `${baseId}-${f.id}`;
        const label = f.label.charAt(0).toUpperCase() + f.label.slice(1);

        // The first field, when it names the entry, is the big title
        if (i === 0 && f.type === 'text' && TITLE_LABEL.test(f.label.trim())) {
          return (
            <TitleInput key={f.id} value={str(val)} placeholder={label} aria-label={label}
              onChange={e => set(f.id, e.target.value)} style={{ marginBottom: 24 }} />
          );
        }

        if (f.type === 'boolean') {
          return (
            <Section key={f.id}>
              <SwitchRow>
                <span>{label}</span>
                <Toggle checked={!!val} aria-label={label} onChange={v => set(f.id, v)} />
              </SwitchRow>
            </Section>
          );
        }

        let control;
        if (f.type === 'number') {
          control = (
            <BoxInput id={id} inputMode="decimal" value={str(val)} placeholder="0"
              onChange={e => {
                const raw = e.target.value.replace(/[^\d.-]/g, '');
                set(f.id, raw === '' ? '' : Number.isNaN(Number(raw)) ? raw : Number(raw));
              }} />
          );
        } else if (f.type === 'date') {
          control = <DateBox id={id} type="date" value={str(val)} onChange={e => set(f.id, e.target.value)} />;
        } else if (f.type === 'url') {
          control = (
            <Adorned>
              https://
              <BareInput id={id} type="url" value={str(val).replace(/^https?:\/\//, '')} placeholder="goodreads.com/book/show/…"
                onChange={e => set(f.id, e.target.value)} />
            </Adorned>
          );
        } else if (LONG_LABEL.test(f.label)) {
          const Box = /quote|excerpt|lyric/i.test(f.label) ? QuoteBox : BoxText;
          control = <Box id={id} value={str(val)} placeholder={`Add ${f.label.toLowerCase()}…`} onChange={e => set(f.id, e.target.value)} />;
        } else {
          control = <BoxInput id={id} value={str(val)} placeholder={`Add ${f.label.toLowerCase()}…`} onChange={e => set(f.id, e.target.value)} />;
        }

        return (
          <Section key={f.id}>
            <SectionHead><SectionLabel as="label" htmlFor={id}>{label}</SectionLabel></SectionHead>
            {control}
          </Section>
        );
      })}
    </FormWrap>
  );
}
