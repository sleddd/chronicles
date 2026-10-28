import { useState, type CSSProperties } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Section, SectionHead, SectionLabel, BoxInput } from './formKit.js';
import { TickMark } from '../../atoms/TickMark.js';

export interface CheckItem { id: string; text: string; done: boolean }

/* A checklist with no limit on its length (Priorities, a task's todo list):
   one row per item — a round tick circle, the text edited in place, × to
   remove — then an outlined "+ Add a …" box (Enter adds), with "N of M left"
   by the label. Props only. */

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const Item = styled.div<{ $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  & + & { border-top: 1px solid var(--border-subtle); }
  input { text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')}; opacity: ${({ $done }) => ($done ? 0.6 : 1)}; }
`;

const Tick = styled.button<{ $done: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 50%; }
`;

const ItemInput = styled.input`
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
  }
  &::placeholder { color: var(--text-hint); }
`;

const Remove = styled.button`
  flex: none;
  display: inline-flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--color-danger); }
`;

const AddBox = styled(BoxInput)`
  margin-top: 12px;
`;

interface ChecklistSectionProps {
  /** Section label, e.g. "Priorities" */
  label: string;
  /** One item, lower case, e.g. "priority" — used in placeholders and labels */
  noun: string;
  items: CheckItem[];
  onChange: (items: CheckItem[]) => void;
  style?: CSSProperties;
}

export function ChecklistSection({ label, noun, items, onChange, style }: ChecklistSectionProps) {
  const [draft, setDraft] = useState('');
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const update = (id: string, patch: Partial<CheckItem>) =>
    onChange(items.map(p => p.id === id ? { ...p, ...patch } : p));
  const remove = (id: string) => onChange(items.filter(p => p.id !== id));
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: crypto.randomUUID(), text, done: false }]);
    setDraft('');
  };

  const left = items.filter(p => !p.done).length;

  return (
    <Section aria-label={label} style={style}>
      <SectionHead>
        <SectionLabel>{label}</SectionLabel>
        {items.length > 0 && <Count>{left} of {items.length} left</Count>}
      </SectionHead>
      {items.map((p, i) => (
        <Item key={p.id} $done={p.done}>
          <Tick type="button" $done={p.done} aria-pressed={p.done} aria-label={p.done ? `Mark ${noun} ${i + 1} not done` : `Mark ${noun} ${i + 1} done`}
            onClick={() => update(p.id, { done: !p.done })}>
            <TickMark checked={p.done} />
          </Tick>
          <ItemInput value={p.text} placeholder={`${Noun} ${i + 1}`} aria-label={`${Noun} ${i + 1}`}
            onChange={e => update(p.id, { text: e.target.value })} />
          <Remove type="button" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => remove(p.id)}>
            <Icon name="x" size={14} strokeWidth={2} />
          </Remove>
        </Item>
      ))}
      <AddBox value={draft} placeholder={`+ Add a ${noun}`} aria-label={`Add a ${noun}`}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add} />
    </Section>
  );
}
