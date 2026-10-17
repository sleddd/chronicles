import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../components/atoms/PillButton.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { CurrentPaydayRow, PaydayEditor, RECONCILE_CARDS_KEY, type PaydayRecord } from '../components/organisms/PaydayEditor.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import {
  Note, TextAction, SmallPill, Table, Row, Cell, Tag, InlineForm, Field, Actions, Money, ErrorNote,
} from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';
import { formatDay, isReadyToSpend, newId, parseMoney, paydaySummary, sortPaydays, todayStr } from '../utils/finance.js';
import type { Payday, PaydayItem } from '../types/finance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

const StartBox = styled.div`
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
`;

const HISTORY_COLS = 'minmax(0, 1.2fr) repeat(3, minmax(0, 1fr)) 110px';
const HISTORY_COLS_PHONE = 'minmax(0, 1fr) minmax(0, 1fr) 90px';

const HistoryRow = styled(Row)`
  cursor: pointer;
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 90px;
    & > :nth-child(2), & > :nth-child(3) { display: none; }
  }
`;

const HistoryHead = styled(HistoryRow)`
  cursor: default;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  &:hover { background: transparent; }
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
      <InlineForm onSubmit={e => {
        e.preventDefault();
        if (cents === null) return;
        const carried = carry ? waiting.map(i => ({ ...i, id: newId(), clearedOn: undefined })) : [];
        onStart({ date, startingBalanceCents: cents, status: 'open', items: carried, spending: [], balanceChecks: [] }, carry && waiting.length ? previous : undefined);
      }}>
        <Field $w="170px"><span>Payday</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field $w="200px"><span>Starting balance</span><input inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00" autoFocus /></Field>
        <Actions>
          <PillButton type="submit" disabled={cents === null || !date}>Start payday</PillButton>
          {onCancel && <PillButton type="button" $variant="neutral" onClick={onCancel}>Cancel</PillButton>}
        </Actions>
      </InlineForm>
      {waiting.length > 0 && previous && (
        <Check>
          <input type="checkbox" checked={carry} onChange={e => setCarry(e.target.checked)} />
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
        <PaydayEditor
          key={current.id}
          payday={current}
          bills={bills.records}
          categories={categories}
          onChange={next => void paydays.save(next)}
        />
      )}

      {sorted.length > 0 && (
        <div style={{ marginTop: 24 }}>
        <CollapsibleCard
          id="paydays"
          title="Paydays"
          storageKey={RECONCILE_CARDS_KEY}
          action={starting ? undefined : (
            <SmallPill type="button" style={{ marginRight: 16 }} onClick={() => setStarting(true)}>New payday</SmallPill>
          )}
        >
          {!starting && current && (
            <CurrentPaydayRow
              key={current.id}
              payday={current}
              onChange={next => void paydays.save(next)}
              onDelete={() => { void paydays.remove(current.id); setSelectedId(null); }}
            />
          )}
          <Table $cols={HISTORY_COLS} $phoneCols={HISTORY_COLS_PHONE}>
            <HistoryHead $cols={HISTORY_COLS} as="div" aria-hidden="true">
              <span>Payday</span><Cell $right>Starting</Cell><Cell $right>Paid</Cell><Cell $right>Leftover</Cell><Cell $right>Status</Cell>
            </HistoryHead>
            {sorted.map(p => {
              const s = paydaySummary(p);
              const active = !starting && current?.id === p.id;
              return (
                <HistoryRow
                  key={p.id}
                  $cols={HISTORY_COLS}
                  $active={active}
                  role="button"
                  tabIndex={0}
                  aria-current={active || undefined}
                  onClick={() => { setSelectedId(p.id); setStarting(false); window.scrollTo?.({ top: 0 }); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(p.id); setStarting(false); } }}
                >
                  <span>{formatDay(p.date)}</span>
                  <Cell $right><Money cents={p.startingBalanceCents} /></Cell>
                  <Cell $right><Money cents={s.payingCents} out /></Cell>
                  <Cell $right><Money cents={s.leftoverCents} /></Cell>
                  <Cell $right>
                    {p.status === 'closed' ? <Tag>Closed</Tag> : isReadyToSpend(p) ? <Tag $tone="accent">OK to spend</Tag> : <Tag>{s.waitingCount} waiting</Tag>}
                  </Cell>
                </HistoryRow>
              );
            })}
          </Table>
        </CollapsibleCard>
        </div>
      )}
    </>
  );
}
