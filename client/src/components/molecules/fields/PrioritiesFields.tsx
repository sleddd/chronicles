import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { FormWrap, Section, SectionHead, SectionLabel, BoxInput } from './formKit.js';
import { TickMark } from '../../atoms/TickMark.js';

export interface PriorityItem { id: string; text: string; done: boolean; }
export interface PrioritiesFieldValues { priorities: PriorityItem[]; }

/* Priorities fields (journal editor): up to five rows — a round tick circle,
   the priority edited in place, × to remove — then an outlined "+ Add a
   priority" box (Enter adds). Same look as the shopping list items. Props only. */

const MAX = 5;

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

interface Props {
  values: PrioritiesFieldValues;
  onChange: (v: PrioritiesFieldValues) => void;
  /** Kept for existing callers; the tick uses the accent token */
  accentColor?: string;
}

export function PrioritiesFields({ values, onChange }: Props) {
  const { priorities } = values;
  const [draft, setDraft] = useState('');

  const update = (id: string, patch: Partial<PriorityItem>) =>
    onChange({ priorities: priorities.map(p => p.id === id ? { ...p, ...patch } : p) });
  const remove = (id: string) => onChange({ priorities: priorities.filter(p => p.id !== id) });
  const add = () => {
    const text = draft.trim();
    if (!text || priorities.length >= MAX) return;
    onChange({ priorities: [...priorities, { id: Date.now().toString(), text, done: false }] });
    setDraft('');
  };

  const left = priorities.filter(p => !p.done).length;

  return (
    <FormWrap>
      <Section aria-label="Priorities">
        <SectionHead>
          <SectionLabel>Priorities</SectionLabel>
          {priorities.length > 0 && <Count>{left} of {priorities.length} left</Count>}
        </SectionHead>
        {priorities.map((p, i) => (
          <Item key={p.id} $done={p.done}>
            <Tick type="button" $done={p.done} aria-pressed={p.done} aria-label={p.done ? `Mark priority ${i + 1} not done` : `Mark priority ${i + 1} done`}
              onClick={() => update(p.id, { done: !p.done })}>
              <TickMark checked={p.done} />
            </Tick>
            <ItemInput value={p.text} placeholder={`Priority ${i + 1}`} aria-label={`Priority ${i + 1}`}
              onChange={e => update(p.id, { text: e.target.value })} />
            <Remove type="button" aria-label={`Remove priority ${i + 1}`} onClick={() => remove(p.id)}>
              <Icon name="x" size={14} strokeWidth={2} />
            </Remove>
          </Item>
        ))}
        {priorities.length < MAX && (
          <AddBox value={draft} placeholder="+ Add a priority" aria-label="Add a priority"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            onBlur={add} />
        )}
      </Section>
    </FormWrap>
  );
}
