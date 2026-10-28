import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { PillButton } from '../atoms/PillButton.js';
import { Toggle } from '../atoms/Toggle.js';
import type { ThemePreference } from '../../utils/autoTheme.js';

/* The welcome tour: six centred cards on a dimmed page — what Chronicles is
   (and that only you can read it), the dashboard, health (wellness cards, meal
   logging, the Health dashboard), topics, the shortcuts, then
   "Make it yours" with the theme and the main feature switches. Back / Next /
   Skip, progress dots; Escape skips. Shown once on a new account's first
   visit (utils/onboarding) and again from Settings. Props only, apart from
   its own step. */

const Dim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(10, 12, 16, 0.45);
`;

const Card = styled.div`
  width: min(520px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 36px 36px 24px;
  background: var(--bg-tile);
  html[data-theme='light'] & { background: var(--bg-control, var(--bg-panel)); }
  border: 1px solid var(--border-pop);
  border-radius: 16px;
  box-shadow: var(--shadow-xl);
  font-family: var(--font-sans);
  @media (max-width: 480px) { padding: 28px 22px 20px; }
`;

const Title = styled.h2`
  margin: 18px 0 12px;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
`;

const Body = styled.div`
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
  p { margin: 0 0 12px; }
  ul { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 6px; }
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
`;

const Dots = styled.div`
  display: flex;
  gap: 6px;
  margin-right: auto;
`;

const Dot = styled.span<{ $on: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $on }) => ($on ? 'var(--color-accent)' : 'var(--border-default)')};
`;

const SkipBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

/* Step 5: Light | Dark | Auto and the feature switches */
const Choice = styled.div`
  display: flex;
  gap: 8px;
  margin: 4px 0 18px;
`;

const ChoiceBtn = styled.button<{ $on: boolean }>`
  flex: 1;
  height: 38px;
  border: 1px solid ${({ $on }) => ($on ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $on }) => ($on ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
  cursor: pointer;
`;

const Switches = styled.div`
  border-top: 1px solid var(--border-subtle);
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 15px;
    color: var(--text-primary);
  }
  small { display: block; font-size: 13px; color: var(--text-muted); }
`;

/* Finance is different: optional, its own pages, manual entry */
const FinanceNote = styled.p`
  margin: 14px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-panel);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
`;

const Label = styled.p`
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-soft);
`;

/** The feature switches the last step offers (each is one or more feature flags) */
export const TOUR_FEATURES: { label: string; note: string; flags: string[] }[] = [
  { label: 'Meals and nutrition', note: 'Log what you eat, with calories and vitamins', flags: ['foodEnabled'] },
  { label: 'Medications', note: 'A daily schedule you tick off, with reminders', flags: ['medicationEnabled'] },
  { label: 'Exercise', note: 'Workouts, a weekly routine and training plans', flags: ['exerciseEnabled'] },
  { label: 'Goals and planning', note: 'Goals, milestones and task boards', flags: ['goalsEnabled', 'milestonesEnabled'] },
  { label: 'Finance', note: 'Optional. Budget, bills and savings, kept apart from your journal', flags: ['financeEnabled'] },
];

interface Props {
  onClose: () => void;
  themePreference: ThemePreference;
  onTheme: (pref: ThemePreference) => void;
  /** A feature is on unless switched off (Finance is off unless switched on) */
  isOn: (flag: string) => boolean;
  onFeature: (flags: string[], on: boolean) => void;
}

export function OnboardingTour({ onClose, themePreference, onTheme, isOn, onFeature }: Props) {
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = 5;

  useEffect(() => { nextRef.current?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const steps = [
    {
      icon: 'lock',
      title: 'Welcome to Chronicles',
      body: (<>
        <p>Everything you write is encrypted on this device before it’s saved. Only you can read it. We can’t.</p>
        <p>That’s also why your recovery key matters. It’s the only way back in if you forget your password, so keep it somewhere safe.</p>
      </>),
    },
    {
      icon: 'dashboard',
      title: 'Your dashboard is your day at a glance',
      body: (<>
        <p>Jot something down in Quick entry, tick off medications, exercise and priorities, and see what’s coming up.</p>
        <p>Drag a card by its grip to move it, fold it away with its arrow, and choose which cards you see in Customize view.</p>
      </>),
    },
    {
      icon: 'favorite',
      title: 'Your health in one place',
      body: (<>
        <p>The wellness check-in on your dashboard is four quick cards for water, sleep, mood and cycle. Tap to fill them in, and open Your day underneath for a few questions about how the day went.</p>
        <p>Log a meal from Quick meal log in a few words. Calories and vitamins are worked out if you’ve set up In-App AI.</p>
        <p>Health brings it all together. It’s where you set up medications and your exercise routine, log meals and symptoms, and see reports on what goes with better days.</p>
      </>),
    },
    {
      icon: 'menu_book',
      title: 'Everything has a place',
      body: (<>
        <p>Entries live in topics. Meals, medications, tasks, recipes and more each come with their own fields, so an entry is quick to fill in.</p>
        <p>You can make topics of your own and give them fields too. Find them all in Journal and Topics.</p>
      </>),
    },
    {
      icon: 'mic',
      title: 'Shortcuts worth knowing',
      body: (
        <ul>
          <li>Tap Voice and say “Add task call the dentist due Friday” or “Mark vitamin D taken”.</li>
          <li>The bell shows what’s due today, and you can tick things off right there.</li>
          <li>Ctrl or ⌘ + S saves the entry you’re writing.</li>
        </ul>
      ),
    },
    {
      icon: 'tune',
      title: 'Make it yours',
      body: (<>
        <Label>Theme</Label>
        <Choice role="group" aria-label="Theme">
          {(['light', 'dark', 'auto'] as const).map(m => (
            <ChoiceBtn key={m} type="button" $on={themePreference === m} aria-pressed={themePreference === m} onClick={() => onTheme(m)}>
              {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'Auto'}
            </ChoiceBtn>
          ))}
        </Choice>
        <Label>What will you track?</Label>
        <Switches>
          {TOUR_FEATURES.map(f => (
            <label key={f.label}>
              <span>{f.label}<small>{f.note}</small></span>
              <Toggle checked={f.flags.every(isOn)} aria-label={f.label} onChange={v => onFeature(f.flags, v)} />
            </label>
          ))}
        </Switches>
        <FinanceNote>
          Finance is optional and starts off. It’s a separate space with its own pages for your budget, bills and
          savings. Everything is typed in by hand, so Chronicles never connects to your bank, and it stays encrypted
          like the rest.
        </FinanceNote>
        <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>You can change any of this later in Settings.</p>
      </>),
    },
  ];
  const s = steps[step];

  return createPortal(
    <Dim role="presentation">
      <Card role="dialog" aria-modal="true" aria-label={`Welcome tour, step ${step + 1} of ${steps.length}`}>
        <MaterialIcon $size={40} aria-hidden="true" style={{ color: 'var(--color-accent)' }}>{s.icon}</MaterialIcon>
        <Title>{s.title}</Title>
        <Body>{s.body}</Body>
        <Foot>
          <Dots aria-hidden="true">{steps.map((_, i) => <Dot key={i} $on={i === step} />)}</Dots>
          {step < last && <SkipBtn type="button" onClick={onClose}>Skip</SkipBtn>}
          {step > 0 && <PillButton type="button" $variant="neutral" onClick={() => setStep(step - 1)}>Back</PillButton>}
          <PillButton ref={nextRef} type="button" onClick={() => (step === last ? onClose() : setStep(step + 1))}>
            {step === last ? 'Get started' : 'Next'}
          </PillButton>
        </Foot>
      </Card>
    </Dim>,
    document.body,
  );
}
