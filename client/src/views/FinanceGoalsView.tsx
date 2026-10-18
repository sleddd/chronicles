import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PillButton } from '../components/atoms/PillButton.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { FormField } from '../components/molecules/FormField.js';
import {
  Note, Actions, ErrorNote, RowMenu, RowBtn, PanelCard, CardTitle, type RowMenuItem,
} from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';
import { centsToInput, formatCents, formatDay, goalProgress, parseMoney, daysBetween, todayStr } from '../utils/finance.js';
import type { FinanceGoal, FinanceRecord } from '../types/finance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

/* "2 active goals · $121.00 paid toward $8,940.00" with "+ New goal" across */
const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 32px 0 24px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const GoalTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const GoalName = styled(CardTitle)<{ $done?: boolean }>`
  font-size: 22px;
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  em { margin-left: 10px; font-family: var(--font-sans); font-style: normal; font-size: 13px; color: var(--text-muted); }
`;

const Sub = styled.div`
  margin-top: 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
`;

const Track = styled.div<{ $pct: number; $done: boolean }>`
  height: 5px;
  margin: 30px 0 12px;
  border-radius: 3px;
  background: linear-gradient(${({ $done }) => ($done ? 'var(--chart-green)' : 'var(--color-accent)')}, ${({ $done }) => ($done ? 'var(--chart-green)' : 'var(--color-accent)')}) no-repeat left / ${({ $pct }) => Math.max(2, $pct)}% 100%, var(--border-card);
`;

const Amounts = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  b { font-weight: 500; color: var(--text-secondary); }
  .pct { color: var(--color-accent-link); }
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

  const active = goals.records.filter(g => g.status === 'active');
  const paid = active.reduce((t, g) => t + goalProgress(g, savings.records).currentCents, 0);
  const toward = active.reduce((t, g) => t + g.targetCents, 0);

  return (
    <section>
      <Top>
        <span>{active.length} active goal{active.length === 1 ? '' : 's'}{active.length ? ` · ${formatCents(paid)} paid toward ${formatCents(toward)}` : ''}</span>
        <PillButton type="button" onClick={() => setEditing(editing === 'new' ? null : 'new')}>{editing === 'new' ? 'Close' : 'New finance goal'}</PillButton>
      </Top>
      {editing === 'new' && <PanelCard style={{ marginBottom: 16 }}><GoalEditor pots={savings.records} onSave={g => goals.save(g)} onCancel={() => setEditing(null)} /></PanelCard>}
      {sorted.length === 0 && editing !== 'new' ? (
        <Note>Set a target — an emergency fund, paying off a card, a trip — and watch your progress. Link a savings fund to track it automatically.</Note>
      ) : (
        <List>
          {sorted.map(g => {
            if (editing === g.id) {
              return <PanelCard key={g.id}><GoalEditor goal={g} pots={savings.records} onSave={x => goals.save(x)} onCancel={() => setEditing(null)} /></PanelCard>;
            }
            const p = goalProgress(g, savings.records);
            const pot = g.savingsPotId ? savings.records.find(s => s.id === g.savingsPotId) : undefined;
            const pct = Math.round(p.fraction * 100);
            const sub = [dueNote(g.targetDate), pot ? `Tracking ${pot.name}` : g.savingsPotId ? 'Linked fund was deleted' : undefined, g.notes].filter(Boolean).join(' · ');
            const menu: RowMenuItem[] = [
              { label: 'Edit', onSelect: () => setEditing(g.id) },
              ...(g.status === 'active' ? [{ label: 'Pause', onSelect: () => void goals.save({ ...g, status: 'paused' as const }) }] : []),
              ...(g.status !== 'active' ? [{ label: 'Make active', onSelect: () => void goals.save({ ...g, status: 'active' as const }) }] : []),
              { label: 'Delete goal', danger: true, confirmLabel: 'Click again to delete', onSelect: () => void goals.remove(g.id) },
            ];
            return (
              <PanelCard key={g.id} aria-label={g.name}>
                <GoalTop>
                  <div style={{ minWidth: 0 }}>
                    <GoalName $done={g.status === 'achieved'}>
                      {g.name}
                      {g.status === 'paused' && <em>Paused</em>}
                      {g.status === 'achieved' && <em>Achieved</em>}
                      {g.status === 'active' && p.reached && <em>Reached</em>}
                    </GoalName>
                    {sub && <Sub>{sub}</Sub>}
                  </div>
                  <Right>
                    {g.status !== 'achieved' && <RowBtn type="button" onClick={() => void goals.save({ ...g, status: 'achieved' })}>Mark achieved</RowBtn>}
                    <RowMenu label={`More actions for ${g.name}`} items={menu} />
                  </Right>
                </GoalTop>
                <Track $pct={Math.min(100, pct)} $done={p.reached || g.status === 'achieved'} aria-label={`${pct}% of target`} />
                <Amounts>
                  <span><b>{formatCents(p.currentCents)}</b> of {formatCents(p.targetCents)}</span>
                  <span className="pct">{pct}%</span>
                </Amounts>
              </PanelCard>
            );
          })}
        </List>
      )}
    </section>
  );
}
