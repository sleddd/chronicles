import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { RowMenu } from '../components/molecules/FinanceParts.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { LoadMore } from '../components/molecules/LoadMore.js';
import { FilterPick } from '../components/molecules/FilterPick.js';
import { PlanGroup, PlanRow, PlanTable, PlanMuted, type PlanColumn } from '../components/molecules/PlanTable.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { singular } from '../utils/singular.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { topics as topicsApi } from '../services/api.js';
import { usePrivateSettings } from '../services/privateSettings.js';
import { TopicEditForm } from '../components/molecules/TopicEditForm.js';
import { TopicIcon } from '../components/molecules/IconPicker.js';
import { RoundSearch } from '../components/molecules/RoundSearch.js';
import { entryOutline } from '../utils/entryOutline.js';
import { tagsInUse, tagsOf, sameTag } from '../utils/entryTags.js';
import { topicKind } from '../utils/topicKind.js';
import { groupTopicRows, sortTopicRows, type TopicGroup, type TopicSort } from '../utils/topicList.js';
import { shortDay } from '../utils/planTable.js';
import { toDateStr } from '../utils/dateUtils.js';
import type { UserFieldDef } from '../types/userFields.js';
import type { DecryptedPost } from '@shared/crypto/types';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';
import { onPhoto } from '../styles/wallpaper.js';
import { topicEntries as entriesOfTopic } from '../utils/topicIndex.js';

/* ── Layout (mirrors TopicsView) ── */

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
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 20px;
`;

const TitleBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
`;

/* Back caret matched to the thin 44px title beside it (34px on phones): the
   chevron glyph only fills part of its em box, so it's set larger to reach close
   to the capitals' height, at the title's thin weight. Its side bearings are pulled
   in so the stroke lines up with the page edge and sits close to the title. */
const BackBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  margin-left: -20px;
  margin-right: -10px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-primary); /* the standard text colour, never the accent */
  ${onPhoto}
  cursor: pointer;
  & > span {
    font-size: 56px;
    font-weight: 100;
    font-variation-settings: 'FILL' 0, 'wght' 100, 'GRAD' 0, 'opsz' 48;
  }
  @media (max-width: 480px) {
    height: 34px;
    margin-left: -16px;
    margin-right: -7px;
    & > span { font-size: 44px; }
  }
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  /* White on the background photo, like every page's title */
  ${onPhoto}
  /* overflow: hidden (for the ellipsis) clips descenders at line-height 1 —
     room below for g/p/y, given back with a negative margin so layout holds */
  padding-bottom: 0.2em;
  margin: 0 0 -0.2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* Topic icon beside the title, in the title's colour at its thin weight */
const TitleIcon = styled.span`
  display: inline-flex;
  margin: 0 14px 0 6px;
  color: var(--text-primary);
  ${onPhoto}
  & > span { font-weight: 200; font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48; }
`;

/* Edit topic and New … */
const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  @media (max-width: 768px) { display: none; }
`;

/* Phones: Edit topic and New … fold into a ⋯ menu across from the title */
const HeadMenu = styled.div`
  display: none;
  flex-shrink: 0;
  button[aria-haspopup] { font-size: 22px; color: var(--text-secondary); }
  @media (max-width: 768px) { display: block; }
`;

/* "Search books" — the shared rounded search box, at the filter row's right end
   (its own line, full width, on phones) */
const Search = styled(RoundSearch)`
  margin-left: auto;
  width: 320px;
  @media (max-width: 768px) { margin-left: 0; width: 100%; order: -1; }
`;

/* Group / Tags / Sort, the search at the right; a hairline under it, then room before the table */
const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin: 24px 0 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
`;

/* A bookmarked entry's mark before its title */
const Mark = styled.span`
  display: inline-flex;
  flex: none;
  color: var(--color-accent);
`;

/* ── Rows ── */

/* Everything under the title starts at the topic icon's left edge, not the
   caret's: caret box (56px, pulled in 20 + 10) + the icon's 6px margin + the
   glyph's own side bearing ≈ 34px (smaller caret on phones) */
const ICON_INSET = '34px';

/* Desktop: content lines up with the topic icon; phones (≤768px): with the back caret */
const Body = styled.div`
  padding-left: ${ICON_INSET};
  @media (max-width: 768px) { padding-left: 0; }
`;

const EditBox = styled.div`
  max-width: 704px;
  margin-top: 8px;
  padding: 0 32px 0 ${ICON_INSET};
  @media (max-width: 768px) { padding: 0 16px 0 0; }
`;

/* ── View ── */

export function TopicDetailView() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { isReady, isLoading } = useInitializeData();
  const allTopics = useEntriesStore(s => s.allTopics);
  const entries = useEntriesStore(s => s.decryptedEntries);
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;
  const openInJournal = useOpenInJournal();

  const topic = allTopics.find(t => String(t.id) === String(topicId));

  const newEntry = useNewEntryInJournal();

  const handleDeleteEntry = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  const topicEntries = useMemo(() => {
    if (!topic) return [];
    return [...entriesOfTopic(entries, topic.id)]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, topic]);

  // The topic's own fields: the first one is the row's title, the rest its muted line
  const fieldDefs = useUIStore(s => (topic ? s.topicCustomFields[topic.id] : undefined)) ?? NO_DEFS;
  const rowText = useCallback((entry: DecryptedPost) => {
    const vals = (((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)?._userFields as Record<string, unknown>) ?? {};
    const texts = fieldDefs.map(d => vals[d.id]).filter(v => v !== undefined && v !== null && v !== '' && typeof v !== 'boolean').map(String);
    if (!fieldDefs.length || !vals[fieldDefs[0].id]) return null;
    return { title: texts[0], sub: texts.slice(1).join(' · ') };
  }, [fieldDefs]);

  // Custom tags are a text topic's (the journal, a plain topic, one with only the person's own fields)
  const tagged = !topicKind(topic?.name);

  // Each entry as a row: its title and next line (the topic's first field and the rest when it has
  // fields, else its first line and the next — code in a code face), its tags, lines and date
  const rows = useMemo(() => topicEntries.map(e => {
    const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
    const outline = entryOutline(e.content);
    const own = rowText(e);
    return {
      id: e.id,
      title: own?.title || outline.title || builtinEntryName(cf) || 'Untitled',
      titleCode: !own && outline.titleCode,
      note: own ? own.sub : outline.note,
      noteCode: !own && outline.noteCode,
      lines: outline.lines,
      tags: tagged ? tagsOf(cf) : [],
      bookmarked: !!cf?._isFavorite,
      created: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
    };
  }), [topicEntries, rowText, tagged]);

  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = (next: Partial<Prefs>) => {
    const all = { ...prefs, ...next };
    setPrefs(all);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ group: all.group, sort: all.sort })); } catch { /* storage unavailable */ }
  };
  const [tagFilter, setTagFilter] = useState('');
  const tagChoices = useMemo(() => tagsInUse(topicEntries.map(e => (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined)), [topicEntries]);
  const group: TopicGroup = prefs.group === 'tag' && !tagged ? 'month' : prefs.group;
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const passes = (r: typeof rows[number]) => (!tagFilter || r.tags.some(t => sameTag(t, tagFilter)))
      && words.every(w => `${r.title} ${r.note} ${r.tags.join(' ')}`.toLowerCase().includes(w));
    return sortTopicRows(rows.filter(passes), prefs.sort);
  }, [rows, query, tagFilter, prefs.sort]);
  // A page of rows at a time (a long topic never draws all of them at once)
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [query, tagFilter, prefs.sort, group]);
  const groups = useMemo(() => groupTopicRows(shown.slice(0, limit), group, new Date().getFullYear()), [shown, limit, group]);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggleFold = (key: string) => setFolded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const today = toDateStr(new Date());


  // Inline topic editor (same as the Topics list's)
  const setTopics = useEntriesStore(s => s.setTopics);
  const updateTopicFields = useUIStore(s => s.updateTopicFields);
  const { savePrivateSetting } = usePrivateSettings();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const startEdit = () => { if (!topic) return; setEditName(topic.name); setEditIcon(topic.icon); setEditing(true); };
  const saveEdit = async () => {
    if (!topic || !editName.trim()) return;
    try {
      const updated = await topicsApi.update(topic.id, { name: editName.trim(), icon: editIcon || undefined });
      setTopics(allTopics.map(t => (t.id === topic.id ? updated : t)));
      setEditing(false);
    } catch (err) { console.error('Failed to update topic:', err); }
  };
  const deleteTopic = async () => {
    if (!topic) return;
    try {
      await topicsApi.delete(topic.id);
      setTopics(allTopics.filter(t => t.id !== topic.id));
      navigate('/topics');
    } catch (err) { console.error('Failed to delete topic:', err); }
  };
  const changeFields = (defs: UserFieldDef[]) => {
    if (!topic) return;
    updateTopicFields(topic.id, defs);
    savePrivateSetting('topicCustomFields', { ...useUIStore.getState().topicCustomFields, [topic.id]: defs })
      .catch(err => console.error('Failed to save topic fields:', err));
  };

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  if (!topic) return (
    <ContentTemplate>
      <EmptyState message="Topic not found." submessage="It may have been deleted." />
    </ContentTemplate>
  );

  if (editing) return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <TitleBlock>
              <BackBtn onClick={() => setEditing(false)} aria-label={`Back to ${topic.name}`}>
                <MaterialIcon $size={56} aria-hidden="true">chevron_left</MaterialIcon>
              </BackBtn>
              <Title>Edit topic</Title>
            </TitleBlock>
          </Head>
          <EditBox>
            <TopicEditForm
              name={editName}
              icon={editIcon}
              cancelLabel="Close"
              onNameChange={setEditName}
              onIconChange={setEditIcon}
              onSave={() => void saveEdit()}
              onCancel={() => setEditing(false)}
              topicId={topic.id}
              fieldDefs={fieldDefs}
              onFieldDefsChange={changeFields}
              onDelete={() => void deleteTopic()}
            />
          </EditBox>
        </Inner>
      </Page>
    </ContentTemplate>
  );

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <TitleBlock>
              <BackBtn onClick={() => navigate('/topics')} aria-label="Back to topics">
                <MaterialIcon $size={56} aria-hidden="true">chevron_left</MaterialIcon>
              </BackBtn>
              <TitleIcon><TopicIcon name={topic.icon} size={40} /></TitleIcon>
              <Title>{topic.name}</Title>
            </TitleBlock>
            <HeadActions>
              {/* Both are page actions: on the background photo Edit topic is a frosted glass pill, New stays solid */}
              <span className="page-action" style={{ display: 'contents' }}>
                <PillButton type="button" $variant="neutral" onClick={startEdit}>Edit topic</PillButton>
                <PillButton type="button" $variant="solid" onClick={() => newEntry(topic.id)}>New {singular(topic.name)}</PillButton>
              </span>
            </HeadActions>
            <HeadMenu>
              <RowMenu label={`${topic.name} actions`} items={[
                { label: `New ${singular(topic.name)}`, onSelect: () => newEntry(topic.id) },
                { label: 'Edit topic', onSelect: startEdit },
              ]} />
            </HeadMenu>
          </Head>

          <Body>
          {topicEntries.length === 0 ? (
            <EmptyState message={`No ${topic.name.toLowerCase()} entries yet.`} />
          ) : (<>
            <FilterRow role="group" aria-label={`Show ${topic.name}`}>
              <FilterPick name="Group" value={GROUPS.find(g => g.value === group)?.label ?? 'Month'} set={false}>
                <select aria-label="Group by" value={group} onChange={e => setPref({ group: e.target.value as TopicGroup })}>
                  {GROUPS.filter(g => g.value !== 'tag' || tagged).map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </FilterPick>
              {tagged && tagChoices.length > 0 && (
                <FilterPick name="Tags" value={tagFilter || 'All'} set={!!tagFilter}>
                  <select aria-label="Tags" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
                    <option value="">All</option>
                    {tagChoices.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FilterPick>
              )}
              <FilterPick name="Sort" value={SORTS.find(x => x.value === prefs.sort)?.label ?? 'Newest'} set={false}>
                <select aria-label="Sort" value={prefs.sort} onChange={e => setPref({ sort: e.target.value as TopicSort })}>
                  {SORTS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </FilterPick>
              <Search ariaLabel={`Search ${topic.name}`} value={query} onChange={setQuery} placeholder={`Search ${topic.name.toLowerCase()}`} />
            </FilterRow>

            {shown.length === 0 ? (
              <EmptyState message="Nothing matches that search." />
            ) : (
              <PlanTable label={topic.name} columns={tagged ? COLUMNS : COLUMNS.filter(c => c.label !== 'Tags')}>
                {groups.map(g => {
                  const body = g.rows.map(r => (
                    <SwipeActions key={`${g.key}:${r.id}`} accentColor={accentColor} onDelete={() => handleDeleteEntry(r.id)}>
                      <PlanRow oneLine
                        lead={r.bookmarked ? <Mark title="Bookmarked"><MaterialIcon $size={18} aria-label="Bookmarked">bookmark</MaterialIcon></Mark> : undefined}
                        title={r.title} titleCode={r.titleCode} note={r.note || undefined} noteCode={r.noteCode}
                        onOpen={() => openInJournal(r.id)}
                        cells={[
                          ...(tagged ? [r.tags.length ? tagText(r.tags) : <PlanMuted key="t">None</PlanMuted>] : []),
                          String(r.lines),
                          shortDay(toDateStr(r.created), today),
                        ]}
                        endCells={tagged ? [true, true, true] : [true, true]}
                      />
                    </SwipeActions>
                  ));
                  if (!g.title) return body;
                  return (
                    <PlanGroup key={g.key} title={g.title} aside={`${g.rows.length} ${g.rows.length === 1 ? 'entry' : 'entries'}`}
                      open={!folded.has(g.key)} onToggle={() => toggleFold(g.key)}>
                      {body}
                    </PlanGroup>
                  );
                })}
                <LoadMore shown={Math.min(limit, shown.length)} total={shown.length} onMore={() => setLimit(l => l + PAGE)} />
              </PlanTable>
            )}
          </>)}
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

const NO_DEFS: UserFieldDef[] = [];

/** Rows drawn at a time, more as the foot scrolls into view */
const PAGE = 100;

const COLUMNS: PlanColumn[] = [
  { label: 'Entry', width: '' }, { label: 'Tags', width: '180px', end: true }, { label: 'Lines', width: '72px', end: true }, { label: 'Date', width: '90px', end: true },
];
const GROUPS: { value: TopicGroup; label: string }[] = [{ value: 'month', label: 'Month' }, { value: 'tag', label: 'Tag' }, { value: 'none', label: 'None' }];
const SORTS: { value: TopicSort; label: string }[] = [
  { value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'title', label: 'Title A–Z' }, { value: 'lines', label: 'Longest' },
];

/* How a topic page groups and sorts, remembered per browser (the tag picked isn't — tags are private) */
const PREFS_KEY = 'topic-list-v1';
interface Prefs { group: TopicGroup; sort: TopicSort }
function readPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
    return {
      group: GROUPS.some(g => g.value === saved.group) ? saved.group! : 'month',
      sort: SORTS.some(x => x.value === saved.sort) ? saved.sort! : 'newest',
    };
  } catch { return { group: 'month', sort: 'newest' }; }
}

/** An entry's tags in its column: the first, and how many more ("PHP +2") */
function tagText(tags: string[]): string {
  return tags.length > 1 ? `${tags[0]} +${tags.length - 1}` : tags[0];
}
