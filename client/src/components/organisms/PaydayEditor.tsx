import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import {
  Note, Tag, ConfirmDelete, ClearBox, SmallBtn, RowMenu, type RowMenuItem,
  SheetHead, SheetHeading, SheetBox, SheetLink, SHEET_RULE, StatBoxRow, StatCell, FieldRow, OutlineBtn, RowBtn,
} from '../molecules/FinanceParts.js';
import {
  balanceCheck, formatCents, formatDay, isReadyToSpend, newId, parseMoney, paydaySummary,
  suggestBillsForPayday, todayStr, centsToInput,
} from '../../utils/finance.js';
import type { FinanceRecord, Payday, PaydayItem, PaydaySpend } from '../../types/finance.js';

export type PaydayRecord = FinanceRecord<'paydays'>;

interface PaydayEditorProps {
  payday: PaydayRecord;
  bills: FinanceRecord<'bills'>[];
  categories: FinanceRecord<'budget'>[];
  onChange: (next: PaydayRecord) => void;
}

/* ── Layout bits ── */

const Section = styled.section`
  margin-top: 44px;
`;

const Hint = styled.p`
  margin: 12px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  button { padding: 0; border: none; background: none; font: inherit; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

/* Status line under the totals: neutral, or the accent when it's OK to spend */
const Banner = styled.div<{ $ready: boolean }>`
  margin-top: 16px;
  padding: 12px 18px;
  border: 1px solid ${({ $ready }) => ($ready ? 'var(--color-accent)' : 'var(--border-subtle)')};
  border-radius: 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $ready }) => ($ready ? 'var(--color-accent-link)' : 'var(--text-soft)')};
  strong { font-weight: 600; }
`;

/* Line rows: tick | name + note | amount | status | actions */
const Line = styled.div<{ $muted?: boolean }>`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 110px 130px auto;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $muted }) => ($muted ? 'var(--text-muted)' : 'var(--text-secondary)')};
  font-variant-numeric: tabular-nums;
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  & > :nth-child(3) { text-align: right; }
  small { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
  .status { font-size: 13px; color: var(--text-muted); }
  @media (max-width: 640px) {
    grid-template-columns: 22px minmax(0, 1fr) 96px;
    padding: 12px 14px;
    & > :nth-child(4) { display: none; }
    & > :nth-child(5) { grid-column: 2 / -1; }
  }
`;

const LineTotal = styled(Line)`
  background: var(--bg-panel);
  font-weight: 500;
`;

const LineActions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
`;

const ListBox = styled(SheetBox)`
  margin-bottom: 14px;
`;

/* Bill picker: a --bg-panel box of checkable bills */
const Picker = styled.div`
  margin-bottom: 14px;
  padding: 14px 20px 18px;
  background: var(--bg-panel);
  border-radius: 12px;
`;

const PickHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
`;

const PickRow = styled.label`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto 110px;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  cursor: pointer;
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  .due { font-size: 13px; color: var(--text-muted); }
  input[type='text'] {
    width: 100%;
    height: 32px;
    padding: 0 10px;
    text-align: right;
    font-family: var(--font-sans);
    font-size: 14px;
    background: transparent !important;
    border: 1px solid var(--border-card) !important;
    border-radius: 8px;
    color: var(--text-secondary);
    outline: none;
  }
`;

const AddBtn = styled(OutlineBtn)`
  height: 30px;
  padding: 0 14px;
`;

/* "Bank says | $ 0.00 | Check" */
const CheckRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  & > form { flex: 0 1 360px; }
  .lbl { color: var(--text-muted); }
`;

const Verdict = styled.p<{ $ok: boolean }>`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $ok }) => ($ok ? 'var(--chart-green)' : 'var(--color-danger)')};
`;

/* ── Helpers ── */

function categoryName(categories: FinanceRecord<'budget'>[], id?: string): string | undefined {
  return id ? categories.find(c => c.id === id)?.name : undefined;
}

const Chevron = () => (
  <span style={{ marginLeft: -18, pointerEvents: 'none', display: 'inline-flex', color: 'var(--text-muted)' }} aria-hidden="true">
    <Icon name="chevron-down" size={14} strokeWidth={2} />
  </span>
);

function CategorySelect({ value, onChange, categories, name }: {
  value: string; onChange: (v: string) => void; categories: FinanceRecord<'budget'>[]; name: string;
}) {
  return (
    <>
      <select aria-label={name} value={value} onChange={e => onChange(e.target.value)} style={{ appearance: 'none', paddingRight: 22, cursor: 'pointer' }}>
        <option value="">No category</option>
        {categories.filter(c => !c.archived || c.id === value).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Chevron />
    </>
  );
}

/* ── Line form (bills / payments) ── */

interface LineDraft {
  description: string;
  direction: 'out' | 'in';
  amount: string;
  categoryId: string;
  combined: boolean;
  combinedCount: string;
  combinedPeriod: string;
  clearedOn: string;
}

const blankLine: LineDraft = { description: '', direction: 'out', amount: '', categoryId: '', combined: false, combinedCount: '', combinedPeriod: '', clearedOn: '' };

function draftFromItem(i: PaydayItem): LineDraft {
  return {
    description: i.description,
    direction: i.direction,
    amount: centsToInput(i.amountCents),
    categoryId: i.categoryId ?? '',
    combined: !!(i.combinedCount || i.combinedPeriod),
    combinedCount: i.combinedCount ? String(i.combinedCount) : '',
    combinedPeriod: i.combinedPeriod ?? '',
    clearedOn: i.clearedOn ?? '',
  };
}

/** One outlined row: description | Paying ⌄ | $ amount | category ⌄ | Add — plus a
    second row for a combined line's count and period. */
function LineForm({ initial, categories, submitLabel, onSubmit, onCancel, hint }: {
  initial: LineDraft;
  categories: FinanceRecord<'budget'>[];
  submitLabel: string;
  onSubmit: (d: LineDraft, cents: number) => void;
  onCancel?: () => void;
  hint?: boolean;
}) {
  const [d, setD] = useState(initial);
  const cents = parseMoney(d.amount);
  const valid = d.description.trim() !== '' && cents !== null && cents > 0;
  const set = (patch: Partial<LineDraft>) => setD(prev => ({ ...prev, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || cents === null) return;
    onSubmit(d, cents);
    if (!onCancel) setD({ ...blankLine, categoryId: d.categoryId });
  };
  return (
    <form onSubmit={submit}>
      <FieldRow $cols="minmax(0, 1fr) 150px 130px 190px auto">
        <label><input aria-label="Description" value={d.description} onChange={e => set({ description: e.target.value })} placeholder={d.combined ? 'Uber' : 'Rent, phone, check #104…'} /></label>
        <label>
          <select aria-label="Type" value={d.direction} onChange={e => set({ direction: e.target.value as 'out' | 'in' })} style={{ appearance: 'none', paddingRight: 22, cursor: 'pointer' }}>
            <option value="out">Paying</option>
            <option value="in">Coming in</option>
          </select>
          <Chevron />
        </label>
        <label><span className="pre">$</span><input aria-label="Amount" inputMode="decimal" value={d.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" /></label>
        <label><CategorySelect name="Category" value={d.categoryId} onChange={v => set({ categoryId: v })} categories={categories} /></label>
        <label style={{ gap: 6, padding: '0 6px' }}>
          {onCancel && <AddBtn type="button" $tone="neutral" onClick={onCancel}>Cancel</AddBtn>}
          <AddBtn type="submit" disabled={!valid}>{submitLabel}</AddBtn>
        </label>
      </FieldRow>
      {(d.combined || (onCancel && d.clearedOn)) && (
        <FieldRow $cols={d.combined && onCancel && d.clearedOn ? '140px 180px 180px' : d.combined ? '140px 200px' : '200px'} style={{ marginTop: 8, width: 'fit-content', maxWidth: '100%' }}>
          {d.combined && <label><input aria-label="How many" inputMode="numeric" value={d.combinedCount} onChange={e => set({ combinedCount: e.target.value.replace(/\D/g, '') })} placeholder="How many (9)" /></label>}
          {d.combined && <label><input aria-label="Period" value={d.combinedPeriod} onChange={e => set({ combinedPeriod: e.target.value })} placeholder="Period (Oct 1–15)" /></label>}
          {onCancel && d.clearedOn && <label><input type="date" aria-label="Cleared on" value={d.clearedOn} onChange={e => set({ clearedOn: e.target.value })} /></label>}
        </FieldRow>
      )}
      {hint && (
        <Hint>
          Waiting lines haven't cleared the bank yet. Combined groups several bills into one payment —{' '}
          <button type="button" aria-pressed={d.combined} onClick={() => set({ combined: !d.combined })}>
            {d.combined ? 'make this a single line' : 'make this a combined line'}
          </button>.
        </Hint>
      )}
    </form>
  );
}

function itemFromDraft(d: LineDraft, cents: number, base?: PaydayItem): PaydayItem {
  const count = parseInt(d.combinedCount, 10);
  return {
    ...(base ?? { id: newId() }),
    description: d.description.trim(),
    direction: d.direction,
    amountCents: cents,
    categoryId: d.categoryId || undefined,
    combinedCount: d.combined && count > 0 ? count : undefined,
    combinedPeriod: d.combined && d.combinedPeriod.trim() ? d.combinedPeriod.trim() : undefined,
    clearedOn: base?.clearedOn ? (d.clearedOn || base.clearedOn) : undefined,
  };
}

/* ── Bill picker ── */

function BillPicker({ payday, bills, onAdd, onClose }: {
  payday: Payday; bills: FinanceRecord<'bills'>[]; onAdd: (items: PaydayItem[]) => void; onClose: () => void;
}) {
  const suggestions = useMemo(() => suggestBillsForPayday(bills, payday), [bills, payday]);
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(suggestions.map(s => [s.bill.id, s.dueSoon])));
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map(s => [s.bill.id, centsToInput(s.bill.amountCents)])));

  const chosen = suggestions.filter(s => picked[s.bill.id] && (parseMoney(amounts[s.bill.id] ?? '') ?? 0) > 0);

  if (suggestions.length === 0) {
    return (
      <Picker>
        <PickHead>
          <span>No bills to add — every active bill is already on this payday, or none are set up yet (add them under Budget &amp; bills).</span>
          <SheetLink type="button" onClick={onClose}>Close</SheetLink>
        </PickHead>
      </Picker>
    );
  }

  return (
    <Picker>
      <PickHead><span>Pick the bills you're paying</span><SheetLink type="button" onClick={onClose}>Close</SheetLink></PickHead>
      {suggestions.map(s => (
        <PickRow key={s.bill.id}>
          <ClearBox checked={!!picked[s.bill.id]} onChange={e => setPicked(p => ({ ...p, [s.bill.id]: e.target.checked }))} aria-label={`Pay ${s.bill.name}`} />
          <span>
            {s.bill.name}
            {s.bill.kind === 'subscription' && <Tag>Subscription</Tag>}
            {s.bill.autopay && <Tag>Autopay</Tag>}
          </span>
          <span className="due">Due {formatDay(s.due)}</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${s.bill.name} amount`}
            value={amounts[s.bill.id] ?? ''}
            onChange={e => setAmounts(a => ({ ...a, [s.bill.id]: e.target.value }))}
          />
        </PickRow>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <OutlineBtn
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onAdd(chosen.map(s => ({
            id: newId(),
            billId: s.bill.id,
            description: s.bill.name,
            amountCents: parseMoney(amounts[s.bill.id] ?? '') ?? s.bill.amountCents,
            direction: 'out',
            categoryId: s.bill.categoryId,
          })))}
        >
          Add {chosen.length || ''} {chosen.length === 1 ? 'bill' : 'bills'}
        </OutlineBtn>
      </div>
    </Picker>
  );
}

/* ── Spending form ── */

function SpendForm({ categories, defaultDate, onAdd }: {
  categories: FinanceRecord<'budget'>[]; defaultDate: string; onAdd: (s: PaydaySpend) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const cents = parseMoney(amount);
  const valid = description.trim() !== '' && cents !== null && cents > 0;
  return (
    <form onSubmit={e => {
      e.preventDefault();
      if (!valid || cents === null) return;
      onAdd({ id: newId(), date, description: description.trim(), amountCents: cents, categoryId: categoryId || undefined });
      setDescription(''); setAmount('');
    }}>
      <FieldRow $cols="170px minmax(0, 1fr) 130px 190px auto">
        <label><input type="date" aria-label="Date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label><input aria-label="What" value={description} onChange={e => setDescription(e.target.value)} placeholder="Groceries, gas…" /></label>
        <label><span className="pre">$</span><input aria-label="Amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label><CategorySelect name="Spending category" value={categoryId} onChange={setCategoryId} categories={categories} /></label>
        <label style={{ padding: '0 6px' }}><AddBtn type="submit" disabled={!valid}>Add</AddBtn></label>
      </FieldRow>
    </form>
  );
}

/* ── Editor ── */

/**
 * One payday: totals, the bills being paid (tick each as it clears), spending
 * from the leftover, and a balance check against the bank.
 */
export function PaydayEditor({ payday, bills, categories, onChange }: PaydayEditorProps) {
  const [picking, setPicking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bankText, setBankText] = useState('');

  const closed = payday.status === 'closed';
  const summary = paydaySummary(payday);
  const ready = isReadyToSpend(payday);
  const lastCheck = payday.balanceChecks[payday.balanceChecks.length - 1];
  const check = lastCheck ? balanceCheck(payday, lastCheck.balanceCents) : null;
  const items = payday.items.filter(i => !i.carriedOver);
  const carried = payday.items.length - items.length;
  const billName = (id?: string) => (id ? bills.find(b => b.id === id)?.name : undefined);
  const outCount = items.filter(i => i.direction === 'out').length;

  const update = (patch: Partial<Payday>) => onChange({ ...payday, ...patch });
  const setItems = (next: PaydayItem[]) => update({ items: [...next, ...payday.items.filter(i => i.carriedOver)] });
  const toggleItem = (id: string, on: boolean) =>
    setItems(items.map(i => (i.id === id ? { ...i, clearedOn: on ? todayStr() : undefined } : i)));
  const toggleSpend = (id: string, on: boolean) =>
    update({ spending: payday.spending.map(s => (s.id === id ? { ...s, clearedOn: on ? todayStr() : undefined } : s)) });

  const runCheck = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(bankText);
    if (cents === null) return;
    update({ balanceChecks: [...payday.balanceChecks, { at: new Date().toISOString(), balanceCents: cents }].slice(-20) });
    setBankText('');
  };

  return (
    <div>
      <StatBoxRow $cols={4} style={{ marginTop: 24 }}>
        <StatCell label="Starting balance" cents={payday.startingBalanceCents} sub={formatDay(payday.date)} />
        <StatCell label="Paying" cents={summary.payingCents} sub={summary.incomingCents ? `+${formatCents(summary.incomingCents)} coming in` : `${outCount} line${outCount === 1 ? '' : 's'}`} />
        <StatCell label="Leftover to spend" cents={summary.leftoverCents} tone={summary.leftoverCents < 0 ? 'danger' : 'accent'}
          sub={summary.spentCents ? `after ${formatCents(summary.spentCents)} spent` : 'Nothing spent yet'} />
        <StatCell label="Still waiting" cents={summary.waitingCents} sub={summary.waitingCount ? `${summary.waitingCount} not cleared yet` : 'Everything cleared'} />
      </StatBoxRow>

      {(items.length > 0 || payday.spending.length > 0) && (
        <Banner $ready={ready} role="status">
          {ready
            ? <><strong>All cleared — OK to spend.</strong> {formatCents(check?.availableCents ?? summary.leftoverCents)} available.</>
            : summary.waitingCount === 0
              ? <>Everything's cleared. <strong>Check your bank balance below</strong> to confirm nothing was missed.</>
              : <>Waiting on {summary.waitingCount} {summary.waitingCount === 1 ? 'line' : 'lines'} to clear. Hold off on spending the leftover until they go through.</>}
        </Banner>
      )}

      {/* ── Bills / payments ── */}
      <Section aria-label="Bills I'm paying">
        <SheetHead>
          <SheetHeading>Bills I'm paying</SheetHeading>
          {!closed && <SheetLink type="button" onClick={() => setPicking(p => !p)}>{picking ? 'Close' : '+ Add from my bills'}</SheetLink>}
        </SheetHead>
        {picking && !closed && (
          <BillPicker
            payday={payday}
            bills={bills}
            onClose={() => setPicking(false)}
            onAdd={added => { setItems([...items, ...added]); setPicking(false); }}
          />
        )}
        {items.length > 0 && (
          <ListBox>
            {items.map(i => (editingId === i.id ? (
              <div key={i.id} style={{ padding: 12 }}>
                <LineForm
                  initial={draftFromItem(i)}
                  categories={categories}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(d, cents) => { setItems(items.map(x => (x.id === i.id ? itemFromDraft(d, cents, i) : x))); setEditingId(null); }}
                />
              </div>
            ) : (
              <Line key={i.id} $muted={!!i.clearedOn}>
                <ClearBox checked={!!i.clearedOn} disabled={closed} aria-label={`${i.description} cleared`} onChange={e => toggleItem(i.id, e.target.checked)} />
                <span>
                  {i.description}
                  {i.combinedCount ? <Tag>{i.combinedCount} combined</Tag> : i.combinedPeriod ? <Tag>Combined</Tag> : null}
                  {i.direction === 'in' && <Tag $tone="accent">Coming in</Tag>}
                  {(() => {
                    const note = [i.combinedPeriod, categoryName(categories, i.categoryId ?? bills.find(b => b.id === i.billId)?.categoryId), i.billId && !billName(i.billId) ? 'bill removed' : undefined].filter(Boolean).join(' · ');
                    return note ? <small>{note}</small> : null;
                  })()}
                </span>
                <span>{i.direction === 'out' ? '−' : '+'}{formatCents(i.amountCents)}</span>
                <span className="status">{i.clearedOn ? `Cleared ${formatDay(i.clearedOn)}` : 'Waiting'}</span>
                <LineActions>
                  {!closed && <SmallBtn type="button" onClick={() => setEditingId(i.id)}>Edit</SmallBtn>}
                  {!closed && <ConfirmDelete label="Remove" onConfirm={() => setItems(items.filter(x => x.id !== i.id))} />}
                </LineActions>
              </Line>
            )))}
            <LineTotal>
              <span />
              <span>Total paying</span>
              <span>{summary.payingCents >= summary.incomingCents ? '−' : '+'}{formatCents(Math.abs(summary.payingCents - summary.incomingCents))}</span>
              <span /><span />
            </LineTotal>
          </ListBox>
        )}
        {carried > 0 && <Note style={{ marginBottom: 12 }}>{carried} waiting {carried === 1 ? 'line was' : 'lines were'} carried over to a newer payday.</Note>}
        {!closed && <LineForm initial={blankLine} categories={categories} submitLabel="Add" onSubmit={(d, cents) => setItems([...items, itemFromDraft(d, cents)])} hint />}
      </Section>

      {/* ── Spending from leftover ── */}
      <Section aria-label="Spending from leftover">
        <SheetHead>
          <SheetHeading>Spending from leftover</SheetHeading>
          {payday.spending.length > 0 && <Hint style={{ margin: 0 }}>{formatCents(summary.spentCents)} spent · {formatCents(summary.leftoverCents)} left</Hint>}
        </SheetHead>
        {payday.spending.length > 0 && (
          <ListBox>
            {[...payday.spending].sort((a, b) => a.date.localeCompare(b.date)).map(s => (
              <Line key={s.id} $muted={!!s.clearedOn}>
                <ClearBox checked={!!s.clearedOn} disabled={closed} aria-label={`${s.description} cleared`} onChange={e => toggleSpend(s.id, e.target.checked)} />
                <span>{s.description}<small>{[formatDay(s.date), categoryName(categories, s.categoryId)].filter(Boolean).join(' · ')}</small></span>
                <span>−{formatCents(s.amountCents)}</span>
                <span className="status">{s.clearedOn ? `Cleared ${formatDay(s.clearedOn)}` : 'Waiting'}</span>
                <LineActions>{!closed && <ConfirmDelete label="Remove" onConfirm={() => update({ spending: payday.spending.filter(x => x.id !== s.id) })} />}</LineActions>
              </Line>
            ))}
          </ListBox>
        )}
        {!closed && <SpendForm categories={categories} defaultDate={todayStr() >= payday.date ? todayStr() : payday.date} onAdd={s => update({ spending: [...payday.spending, s] })} />}
      </Section>

      {/* ── Balance check ── */}
      <Section aria-label="Check my balance">
        <SheetHead><SheetHeading>Check my balance</SheetHeading></SheetHead>
        {!closed && (
          <CheckRow>
            <form onSubmit={runCheck}>
              <FieldRow $cols="auto minmax(0, 1fr) auto">
                <label><span className="lbl">Bank says</span></label>
                <label><span className="pre">$</span><input aria-label="Current bank balance" inputMode="decimal" value={bankText} onChange={e => setBankText(e.target.value)} placeholder="0.00" /></label>
                <label style={{ padding: '0 6px' }}><AddBtn type="submit" disabled={parseMoney(bankText) === null}>Check</AddBtn></label>
              </FieldRow>
            </form>
            {!check && <span>Enter what your bank shows to compare</span>}
          </CheckRow>
        )}
        {check && lastCheck && (
          <>
            <StatBoxRow $cols={3} style={{ marginTop: 16 }}>
              <StatCell label="Bank shows" cents={lastCheck.balanceCents} sub={new Date(lastCheck.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />
              <StatCell label="Should show" cents={check.expectedCents} sub="Start − cleared lines" />
              <StatCell label="Available now" cents={check.availableCents} sub="Bank − still waiting" tone={check.availableCents < 0 ? 'danger' : undefined} />
            </StatBoxRow>
            <Verdict $ok={check.matches} role="status">
              {check.matches
                ? 'Matches ✓ — nothing unexpected went through.'
                : `Off by ${formatCents(Math.abs(check.differenceCents))} — the bank shows ${check.differenceCents < 0 ? 'less' : 'more'} than expected. Something not listed went through, an amount differs, or a line needs ticking.`}
            </Verdict>
          </>
        )}
      </Section>
    </div>
  );
}

/* ── Payday header: a --bg-panel bar with the date and starting balance ── */

const HeaderBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 24px;
  margin-top: 32px;
  background: var(--bg-panel);
  border-radius: 12px;
  /* && beats FinanceShell's "first block has no top padding" rule */
  && { padding: 18px 22px; }
`;

const HeadField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  & > span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  input {
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: var(--text-secondary);
    color-scheme: light dark;
    font-variant-numeric: tabular-nums;
  }
  input::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; margin-left: 18px; }
  & + & { padding-left: 24px; border-left: 1px solid var(--border-card); }
`;

const Money$ = styled.span`
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-family: var(--font-sans);
  font-size: 17px;
  color: var(--text-secondary);
  input { width: 140px; }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
`;

/**
 * The payday's header: date and starting balance (saves on blur / Enter; a bad
 * amount reverts), Close / Reopen, and a ⋯ menu (New payday, Delete).
 */
export function PaydayHeader({ payday, onChange, onDelete, onNew }: {
  payday: PaydayRecord; onChange: (next: PaydayRecord) => void; onDelete: () => void; onNew: () => void;
}) {
  const [startText, setStartText] = useState(centsToInput(payday.startingBalanceCents));
  const closed = payday.status === 'closed';
  const saveStart = () => {
    const cents = parseMoney(startText);
    if (cents === null) { setStartText(centsToInput(payday.startingBalanceCents)); return; }
    setStartText(centsToInput(cents));
    if (cents !== payday.startingBalanceCents) onChange({ ...payday, startingBalanceCents: cents });
  };
  const menu: RowMenuItem[] = [
    { label: 'New payday', onSelect: onNew },
    { label: 'Delete payday', danger: true, confirmLabel: 'Click again to delete', onSelect: onDelete },
  ];
  return (
    <HeaderBar>
      <form style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }} onSubmit={e => { e.preventDefault(); saveStart(); }}>
        <HeadField>
          <span>{closed ? 'Payday (closed)' : 'Current payday'}</span>
          <input type="date" value={payday.date} disabled={closed} onChange={e => e.target.value && onChange({ ...payday, date: e.target.value })} />
        </HeadField>
        <HeadField>
          <span>Starting balance</span>
          <Money$>$<input inputMode="decimal" aria-label="Starting balance" value={startText} disabled={closed} onChange={e => setStartText(e.target.value)} onBlur={saveStart} placeholder="0.00" /></Money$>
        </HeadField>
      </form>
      <HeaderRight>
        {closed
          ? <RowBtn type="button" onClick={() => onChange({ ...payday, status: 'open', closedOn: undefined })}>Reopen payday</RowBtn>
          : <RowBtn type="button" onClick={() => onChange({ ...payday, status: 'closed', closedOn: todayStr() })}>Close payday</RowBtn>}
        <RowMenu label="More payday actions" items={menu} />
      </HeaderRight>
    </HeaderBar>
  );
}
