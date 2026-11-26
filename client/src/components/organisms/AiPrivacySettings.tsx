import { useState } from 'react';
import styled from 'styled-components';
import { SettingsGroup, SettingsActionRow, SettingsDisclosureRow, SettingsNotice, RowPill } from '../molecules/SettingsGroup.js';
import { Toggle } from '../atoms/Toggle.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useOptionalAuth } from '../../contexts/AuthContext.js';
import { useAiPrivacy } from '../../hooks/useAiPrivacy.js';
import { AI_FEATURES, aiPrivacyLoaded, aiPrivacyUnreadable, resetAiPrivacy, updateAiPrivacy, type AiFeatureKey, type AiPrivacy } from '../../services/aiPrivacy.js';
import { showFlash } from '../../services/flashNotice.js';
import { AssistantChanges } from './AssistantChanges.js';

/* One line of the note above the switches */
const NoteLine = styled.p`
  margin: 0 0 8px;
  &:last-child { margin-bottom: 0; }
`;

/** Records no AI feature in the browser reads: only the Chronicles AI app does. */
const APP_ONLY_FEATURES = new Set<AiFeatureKey>(['habits', 'bills']);

/** What hiding each feature stops, in plain words (`app`: the Chronicles AI app is offered to this account). */
const FEATURE_NOTES: Record<AiFeatureKey, (app: boolean) => string> = {
  doses: app => `When on, AI never gets a medication’s name and dose to estimate its nutrients${app ? ', and the Chronicles AI app can’t see or tick doses' : ''}.`,
  habits: () => 'When on, the Chronicles AI app can’t see or tick habits.',
  bills: () => 'When on, the Chronicles AI app can’t see bills or record payments.',
  vision: app => `When on, AI plan never gets your vision, the vision of each area or your goal categories${app ? ', and neither does the Chronicles AI app' : ''}.`,
};

/**
 * Settings → In-App AI, under the AI switches:
 *  - "Chronicles AI app (Mac and iPad)": lets the app sign in with this
 *    account's password (offered only to accounts it's available to)
 *  - "Hide from AI": topics and features no AI ever sees — not In-App
 *    AI, AI insights, AI planning, the AI kitchen, calorie estimates, or the
 *    Chronicles AI app. Shown while any AI is on.
 * Single entries are hidden from the editor (the In-App AI row's Hide checkbox).
 */
export function AiPrivacySettings({ inAppAiOn }: { inAppAiOn: boolean }) {
  const user = useOptionalAuth()?.user;
  const privacy = useAiPrivacy();
  const topics = useEntriesStore(s => s.allTopics);
  const [saving, setSaving] = useState(false);
  // Hide from AI folds away under its title, shut to start
  const [hideOpen, setHideOpen] = useState(false);
  const available = user?.assistantAvailable === true;
  const aiOn = inAppAiOn || privacy.appEnabled;

  // Each change is made to what the server holds now (updateAiPrivacy reads it
  // first), so a tab left open can't undo a choice made in another one
  const save = async (change: (now: AiPrivacy) => AiPrivacy) => {
    setSaving(true);
    try {
      await updateAiPrivacy(change);
    } catch {
      showFlash('That didn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTopic = (id: number, hidden: boolean) => save(now => ({
    ...now,
    hiddenTopicIds: hidden ? [...new Set([...now.hiddenTopicIds, id])] : now.hiddenTopicIds.filter(t => t !== id),
  }));
  const toggleFeature = (key: AiFeatureKey, hidden: boolean) => save(now => ({
    ...now,
    hiddenFeatures: hidden ? [...new Set([...now.hiddenFeatures, key])] : now.hiddenFeatures.filter(f => f !== key),
  }));

  // The choices couldn't be read in this browser. Everything is kept from AI
  // here meanwhile, but the server goes on honouring its own copy, so the
  // Chronicles AI app would keep working with no switch to stop it. This is
  // the way out: start again from what the server lists, with the app off
  const startAgain = async () => {
    setSaving(true);
    try {
      await resetAiPrivacy();
      showFlash('Done. Check the list of what’s hidden from AI below.');
    } catch {
      showFlash('That didn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (aiPrivacyUnreadable(privacy)) {
    return (
      <SettingsGroup label="Hide from AI">
        <SettingsActionRow
          title="Your choices couldn’t be read in this browser"
          description={available
            ? 'Nothing goes to any AI from this browser until they can be. Start again to switch the Chronicles AI app off and sign it out. The topics and features already hidden stay hidden. Check the list afterwards.'
            : 'Nothing goes to any AI from this browser until they can be. Start again to keep the topics and features already hidden. Check the list afterwards.'}
          action={<RowPill type="button" disabled={saving} onClick={() => { void startAgain(); }}>
            {available ? 'Turn the AI app off and start again' : 'Start again'}
          </RowPill>}
        />
      </SettingsGroup>
    );
  }
  // Not read yet: nothing to show or change. Everything is kept from AI meanwhile
  if (!aiPrivacyLoaded(privacy)) return null;

  const sortedTopics = [...topics].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {available && (
        <SettingsGroup label="Chronicles AI app">
          <SettingsActionRow
            title="Chronicles AI app (Mac and iPad)"
            description="When on, the Mac and iPad AI app signs in with your password, holds your saved In-App AI key while open, and respects items hidden from AI. It can add entries, log bill payments, and check off doses, habits, or tasks—with undo available below. Manage active sign-ins under Security → Sessions; turning this off signs all out."
            action={<Toggle checked={privacy.appEnabled} disabled={saving}
              onChange={v => { void save(now => ({ ...now, appEnabled: v })); }} aria-label="Chronicles AI app" />}
          />
          <AssistantChanges />
        </SettingsGroup>
      )}

      {aiOn && (
        <SettingsGroup>
          <SettingsDisclosureRow title="Hide from AI" open={hideOpen} onToggle={() => setHideOpen(o => !o)} />
          {hideOpen && (<>
          {/* The owner's wording, as written */}
          <SettingsNotice>
            <NoteLine>
              Switch this on to exclude a topic or entry from AI insights by default. You can enable it on a whole topic
              or on a single entry.
            </NoteLine>
            <NoteLine>
              This setting acts as your global default for AI insights, and a separate consent modal still appears when
              you tap AI insights to show what will be shared and let you confirm or cancel for that run.
            </NoteLine>
            <NoteLine>
              AI task management and menu planning do not use this setting. Each time you run them, a pop-up modal shows
              the exact data that will be shared, and your consent comes from that modal rather than these switches.
            </NoteLine>
            <NoteLine>
              AI Chat will still never be able to access or read any part of your journal. However, you can still save
              things from chat to chronicles.
            </NoteLine>
          </SettingsNotice>
          {sortedTopics.map(t => {
            const hidden = privacy.hiddenTopicIds.includes(t.id);
            return (
              <SettingsActionRow
                key={t.id}
                title={t.name}
                description={hidden ? 'Hidden. AI never gets entries in this topic.' : 'Not hidden. AI can use these entries.'}
                action={<Toggle checked={hidden} disabled={saving}
                  onChange={v => { void toggleTopic(t.id, v); }} aria-label={`Hide ${t.name} from AI`} />}
              />
            );
          })}
          {/* Habit check-ins and bills only ever go to the Chronicles AI app, so their switches show only where it is offered */}
          {AI_FEATURES.filter(f => available || !APP_ONLY_FEATURES.has(f.key)).map(f => {
            const hidden = privacy.hiddenFeatures.includes(f.key);
            return (
              <SettingsActionRow
                key={f.key}
                title={f.label}
                description={`${hidden ? 'Hidden.' : 'Not hidden.'} ${FEATURE_NOTES[f.key](available)}`}
                action={<Toggle checked={hidden} disabled={saving}
                  onChange={v => { void toggleFeature(f.key, v); }} aria-label={`Hide ${f.label} from AI`} />}
              />
            );
          })}
          </>)}
        </SettingsGroup>
      )}
    </>
  );
}
