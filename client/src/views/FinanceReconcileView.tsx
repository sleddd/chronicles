import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { PaydayEditor, PaydayHeader, type PaydayRecord } from '../components/organisms/PaydayEditor.js';
import {
  Note, TextAction, ErrorNote, ClearBox, FieldRow, OutlineBtn, SheetHead, SheetHeading, SheetBox, SheetLink, SHEET_RULE,
} from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';
import { formatCents, formatDay, isReadyToSpend, newId, parseMoney, paydaySummary, sortPaydays, todayStr } from '../utils/finance.js';
import type { Payday, PaydayItem } from '../types/finance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

const StartBox = styled.div`
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
  cursor: pointer;
`;

const Section = styled.section`
  margin-top: 44px;
`;

/* Past paydays: payday | starting | paid | leftover | status */
const HistGrid = styled.div<{ $active?: boolean; $head?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr)) 130px;
  align-items: center;
  gap: 16px;
  padding: ${({ $head }) => ($head ? '16px 28px 12px' : '14px 28px')};
  font-family: var(--font-sans);
  font-size: ${({ $head }) => ($head ? '13px' : '15px')};
  color: ${({ $head }) => ($head ? 'var(--text-muted)' : 'var(--text-secondary)')};
  background: ${({ $active }) => ($active ? 'var(--bg-row-hover)' : 'transparent')};
  cursor: ${({ $head }) => ($head ? 'default' : 'pointer')};
  font-variant-numeric: tabular-nums;
  & > :not(:first-child) { text-align: right; }
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  ${({ $head }) => ($head ? '' : '&:hover { background: var(--bg-row-hover); }')}
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  small { margin-left: 6px; font-size: 13px; color: var(--text-muted); }
  .left { color: var(--color-accent-link); }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 110px;
    padding-left: 16px; padding-right: 16px;
    & > :nth-child(2), & > :nth-child(3) { display: none; }
  }
`;

const StatusPill = styled.span<{ $tone: 'ok' | 'muted' }>`
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $tone }) => ($tone === 'ok' ? 'color-mix(in srgb, var(--color-accent) 16%, var(--bg-app))' : 'var(--bg-row-hover)')};
  color: ${({ $tone }) => ($tone === 'ok' ? 'var(--color-accent-link)' : 'var(--text-muted)')};
`;

/** Waiting lines on a payday that could move to a new one. */
function waitingLines(p: Payday): PaydayItem[] {
  return p.items.filter(i => !i.clearedOn && !i.carriedOver);
}

function StartPayday({ previous, onStart, onCancel }: {
  previous?: PaydayRecord;
  onStart: (payday: Payday, carryFrom?: PaydayRecord) => void;
  onCancel?: () => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [balance, setBalance] = useState('');
  const waiting = previous ? waitingLines(previous) : [];
  const [carry, setCarry] = useState(waiting.length > 0);
  const cents = parseMoney(balance);

  return (
    <StartBox>
      <Note>
        Start with your bank balance once everything has posted (paycheck included). Then add the bills you're paying,
        and tick each one off as it clears.
      </Note>
      <form onSubmit={e => {
        e.preventDefault();
        if (cents === null) return;
        const carried = carry ? waiting.map(i => ({ ...i, id: newId(), clearedOn: undefined })) : [];
        onStart({ date, startingBalanceCents: cents, status: 'open', items: carried, spending: [], balanceChecks: [] }, carry && waiting.length ? previous : undefined);
      }}>
        <FieldRow $cols="180px 200px auto" style={{ width: 'fit-content', maxWidth: '100%' }}>
          <label><input type="date" aria-label="Payday" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label><span className="pre">$</span><input aria-label="Starting balance" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} placeholder="Starting balance" autoFocus /></label>
          <label style={{ gap: 6, padding: '0 6px' }}>
            {onCancel && <OutlineBtn type="button" $tone="neutral" style={{ height: 30 }} onClick={onCancel}>Cancel</OutlineBtn>}
            <OutlineBtn type="submit" style={{ height: 30 }} disabled={cents === null || !date}>Start payday</OutlineBtn>
          </label>
        </FieldRow>
      </form>
      {waiting.length > 0 && previous && (
        <Check>
          <ClearBox checked={carry} onChange={e => setCarry(e.target.checked)} />
          Carry over {waiting.length} line{waiting.length === 1 ? '' : 's'} still waiting from {formatDay(previous.date)} (and close that payday)
        </Check>
      )}
    </StartBox>
  );
}

/**
 * Reconcile: the paycheck routine. Each payday holds the starting balance,
 * the bills being paid, spending from the leftover, and balance checks — the
 * newest open payday is shown, older ones are in the history below.
 */
export function FinanceReconcileView() {
  return (
    <FinanceShell requiresReconcile>
      <Reconcile />
    </FinanceShell>
  );
}

function Reconcile() {
  const paydays = useFinance('paydays');
  const bills = useFinance('bills');
  const budget = useFinance('budget');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const sorted = useMemo(() => sortPaydays(paydays.records), [paydays.records]);
  const current = (selectedId && sorted.find(p => p.id === selectedId)) || sorted.find(p => p.status === 'open') || sorted[0];
  const categories = useMemo(() => [...budget.records].sort((a, b) => a.order - b.order), [budget.records]);

  if (paydays.status === 'idle' || paydays.status === 'loading') return <Center><Spinner size={32} /></Center>;
  if (paydays.status === 'error') return (
    <>
      <ErrorNote role="alert">Couldn't load your paydays.</ErrorNote>
      <TextAction type="button" onClick={() => void paydays.reload()}>Try again</TextAction>
    </>
  );

  const start = async (payday: Payday, carryFrom?: PaydayRecord) => {
    const saved = await paydays.save(payday);
    if (!saved) return;
    if (carryFrom) {
      await paydays.save({
        ...carryFrom,
        status: 'closed',
        closedOn: carryFrom.closedOn ?? todayStr(),
        items: carryFrom.items.map(i => (!i.clearedOn && !i.carriedOver ? { ...i, carriedOver: true } : i)),
      });
    }
    setSelectedId(saved.id);
    setStarting(false);
  };

  return (
    <>
      {paydays.unreadable > 0 && <ErrorNote>{paydays.unreadable} payday{paydays.unreadable === 1 ? '' : 's'} couldn't be decrypted and {paydays.unreadable === 1 ? 'is' : 'are'} hidden.</ErrorNote>}

      {!current || starting ? (
        <StartPayday previous={sorted[0]} onStart={(p, from) => void start(p, from)} onCancel={current ? () => setStarting(false) : undefined} />
      ) : (
        <>
          <PaydayHeader
            key={`h-${current.id}`}
            payday={current}
            onChange={next => void paydays.save(next)}
            onDelete={() => { void paydays.remove(current.id); setSelectedId(null); }}
            onNew={() => setStarting(true)}
          />
          <PaydayEditor
            key={current.id}
            payday={current}
            bills={bills.records}
            categories={categories}
            onChange={next => void paydays.save(next)}
          />
        </>
      )}

      {sorted.length > 0 && (
        <Section aria-label="Past paydays">
          <SheetHead>
            <SheetHeading>Past paydays</SheetHeading>
            {!starting && <SheetLink type="button" onClick={() => setStarting(true)}>+ New payday</SheetLink>}
          </SheetHead>
          <SheetBox>
            <HistGrid $head aria-hidden="true">
              <span>Payday</span><span>Starting</span><span>Paid</span><span>Leftover</span><span>Status</span>
            </HistGrid>
            {sorted.map(p => {
              const s = paydaySummary(p);
              const active = !starting && current?.id === p.id;
              return (
                <HistGrid
                  key={p.id}
                  $active={active}
                  role="button"
                  tabIndex={0}
                  aria-current={active || undefined}
                  onClick={() => { setSelectedId(p.id); setStarting(false); window.scrollTo?.({ top: 0 }); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(p.id); setStarting(false); } }}
                >
                  <span>{formatDay(p.date)}{active && <small>· current</small>}</span>
                  <span>{formatCents(p.startingBalanceCents)}</span>
                  <span>−{formatCents(s.payingCents)}</span>
                  <span className="left">{formatCents(s.leftoverCents)}</span>
                  <span>
                    {p.status === 'closed'
                      ? <StatusPill $tone="muted">Closed</StatusPill>
                      : s.waitingCount === 0
                        ? <StatusPill $tone="ok">{isReadyToSpend(p) ? 'OK to spend' : 'All cleared'}</StatusPill>
                        : <StatusPill $tone="muted">{s.waitingCount} waiting</StatusPill>}
                  </span>
                </HistGrid>
              );
            })}
          </SheetBox>
        </Section>
      )}
    </>
  );
}
