import { useId, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import type { TrainingCategory, TrainingPhase, TrainingPlanFieldValues } from '../../../types/fields.js';
import { EXERCISE_TYPES } from '../../../utils/exerciseSummary.js';
import { mountaineeringTemplate } from '../../../utils/training.js';
import { tableColumnRules } from '../../../styles/columnRules.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel,
  BareDate, BoxInput, BoxText, FieldNote,
} from './formKit.js';

/* Training plan fields (journal editor): the plan's name as a big borderless
   title; Start / Event dates in a row box; Categories — each name edited in
   place with × and the activities that count toward it automatically as small
   chips; Phases as a spreadsheet — phase, weeks, then the hours for the whole
   phase in each category and its total — with "+ Add phase"; Notes; and an
   Active card. An empty plan offers the mountaineering template. Props only. */

const SHORT_ACTIVITY: Record<string, string> = { strength: 'Strength' };

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const TemplateCard = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  margin-top: 30px;
  padding: 16px 18px;
  border: 1px dashed var(--border-dashed);
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const LinkBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const CategoryList = styled.div`
  border: 1px solid var(--border-card);
  border-radius: 10px;
  margin-bottom: 12px;
`;

const CategoryRow = styled.div`
  padding: 12px 8px 14px 16px;
  & + & { border-top: 1px solid var(--border-card); }
  .top { display: flex; align-items: center; gap: 10px; }
  .counts { margin: 10px 0 0; font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
`;

const SmallChip = styled(Chip)`
  height: 26px;
  padding: 0 10px;
  font-size: 13px;
`;

const InPlace = styled.input`
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

/* Phases × categories, scrolling sideways when it doesn't fit */
const SheetWrap = styled.div`
  overflow-x: auto;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const Sheet = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 14px;
  th, td { padding: 10px 12px; text-align: left; vertical-align: middle; }
  th {
    font-weight: 400;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-card);
    white-space: nowrap;
  }
  tbody tr + tr td { border-top: 1px solid var(--border-subtle); }
  ${tableColumnRules}
  .num { width: 76px; text-align: right; }
  .total { color: var(--text-muted); white-space: nowrap; }
  td input { text-align: inherit; }
  td.num input { text-align: right; }
`;

const StatusCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 30px;
  padding: 16px 18px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  .title { font-family: var(--font-sans); font-size: 16px; color: var(--text-secondary); }
  .note { margin-top: 4px; font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

interface TrainingPlanFieldsProps {
  values: TrainingPlanFieldValues;
  onChange: (values: TrainingPlanFieldValues) => void;
}

export function TrainingPlanFields({ values, onChange }: TrainingPlanFieldsProps) {
  const set = (patch: Partial<TrainingPlanFieldValues>) => onChange({ ...values, ...patch });
  const categories = values.categories ?? [];
  const phases = values.phases ?? [];
  const [draft, setDraft] = useState('');
  const startId = useId();
  const eventId = useId();
  const notesId = useId();

  const setCategory = (id: string, patch: Partial<TrainingCategory>) =>
    set({ categories: categories.map(c => (c.id === id ? { ...c, ...patch } : c)) });
  const addCategory = () => {
    const name = draft.trim();
    if (!name) return;
    set({ categories: [...categories, { id: crypto.randomUUID(), name, exerciseTypes: [] }] });
    setDraft('');
  };
  const toggleActivity = (c: TrainingCategory, type: string) => {
    const has = c.exerciseTypes?.includes(type);
    // An activity counts toward one category only
    set({
      categories: categories.map(x => {
        const types = (x.exerciseTypes ?? []).filter(t => t !== type);
        return x.id === c.id ? { ...x, exerciseTypes: has ? types : [...types, type] } : { ...x, exerciseTypes: types };
      }),
    });
  };
  const setPhase = (id: string, patch: Partial<TrainingPhase>) =>
    set({ phases: phases.map(p => (p.id === id ? { ...p, ...patch } : p)) });
  const addPhase = () =>
    set({ phases: [...phases, { id: crypto.randomUUID(), name: `Phase ${phases.length + 1}`, weeks: '6', targets: {} }] });
  const phaseTotal = (p: TrainingPhase) =>
    categories.reduce((t, c) => t + (parseFloat(p.targets?.[c.id] ?? '') || 0), 0);
  const applyTemplate = () => set({ ...mountaineeringTemplate() });

  return (
    <FormWrap>
      <div>
        <TitleInput value={values.planName ?? ''} onChange={e => set({ planName: e.target.value })}
          placeholder="e.g. Mt Hood" aria-label="Plan name" />
      </div>

      {categories.length === 0 && phases.length === 0 && (
        <TemplateCard>
          <span>Start from the mountaineering template, with five categories and four phases.</span>
          <LinkBtn type="button" onClick={applyTemplate}>Use template</LinkBtn>
        </TemplateCard>
      )}

      <RowBox style={{ marginTop: 30 }}>
        <LabelledRow>
          <RowLabel as="label" htmlFor={startId}>Starts</RowLabel>
          <BareDate id={startId} type="date" value={values.startDate ?? ''} onChange={e => set({ startDate: e.target.value })} />
        </LabelledRow>
        <LabelledRow>
          <RowLabel as="label" htmlFor={eventId}>Event date</RowLabel>
          <BareDate id={eventId} type="date" value={values.eventDate ?? ''} onChange={e => set({ eventDate: e.target.value })} />
        </LabelledRow>
      </RowBox>

      <Section aria-label="Categories" style={{ marginTop: 30 }}>
        <SectionHead>
          <SectionLabel>Categories</SectionLabel>
          <Count>{categories.length || 'None yet'}</Count>
        </SectionHead>
        {categories.length > 0 && (
          <CategoryList>
            {categories.map((c, i) => (
              <CategoryRow key={c.id}>
                <div className="top">
                  <InPlace value={c.name} placeholder={`Category ${i + 1}`} aria-label={`Category ${i + 1}`}
                    onChange={e => setCategory(c.id, { name: e.target.value })} />
                  <Remove type="button" aria-label={`Remove ${c.name || `category ${i + 1}`}`}
                    onClick={() => set({ categories: categories.filter(x => x.id !== c.id) })}>
                    <Icon name="x" size={14} strokeWidth={2} />
                  </Remove>
                </div>
                <p className="counts">Counts automatically</p>
                <Chips style={{ marginTop: 8 }} aria-label={`Activities counted as ${c.name}`}>
                  {EXERCISE_TYPES.map(t => {
                    const on = !!c.exerciseTypes?.includes(t.value);
                    return (
                      <SmallChip key={t.value} type="button" $active={on} aria-pressed={on} onClick={() => toggleActivity(c, t.value)}>
                        {SHORT_ACTIVITY[t.value] ?? t.label}
                      </SmallChip>
                    );
                  })}
                </Chips>
              </CategoryRow>
            ))}
          </CategoryList>
        )}
        <BoxInput value={draft} placeholder="+ Add a category" aria-label="Add a category"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          onBlur={addCategory} />
        <FieldNote>A session counts toward the category it names, else the one its activity is ticked under.</FieldNote>
      </Section>

      <Section aria-label="Phases">
        <SectionHead>
          <SectionLabel>Phases</SectionLabel>
          <LinkBtn type="button" onClick={addPhase}>+ Add phase</LinkBtn>
        </SectionHead>
        {phases.length > 0 && (
          <SheetWrap>
            <Sheet>
              <thead>
                <tr>
                  <th>Phase</th>
                  <th className="num">Weeks</th>
                  {categories.map(c => <th key={c.id} className="num" title={c.name}>{c.name || '—'} h</th>)}
                  <th className="num">Total</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {phases.map((p, i) => (
                  <tr key={p.id}>
                    <td><InPlace value={p.name} aria-label={`Phase ${i + 1} name`} onChange={e => setPhase(p.id, { name: e.target.value })} /></td>
                    <td className="num">
                      <InPlace inputMode="numeric" value={p.weeks} placeholder="6" aria-label={`${p.name} weeks`}
                        onChange={e => setPhase(p.id, { weeks: e.target.value.replace(/[^\d]/g, '') })} />
                    </td>
                    {categories.map(c => (
                      <td key={c.id} className="num">
                        <InPlace inputMode="decimal" value={p.targets?.[c.id] ?? ''} placeholder="—"
                          aria-label={`${p.name} ${c.name} hours`}
                          onChange={e => setPhase(p.id, { targets: { ...p.targets, [c.id]: e.target.value.replace(/[^\d.]/g, '') } })} />
                      </td>
                    ))}
                    <td className="num total">{phaseTotal(p) ? `${phaseTotal(p)} h` : '—'}</td>
                    <td>
                      <Remove type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ phases: phases.filter(x => x.id !== p.id) })}>
                        <Icon name="x" size={14} strokeWidth={2} />
                      </Remove>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Sheet>
          </SheetWrap>
        )}
        <FieldNote>Hours are for the whole phase. Phases run back to back from the start date.</FieldNote>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="e.g. Route, gear, who’s climbing"
          onChange={e => set({ notes: e.target.value })} />
      </Section>

      <StatusCard>
        <div>
          <div className="title">Active plan</div>
          <div className="note">{values.isActive ? 'Shown first in Training' : 'Kept for reference'}</div>
        </div>
        <Toggle checked={values.isActive} aria-label="Active plan" onChange={v => set({ isActive: v })} />
      </StatusCard>
    </FormWrap>
  );
}
