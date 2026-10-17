import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { CollapsibleCard } from './CollapsibleCard.js';
import {
  SectionHead, SectionLabel, Note, TextAction, SmallPill, StatStrip, Stat, Money, Table, Row, TotalRow,
  Cell, SubText, Tag, InlineForm, Field, SmallBtn, Actions, ConfirmDelete, ClearBox, ErrorNote,
} from '../molecules/FinanceParts.js';
import {
  balanceCheck, formatCents, formatDay, isReadyToSpend, newId, parseMoney, paydaySummary,
  suggestBillsForPayday, todayStr, centsToInput,
} from '../../utils/finance.js';
import type { FinanceRecord, Payday, PaydayItem, PaydaySpend } from '../../types/finance.js';
import { continueRules } from '../../styles/columnRules.js';

export type PaydayRecord = FinanceRecord<'paydays'>;

interface PaydayEditorProps {
  payday: PaydayRecord;
  bills: FinanceRecord<'bills'>[];
  categories: FinanceRecord<'budget'>[];
  onChange: (next: PaydayRecord) => void;
}

/* ── Layout bits ── */

/* "Current payday" row in the Paydays card: label · date + balance · close/delete,
   between hairlines, above the history list */
const CurrentRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 20px;
  padding: 14px 0;
  border-top: 1px solid var(--border-subtle);
  /* No bottom rule: the history list's first row draws the line below */
`;

const CurrentLabel = styled.span`
  align-self: center;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  white-space: nowrap;
`;

const HeaderFields = styled(InlineForm)`
  flex-wrap: nowrap;
  gap: 10px;
  @media (max-width: 640px) { flex-wrap: wrap; }
`;

const RowControls = styled(Actions)`
  margin-left: auto;
  align-self: center;
`;

const Banner = styled.div<{ $ready: boolean }>`
  margin-top: 24px;
  padding: 14px 16px;
  border-radius: var(--r-lg, 2px);
  font-family: var(--font-sans);
  font-size: 15px;
  background: ${({ $ready }) => ($ready ? 'var(--color-accent)' : 'var(--bg-sunken)')};
  color: ${({ $ready }) => ($ready ? 'var(--on-accent)' : 'var(--text-secondary)')};
  strong { font-weight: 600; }
`;

const ITEM_COLS = '28px minmax(0, 1fr) 110px 120px minmax(0, auto)';
const ITEM_COLS_PHONE = '28px minmax(0, 1fr) 96px';

const ItemRow = styled(Row)`
  @media (max-width: 640px) {
    grid-template-columns: ${ITEM_COLS_PHONE};
    & > :nth-child(4) { display: none; }
    & > :nth-child(5) { grid-column: 2 / -1; justify-content: flex-start; padding-top: 0; ${continueRules(96 - 8)} }
  }
`;

const ItemTotal = styled(TotalRow)`
  @media (max-width: 640px) {
    grid-template-columns: ${ITEM_COLS_PHONE};
    & > :nth-child(4), & > :nth-child(5) { display: none; }
  }
`;

const Picker = styled.div`
  margin: 4px 0 16px;
  padding: 12px 16px 16px;
  background: var(--bg-sunken);
  border-radius: var(--r-lg, 2px);
`;

const PickRow = styled.label`
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto 110px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  &:last-of-type { border-bottom: none; }
  input[type='text'] {
    width: 100%;
    min-height: 30px;
    padding: 0 8px;
    text-align: right;
    font-size: 14px;
    background: var(--bg-app) !important;
    border: none;
    border-radius: var(--r-md, 1px);
    color: var(--text-primary);
  }
`;

const CheckResult = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px 24px;
  margin-top: 18px;
`;

const Verdict = styled.p<{ $ok: boolean }>`
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $ok }) => ($ok ? 'var(--color-success)' : 'var(--color-danger)')};
`;

/** Open/closed memory for the Reconcile cards. */
export const RECONCILE_CARDS_KEY = 'finance-reconcile-collapsed-v1';

const CardGap = styled.div`
  margin-top: 24px;
`;

const AddLink = styled(TextAction)`
  margin-top: 4px;
`;

/* ── Helpers ── */

function categoryName(categories: FinanceRecord<'budget'>[], id?: string): string | undefined {
  return id ? categories.find(c => c.id === id)?.name : undefined;
}

function CategorySelect({ value, onChange, categories, name }: {
  value: string; onChange: (v: string) => void; categories: FinanceRecord<'budget'>[]; name: string;
}) {
  return (
    <select aria-label={name} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">No category</option>
      {categories.filter(c => !c.archived || c.id === value).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
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

function LineForm({ initial, categories, submitLabel, onSubmit, onCancel }: {
  initial: LineDraft;
  categories: FinanceRecord<'budget'>[];
  submitLabel: string;
  onSubmit: (d: LineDraft, cents: number) => void;
  onCancel?: () => void;
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
    <InlineForm onSubmit={submit}>
      <Field $grow><span>Description</span>
        <input value={d.description} onChange={e => set({ description: e.target.value })} placeholder={d.combined ? 'Uber' : 'Rent, phone, check #104…'} />
      </Field>
      <Field $w="110px"><span>Type</span>
        <select value={d.direction} onChange={e => set({ direction: e.target.value as 'out' | 'in' })}>
          <option value="out">Paying</option>
          <option value="in">Coming in</option>
        </select>
      </Field>
      <Field $w="120px"><span>Amount</span>
        <input inputMode="decimal" value={d.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" />
      </Field>
      <Field $w="160px"><span>Category</span>
        <CategorySelect name="Category" value={d.categoryId} onChange={v => set({ categoryId: v })} categories={categories} />
      </Field>
      {d.combined && (
        <>
          <Field $w="90px"><span>How many</span>
            <input inputMode="numeric" value={d.combinedCount} onChange={e => set({ combinedCount: e.target.value.replace(/\D/g, '') })} placeholder="9" />
          </Field>
          <Field $w="140px"><span>Period</span>
            <input value={d.combinedPeriod} onChange={e => set({ combinedPeriod: e.target.value })} placeholder="Oct 1–15" />
          </Field>
        </>
      )}
      {onCancel && d.clearedOn && (
        <Field $w="170px"><span>Cleared on</span>
          <input type="date" value={d.clearedOn} onChange={e => set({ clearedOn: e.target.value })} />
        </Field>
      )}
      <Actions>
        <SmallBtn type="button" $on={d.combined} aria-pressed={d.combined} onClick={() => set({ combined: !d.combined })}>Combined</SmallBtn>
        <PillButton type="submit" disabled={!valid}>{submitLabel}</PillButton>
        {onCancel && <PillButton type="button" $variant="neutral" onClick={onCancel}>Cancel</PillButton>}
      </Actions>
    </InlineForm>
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
        <Note>No bills to add — every active bill is already on this payday, or none are set up yet (add them under Budget &amp; Bills).</Note>
        <AddLink type="button" onClick={onClose}>Close</AddLink>
      </Picker>
    );
  }

  return (
    <Picker>
      <SectionHead><SectionLabel>Pick the bills you're paying</SectionLabel><TextAction type="button" onClick={onClose}>Close</TextAction></SectionHead>
      {suggestions.map(s => (
        <PickRow key={s.bill.id}>
          <input type="checkbox" checked={!!picked[s.bill.id]} onChange={e => setPicked(p => ({ ...p, [s.bill.id]: e.target.checked }))} />
          <span>
            {s.bill.name}
            {s.bill.kind === 'subscription' && <Tag>Subscription</Tag>}
            {s.bill.autopay && <Tag>Autopay</Tag>}
          </span>
          <Cell $muted $small>Due {formatDay(s.due)}</Cell>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${s.bill.name} amount`}
            value={amounts[s.bill.id] ?? ''}
            onChange={e => setAmounts(a => ({ ...a, [s.bill.id]: e.target.value }))}
          />
        </PickRow>
      ))}
      <Actions style={{ marginTop: 12 }}>
        <PillButton
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
        </PillButton>
      </Actions>
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
    <InlineForm onSubmit={e => {
      e.preventDefault();
      if (!valid || cents === null) return;
      onAdd({ id: newId(), date, description: description.trim(), amountCents: cents, categoryId: categoryId || undefined });
      setDescription(''); setAmount('');
    }}>
      <Field $w="170px"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field $grow><span>What</span><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Groceries, gas…" /></Field>
      <Field $w="120px"><span>Amount</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
      <Field $w="160px"><span>Category</span><CategorySelect name="Spending category" value={categoryId} onChange={setCategoryId} categories={categories} /></Field>
      <Actions><PillButton type="submit" disabled={!valid}>Add</PillButton></Actions>
    </InlineForm>
  );
}

/* ── Editor ── */

/**
 * One payday: starting balance → the bills being paid → what's left to spend,
 * ticking each line as it clears, and a balance check against the bank.
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

      <StatStrip $cols={4}>
        <Stat label="Starting balance" cents={payday.startingBalanceCents} sub={formatDay(payday.date)} />
        <Stat label="Paying" cents={summary.payingCents} sub={summary.incomingCents ? `+${formatCents(summary.incomingCents)} coming in` : `${items.filter(i => i.direction === 'out').length} lines`} />
        <Stat label="Leftover to spend" cents={summary.leftoverCents} tone={summary.leftoverCents < 0 ? 'danger' : 'default'} sub={summary.spentCents ? `after ${formatCents(summary.spentCents)} spent` : undefined} />
        <Stat label="Still waiting" cents={summary.waitingCents} tone="muted" sub={summary.waitingCount ? `${summary.waitingCount} not cleared yet` : 'Everything cleared'} />
      </StatStrip>

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
      <CardGap>
      <CollapsibleCard
        id="paying"
        title="Bills I'm paying"
        storageKey={RECONCILE_CARDS_KEY}
        action={closed ? undefined : (
          <SmallPill type="button" style={{ marginRight: 16 }} onClick={() => setPicking(p => !p)}>{picking ? 'Close' : 'Add bills'}</SmallPill>
        )}
      >
        {picking && !closed && (
          <BillPicker
            payday={payday}
            bills={bills}
            onClose={() => setPicking(false)}
            onAdd={added => { setItems([...items, ...added]); setPicking(false); }}
          />
        )}
        {items.length > 0 && (
          <Table $cols={ITEM_COLS} $phoneCols={ITEM_COLS_PHONE}>
            {items.map(i => (editingId === i.id ? (
              <div key={i.id} style={{ padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <LineForm
                  initial={draftFromItem(i)}
                  categories={categories}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(d, cents) => { setItems(items.map(x => (x.id === i.id ? itemFromDraft(d, cents, i) : x))); setEditingId(null); }}
                />
              </div>
            ) : (
              <ItemRow key={i.id} $cols={ITEM_COLS} $muted={!!i.clearedOn}>
                <ClearBox checked={!!i.clearedOn} disabled={closed} aria-label={`${i.description} cleared`} onChange={e => toggleItem(i.id, e.target.checked)} />
                <span>
                  {i.description}
                  {i.combinedCount ? <Tag>{i.combinedCount} combined</Tag> : i.combinedPeriod ? <Tag>Combined</Tag> : null}
                  {i.direction === 'in' && <Tag $tone="accent">Coming in</Tag>}
                  <SubText>
                    {[i.combinedPeriod, categoryName(categories, i.categoryId ?? bills.find(b => b.id === i.billId)?.categoryId), i.billId && !billName(i.billId) ? 'bill removed' : undefined]
                      .filter(Boolean).join(' · ') || ' '}
                  </SubText>
                </span>
                <Cell $right><Money cents={i.amountCents} out={i.direction === 'out'} /></Cell>
                <Cell $muted $small>{i.clearedOn ? `Cleared ${formatDay(i.clearedOn)}` : 'Waiting'}</Cell>
                <Actions>
                  {!closed && <SmallBtn type="button" onClick={() => setEditingId(i.id)}>Edit</SmallBtn>}
                  {!closed && <ConfirmDelete label="Remove" onConfirm={() => setItems(items.filter(x => x.id !== i.id))} />}
                </Actions>
              </ItemRow>
            )))}
            <ItemTotal $cols={ITEM_COLS}>
              <span />
              <span>Total paying</span>
              <Cell $right><Money cents={summary.payingCents - summary.incomingCents} out={summary.payingCents >= summary.incomingCents} /></Cell>
              <span />
              <span />
            </ItemTotal>
          </Table>
        )}
        {carried > 0 && <Note style={{ marginTop: 8 }}>{carried} waiting {carried === 1 ? 'line was' : 'lines were'} carried over to a newer payday.</Note>}
        {!closed && (
          <div style={{ marginTop: 16 }}>
            <LineForm initial={blankLine} categories={categories} submitLabel="Add line" onSubmit={(d, cents) => setItems([...items, itemFromDraft(d, cents)])} />
          </div>
        )}
      </CollapsibleCard>
      </CardGap>

      {/* ── Spending from leftover ── */}
      <CardGap>
      <CollapsibleCard
        id="spending"
        title="Spending from leftover"
        storageKey={RECONCILE_CARDS_KEY}
        action={payday.spending.length > 0
          ? <Cell $muted $small style={{ marginRight: 16 }}>{formatCents(summary.spentCents)} spent · {formatCents(summary.leftoverCents)} left</Cell>
          : undefined}
      >
        {payday.spending.length > 0 && (
          <Table $cols={ITEM_COLS} $phoneCols={ITEM_COLS_PHONE}>
            {[...payday.spending].sort((a, b) => a.date.localeCompare(b.date)).map(s => (
              <ItemRow key={s.id} $cols={ITEM_COLS} $muted={!!s.clearedOn}>
                <ClearBox checked={!!s.clearedOn} disabled={closed} aria-label={`${s.description} cleared`} onChange={e => toggleSpend(s.id, e.target.checked)} />
                <span>{s.description}<SubText>{[formatDay(s.date), categoryName(categories, s.categoryId)].filter(Boolean).join(' · ')}</SubText></span>
                <Cell $right><Money cents={s.amountCents} out /></Cell>
                <Cell $muted $small>{s.clearedOn ? `Cleared ${formatDay(s.clearedOn)}` : 'Waiting'}</Cell>
                <Actions>{!closed && <ConfirmDelete label="Remove" onConfirm={() => update({ spending: payday.spending.filter(x => x.id !== s.id) })} />}</Actions>
              </ItemRow>
            ))}
          </Table>
        )}
        {!closed && (
          <div style={{ marginTop: 16 }}>
            <SpendForm categories={categories} defaultDate={todayStr() >= payday.date ? todayStr() : payday.date} onAdd={s => update({ spending: [...payday.spending, s] })} />
          </div>
        )}
      </CollapsibleCard>
      </CardGap>

      {/* ── Balance check ── */}
      <CardGap>
      <CollapsibleCard id="balance" title="Check my balance" storageKey={RECONCILE_CARDS_KEY}>
        {!closed && (
          <InlineForm onSubmit={runCheck}>
            <Field $w="200px"><span>Current bank balance</span>
              <input inputMode="decimal" value={bankText} onChange={e => setBankText(e.target.value)} placeholder="0.00" />
            </Field>
            <Actions><PillButton type="submit" disabled={parseMoney(bankText) === null}>Check</PillButton></Actions>
          </InlineForm>
        )}
        {check && lastCheck && (
          <>
            <CheckResult>
              <Stat label="Bank shows" cents={lastCheck.balanceCents} sub={new Date(lastCheck.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />
              <Stat label="Should show" cents={check.expectedCents} sub="Start − cleared lines" />
              <Stat label="Available now" cents={check.availableCents} sub="Bank − still waiting" tone={check.availableCents < 0 ? 'danger' : 'default'} />
            </CheckResult>
            <Verdict $ok={check.matches} role="status">
              {check.matches
                ? 'Matches ✓ — nothing unexpected went through.'
                : `Off by ${formatCents(Math.abs(check.differenceCents))} — the bank shows ${check.differenceCents < 0 ? 'less' : 'more'} than expected. Something not listed went through, an amount differs, or a line needs ticking.`}
            </Verdict>
          </>
        )}
      </CollapsibleCard>
      </CardGap>
    </div>
  );
}


/**
 * The current payday's row in the Paydays card: its date and starting balance
 * (the balance saves on blur / Enter; a bad amount reverts), then close /
 * reopen and delete on the right.
 */
export function CurrentPaydayRow({ payday, onChange, onDelete }: {
  payday: PaydayRecord; onChange: (next: PaydayRecord) => void; onDelete: () => void;
}) {
  const [startText, setStartText] = useState(centsToInput(payday.startingBalanceCents));
  const closed = payday.status === 'closed';
  const saveStart = () => {
    const cents = parseMoney(startText);
    if (cents === null) { setStartText(centsToInput(payday.startingBalanceCents)); return; }
    setStartText(centsToInput(cents));
    if (cents !== payday.startingBalanceCents) onChange({ ...payday, startingBalanceCents: cents });
  };
  return (
    <CurrentRow>
      <CurrentLabel>Current payday</CurrentLabel>
      <HeaderFields onSubmit={e => { e.preventDefault(); saveStart(); }}>
        <Field $w="170px"><span>Payday</span>
          <input type="date" value={payday.date} disabled={closed} onChange={e => e.target.value && onChange({ ...payday, date: e.target.value })} />
        </Field>
        <Field $w="170px"><span>Starting balance</span>
          <input inputMode="decimal" value={startText} disabled={closed} onChange={e => setStartText(e.target.value)} onBlur={saveStart} placeholder="0.00" />
        </Field>
      </HeaderFields>
      <RowControls>
        {closed
          ? <SmallBtn type="button" onClick={() => onChange({ ...payday, status: 'open', closedOn: undefined })}>Reopen</SmallBtn>
          : <SmallBtn type="button" onClick={() => onChange({ ...payday, status: 'closed', closedOn: todayStr() })}>Close this payday</SmallBtn>}
        <ConfirmDelete label="Delete" onConfirm={onDelete} />
      </RowControls>
    </CurrentRow>
  );
}
