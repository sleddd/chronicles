import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { RowMenu } from '../components/molecules/FinanceParts.js';
import { useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { PlanMuted } from '../components/molecules/PlanTable.js';
import { EntryTableList, type EntryTableColumn } from '../components/organisms/EntryTableList.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { singular } from '../utils/singular.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { topics as topicsApi } from '../services/api.js';
import { usePrivateSettings } from '../services/privateSettings.js';
import { TopicEditForm } from '../components/molecules/TopicEditForm.js';
import { TopicIcon } from '../components/molecules/IconPicker.js';
import { entryOutline } from '../utils/entryOutline.js';
import { tagsOf } from '../utils/entryTags.js';
import { topicKind } from '../utils/topicKind.js';
import { eventCells } from '../utils/eventRow.js';
import type { UserFieldDef } from '../types/userFields.js';
import type { DecryptedPost } from '@shared/crypto/types';
import { onPhoto } from '../styles/wallpaper.js';
import { topicEntries, type TopicEntries } from '../utils/topicIndex.js';

/* ── Layout (mirrors TopicsView) ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1300px; /* a little wider than the other pages' 1150px */
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
  const topic = allTopics.find(t => String(t.id) === String(topicId));
  // Just this topic's entries: the list keeps its identity while nothing in the topic changed
  const ownEntries = useEntriesStore(s => (topic ? topicEntries(s.decryptedEntries, topic.id) : NO_ENTRIES));

  const newEntry = useNewEntryInJournal();

  // Newest first (the shared list is read-only: copy before sorting)
  const sortedEntries = useMemo(() => [...ownEntries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [ownEntries]);

  // The topic's own fields: the first one is the row's title, the rest its muted line
  const fieldDefs = useUIStore(s => (topic ? s.topicCustomFields[topic.id] : undefined)) ?? NO_DEFS;
  const ownText = useCallback((entry: DecryptedPost) => {
    if (!fieldDefs.length) return null;
    const vals = (fieldsOf(entry)?._userFields as Record<string, unknown> | undefined) ?? {};
    const first = vals[fieldDefs[0].id];
    if (!showsAsText(first)) return null;
    const rest = fieldDefs.slice(1).map(d => vals[d.id]).filter(showsAsText).map(String);
    return { title: String(first), note: rest.join(' · ') };
  }, [fieldDefs]);

  // Custom tags are a text topic's (the journal, a plain topic, one with only the person's own fields)
  const kind = topicKind(topic?.name);
  const tagged = !kind;
  // Events and meetings: when they start and end, and where, in place of Lines and Date
  const eventLike = kind === 'event' || kind === 'meeting';
  const columns = eventLike ? EVENT_COLUMNS : tagged ? [TAGS_COLUMN, LINES_COLUMN] : [LINES_COLUMN];

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
          {sortedEntries.length === 0 ? (
            <EmptyState message={`No ${topic.name.toLowerCase()} entries yet.`} />
          ) : (
            // Keyed by topic: another topic starts with no search, tag or folded groups
            <EntryTableList key={topic.id} label={topic.name} firstColumn="Entry" entries={sortedEntries}
              columns={columns} dateColumn={!eventLike} ownText={ownText} tagsOf={tagged ? entryTags : undefined}
              longest bookmarks prefsKey={PREFS_KEY} emptyMessage={`No ${topic.name.toLowerCase()} entries yet.`} />
          )}
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

const NO_DEFS: UserFieldDef[] = [];
const NO_ENTRIES: TopicEntries = [];

const fieldsOf = (e: DecryptedPost) => (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
const entryTags = (e: DecryptedPost) => tagsOf(fieldsOf(e));
/** A field value that reads as text in a row (yes / no fields and blanks don't) */
const showsAsText = (v: unknown) => v !== undefined && v !== null && v !== '' && typeof v !== 'boolean';

/* How a topic page groups and sorts, remembered per browser (the tag picked isn't — tags are private) */
const PREFS_KEY = 'topic-list-v1';

const TAGS_COLUMN: EntryTableColumn = {
  label: 'Tags', width: '180px', end: true,
  cell: e => { const tags = entryTags(e); return tags.length ? tagText(tags) : <PlanMuted>None</PlanMuted>; },
};
const LINES_COLUMN: EntryTableColumn = { label: 'Lines', width: '72px', end: true, cell: e => String(entryOutline(e.content).lines) };
/* Events and meetings: when they start and end, and the venue */
const EVENT_COLUMNS: EntryTableColumn[] = [
  { label: 'Starts', width: '170px', cell: (e, today) => eventCells(fieldsOf(e), today).starts || <PlanMuted>Not set</PlanMuted> },
  { label: 'Ends', width: '170px', cell: (e, today) => eventCells(fieldsOf(e), today).ends || <PlanMuted>—</PlanMuted> },
  { label: 'Venue', width: '200px', cell: (e, today) => eventCells(fieldsOf(e), today).venue || <PlanMuted>—</PlanMuted> },
];

/** An entry's tags in its column: the first, and how many more ("PHP +2") */
function tagText(tags: string[]): string {
  return tags.length > 1 ? `${tags[0]} +${tags.length - 1}` : tags[0];
}
