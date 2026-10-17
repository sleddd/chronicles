import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi } from '../services/api.js';
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
  color: var(--text-primary);
  cursor: pointer;
  &:hover { color: var(--color-accent); }
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

/* ── Rows ── */

const List = styled.div`
  display: flex;
  flex-direction: column;
  /* Breathing room between the topic title and its entries */
  margin-top: 28px;
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

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <TitleBlock>
              <BackBtn onClick={() => navigate('/topics')} aria-label="Back to topics">
                <MaterialIcon $size={56} aria-hidden="true">chevron_left</MaterialIcon>
              </BackBtn>
              <Title>{topic.name}</Title>
            </TitleBlock>
            <PillButton type="button" onClick={() => newEntry(topic.id)} style={{ flexShrink: 0 }}>
              New entry
            </PillButton>
          </Head>


          {topicEntries.length === 0 ? (
            <EmptyState message={`No ${topic.name.toLowerCase()} entries yet.`} />
          ) : (
            <List>
              {topicEntries.map((entry: DecryptedPost, i: number) => {
                const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
                return (
                  <SwipeActions
                    key={entry.id}
                    accentColor={accentColor}
                    onEdit={() => openInJournal(entry.id)}
                    onDelete={() => handleDeleteEntry(entry.id)}
                  >
                    <EntryListCard
                      hint={i === 0}
                      content={entry.content}
                      createdAt={created}
                      topicColor={topic.color || accentColor}
                      fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
                      onClick={() => openInJournal(entry.id)}
                    />
                  </SwipeActions>
                );
              })}
            </List>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
