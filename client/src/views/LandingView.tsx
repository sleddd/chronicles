import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { LandingTemplate, Container, ActionPill, DarkBand, TEAL_GRADIENT } from '../components/templates/LandingTemplate.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { Chip } from '../components/molecules/fields/formKit.js';
import { BetaSignup } from '../components/organisms/landing/BetaSignup.js';
import { useScrollReveal } from '../hooks/useScrollReveal.js';
import { BETA_DETAILS } from '@shared/legal/index.js';
import heroShot from '../assets/landing/dashboard-dark.jpg';

/* The public home page at `/`: the hero on a night-sky photo with the
   dashboard in a frame, how it works, the four questions a dashboard should
   answer, the feature rows, everything else, a comparison, privacy, the beta
   sign-up and questions. The app itself starts at /dashboard. Installed copies
   (the PWA, standalone) skip this page and open the app. */

/** The home page's title (also in index.html, for crawlers) */
export const SEO_TITLE = 'Chronicles — Zero-Knowledge Encrypted Journal & Digital Day Planner';

/* Feature screenshots (light theme, test account): src/assets/landing/features/<key>.jpg */
const SHOTS = import.meta.glob<string>('../assets/landing/features/*.jpg', { eager: true, query: '?url', import: 'default' });
const shotUrl = (key: string) => SHOTS[`../assets/landing/features/${key}.jpg`];

/** Stagger for revealed items: each later one starts a beat after */
const delay = (i: number) => ({ '--reveal-delay': `${i * 0.1}s` }) as CSSProperties;

const TRUST = [
  { icon: 'lock', text: 'Zero-knowledge encryption' },
  { icon: 'visibility_off', text: 'No analytics or tracking' },
  { icon: 'link', text: 'Nothing connects to your bank' },
  { icon: 'key', text: 'AI optional, with your own key' },
  { icon: 'download', text: 'Export your data any time' },
];

const QUESTIONS_FOUR = [
  { title: 'What matters now?', body: 'Today’s priorities, active goals, medication doses, the day’s menu and what’s coming up, on one dashboard you arrange yourself.' },
  { title: 'What am I doing about it?', body: 'Goals hold their milestones and tasks. Exercise and medication schedules you check off. A timer for anything you want to track.' },
  { title: 'What changed?', body: 'Mood, sleep, stress, exercise, symptoms and spending over time, with patterns in what goes with your better days.' },
  { title: 'What should change next?', body: 'Your journal sits beside the evidence, so a weekly review ends with a decision instead of another chart.' },
];

interface Feature {
  label: string;
  title: string;
  body: string;
  points: string[];
  note?: string;
  shot: string;
  size: [number, number];
  alt: string;
}

const FEATURES: Feature[] = [
  {
    label: 'Life dashboard', title: 'Your whole day at a glance.',
    body: 'Weather, priorities, doses, the day’s menu, your shopping list and what’s ahead, under your own wallpaper. Choose what shows with Customize view.',
    points: ['Quick entry from the top of the page', 'Wellness check-in for water, sleep and mood', 'World clocks, daily quote, light and dark themes'],
    shot: 'dashboard-2', size: [1268, 1300],
    alt: 'The dashboard with today’s priorities, what’s coming up, the shopping list, medications, a quick meal log and a symptom log',
  },
  {
    label: 'Journal', title: 'A journal that keeps up with you.',
    body: 'Write with rich text, photos, voice dictation, or Apple Pencil handwriting and drawing. Search by keyword, topic or date, and bookmark what matters.',
    points: ['Entries grouped by day and month', 'Ideas, quotes, books and films beside your days', 'Encrypted before it leaves your browser'],
    shot: 'journal', size: [1268, 1000],
    alt: 'The journal with everyday entries by month and a Sunday entry open',
  },
  {
    label: 'Goals and planning', title: 'Goals that hold everything they need.',
    body: 'A personal operating system without the setup. A goal is a container for its milestones, tasks, people, supplies and savings. Tasks roll up into milestones, and milestones into goals.',
    points: ['Kanban boards or lists, drag to change status', 'Priorities, deadlines and todos', 'Time tracking for tasks and focus sessions'],
    shot: 'planning-tasks', size: [1268, 900],
    alt: 'The tasks board by status with priorities, deadlines and the milestone each rolls up to',
  },
  {
    label: 'Health and wellness', title: 'Health, wellness and symptom tracking.',
    body: 'Track nutrition against your goals, log wellness, and run medication and exercise schedules with doses you check off. Allergy, symptom and medication lists print for appointments.',
    points: ['Meals, calories, macros and vitamins', 'Mood tracker, sleep, water and stress', 'Exercise history and symptom logs'],
    shot: 'health-dashboard', size: [1268, 1300],
    alt: 'The health dashboard with nutrients against goals, the macro split, the wellness check-in, quick logs and today’s doses',
  },
  {
    label: 'Reports and patterns', title: 'See what goes with your better days.',
    body: 'Personal analytics from the life you already logged. Mood, sleep, social time, exercise and stress over time, and which symptoms tend to happen together.',
    points: ['Possible correlations you confirm or dismiss', 'A square per day for every symptom', 'No wearable needed: built from your entries'],
    note: 'A pattern is a lead worth looking into, not a diagnosis.',
    shot: 'health-reports', size: [1268, 1300],
    alt: 'Health reports with mood, sleep, social time, exercise and stress over time, and what goes with better days',
  },
];

const MODULES = [
  { title: 'Calendar', body: 'Day, week and month views of events, deadlines and bills. Two-way Google Calendar sync and a private Apple Calendar feed.', shot: 'calendar', alt: 'The month calendar with events and bills on their days' },
  { title: 'Meal planning', body: 'A weekly menu, recipes with checkable ingredients, and one tap to turn the menu into a shopping list.', shot: 'kitchen', alt: 'The kitchen dashboard with today’s meals and the shopping list' },
  { title: 'Budget and finance', body: 'A manual budget, bills and subscriptions, savings funds and money goals. Off by default, and never linked to a bank.', shot: 'finance', alt: 'The budget with planned, bills, spending and what’s left' },
  { title: 'Media journal', body: 'Books, movies, shows and music on one shelf, with half-star ratings, progress, notes and a public shelf to share.', shot: 'media-dark', alt: 'The media journal shelf of book covers' },
];

const EXTRAS = [
  { title: 'Custom topics', body: 'Add, reorder and give each topic its own icon and fields.' },
  { title: 'Time tracking', body: 'Time any task, workout or session, right from its entry.' },
  { title: 'Works on any device', body: 'Runs in the browser and installs to your phone’s home screen.' },
  { title: 'Optional AI', body: 'Calorie and nutrient estimates with your own Anthropic, OpenAI or Bedrock key. It never sees your journal.' },
];

const COMPARE_COLUMNS = ['Chronicles', 'Build-your-own workspace', 'Health data dashboard', 'Separate apps for each job'];
const COMPARE_ROWS: [string, string, string, string, string][] = [
  ['Useful from day one', 'Yes, with default topics and views', 'After you design the databases', 'After you connect devices', 'Yes, one app at a time'],
  ['Journal, goals and health together', 'Yes', 'If you build the links', 'Health only', 'Spread across apps'],
  ['Enter it once, see it everywhere', 'Yes', 'With relations and formulas', 'For synced data', 'No, re-entered in each'],
  ['Upkeep each month', 'None', 'Schema, filters and cleanup', 'Low', 'Several subscriptions'],
  ['Zero-knowledge encryption', 'Yes', 'Varies', 'Varies', 'Varies'],
  ['Automatic wearable data', 'No, you enter it', 'Through add-ons', 'Yes, its core job', 'In health apps'],
];

const PRIVACY = [
  { icon: 'lock', title: 'Encrypted on your device', body: 'AES-256 encryption in the browser, and your password never leaves your device.' },
  { icon: 'visibility_off', title: 'No tracking', body: 'No analytics, telemetry or crash reporting. When something breaks, a bug form is how you report it.' },
  { icon: 'notifications_off', title: 'No pings, no marketing', body: 'No notifications and no marketing email. Chronicles waits until you open it.' },
  { icon: 'key', title: 'AI on your terms', body: 'The assistant is optional and uses your own key. Requests go from your browser straight to the provider.' },
  { icon: 'image', title: 'Photos in your own storage', body: 'Photos are encrypted and kept in your own Cloudflare R2 bucket. They never touch the Chronicles server.' },
  { icon: 'download', title: 'Your data leaves with you', body: 'Export entries to CSV any time, and finance data as spreadsheets with a full JSON backup.' },
];

const BETA_POINTS = ['Free access for the whole beta', 'A direct say in what gets built next', 'After release, no more than $20 a month'];

const QUESTIONS = [
  { q: 'What is a life dashboard app?', a: 'A life dashboard gathers the parts of your life you want to review, like goals, tasks, health, mood and money, into one view so you can see what changed and decide what to do next. Chronicles pairs that dashboard with a journal and a day planner, so the data behind it comes from the same quick entries.' },
  { q: 'Is Chronicles a life tracker, a journal or a planner?', a: 'All three. The journal is where entries go in. The planner holds goals, milestones and tasks. The tracker turns health, mood and spending into reports. One entry line feeds them all.' },
  { q: 'Who is Chronicles for?', a: 'Adults who want one place for the details of their days. You must be 18 or older to join.' },
  { q: 'Does it connect to my bank or health apps?', a: 'No. Health and finance tracking are entered by you, and nothing connects to a bank. Google Calendar sync is the one connection, and you choose whether to turn it on.' },
  { q: 'Is there a phone app?', a: 'Chronicles runs in your browser on phones and tablets, and you can add it to your home screen like an app. Native iPhone and Android apps are planned after the beta.' },
  { q: 'What will it cost?', a: `Chronicles is free during the beta. After that it will be a paid subscription priced to cover hosting and maintenance. ${BETA_DETAILS.priceTerms}` },
  { q: 'What happens if I lose my password?', a: 'When you sign up you receive a recovery key. If you forget your password, it’s the only way back into your account, so keep it somewhere safe. If you lose both your password and your recovery key, no one can open your data, including us. It’s encrypted with keys only you hold. What we can do is delete your account and everything in it once you confirm the request from your account’s email address, so you can start again.' },
];

/* ——— Shared pieces ——— */

/* A small label over a section heading: spaced teal capitals */
const Eyebrow = styled.p<{ $center?: boolean }>`
  margin: 0 0 18px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-accent-line);
  ${({ $center }) => $center && 'text-align: center;'}
`;

/* Section headings: big thin Work Sans, sentence case */
const H2 = styled.h2<{ $center?: boolean }>`
  margin: 0 0 22px;
  max-width: 900px;
  font-family: var(--font-display);
  font-size: 60px;
  font-weight: 200;
  line-height: 1.1;
  color: var(--text-primary);
  text-wrap: balance;
  ${({ $center }) => $center && 'margin-left: auto; margin-right: auto; text-align: center;'}
  @media (max-width: 768px) { font-size: 40px; }
`;

const Lede = styled.p<{ $center?: boolean }>`
  max-width: 680px;
  margin: 0;
  font-size: 18px;
  line-height: 1.7;
  color: var(--text-soft);
  ${({ $center }) => $center && 'margin-left: auto; margin-right: auto; text-align: center;'}
  @media (max-width: 768px) { font-size: 17px; }
`;

/* A plain list with an accent tick before each line */
const Ticks = styled.ul`
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
  li { display: flex; align-items: flex-start; gap: 12px; font-size: 16px; color: var(--text-primary); }
  li > span { flex: none; margin-top: 2px; color: var(--color-accent-line); }
`;

function TickList({ items }: { items: string[] }) {
  return (
    <Ticks>
      {items.map(t => <li key={t}><MaterialIcon aria-hidden $size={18}>check</MaterialIcon>{t}</li>)}
    </Ticks>
  );
}

const Band = styled.section<{ $tone: 'page' | 'white' }>`
  padding: 128px 0;
  background: ${({ $tone }) => ($tone === 'white' ? '#ffffff' : 'var(--bg-app)')};
  @media (max-width: 768px) { padding: 80px 0; }
`;

/* ——— Hero ——— */

const Hero = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: 88px 24px 72px;
  text-align: center;
  text-shadow: 0 1px 14px rgba(8, 12, 28, 0.4);
  @media (max-width: 768px) { padding: 48px 32px 48px; }
`;

const HeroEyebrow = styled.p`
  margin: 0 0 22px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--text-primary);
  @media (max-width: 480px) { letter-spacing: 0.18em; font-size: 12px; }
`;

const H1 = styled.h1`
  margin: 0 0 28px;
  font-family: var(--font-display);
  font-size: 84px;
  font-weight: 200;
  line-height: 1.04;
  color: var(--text-primary);
  /* The second half in a pale teal, the page's one coloured phrase */
  em { font-style: normal; color: #acdcd9; }
  @media (max-width: 768px) { font-size: 44px; }
`;

const HeroText = styled.p`
  max-width: 700px;
  margin: 0 auto 36px;
  font-size: 19px;
  line-height: 1.65;
  color: var(--text-soft);
  @media (max-width: 768px) { font-size: 17px; }
`;

const HeroActions = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 14px;
  a { text-shadow: none; }
`;

const BigPill = styled(ActionPill)`
  && { min-height: 48px; padding: 10px 26px; font-size: 16px; font-weight: 600; }
`;

const HeroNote = styled.p`
  margin: 22px 0 0;
  font-size: 14px;
  font-style: italic;
  color: var(--text-muted);
`;

/* The dashboard in a pale glass frame, with three floating cards lifted
   off it like the app's own (Water, Quick entry, Mood) */
const Showcase = styled.div`
  position: relative;
  max-width: 1184px;
  margin: 0 auto;
  padding: 0 24px 8px;
  @media (max-width: 768px) { padding: 0 20px; }
`;

const Frame = styled.div`
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 18px;
  background: rgba(236, 238, 244, 0.55);
  backdrop-filter: blur(6px);
  box-shadow: 0 30px 80px rgba(16, 20, 40, 0.28);
  img { display: block; width: 100%; height: auto; border-radius: 10px; }
  @media (max-width: 768px) { padding: 6px; border-radius: 12px; img { border-radius: 7px; } }
`;

/* A floating card: the light panel, a hairline and an overlay shadow */
const Float = styled.div`
  position: absolute;
  padding: 20px 22px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  background: rgba(244, 245, 248, 0.94);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 48px rgba(16, 20, 40, 0.22);
  color: var(--text-primary);
  text-align: left;
  text-shadow: none;
  --text-primary: #1f2128;
  --text-soft: #4a505b;
  /* the card label, as on the dashboards */
  > b {
    display: block;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-soft);
  }
  @media (max-width: 1000px) { display: none; }
`;

const WaterCard = styled(Float)`
  top: 13%;
  right: -16px;
  width: 250px;
  strong { font-family: var(--font-display); font-size: 38px; font-weight: 300; margin-right: 10px; }
  p { display: flex; align-items: baseline; margin: 6px 0 12px; font-size: 15px; color: var(--text-soft); }
  /* the wellness rule: 4 of 8, an accent dot at the end */
  i {
    position: relative;
    display: block;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--color-accent) 0 52%, #d3d7dd 52%);
    &::after { content: ''; position: absolute; left: 52%; top: 50%; width: 13px; height: 13px; border-radius: 50%; background: var(--color-accent); transform: translate(-50%, -50%); }
  }
`;

const EntryCard = styled(Float)`
  bottom: 9%;
  left: -24px;
  width: 320px;
  p { margin: 14px 0 18px; font-size: 16px; font-style: italic; }
  div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid #d3d7dd;
    font-size: 14px;
    color: var(--text-soft);
  }
  div > span { display: inline-flex; align-items: center; height: 30px; }
`;

const MoodCard = styled(Float)`
  bottom: -26px;
  right: -8px;
  width: 250px;
  > b { display: flex; justify-content: space-between; em { font-style: normal; letter-spacing: normal; text-transform: none; font-size: 14px; color: var(--color-accent-line); } }
  div { display: flex; justify-content: space-between; margin-top: 12px; }
  span { width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid #80868f; }
  span[data-on] { border-color: var(--color-accent-line); background: var(--color-accent-subtle); }
`;

/* ——— Trust strip ——— */

const Trust = styled.ul`
  list-style: none;
  margin: 0;
  padding: 72px 0 36px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px;
  border-bottom: 1px solid var(--border-subtle);
  li { display: flex; align-items: center; gap: 14px; font-size: 15px; color: var(--text-primary); line-height: 1.45; }
  li > span { flex: none; color: var(--color-accent-line); }
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 32px; padding-top: 56px; }
  @media (max-width: 520px) { grid-template-columns: minmax(0, 1fr); }
`;

/* ——— How it works ——— */

const Steps = styled.ol`
  list-style: none;
  margin: 72px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
  > li {
    display: flex;
    flex-direction: column;
    padding: 36px 32px 32px;
    border: 1px solid var(--border-card);
    border-radius: 12px;
    background: var(--bg-panel);
  }
  > li > small { font-size: 14px; letter-spacing: 0.14em; color: var(--color-accent-line); }
  > li > h3 { margin: 18px 0 14px; font-family: var(--font-display); font-size: 30px; font-weight: 300; color: var(--text-primary); }
  > li > p { margin: 0 0 28px; font-size: 16px; line-height: 1.6; color: var(--text-soft); }
  @media (max-width: 960px) { grid-template-columns: minmax(0, 1fr); gap: 20px; margin-top: 48px; }
`;

/* The step's picture, at the foot of its card under a hairline */
const StepArt = styled.div`
  margin-top: auto;
  padding-top: 22px;
  border-top: 1px solid var(--border-subtle);
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  > span { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; font-size: 13px; cursor: default; }
`;

const SampleEntry = styled.p`
  margin: 0 0 10px;
  padding: 14px 16px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
  background: #ffffff;
  font-size: 15px;
  font-style: italic;
  color: var(--text-primary);
`;

const FillsIn = styled.ul`
  list-style: none;
  margin: -6px 0 0;
  padding: 0;
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 0;
    font-size: 14px;
    color: var(--text-primary);
  }
  li + li { border-top: 1px dashed var(--border-subtle); }
  li > span { color: var(--color-accent-line); }
`;

/* ——— Four questions ——— */

const Four = styled.ol`
  list-style: none;
  margin: 72px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--border-subtle);
  li { padding: 44px 28px 8px; }
  li:first-child { padding-left: 0; }
  li + li { border-left: 1px solid var(--border-subtle); }
  li > small { font-size: 14px; letter-spacing: 0.14em; color: var(--color-accent-line); }
  h3 { margin: 16px 0 14px; font-family: var(--font-display); font-size: 28px; font-weight: 300; line-height: 1.2; color: var(--text-primary); }
  p { margin: 0; font-size: 16px; line-height: 1.6; color: var(--text-soft); }
  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    li:nth-child(3) { padding-left: 0; border-left: none; }
    li:nth-child(n + 3) { border-top: 1px solid var(--border-subtle); }
  }
  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
    li { padding: 32px 0 28px; }
    li + li { border-left: none; border-top: 1px solid var(--border-subtle); }
  }
`;

/* ——— Feature rows ——— */

const FeatureRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 136px;
  margin-top: 136px;
  @media (max-width: 900px) { gap: 80px; margin-top: 88px; }
`;

const FeatureRow = styled.article`
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 80px;
  align-items: center;
  &:nth-child(even) { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); }
  &:nth-child(even) > :first-child { order: 2; }
  h3 { margin: 0 0 22px; font-family: var(--font-display); font-size: 50px; font-weight: 200; line-height: 1.1; color: var(--text-primary); text-wrap: balance; }
  p { margin: 0; font-size: 18px; line-height: 1.7; color: var(--text-soft); }
  em { display: block; margin-top: 10px; font-size: 17px; color: var(--text-soft); }
  @media (max-width: 900px) {
    &, &:nth-child(even) { grid-template-columns: minmax(0, 1fr); gap: 36px; }
    &:nth-child(even) > :first-child { order: 0; }
    h3 { font-size: 38px; }
  }
`;

/* "01 · Life dashboard": spaced grey capitals */
const RowLabel = styled.p`
  && { margin: 0 0 24px; font-size: 17px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-soft); }
`;

/* A screenshot in a light device bezel, lifted off the page */
const Device = styled.div`
  padding: 8px;
  border: 1px solid var(--border-card);
  border-radius: 16px;
  background: var(--bg-app);
  box-shadow: 0 2px 6px rgba(20, 24, 32, 0.04), 0 28px 60px rgba(20, 24, 32, 0.12);
  img { display: block; width: 100%; height: auto; border-radius: 10px; }
`;

/* ——— Everything else ——— */

const Modules = styled.ul`
  list-style: none;
  margin: 64px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
  li { overflow: hidden; border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-panel); }
  img { display: block; width: 100%; height: 190px; object-fit: cover; object-position: top left; border-bottom: 1px solid var(--border-subtle); }
  li > div { padding: 24px 22px 28px; }
  h3 { margin: 0 0 12px; font-family: var(--font-display); font-size: 22px; font-weight: 400; color: var(--text-primary); }
  p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--text-soft); }
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

const Extras = styled.ul`
  list-style: none;
  margin: 56px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 40px;
  li { padding-top: 28px; border-top: 1px solid var(--border-default); }
  h3 { margin: 0 0 10px; font-family: var(--font-display); font-size: 21px; font-weight: 400; color: var(--text-primary); }
  p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--text-soft); }
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 40px; }
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

/* ——— Compare ——— */

/* The table scrolls sideways inside its own box on narrow screens */
const TableBox = styled.div`
  margin-top: 64px;
  overflow-x: auto;
  border: 1px solid var(--border-card);
  border-radius: 12px;
  background: var(--bg-panel);
`;

const Table = styled.table`
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
  font-size: 15px;
  th, td { padding: 22px 22px; text-align: left; vertical-align: top; line-height: 1.6; }
  thead th { font-family: var(--font-display); font-size: 18px; font-weight: 400; color: var(--text-primary); background: #ffffff; }
  tbody tr { border-top: 1px solid var(--border-subtle); }
  tbody th { font-weight: 500; color: var(--text-primary); width: 26%; }
  td { color: var(--text-soft); }
  /* The Chronicles column: a deep teal head over faintly tinted cells */
  thead th:nth-child(2) { background: var(--color-accent-line); color: #ffffff; }
  td:nth-child(2) { background: var(--color-accent-subtle); color: var(--text-primary); font-weight: 600; }
`;

const TableNote = styled.p`
  margin: 18px 0 0;
  font-size: 14px;
  font-style: italic;
  color: var(--text-soft);
`;

/* ——— Privacy (the teal band) ——— */

const PrivacyBand = styled(DarkBand)`
  background: ${TEAL_GRADIENT};
  --text-secondary: rgba(255, 255, 255, 0.88);
  --text-muted: rgba(255, 255, 255, 0.7);
  padding: 128px 0 96px;
  @media (max-width: 768px) { padding: 80px 0 64px; }
`;

const PrivacyHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 56px;
  align-items: center;
  h2 { margin: 0; color: var(--text-primary); }
  p { margin: 0; font-size: 19px; line-height: 1.65; color: var(--text-secondary); }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 20px; p { font-size: 17px; } }
`;

const PrivacyGrid = styled.ul`
  list-style: none;
  margin: 88px 0 64px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 56px 64px;
  li { padding-top: 36px; border-top: 1px solid rgba(124, 196, 194, 0.32); }
  li > span { display: block; margin-bottom: 22px; color: #8fd1cd; }
  h3 { margin: 0 0 12px; font-family: var(--font-display); font-size: 24px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0; font-size: 16px; line-height: 1.7; color: var(--text-secondary); }
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 44px 40px; }
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); gap: 36px; margin: 48px 0; li { padding-top: 28px; } }
`;

const FinePrint = styled.p`
  max-width: 480px;
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
`;

/* ——— Beta ——— */

const BetaLayout = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 80px;
  align-items: center;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 44px; }
`;

/* ——— Questions ——— */

/* Questions on the app's dark page colour, with the dark theme's text tones */
const FaqBand = styled(DarkBand)`
  --border-default: rgba(255, 255, 255, 0.22);
  --border-subtle: rgba(255, 255, 255, 0.12);
  --color-accent-line: #7cc4c2;
  --shadow-ring: 0 0 0 3px rgba(52, 165, 162, 0.5);
  padding: 120px 0 120px;
  @media (max-width: 768px) { padding: 72px 0 80px; }
`;

const FaqLayout = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
  gap: 64px;
  align-items: start;
  h2 { margin-bottom: 18px; }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 32px; }
`;

const Faq = styled.div`
  border-top: 1px solid var(--border-default);
  > div { border-bottom: 1px solid var(--border-subtle); }
  h3 { margin: 0; }
  button {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 26px 0;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 400;
    color: var(--text-primary);
    /* The app's chevron (CollapsibleCard), on the right, turning as it opens */
    &::after {
      content: '';
      flex: none;
      margin-left: auto;
      width: 8px;
      height: 8px;
      border-right: 1.5px solid var(--text-muted);
      border-bottom: 1.5px solid var(--text-muted);
      transform: translateY(-3px) rotate(45deg);
      transition: transform 0.3s ease;
    }
    &[aria-expanded='true']::after { transform: translateY(2px) rotate(-135deg); }
    &:focus-visible { outline: none; box-shadow: var(--shadow-ring); }
    @media (max-width: 768px) { font-size: 19px; padding: 22px 0; }
  }
  /* The answer slides open and shut: its row grows from 0fr to 1fr */
  [role='region'] {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition: grid-template-rows 0.35s ease, opacity 0.3s ease;
  }
  [role='region'][data-open='true'] { grid-template-rows: 1fr; opacity: 1; }
  [role='region'] > div { overflow: hidden; }
  p { margin: 0 0 26px; max-width: 680px; font-size: 16px; line-height: 1.7; color: var(--text-secondary); }
  @media (prefers-reduced-motion: reduce) {
    button::after, [role='region'] { transition: none; }
  }
`;

/** One question: a button that slides its answer open and shut */
function FaqItem({ id, q, a, startOpen, style }: { id: string; q: string; a: string; startOpen?: boolean; style?: CSSProperties }) {
  const [open, setOpen] = useState(!!startOpen);
  return (
    <div data-reveal style={style}>
      <h3>
        <button type="button" id={`${id}-q`} aria-expanded={open} aria-controls={`${id}-a`} onClick={() => setOpen(o => !o)}>{q}</button>
      </h3>
      <div role="region" id={`${id}-a`} aria-labelledby={`${id}-q`} data-open={open} inert={!open}>
        <div><p>{a}</p></div>
      </div>
    </div>
  );
}

/** True when Chronicles runs as an installed app (home-screen PWA) */
function isInstalledApp(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function LandingView() {
  const { isAuthenticated } = useAuth();
  const revealRef = useRef<HTMLDivElement>(null);
  useScrollReveal(revealRef);

  useEffect(() => {
    document.title = SEO_TITLE;
    return () => { document.title = 'Chronicles'; };
  }, []);

  if (isInstalledApp()) return <Navigate to="/dashboard" replace />;

  return (
    <LandingTemplate
      signedIn={isAuthenticated}
      hero={(
        <section aria-labelledby="hero-title">
          <Hero>
            <HeroEyebrow>Life dashboard · Journal · Day planner</HeroEyebrow>
            <H1 id="hero-title">A life dashboard for people <em>too busy to plan.</em></H1>
            <HeroText>
              Chronicles is a zero-knowledge encrypted journal, life tracker and digital day planner in one app. Write one
              line and it lands where it belongs: goals, tasks, meals, medications, moods, bills and your calendar.
            </HeroText>
            <HeroActions>
              <BigPill as="a" href="#beta" $primary>Join the private beta</BigPill>
              <BigPill as="a" href="#how">See how it works</BigPill>
            </HeroActions>
            <HeroNote>{BETA_DETAILS.seats} beta seats. Free during the beta.</HeroNote>
          </Hero>
          <Showcase>
            <Frame>
              <img src={heroShot} width={1600} height={1000} alt="The Chronicles dashboard in dark mode: a greeting with the weather, the quick entry, the daily quote, the wellness check-in and world clocks" />
            </Frame>
            <WaterCard aria-hidden>
              <b>Water</b>
              <p><strong>4</strong> of 8 glasses</p>
              <i />
            </WaterCard>
            <EntryCard aria-hidden>
              <b>Quick entry</b>
              <p>Took my iron with breakfast</p>
              <div><Chip as="span" $active>Medication</Chip> Logged to today</div>
            </EntryCard>
            <MoodCard aria-hidden>
              <b>Mood <em>Good</em></b>
              <div><span /><span /><span /><span data-on /><span /></div>
            </MoodCard>
          </Showcase>
        </section>
      )}
    >
      <div ref={revealRef}>
        <Container>
          <Trust aria-label="At a glance">
            {TRUST.map(t => (
              <li key={t.text}><MaterialIcon aria-hidden $size={22}>{t.icon}</MaterialIcon>{t.text}</li>
            ))}
          </Trust>
        </Container>

        <Band $tone="page" id="how" aria-labelledby="how-title">
          <Container>
            <div data-reveal>
              <Eyebrow $center>How it works</Eyebrow>
              <H2 $center id="how-title">One line in. Every view sorted for you.</H2>
              <Lede $center>
                Chronicles is inspired by bullet journaling, without the notebook. Every entry carries a topic, whether
                it’s a task, a meal or an event, and the views do the sorting. It’s a life tracker you’ll keep using
                because entering a day takes seconds.
              </Lede>
            </div>
            <Steps>
              <li data-reveal style={delay(0)}>
                <small>01</small>
                <h3>Pick a topic</h3>
                <p>Start with the defaults or make your own, with custom fields, so a book asks for a title and author and a dose asks for an amount.</p>
                <StepArt aria-hidden>
                  <Chips>
                    {['Journal', 'Medication', 'Meals', 'Tasks', 'Bills', 'Books', '+ Your own'].map(t => (
                      <Chip key={t} as="span" $active={t === 'Medication'}>{t}</Chip>
                    ))}
                  </Chips>
                </StepArt>
              </li>
              <li data-reveal style={delay(1)}>
                <small>02</small>
                <h3>Write a sentence</h3>
                <p>A meal, a dose, a bill, a thought. Enter it as it happens in under fifteen seconds, by typing, voice or Apple Pencil.</p>
                <StepArt aria-hidden>
                  <SampleEntry>Lunch: salmon salad, about 520 calories</SampleEntry>
                  <Chips>
                    <Chip as="span" $active>Meals</Chip>
                    <Chip as="span" $active={false}>Today, 12:40</Chip>
                  </Chips>
                </StepArt>
              </li>
              <li data-reveal style={delay(2)}>
                <small>03</small>
                <h3>Your views fill in</h3>
                <p>The entry shows up everywhere it’s needed. No copying the same fact into five apps, and no dashboard to maintain.</p>
                <StepArt aria-hidden>
                  <FillsIn>
                    {['Dashboard · today’s meals', 'Health · calories and macros', 'Reports · nutrition over time'].map(t => (
                      <li key={t}>{t}<MaterialIcon $size={18}>check</MaterialIcon></li>
                    ))}
                  </FillsIn>
                </StepArt>
              </li>
            </Steps>
          </Container>
        </Band>

        <Band $tone="white" id="features" aria-labelledby="four-title">
          <Container>
            <div data-reveal>
              <Eyebrow>A dashboard that leads to decisions</Eyebrow>
              <H2 id="four-title">A personal dashboard should answer four questions.</H2>
              <Lede>
                The best life dashboard isn’t the one with the most charts. It’s the one that shortens the trip from
                seeing what changed to deciding what to do next.
              </Lede>
            </div>
            <Four>
              {QUESTIONS_FOUR.map((f, i) => (
                <li key={f.title} data-reveal style={delay(i)}>
                  <small>{pad(i + 1)}</small>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </Four>

            <FeatureRows>
              {FEATURES.map((f, i) => (
                <FeatureRow key={f.label}>
                  <div data-reveal>
                    <RowLabel>{pad(i + 1)} · {f.label}</RowLabel>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                    <TickList items={f.points} />
                    {f.note && <em>{f.note}</em>}
                  </div>
                  <div data-reveal style={delay(1.5)}>
                    {shotUrl(f.shot) && (
                      <Device>
                        <img src={shotUrl(f.shot)} width={f.size[0]} height={f.size[1]} alt={f.alt} loading="lazy" decoding="async" />
                      </Device>
                    )}
                  </div>
                </FeatureRow>
              ))}
            </FeatureRows>
          </Container>
        </Band>

        <Band $tone="page" aria-labelledby="more-title">
          <Container>
            <div data-reveal>
              <Eyebrow>All in one life tracker</Eyebrow>
              <H2 id="more-title">Everything else your days touch.</H2>
              <Lede>Modules switch on and off, so you keep only what you use.</Lede>
            </div>
            <Modules>
              {MODULES.map((m, i) => (
                <li key={m.title} data-reveal style={delay(i)}>
                  {shotUrl(m.shot) && <img src={shotUrl(m.shot)} alt={m.alt} loading="lazy" decoding="async" />}
                  <div>
                    <h3>{m.title}</h3>
                    <p>{m.body}</p>
                  </div>
                </li>
              ))}
            </Modules>
            <Extras>
              {EXTRAS.map((x, i) => (
                <li key={x.title} data-reveal style={delay(i)}>
                  <h3>{x.title}</h3>
                  <p>{x.body}</p>
                </li>
              ))}
            </Extras>
          </Container>
        </Band>

        <Band $tone="white" id="compare" aria-labelledby="compare-title">
          <Container>
            <div data-reveal>
              <Eyebrow>Compare</Eyebrow>
              <H2 id="compare-title">All in one, without becoming a project.</H2>
              <Lede>
                Most life dashboard apps pick one job. Health dashboards read your wearables. Build-your-own workspaces
                hand you databases and formulas. A stack of single-purpose apps means entering the same day five times.
                Chronicles keeps the journal, the planner and the tracker behind one entry line.
              </Lede>
            </div>
            <TableBox data-reveal tabIndex={0} role="region" aria-label="Chronicles compared with other approaches">
              <Table>
                <thead>
                  <tr>
                    <td aria-hidden style={{ background: '#ffffff' }} />
                    {COMPARE_COLUMNS.map(c => <th key={c} scope="col">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map(([label, ...cells]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {cells.map((c, i) => <td key={i}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableBox>
            <TableNote>
              If wearable data is your main input, keep a dedicated health platform as its source of truth. Chronicles
              holds the context around it: goals, routines, symptoms and how the days felt.
            </TableNote>
          </Container>
        </Band>

        <PrivacyBand id="privacy" aria-labelledby="privacy-title">
          <Container>
            <PrivacyHead data-reveal>
              <H2 id="privacy-title">Only you can read it.</H2>
              <p>Chronicles is zero knowledge. Entries are encrypted in your browser before they’re saved, so the server only
              ever holds data it can’t read.</p>
            </PrivacyHead>
            <PrivacyGrid>
              {PRIVACY.map((p, i) => (
                <li key={p.title} data-reveal style={delay(i % 3)}>
                  <MaterialIcon aria-hidden $size={26}>{p.icon}</MaterialIcon>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </li>
              ))}
            </PrivacyGrid>
            <FinePrint data-reveal>
              No system is perfectly secure. You keep your own recovery key, and by using Chronicles you accept the risk of
              storing your data here.
            </FinePrint>
          </Container>
        </PrivacyBand>

        <Band $tone="page" id="beta" aria-labelledby="beta-title">
          <BetaLayout>
            <div data-reveal>
              <Eyebrow>Private beta</Eyebrow>
              <H2 id="beta-title">Help shape your new life dashboard.</H2>
              <Lede>
                Chronicles is in active design and development. Seats are limited so every tester’s feedback gets the
                attention it needs.
              </Lede>
              <TickList items={BETA_POINTS} />
            </div>
            <div data-reveal style={delay(1.5)}><BetaSignup /></div>
          </BetaLayout>
        </Band>

        <FaqBand id="faq" aria-labelledby="faq-title">
          <FaqLayout>
            <div data-reveal>
              <Eyebrow>Questions</Eyebrow>
              <H2 id="faq-title">Good to know.</H2>
              <Lede>Anything else goes through the in-app bug and feedback form.</Lede>
            </div>
            <Faq>
              {QUESTIONS.map(({ q, a }, i) => (
                <FaqItem key={q} id={`faq-${i}`} q={q} a={a} startOpen={i === 0} style={delay(i * 0.6)} />
              ))}
            </Faq>
          </FaqLayout>
        </FaqBand>
      </div>
    </LandingTemplate>
  );
}
