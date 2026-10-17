import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PillButton } from '../components/atoms/PillButton.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { FormField } from '../components/molecules/FormField.js';
import {
  Section, SectionHead, Note, SmallPill, Tag, SubText, ProgressRing, Actions, SmallBtn, ConfirmDelete, ErrorNote,
} from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';
import { centsToInput, formatCents, formatDay, goalProgress, parseMoney, daysBetween, todayStr } from '../utils/finance.js';
import type { FinanceGoal, FinanceRecord } from '../types/finance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

const GoalRow = styled.div`
  padding: 18px 0;
  border-top: 1px solid var(--border-subtle);
  &:last-child { border-bottom: 1px solid var(--border-subtle); }
`;

const GoalTop = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 10px;
`;

/* Amount + circle progress on the right, the ring in a little from the edge */
const Progress = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 14px;
  & > svg { margin-right: 20px; }
`;

const GoalName = styled.span<{ $done?: boolean }>`
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-primary);
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
`;

/* "By Feb 16, 2027 · 123 days left / $0.00 of $6,000.00 · 0%" — italic, left of the ring */
const Amounts = styled.span`
  font-style: italic;
  strong { font-weight: inherit; color: var(--text-primary); }
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
`;

const EditorBox = styled.div`
  padding: 4px 0 16px;
`;

interface Draft { name: string; target: string; targetDate: string; savingsPotId: string; current: string; status: FinanceGoal['status']; notes: string }

function draftFrom(g?: FinanceGoal): Draft {
  return {
    name: g?.name ?? '',
    target: centsToInput(g?.targetCents),
    targetDate: g?.targetDate ?? '',
    savingsPotId: g?.savingsPotId ?? '',
    current: centsToInput(g?.currentCents),
    status: g?.status ?? 'active',
    notes: g?.notes ?? '',
  };
}

function GoalEditor({ goal, pots, onSave, onCancel }: {
  goal?: FinanceRecord<'goals'>;
  pots: FinanceRecord<'savings'>[];
  onSave: (g: FinanceGoal & { id?: string }) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [d, setD] = useState(() => draftFrom(goal));
  const [error, setError] = useState('');
  const set = (p: Partial<Draft>) => setD(prev => ({ ...prev, ...p }));
  const uid = goal?.id ?? 'new';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = parseMoney(d.target);
    const current = d.current.trim() ? parseMoney(d.current) : null;
    if (!d.name.trim()) { setError('Name the goal'); return; }
    if (target === null || target <= 0) { setError('Enter a target amount'); return; }
    if (!d.savingsPotId && d.current.trim() && current === null) { setError('Enter the amount so far like 250.00'); return; }
    await onSave({
      ...(goal ? { id: goal.id } : {}),
      name: d.name.trim(),
      targetCents: target,
      targetDate: d.targetDate || undefined,
      savingsPotId: d.savingsPotId || undefined,
      currentCents: d.savingsPotId ? undefined : (current ?? undefined),
      status: d.status,
      notes: d.notes.trim() || undefined,
    });
    onCancel();
  };

  return (
    <EditorBox>
      <form onSubmit={e => void submit(e)}>
        <FormField label="Goal" htmlFor={`goal-name-${uid}`}>
          <input id={`goal-name-${uid}`} value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Pay off credit card, $5k emergency fund…" autoFocus />
        </FormField>
        <FormField label="Target amount" htmlFor={`goal-target-${uid}`}>
          <input id={`goal-target-${uid}`} inputMode="decimal" value={d.target} onChange={e => set({ target: e.target.value })} placeholder="0.00" />
        </FormField>
        <FormField label="Target date" htmlFor={`goal-date-${uid}`}>
          <input id={`goal-date-${uid}`} type="date" value={d.targetDate} onChange={e => set({ targetDate: e.target.value })} />
        </FormField>
        <FormField label="Track progress" htmlFor={`goal-pot-${uid}`}>
          <select id={`goal-pot-${uid}`} value={d.savingsPotId} onChange={e => set({ savingsPotId: e.target.value })}>
            <option value="">I'll enter the amount</option>
            {pots.map(p => <option key={p.id} value={p.id}>From savings fund: {p.name}</option>)}
          </select>
        </FormField>
        {!d.savingsPotId && (
          <FormField label="Amount so far" htmlFor={`goal-current-${uid}`}>
            <input id={`goal-current-${uid}`} inputMode="decimal" value={d.current} onChange={e => set({ current: e.target.value })} placeholder="0.00" />
          </FormField>
        )}
        <FormField label="Status" htmlFor={`goal-status-${uid}`}>
          <select id={`goal-status-${uid}`} value={d.status} onChange={e => set({ status: e.target.value as FinanceGoal['status'] })}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="achieved">Achieved</option>
          </select>
        </FormField>
        <FormField label="Notes" htmlFor={`goal-notes-${uid}`}>
          <textarea id={`goal-notes-${uid}`} rows={2} value={d.notes} onChange={e => set({ notes: e.target.value })} />
        </FormField>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Actions style={{ justifyContent: 'flex-start', marginTop: 8 }}>
          <PillButton type="submit">{goal ? 'Save goal' : 'Add goal'}</PillButton>
          <PillButton type="button" $variant="neutral" onClick={onCancel}>Cancel</PillButton>
        </Actions>
      </form>
    </EditorBox>
  );
}

function dueNote(targetDate: string | undefined): string | undefined {
  if (!targetDate) return undefined;
  const days = daysBetween(todayStr(), targetDate);
  if (days < 0) return `Target was ${formatDay(targetDate)}`;
  if (days === 0) return 'Target is today';
  return `By ${formatDay(targetDate)} · ${days} day${days === 1 ? '' : 's'} left`;
}

/** Financial goals: target, date and progress (from a savings fund or typed in). */
export function FinanceGoalsView() {
  return (
    <FinanceShell>
      <Goals />
    </FinanceShell>
  );
}

function Goals() {
  const goals = useFinance('goals');
  const savings = useFinance('savings');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  if (goals.status === 'idle' || goals.status === 'loading' || savings.status === 'idle' || savings.status === 'loading') {
    return <Center><Spinner size={32} /></Center>;
  }

  const order = { active: 0, paused: 1, achieved: 2 } as const;
  const sorted = [...goals.records].sort((a, b) => order[a.status] - order[b.status] || (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'));

  return (
    <Section>
      <SectionHead style={{ justifyContent: 'flex-end' }}>
        <SmallPill type="button" onClick={() => setEditing(editing === 'new' ? null : 'new')}>New goal</SmallPill>
      </SectionHead>
      {editing === 'new' && <GoalEditor pots={savings.records} onSave={g => goals.save(g)} onCancel={() => setEditing(null)} />}
      {sorted.length === 0 && editing !== 'new' ? (
        <Note>Set a target — an emergency fund, paying off a card, a trip — and watch your progress. Link a savings fund to track it automatically.</Note>
      ) : (
        <div>
          {sorted.map(g => {
            if (editing === g.id) {
              return <GoalEditor key={g.id} goal={g} pots={savings.records} onSave={x => goals.save(x)} onCancel={() => setEditing(null)} />;
            }
            const p = goalProgress(g, savings.records);
            const pot = g.savingsPotId ? savings.records.find(s => s.id === g.savingsPotId) : undefined;
            return (
              <GoalRow key={g.id}>
                <GoalTop>
                  <span>
                    <GoalName $done={g.status === 'achieved'}>{g.name}</GoalName>
                    {g.status === 'paused' && <Tag>Paused</Tag>}
                    {g.status === 'achieved' && <Tag $tone="success">Achieved</Tag>}
                    {g.status === 'active' && p.reached && <Tag $tone="success">Reached</Tag>}
                  </span>
                  <Progress>
                    <Amounts>
                      {dueNote(g.targetDate) && <>{dueNote(g.targetDate)} / </>}
                      {/* The amount stands out in the theme's main text colour */}
                      <strong>{formatCents(p.currentCents)} of {formatCents(p.targetCents)} · {Math.round(p.fraction * 100)}%</strong>
                    </Amounts>
                    <ProgressRing fraction={p.fraction} tone={p.reached ? 'success' : 'default'} size={28} label={`${g.name}: ${Math.round(p.fraction * 100)}% of target`} />
                  </Progress>
                </GoalTop>
                {(pot || g.savingsPotId || g.notes) && (
                  <SubText style={{ marginTop: 8 }}>
                    {[pot ? `Tracking ${pot.name}` : g.savingsPotId ? 'Linked fund was deleted' : undefined, g.notes].filter(Boolean).join(' · ')}
                  </SubText>
                )}
                <Actions style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                  {g.status !== 'achieved' && <SmallBtn type="button" onClick={() => void goals.save({ ...g, status: 'achieved' })}>Mark achieved</SmallBtn>}
                  <SmallBtn type="button" onClick={() => setEditing(g.id)}>Edit</SmallBtn>
                  <ConfirmDelete onConfirm={() => void goals.remove(g.id)} />
                </Actions>
              </GoalRow>
            );
          })}
        </div>
      )}
    </Section>
  );
}
