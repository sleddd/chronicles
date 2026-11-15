import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { LandingTemplate, Container, DarkBand, HERO_PHOTO, PAGE_INK } from '../components/templates/LandingTemplate.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { ShotSlides, type Slide } from '../components/organisms/landing/ShotSlides.js';
import { ScreenSlideshow } from '../components/organisms/landing/ScreenSlideshow.js';
import { BetaSignup } from '../components/organisms/landing/BetaSignup.js';
import { useScrollReveal } from '../hooks/useScrollReveal.js';

/* The public home page at `/`: the hero on a night-sky photo with the
   dashboard in a frame, how it works, the feature rows, everything else, a comparison, privacy, the beta
   sign-up and questions. The app itself starts at /dashboard. Installed copies
   (the PWA, standalone) skip this page and open the app. */

/** The home page's title (also in index.html, for crawlers) */
export const SEO_TITLE = 'Chronicles — Zero-Knowledge Encrypted Journal & Digital Day Planner';

/* Feature screenshots (dark theme, test account): src/assets/landing/features/<key>.jpg */
const SHOTS = import.meta.glob<string>('../assets/landing/features/*.jpg', { eager: true, query: '?url', import: 'default' });
const shotUrl = (key: string) => SHOTS[`../assets/landing/features/${key}.jpg`];

/** A row's slides: one shot of each screen, in dark (the light one only where there's no dark) */
function slidesFor(f: Feature): Slide[] {
  const keys = Array.isArray(f.shot) ? f.shot : [f.shot];
  const alts = Array.isArray(f.alt) ? f.alt : [f.alt];
  return keys.flatMap((k, i) => {
    const alt = alts[i] ?? alts[0];
    const dark = shotUrl(`${k}-dark`);
    return [{ src: dark ?? shotUrl(k), alt: dark ? `${alt} (dark mode)` : alt, size: f.size }].filter(sl => !!sl.src) as Slide[];
  });
}

/** Stagger for revealed items: each later one starts a beat after */
const delay = (i: number) => ({ '--reveal-delay': `${i * 0.1}s` }) as CSSProperties;

interface Feature {
  label: string;
  title: string;
  body: string;
  points: string[];
  note?: string;
  /** One screenshot key, or several for a slideshow */
  shot: string | string[];
  size: [number, number];
  alt: string | string[];
}

const FEATURES: Feature[] = [
  {
    label: 'Journal', title: 'A journal that keeps up with you.',
    body: 'Everything you capture on your home dashboard flows into your main journal, where you can search, review, and edit every note, wellness check, and media entry in one chronological stream. Switch to the media journal view to organize books, movies, TV shows, and music with ratings and progress tracking, using separate public and private shelves so you share only what you choose with others.',
    points: [],
    shot: 'journal', size: [1268, 1000],
    alt: 'The journal with everyday entries by month and a Sunday entry open',
  },
  {
    label: 'Goals and planning', title: 'From multiyear roadmaps down to your daily plan.',
    body: 'Every task links directly to milestones and goals, giving you seamless movement between list views, Kanban boards, and a draggable Gantt roadmap. Filter instantly by goal or category, drag tasks into your weekly planner to map out your days, and see everything automatically appear on your main calendar next to synced events and bills.',
    points: [],
    shot: ['planning-tasks', 'planning-roadmap', 'planning-planner'], size: [1268, 900],
    alt: [
      'The tasks board by status with priorities, deadlines and the milestone each rolls up to',
      'The roadmap: goals and their milestones as bars across the year, grouped by category',
      'The week planner with tasks and events in each day, and the unscheduled tasks beside it',
    ],
  },
  {
    label: 'Health and wellness', title: 'Health, wellness, and endurance training in one view.',
    body: 'Log daily habits, mood, sleep, hydration, and nutrition with macro and micronutrient targets, alongside scheduled workouts and multi-phase training plans built for big athletic goals like mountaineering. Stay consistent with effortless medication dose tracking, uncover symptom patterns and food triggers through built in reports, and print organized allergy, symptom, and medication lists for your doctor.',
    points: [],
    shot: ['health-dashboard', 'health-meals', 'health-exercise-history', 'health-reports'],
    size: [1268, 1300],
    alt: [
      'The health dashboard with nutrients against goals, the macro split, the wellness check-in, quick logs, today’s doses and a quick symptom log',
      'The meals log with the day’s calories and vitamins against goals beside the protein, carbs and fat split, and what was eaten',
      'Exercise history showing each exercise’s sessions, days, time and distance this month',
      'Health reports with mood, sleep, social time, exercise and stress over time, and what goes with better days',
    ],
  },
  {
    label: 'Budget and finance', title: 'Private budgeting to keep your finances on track.',
    body: 'Manage monthly category budgets, recurring bills, subscriptions, and dedicated savings funds in one clean view. Your running balance updates automatically as you log expenses, while clear reports compare planned versus actual spending so you can adjust before the month ends.',
    points: [],
    shot: ['finance', 'finance-bills', 'finance-savings'], size: [1268, 1440],
    alt: [
      'The budget with planned, bills, spending and what’s left, and where the money goes by category',
      'Bills and subscriptions with what’s due, paid and overdue this month',
      'Savings funds with each balance and its progress toward a target',
    ],
  },
];

const MODULES = [
  { title: 'Calendar', body: 'View events, deadlines, and bills by day, week, or month, complete with two-way Google Calendar sync and a private Apple Calendar feed.', shot: 'calendar-dark', alt: 'The month calendar with events and bills on their days' },
  { title: 'Meal planning', body: 'Build a weekly menu, save recipes with checkable ingredients, and turn your meal plan into a shopping list in one tap.', shot: 'kitchen-dark', alt: 'The kitchen dashboard with today’s meals and the shopping list' },
  { title: 'Budget and finance', body: 'Manage a manual budget, bills, subscriptions, and savings goals. Off by default, and never linked to a bank.', shot: 'finance-dark', alt: 'The budget with planned, bills, spending and what’s left' },
  { title: 'Media journal', body: 'Keep books, movies, shows, and music on one shelf with half-star ratings, progress tracking, notes, and an optional public shelf to share.', shot: 'media-dark', alt: 'The media journal shelf of book covers' },
];

const EXTRAS = [
  { title: 'Custom topics', body: 'Create, reorder, and customize any topic with its own icon and tailored fields.' },
  { title: 'Time tracking', body: 'Time any task, workout, or focus session directly from its entry.' },
  { title: 'Built for mobile', body: 'Access your secure workspace in any web browser or install it straight to your phone home screen for a seamless native experience.' },
  { title: 'Optional AI', body: 'Get instant calorie and nutrient estimates using your own Anthropic, OpenAI, or Bedrock API key. It never touches or sees your journal.' },
];

const PRIVACY = [
  { icon: 'lock', title: 'Encrypted on your device', body: 'Client-side AES encryption in the browser, ensuring your password and keys never leave your device.' },
  { icon: 'visibility_off', title: 'No tracking', body: 'No analytics, telemetry or crash reporting. When something breaks, a bug form is how you report it.' },
  { icon: 'notifications_off', title: 'No pings, no marketing', body: 'No notifications and no marketing email. Chronicles waits until you open it.' },
  { icon: 'key', title: 'AI on your terms', body: 'The assistant is optional and uses your own key. Requests go from your browser straight to the provider.' },
  { icon: 'image', title: 'Private, encrypted photo storage.', body: 'Photos stay off by default. Connect your own private storage bucket, and encrypted images upload directly to your personal cloud without touching our servers.' },
  { icon: 'download', title: 'Your data leaves with you', body: 'Export entries, including finance, to JSON or CSV, print medical summaries, or jump straight in using built-in seed data for wellness, topics, and finance.' },
];

const BETA_POINTS = ['Free access for the whole beta', 'A direct say in what gets built next', 'After release, no more than $20 a month'];

const QUESTIONS = [
  { q: 'How do I give feedback or report a bug?', a: 'Simply head to your settings, open the built-in report a bug or feedback form, fill out your notes, and click send.' },
  { q: 'Can I import my existing notes or journal entries?', a: 'Yes. Because Chronicles supports full JSON backups and CSV exports, you can easily migrate or restore your data anytime.' },
  { q: 'What happens to my data if I stop using Chronicles?', a: 'Your data is entirely yours. You can export your complete archive to JSON or CSV spreadsheets at any moment, leaving nothing behind on any server.' },
  { q: 'How does optional AI work without compromising privacy?', a: 'You bring your own API key (Anthropic, OpenAI, or Bedrock). The AI is only used on demand for quick calorie or nutrient estimates, and your journal contents are never used to train models or stored externally.' },
  { q: 'Is my data accessible offline?', a: 'Yes. Because it runs directly in your browser with local storage and client-side encryption, your workspace remains fully accessible and functional even when you are offline.' },
  { q: 'What happens if I lose my password?', a: 'Because Chronicles uses zero-knowledge client-side encryption where your password and keys never leave your device, we cannot recover or reset your password for you. Your data remains strictly private.' },
  { q: 'Is there a phone app?', a: 'Chronicles runs smoothly in any modern web browser and installs straight to your phone home screen for a seamless native app experience. A native iOS and Android app will be developed after initial beta release.' },
  { q: 'What will it cost?', a: 'During the active beta, access is completely free. After official release, pricing will be no more than $20 a month.' },
];

/* ——— Shared pieces ——— */

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
  li > span { flex: none; margin-top: 2px; color: ${PAGE_INK}; }
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45), 0 2px 18px rgba(0, 0, 0, 0.55);
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
  margin: 0 auto 48px;
  font-family: var(--font-display);
  font-size: 78px;
  font-weight: 200;
  line-height: 1.06;
  color: var(--text-primary);
  /* Two lines on wide screens: "A life dashboard for / people too busy to plan." */
  br { @media (max-width: 768px) { display: none; } }
  /* The second half in a pale teal, the page's one coloured phrase */
  em { font-style: normal; color: #b6dbd9; }
  @media (max-width: 768px) { font-size: 44px; }
`;

const HeroText = styled.p`
  max-width: 960px; /* first line ends at "moments, and", the second starts at "tasks" */
  margin: 0 auto;
  font-size: 18px;
  line-height: 1.65;
  color: var(--text-soft);
  @media (max-width: 768px) { font-size: 17px; }
`;

/* The hero's slideshow of the app, no frame */
const Showcase = styled.div`
  max-width: 1048px;
  margin: 0 auto;
  padding: 0 24px 8px;
  @media (max-width: 768px) { padding: 0 20px; }
`;

/* ——— How it works (the original timeline) ——— */

const STEPS = [
  { title: 'Choose or create a topic', body: 'Pick an existing topic or build your own with custom fields.' },
  { title: 'Capture it in seconds', body: 'Log a meal, medication dose, expense, or thought in under 15 seconds.' },
  { title: 'View your big picture', body: 'Chronicles sorts your entries by topic so you can track, plan, and organize your days effortlessly.' },
];

/* More room above and below than the other bands */
const HowBand = styled(Band)`
  && { padding: 136px 0 144px; }
  @media (max-width: 768px) { && { padding: 88px 0 96px; } }
`;

/* The heading: title case, a touch heavier, more room under it */
const HowTitle = styled(H2)`
  margin: 0 0 30px;
  font-size: 60px;
  font-weight: 300;
  text-align: center;
  text-transform: capitalize;
  max-width: none;
  @media (max-width: 768px) { font-size: 42px; }
`;

/* The intro: centred, at most 860px wide */
const WideLede = styled(Lede)`
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
`;

/* A timeline: a teal ring with a centre dot above each step, a hairline
   joining the rings, the title and text centred underneath */
const Steps = styled.ol`
  --gap: 40px;
  list-style: none;
  margin: 72px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gap);
  li { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; }
  /* The line to the next ring: from this ring's edge to the next ring's edge */
  li:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 17px;
    left: calc(50% + 30px);
    width: calc(100% + var(--gap) - 60px);
    height: 1px;
    background: var(--border-default);
  }
  h3 { margin: 32px 0 10px; font-family: var(--font-display); font-size: 26px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0; max-width: 300px; font-size: 16px; line-height: 1.65; color: var(--text-soft); text-wrap: balance; }
  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 44px;
    margin-top: 48px;
    li::after { display: none; }
    h3 { margin-top: 18px; }
  }
`;

/* The step marker: a teal ring with a dot in the middle */
const Marker = styled.span`
  width: 34px;
  height: 34px;
  flex: none;
  border: 2px solid ${PAGE_INK};
  border-radius: 50%;
  background: radial-gradient(circle, ${PAGE_INK} 0 5px, transparent 5.5px);
`;

/* ——— Features (heading, then the rows) ——— */

/* ——— Feature rows ——— */

const FeatureRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 136px;
  @media (max-width: 900px) { gap: 80px; }
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

/* A screenshot in a light device bezel, lifted off the page */

/* ——— Everything else ——— */

const Modules = styled.ul`
  list-style: none;
  margin: 64px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
  li { overflow: hidden; border-radius: 12px; background: var(--bg-panel); box-shadow: 0 1px 3px rgba(20, 24, 32, 0.06), 0 10px 28px rgba(20, 24, 32, 0.08); }
  img { display: block; width: 100%; height: 190px; object-fit: cover; object-position: top left; }
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

/* ——— Privacy (the dark band over the night sky) ——— */

/* The app's dark page colour over the mountain photo (the river valley, the
   hero's), faint. (`BAND_GRADIENT`, the teal band, is kept for going back.) */
const PrivacyBand = styled(DarkBand)`
  background:
    linear-gradient(180deg, rgba(31, 34, 41, 0.9) 0%, rgba(31, 34, 41, 0.84) 45%, rgba(31, 34, 41, 0.92) 100%),
    #1f2229 url(${HERO_PHOTO}) center 55% / cover no-repeat;
  --text-secondary: rgba(255, 255, 255, 0.88);
  --text-muted: rgba(255, 255, 255, 0.7);
  padding: 128px 0 96px;
  @media (max-width: 768px) { padding: 80px 0 64px; }
`;

const PrivacyHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 56px;
  align-items: end;
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
  gap: 20px;
  /* Each item a quiet card: a faint fill and a hairline, 14px corners */
  li {
    padding: 28px 26px 32px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(31, 34, 41, 0.55);
  }
  li > span { display: block; margin-bottom: 26px; color: #8fd1cd; }
  h3 { margin: 0 0 12px; font-family: var(--font-display); font-size: 22px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0; font-size: 15px; line-height: 1.65; color: var(--text-secondary); }
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); gap: 14px; margin: 48px 0; }
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
  /* A light teal on the dark band */
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
            <H1 id="hero-title">A life dashboard for<br /> people <em>too busy to plan.</em></H1>
            <HeroText>
              Chronicles is a zero-knowledge encrypted journal, planner, and life tracker. Capture notes, habits, moments,
              and tasks in one place, and let Chronicles automatically organize them into the views you need to manage
              your day.
            </HeroText>
          </Hero>
          <Showcase>
            <ScreenSlideshow />
          </Showcase>
        </section>
      )}
    >
      <div ref={revealRef}>
        <HowBand $tone="page" id="how" aria-labelledby="how-title">
          <Container>
            <div data-reveal>
              <HowTitle id="how-title">How it works</HowTitle>
              <WideLede>
                Configure your custom topics once with essentials like medications, allergies, bills, and roadmap goals,
                and maintain everything in under fifteen minutes a day. Your continuous stream of entries is automatically
                sorted into custom views, creating a centralized digital hub that brings your metrics, tasks, goals, and
                routines into one clear view.
              </WideLede>
            </div>
            <Steps>
              {STEPS.map((st, i) => (
                <li key={st.title} data-reveal style={delay(i)}>
                  <Marker aria-hidden />
                  <h3>{st.title}</h3>
                  <p>{st.body}</p>
                </li>
              ))}
            </Steps>
          </Container>
        </HowBand>

        <Band $tone="white" id="features" aria-label="Features">
          <Container>
            <FeatureRows>
              {FEATURES.map((f, i) => (
                <FeatureRow key={f.label}>
                  <div data-reveal>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                    {f.points.length > 0 && <TickList items={f.points} />}
                    {f.note && <em>{f.note}</em>}
                  </div>
                  <div data-reveal style={delay(1.5)}>
                    <ShotSlides slides={slidesFor(f).filter((sl, i) => Array.isArray(f.shot) || i === 0)} />
                  </div>
                </FeatureRow>
              ))}
            </FeatureRows>
          </Container>
        </Band>

        <Band $tone="page" aria-labelledby="more-title">
          <Container>
            <div data-reveal>
              <H2 id="more-title">Everything else your days touch.</H2>
              <Lede>Modules switch on and off, so your workspace stays clean and you only keep what you use.</Lede>
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

        <PrivacyBand id="privacy" aria-labelledby="privacy-title">
          <Container>
            <PrivacyHead data-reveal>
              <div>
                <H2 id="privacy-title">Only you can read it.</H2>
              </div>
              <p>Chronicles is zero knowledge. Entries are encrypted in your browser before they’re saved, so the server only
              ever holds data it can’t read.</p>
            </PrivacyHead>
            <PrivacyGrid>
              {PRIVACY.map((p, i) => (
                <li key={p.title} data-reveal style={delay(i % 3)}>
                  <MaterialIcon aria-hidden $size={22}>{p.icon}</MaterialIcon>
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
              <H2 id="beta-title">Help shape your new life dashboard.</H2>
              <Lede>
                Chronicles is in active development with limited seats to ensure every tester gets direct attention.
              </Lede>
              <TickList items={BETA_POINTS} />
            </div>
            <div data-reveal style={delay(1.5)}><BetaSignup /></div>
          </BetaLayout>
        </Band>

        <FaqBand id="faq" aria-labelledby="faq-title">
          <FaqLayout>
            <div data-reveal>
              <H2 id="faq-title">Good to know</H2>
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
