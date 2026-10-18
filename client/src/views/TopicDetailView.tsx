import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { RowMenu } from '../components/molecules/FinanceParts.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { MonthGroups } from '../components/molecules/MonthGroups.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { singular } from '../utils/singular.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { topics as topicsApi, settings as settingsApi } from '../services/api.js';
import { usePrivateSettings } from '../services/privateSettings.js';
import { TopicEditForm } from '../components/molecules/TopicEditForm.js';
import { TopicIcon } from '../components/molecules/IconPicker.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { entryTitleText } from '../utils/entryTitle.js';
import type { UserFieldDef } from '../types/userFields.js';
import type { DecryptedPost } from '@shared/crypto/types';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

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
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); } /* brightens, never the accent */
  & > span {
    font-size: 56px;
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
  /* overflow: hidden (for the ellipsis) clips descenders at line-height 1 —
     room below for g/p/y, given back with a negative margin so layout holds */
  padding-bottom: 0.2em;
  margin: 0 0 -0.2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* Topic icon beside the title, in the accent at the title's thin weight */
const TitleIcon = styled.span`
  display: inline-flex;
  margin: 0 14px 0 6px;
  color: var(--color-accent);
  & > span { font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48; }
`;

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

/* "Search books" — a rounded outlined search box */
const Search = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  margin-top: 20px;
  padding: 0 20px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  color: var(--text-muted);
  &:focus-within { border-color: var(--control-border); }
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-secondary);
  }
  input::placeholder { color: var(--text-hint); }
  input::-webkit-search-cancel-button { display: none; }
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
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
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
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === topic.id)
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

  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topicEntries;
    return topicEntries.filter(e => {
      const t = rowText(e);
      const hay = `${entryTitleText(e.content)} ${t?.title ?? ''} ${t?.sub ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [topicEntries, query, rowText]);


  // Inline topic editor (same as the Topics list's)
  const setTopics = useEntriesStore(s => s.setTopics);
  const updateTopicFields = useUIStore(s => s.updateTopicFields);
  const topicHideText = useUIStore(s => s.topicHideText);
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
  const changeHideText = (hide: boolean) => {
    if (!topic) return;
    useUIStore.getState().updateTopicHideText(topic.id, hide);
    settingsApi.upsert('topicHideText', useUIStore.getState().topicHideText)
      .catch(err => console.error('Failed to save topic option:', err));
  };

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to view this topic" /></ContentTemplate>
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
              hideTextField={!!topicHideText[topic.id]}
              onHideTextFieldChange={changeHideText}
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
              <PillButton type="button" $variant="neutral" onClick={startEdit}>Edit topic</PillButton>
              <PillButton type="button" onClick={() => newEntry(topic.id)}>New {singular(topic.name)}</PillButton>
            </HeadActions>
            <HeadMenu>
              <RowMenu label={`${topic.name} actions`} items={[
                { label: `New ${singular(topic.name)}`, onSelect: () => newEntry(topic.id) },
                { label: 'Edit topic', onSelect: startEdit },
              ]} />
            </HeadMenu>
          </Head>

          <Body>
          {topicEntries.length > 0 && (
            <Search>
              <Icon name="search" size={16} strokeWidth={2} />
              <input type="search" aria-label={`Search ${topic.name}`} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${topic.name.toLowerCase()}`} />
            </Search>
          )}

          {topicEntries.length === 0 ? (
            <EmptyState message={`No ${topic.name.toLowerCase()} entries yet.`} />
          ) : shown.length === 0 ? (
            <EmptyState message="Nothing matches that search." />
          ) : (
            <MonthGroups items={shown} keyOf={e => e.id} dateOf={e => (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt))}>{(entry: DecryptedPost) => {
              const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
              const t = rowText(entry);
              return (
                <SwipeActions accentColor={accentColor} onDelete={() => handleDeleteEntry(entry.id)}>
                  <EntryListCard
                    content={t ? `<p>${escapeHtml(t.title)}</p>` : entry.content}
                    preview={t?.sub || undefined}
                    createdAt={created}
                    topicColor={topic.color || accentColor}
                    fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
                    onClick={() => openInJournal(entry.id)}
                  />
                </SwipeActions>
              );
            }}</MonthGroups>
          )}
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

const NO_DEFS: UserFieldDef[] = [];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
