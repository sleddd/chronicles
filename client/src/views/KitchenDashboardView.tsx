import { useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import { NAV_COMPACT } from '../styles/breakpoints.js';
import { KITCHEN_TITLE, MealsTabBar } from '../components/molecules/MealsTabBar.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { entries as entriesApi } from '../services/api.js';
import { builtinEntryName, stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { longDay } from '../components/organisms/FoodLog.js';
import { latestOpenList, menuDays, upcomingMeals } from '../utils/kitchen.js';
import type { ShoppingItem } from '../types/fields.js';
import { TickMark } from '../components/atoms/TickMark.js';

/* ── Layout (mirrors the Health dashboard) ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

const Head = styled.div`
  padding: 53px 0 28px; /* room under the title before the tabs */
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* Bordered collapsible cards like the Health dashboard: side by side on
   desktop, stacked on tablet and phone. */
const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
  margin-top: 24px;
  ${NAV_COMPACT} { grid-template-columns: minmax(0, 1fr); }
`;

const CARDS_KEY = 'kitchen-dashboard-collapsed-v1';

const SectionLink = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  &:hover { opacity: 0.7; }
`;

const Note = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
`;

function DashCard(props: { id: string; title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <CollapsibleCard storageKey={CARDS_KEY} {...props} />;
}

/* ── Today's meals ── */

/* One planned meal: slot name in muted grey, the meal beside it. No rules
   between rows; a row lifts onto a soft fill on hover (recipe rows open it). */
const MealRow = styled.button<{ $link: boolean }>`
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 16px;
  align-items: baseline;
  width: calc(100% + 32px);
  margin: 0 -16px;
  padding: 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: ${({ $link }) => ($link ? 'pointer' : 'default')};
  transition: background 120ms ease;
  &:hover { background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  @media (max-width: 480px) { grid-template-columns: 110px minmax(0, 1fr); }
`;

const SlotLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const MealName = styled.span`
  font-family: var(--font-sans);
  font-size: 17px;
  color: var(--text-secondary);
`;

const Meals = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: -20px; /* rows start close under the header */
`;

/** Today's planned meals, else the next planned day within two weeks. */
function useUpcomingMeals() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const today = toDateStr(new Date());
  const menuTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'menu plan')?.id, [allTopics]);
  const next = useMemo(() => upcomingMeals(menuDays(entries, menuTopicId), today), [entries, menuTopicId, today]);
  // The card title: "Today", or the day the shown meals are planned for
  const title = next && next.day !== today ? longDay(next.day) : 'Today';
  // "Sat, Oct 17 · 2 meals planned"
  const subtitle = next
    ? `${new Date(`${next.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${next.meals.length} ${next.meals.length === 1 ? 'meal' : 'meals'} planned`
    : undefined;
  return { next, title, subtitle };
}

function UpcomingMeals({ next }: { next: ReturnType<typeof useUpcomingMeals>['next'] }) {
  const openInJournal = useOpenInJournal();

  if (!next) return <Note>Nothing planned for the next two weeks. Plan meals on the Menu tab.</Note>;
  return (
    <Meals>
      {next.meals.map(m => (
        <MealRow
          key={m.slot}
          type="button"
          $link={m.recipeId !== null}
          onClick={() => { if (m.recipeId !== null) openInJournal(m.recipeId); }}
          title={m.recipeId !== null ? 'Open recipe' : undefined}
        >
          <SlotLabel>{m.label}</SlotLabel>
          <MealName>{m.name}</MealName>
        </MealRow>
      ))}
    </Meals>
  );
}

/* ── Shopping list checklist ── */

/* Sentence-case accent link in the card's title row ("Open list") */
const HeadLink = styled.button`
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--color-accent);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

/* How much of the list is got: a 4px rule under the header */
const Progress = styled.div`
  height: 4px;
  margin: 0 0 28px;
  border-radius: 2px;
  background: var(--border-card);
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: var(--color-accent-fill, var(--color-accent));
  transition: width 200ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Items = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

/* One item: a round tick-off circle and its name */
const ItemBtn = styled.button<{ $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 16px;
  color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; border-radius: 4px; }
`;

const Tick = styled.span<{ $done: boolean }>`
  flex: none;
  display: inline-flex;
`;

/* Add an item: an outlined box with a + — Enter adds */
const AddBox = styled.form`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 28px;
  height: 48px;
  padding: 0 18px;
  border: 1px solid var(--border-card);
  border-radius: var(--r-lg, 6px);
  color: var(--text-muted); /* the + */
  &:focus-within { border-color: var(--color-accent); }
`;

const AddInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  outline: none;
  &::placeholder { color: var(--text-placeholder); }
`;

const ErrorNote = styled(Note)`
  color: var(--color-danger, #9B4444);
  margin-top: 8px;
`;

/** The newest shopping list with unchecked items, and its name for the card title. */
function useOpenShoppingList() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const listTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'shopping list')?.id, [allTopics]);
  const list = useMemo(() => latestOpenList(entries, listTopicId), [entries, listTopicId]);
  const cf = ((list?.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
  const title = list ? (stripHtml(list.content).trim() || builtinEntryName(cf) || 'Shopping List') : 'Shopping List';
  const left = ((cf.items as ShoppingItem[] | undefined) ?? []).filter(i => !i.checked).length;
  return { list, title, left };
}

function ShoppingChecklist({ list }: { list: ReturnType<typeof useOpenShoppingList>['list'] }) {
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const { encryptPost } = useEncryption();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  if (!list) {
    return (
      <Note>
        No open shopping list.{' '}
        <SectionLink type="button" onClick={() => navigate('/shopping')}>Start one</SectionLink>
      </Note>
    );
  }

  const meta = (list.metadata as Record<string, unknown>) ?? {};
  const cf = (meta._customFields as Record<string, unknown>) ?? {};
  const items = (cf.items as ShoppingItem[] | undefined) ?? [];
  const left = items.filter(i => !i.checked).length;

  const saveItems = async (next: ShoppingItem[]) => {
    const prev = list.metadata;
    const metadata = { ...meta, _customFields: { ...cf, items: next } };
    updateDecryptedEntry(list.id, { metadata });
    setError('');
    try {
      const tid = meta._taxonomyId as number | undefined;
      const encrypted = await encryptPost(list.content, metadata);
      await entriesApi.update(list.id, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        taxonomyIds: tid ? [tid] : [],
      });
    } catch (err) {
      console.error('Shopping list save failed:', err);
      updateDecryptedEntry(list.id, { metadata: prev });
      setError('That change didn’t save — try again.');
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void saveItems([...items, { id: crypto.randomUUID(), name: text, category: 'other', checked: false }]);
  };

  // Unchecked first, so what's still needed sits at the top
  const ordered = [...items.filter(i => !i.checked), ...items.filter(i => i.checked)];
  const pct = items.length ? ((items.length - left) / items.length) * 100 : 0;

  return (
    <>
      <Progress role="progressbar" aria-label="Items got" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={items.length - left}>
        <ProgressFill $pct={pct} />
      </Progress>
      {items.length === 0 && <Note>No items yet.</Note>}
      <Items>
        {ordered.map(item => (
          <li key={item.id}>
            <ItemBtn type="button" $done={item.checked} aria-pressed={item.checked}
              onClick={() => void saveItems(items.map(i => (i.id === item.id ? { ...i, checked: !i.checked } : i)))}>
              <Tick $done={item.checked} aria-hidden="true">
                <TickMark checked={item.checked} />
              </Tick>
              {item.name || 'Item'}
            </ItemBtn>
          </li>
        ))}
      </Items>
      <AddBox onSubmit={add}>
        <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
        <AddInput value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="Add an item" />
      </AddBox>
      {error && <ErrorNote role="alert">{error}</ErrorNote>}
    </>
  );
}

/* ── View ── */

/**
 * From the Kitchen dashboard: what's on the menu today (or next), and the
 * latest unfinished shopping list as a checklist you can tick off and add to.
 */
export function KitchenDashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const navigate = useNavigate();
  // Cards are titled by what they show: "Today" (or the next planned day) and the list's own name
  const meals = useUpcomingMeals();
  const shopping = useOpenShoppingList();
  const openInJournal = useOpenInJournal();

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  const seeAll = (path: string) => <SectionLink type="button" onClick={() => navigate(path)}>See all</SectionLink>;

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head><Title>{KITCHEN_TITLE}</Title></Head>
          <MealsTabBar />

          <CardGrid>
            <DashCard id="meals" title={meals.title} subtitle={meals.subtitle}
              action={<HeadLink type="button" onClick={() => navigate('/menu')}>See all</HeadLink>}>
              <UpcomingMeals next={meals.next} />
            </DashCard>

            <DashCard
              id="shopping"
              title="Shopping list"
              subtitle={shopping.list ? `${shopping.title} · ${shopping.left} left to get` : undefined}
              action={shopping.list
                ? <HeadLink type="button" onClick={() => openInJournal(shopping.list!.id)}>Open list</HeadLink>
                : seeAll('/shopping')}
            >
              <ShoppingChecklist list={shopping.list} />
            </DashCard>
          </CardGrid>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
