import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { LandingTemplate, Container, DarkBand, ActionPill, HERO_PHOTO_TORRES, PAGE_INK } from '../components/templates/LandingTemplate.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { ShotSlides, type Slide } from '../components/organisms/landing/ShotSlides.js';
import { ScreenSlideshow } from '../components/organisms/landing/ScreenSlideshow.js';
import HEADLINE_SVG from '../assets/landing/headline.svg?url';
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
  /** Label rows under the text: a small tracked-caps label beside a line (the mockup's STREAM / SEARCH / MEDIA) */
  facts?: { label: string; text: string }[];
  note?: string;
  /** One screenshot key, or several for a slideshow */
  shot: string | string[];
  size: [number, number];
  alt: string | string[];
}

const FEATURES: Feature[] = [
  {
    label: 'Journal', title: 'A journal that keeps up with you.',
    body: 'Everything you capture on your dashboard lands here, in one stream you can search, review and edit.',
    points: [],
    facts: [
      { label: 'Stream', text: 'Notes, wellness checks and meals, newest first.' },
      { label: 'Search', text: 'Find any entry by word, topic or date.' },
      { label: 'Write', text: 'Write for any topic in any form you like - dictation, pen, or just type in your entry.' },
    ],
    shot: 'journal', size: [1268, 1000],
    alt: 'The journal with everyday entries by month and a Sunday entry open',
  },
  {
    label: 'Media journal', title: 'One shelf for everything you read, watch and hear.',
    body: 'Keep track of your books, films, shows and albums at your own pace.',
    points: [],
    facts: [
      { label: 'Track', text: 'Drag a progress bar as you go, and rate in half stars.' },
      { label: 'Add', text: 'Search a title and the cover, creator, year and genre fill in for you.' },
      { label: 'Share', text: 'Bookmark favorites onto a public shelf with its own link that you can share with others while your notes and progress stay private. You can also follow other user’s public shelves.' },
    ],
    shot: ['media', 'media-entry', 'media-public', 'media-following'], size: [1268, 910],
    alt: [
      'The media journal shelf of covers with ratings, progress and shelf status under each',
      'A book’s entry with its cover, author, year and genre filled in, shelf, tags, progress and a half-star rating',
      'A public shelf as visitors see it, with the shared covers and ratings',
      'The Following view: a box to paste a shelf link, and a followed shelf with its first covers, Open shelf and Unfollow',
    ],
  },
  {
    label: 'Goals and planning', title: 'Plan the decade.\nThen plan Thursday.',
    body: 'Every task ties back to a milestone and a goal, so the small things you do each day add up to the big ones.',
    points: [],
    facts: [
      { label: 'Goals', text: 'Set a vision, then break it into goals and milestones on a draggable roadmap.' },
      { label: 'Tasks', text: 'Work as a list or a Kanban board, filtered by goal or category.' },
      { label: 'Planner', text: 'Drag tasks into your week and see them on your calendar beside events and bills.' },
    ],
    shot: ['planning-planner', 'planning-tasks', 'planning-roadmap', 'planning-vision'], size: [1268, 900],
    alt: [
      'The tasks board by status with priorities, deadlines and the milestone each rolls up to',
      'The roadmap: goals and their milestones as bars across the year, grouped by category',
      'The week planner with tasks and events in each day, and the unscheduled tasks beside it',
    ],
  },
  {
    label: 'Health and wellness', title: 'Your health,\nday by day.',
    body: 'Track what you eat, how you feel and what you take, then see how they connect.',
    points: [],
    facts: [
      { label: 'Wellness', text: 'Mood, sleep, water and meals, with calorie and nutrient targets.' },
      { label: 'Medication', text: 'A dose schedule you check off, with a full history behind it.' },
      { label: 'Reports', text: 'Spot symptom patterns and food triggers, and print allergy, symptom and medication lists for your doctor.' },
    ],
    shot: ['health-meals', 'health-dashboard', 'health-exercise-history', 'health-reports'],
    size: [1268, 1300],
    alt: [
      'The health dashboard with nutrients against goals, the macro split, the wellness check-in, quick logs, today’s doses and a quick symptom log',
      'The meals log with the day’s calories and vitamins against goals beside the protein, carbs and fat split, and what was eaten',
      'Exercise history showing each exercise’s sessions, days, time and distance this month',
      'Health reports with mood, sleep, social time, exercise and stress over time, and what goes with better days',
    ],
  },
  {
    // The pasted headline began "now what’s left": read as "Know" with its first letter lost
    label: 'Budget and finance', title: 'Know what’s left\nbefore you spend it.',
    body: 'Plan the month, log what you spend, and your balance keeps itself current.',
    points: [],
    facts: [
      { label: 'Budget', text: 'Set category budgets and recurring bills, then mark them paid as you go.' },
      { label: 'Savings', text: 'Build funds for the things you’re working toward, and pay debts down beside them.' },
      { label: 'Reports', text: 'Compare planned against actual, and see where the money went.' },
    ],
    shot: ['finance', 'finance-bills', 'finance-savings'], size: [1268, 1440],
    alt: [
      'The budget with planned, bills, spending and what’s left, and where the money goes by category',
      'Bills and subscriptions with what’s due, paid and overdue this month',
      'Savings funds with each balance and its progress toward a target',
    ],
  },
  {
    label: 'AI planning and insights', title: 'An AI planner\nthat asks first.',
    body: 'Bring your own AI key and let it plan your week or reflect on your journal. It runs only when you press the button, and only on what you agree to share.',
    points: [],
    facts: [
      { label: 'Plan', text: 'It reads your tasks, goals and calendar, then suggests a schedule, new tasks and a fuller roadmap. You review every change before anything is saved.' },
      { label: 'Reflect', text: 'Ask for insights on your journal and get a short reflection with prompts to write about.' },
      { label: 'Consent', text: 'Off until you turn it on. Every run lists exactly what will be shared, and nothing is stored unencrypted.' },
    ],
    // Each share prompt comes before the result it leads to, as it does in the app
    shot: ['ai-plan-share', 'ai-plan', 'ai-plan-roadmap', 'ai-insights-share', 'ai-insights'], size: [1268, 900],
    alt: [
      'The prompt before anything is sent, listing the tasks, goals, milestones, visions and events that will be shared',
      'The AI plan to review: tasks placed on days and new tasks for goals, each with a tick, before Apply',
      'More of the AI plan: a goal’s status, a milestone’s new target date, and new milestones that fill out the roadmap',
      'The prompt before journal insights run, listing the journal entries that will be shared',
      'AI insights on the journal: a short reflection written from recent entries, with prompts underneath',
    ],
  },
];

const MODULES = [
  { title: 'Calendar', body: 'Events, deadlines and bills by day, week or month, in sync with Google and Apple Calendar.', shot: 'calendar-dark', alt: 'The month calendar with events and bills on their days' },
  { title: 'Meal planning', body: 'Plan the week, save recipes, and turn the menu into a shopping list.', shot: 'kitchen-dark', alt: 'The kitchen dashboard with today’s meals and the shopping list' },
  { title: 'Budget and finance', body: 'Budgets, bills, subscriptions and savings goals, entered by you.', shot: 'finance-dark', alt: 'The budget with planned, bills, spending and what’s left' },
  { title: 'Media journal', body: 'Books, films, shows and music on your shelf, with ratings and progress.', shot: 'media-dark', alt: 'The media journal shelf of book covers' },
];

const EXTRAS = [
  { title: 'Custom topics', body: 'Create, reorder, and customize any topic with its own icon and tailored fields.' },
  { title: 'Time tracking', body: 'Time any task, workout, or focus session directly from its entry.' },
  { title: 'Works on any device', body: 'Runs smoothly in your browser and installs straight to your phone home screen as a progressive web app for instant access anywhere.' },
  { title: 'Optional AI', body: 'Get instant calorie and nutrient estimates using your own Anthropic, OpenAI, or Bedrock API key. It never touches or sees your journal.' },
];

const PRIVACY = [
  { icon: 'lock', title: 'Encrypted on your device', body: 'Client-side AES encryption in the browser, ensuring your password and keys never leave your device.' },
  { icon: 'visibility_off', title: 'No tracking', body: 'No analytics, telemetry or crash reporting. When something breaks, a bug form is how you report it.' },
  { icon: 'notifications_off', title: 'No pings, no marketing', body: 'No notifications and no marketing email. Chronicles waits until you open it.' },
  { icon: 'key', title: 'AI on your terms', body: 'The assistant is optional and uses your own key. Requests go from your browser straight to the provider.' },
  { icon: 'image', title: 'Optional encrypted photo storage', body: 'Photos are off by default. Bring your own storage key to connect a private bucket, and your encrypted photos go straight to your personal storage without ever touching the Chronicles server.' },
  { icon: 'download', title: 'Your data leaves with you', body: 'Export full JSON backups, download entries and finance data as CSV, or print clean medical summaries anytime. Start fresh or load built-in seed data for wellness, topics, and finance to test out the app instantly.' },
];

const BETA_POINTS = ['Free for the whole beta', 'A say in what gets built next', '$20 a month or less after release'];

const QUESTIONS = [
  { q: 'Why did you build Chronicles?', a: 'Chronicles was born out of personal necessity during illness to serve as a private daily anchor. Because commercial alternatives often lack true zero knowledge privacy or lock essential features behind expensive subscriptions, the source code remains completely public and free to run yourself. Only the managed hosted version and future native mobile apps will carry a post beta price to cover ongoing infrastructure, maintenance, and project sustainability.' },
  { q: 'How do I give feedback or report a bug?', a: 'Head to your settings, open the built-in feedback or report a bug form, fill out your notes, and click send.' },
  { q: 'Can I import my existing notes or journal entries?', a: 'Yes. Chronicles supports full JSON backups and CSV exports so you can migrate or restore your data anytime.' },
  { q: 'What happens to my data if I stop using Chronicles?', a: 'Your data is entirely yours. You can export your complete archive to JSON or CSV spreadsheets at any moment, leaving nothing behind on any server.' },
  { q: 'How does optional AI work without compromising privacy?', a: 'You bring your own API key (Anthropic, OpenAI, or Bedrock). The AI is only used on demand for quick calorie or nutrient estimates, and your journal contents are never used to train models or stored externally.' },
  { q: 'Is my data accessible offline?', a: 'Yes. Because it runs directly in your browser with local storage and client-side encryption, your workspace remains fully functional even when you are offline.' },
  { q: 'What happens if I lose my password?', a: 'Because Chronicles uses zero-knowledge client-side encryption where your password and keys never leave your device, we cannot recover or reset your password for you. Your data remains strictly private.' },
  { q: 'Is there a phone app?', a: 'Chronicles runs smoothly in any modern web browser and installs straight to your phone home screen for a seamless native app experience.' },
  { q: 'What will it cost?', a: 'During active beta, access is completely free. After official release, pricing will be no more than $20 a month.' },
  { q: 'Can I run Chronicles locally on my own computer?', a: 'Yes. I’m happy to share a single copy of Chronicles for your personal use only. It isn’t for redistribution or commercial use. Email support@mydailychronicles.com and I’ll invite you to the GitHub repository to download a copy or send it to you as a zip file.' },
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

const Band = styled.section<{ $tone: 'page' | 'white'; $flush?: boolean }>`
  /* $flush: no padding of its own (the feature rows are bands themselves) */
  padding: ${({ $flush }) => ($flush ? 0 : '128px 0')};
  background: ${({ $tone }) => ($tone === 'white' ? '#ffffff' : 'var(--bg-app)')};
  @media (max-width: 768px) { padding: ${({ $flush }) => ($flush ? 0 : '80px 0')}; }
`;

/* ——— Hero ——— */

const Hero = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: 72px 24px 36px; /* 72px under before (with the buttons) */
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45), 0 2px 18px rgba(0, 0, 0, 0.55);
  @media (max-width: 768px) { padding: 40px 32px 28px; }
`;

const H1 = styled.h1`
  margin: 0 auto 18px; /* 48px before */
  font-family: var(--font-display);
  font-size: 78px;
  font-weight: 200;
  line-height: 1.06;
  color: var(--text-primary);
  /* Its words are drawn by HeadlineArt below; the sizes here set that drawing's width */
  /* Tablets and phones: a little bigger than before (the intro under it a little smaller) */
  @media (max-width: 1024px) { font-size: 72px; margin-bottom: 14px; }
  @media (max-width: 768px) { font-size: 58px; }
  @media (max-width: 400px) { font-size: 50px; }
`;

/* The headline, "Your life dashboard", drawn as an SVG of its letters in Pairland
   (src/assets/landing/headline.svg, traced from src/assets/fonts/pairland.ttf) so it
   looks the same on every device and no font has to load. The words themselves stay in
   the heading, visually hidden, for screen readers and search. 591 × 91 at the
   headline's 78px, so its width is set in em and follows the heading's sizes */
const HeadlineArt = styled.img`
  display: block;
  width: 7.58em;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

const HeroText = styled.p`
  /* The width sets where the lines wrap (no line breaks in the text) */
  max-width: 760px;
  margin: 0 auto;
  font-size: 18px;
  line-height: 1.65;
  color: var(--text-soft);
  @media (max-width: 1024px) { font-size: 18px; }
  @media (max-width: 768px) { font-size: 17px; }
  /* "Encrypted…" starts the second line on wider screens; phones wrap it naturally */
  br { @media (max-width: 768px) { display: none; } }
`;

/* The hero's slideshow of the app, no frame */
const Showcase = styled.div`
  max-width: 1048px;
  margin: 0 auto;
  padding: 0 24px 8px;
  @media (max-width: 768px) { padding: 0 20px; }
`;

/* "Join the Beta" under How it works: the page's pill (ActionPill) as an accent
   outline — no fill — centred */
const HowCta = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 64px;
  --pill-neutral-bg: transparent;
  --pill-neutral-border: var(--color-accent-line);
  --pill-neutral-fg: var(--color-accent-line);
  --pill-neutral-hover: var(--color-accent-subtle);
`;

const BigPill = styled(ActionPill)`
  && { min-height: 48px; padding: 10px 28px; font-size: 16px; font-weight: 600; }
`;

/* ——— How it works (the original timeline) ——— */

const STEPS = [
  { title: 'Choose or create a topic', body: 'Pick an existing topic or build your own with custom fields.' },
  { title: 'Capture it in seconds', body: 'Log a meal, medication dose, expense, or thought in under 15 seconds.' },
  { title: 'Check the views', body: 'Everything is sorted by topic into views that let you track, plan, and organize your days effortlessly.' },
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
  /* In the page's own column, lined up with the rest of the content (it used to break
     out to 1360px, which made the screenshots huge) */
  /* The mockup's proportions: about 360px of text beside a 590px screenshot */
  max-width: 1100px; /* 1040 before: widened with the gap, so the columns keep their size */
  margin: 0 auto;
  display: flex;
  flex-direction: column;
`;

/* Each row its own full-width band, alternating white and the page grey (the band's
   colour runs edge to edge; the content stays in the column) */
const FeatureRow = styled.article`
  padding: 112px 0;
  background: #ffffff;
  box-shadow: 0 0 0 100vmax #ffffff;
  clip-path: inset(0 -100vmax);
  &:nth-child(even) { background: var(--bg-app); box-shadow: 0 0 0 100vmax var(--bg-app); }
  @media (max-width: 768px) { padding: 72px 0; }
  display: grid;
  /* Text and screenshot share the column evenly (the screenshot had the bigger share) */
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr); /* 0.62fr before */
  gap: 128px; /* 72px before */
  @media (max-width: 1200px) { gap: 88px; }
  align-items: center;
  /* Every row the same way round: text on the left, screenshot on the right (they alternated before) */
  h3 { margin: 0 0 22px; font-family: var(--font-display); font-size: 46px; font-weight: 200; line-height: 1.08; color: var(--text-primary); text-wrap: balance; }
  p { margin: 0; font-size: 18px; line-height: 1.6; color: var(--text-soft); }
  em { display: block; margin-top: 10px; font-size: 17px; color: var(--text-soft); }
  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr); gap: 36px;
    h3 { font-size: 38px; }
  }
`;

/* A feature's label rows: a small tracked-caps label beside its line, hairlines above
   each row (none under the last) (the mockup's STREAM / SEARCH / MEDIA) */
const Facts = styled.dl`
  margin: 30px 0 0;
  padding: 0;
  /* No rule under the last row */
  & > div {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 14px;
    padding: 16px 0;
    border-top: 1px solid var(--border-default);
  }
  dt {
    padding-top: 3px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-primary);
  }
  dd { margin: 0; font-size: 15px; line-height: 1.5; color: var(--text-soft); }
  @media (max-width: 560px) { & > div { grid-template-columns: minmax(0, 1fr); gap: 6px; } }
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

/* The app's dark page colour over the hero's photo (Philipp Torres's leaves —
   Justin Fisher's beach grass, `HERO_PHOTO`, before), faint. (`BAND_GRADIENT`, the
   teal band, is kept for going back.) */
const PrivacyBand = styled(DarkBand)`
  background:
    linear-gradient(180deg, rgba(31, 34, 41, 0.9) 0%, rgba(31, 34, 41, 0.84) 45%, rgba(31, 34, 41, 0.92) 100%),
    #1f2229 url(${HERO_PHOTO_TORRES}) center 55% / cover no-repeat;
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
  /* The icons: thin (the CSS weight and 'wght' must agree, for Safari) and white like
     the text, faded back into the band */
  li > span {
    display: block;
    margin-bottom: 26px;
    color: var(--text-primary);
    opacity: 0.5;
    font-weight: 200;
    font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24;
  }
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
  /* A pale teal on the dark band (a light taupe, #c9b8a8, for a while) */
  --color-accent-line: #a6dedb;
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
            <H1 id="hero-title"><HeadlineArt src={HEADLINE_SVG} alt="" aria-hidden="true" /><VisuallyHidden>Your life dashboard</VisuallyHidden></H1>
            <HeroText>
              Your journal, plans, habits, budget, books, and media, all together at last.<br /> Encrypted, untracked,
              and yours alone.
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
            <HowCta data-reveal style={delay(3)}><BigPill as="a" href="#beta">Join the Beta</BigPill></HowCta>
          </Container>
        </HowBand>

        <Band $tone="white" id="features" aria-label="Features" $flush>
          <Container>
            <FeatureRows>
              {FEATURES.map((f, i) => (
                <FeatureRow key={f.label}>
                  <div data-reveal>
                    <h3>{f.title.split('\n').map((line, n) => <span key={n}>{n > 0 && <br />}{line}</span>)}</h3>
                    <p>{f.body}</p>
                    {f.points.length > 0 && <TickList items={f.points} />}
                    {f.facts && f.facts.length > 0 && (
                      <Facts>
                        {f.facts.map(x => (
                          <div key={x.label}><dt>{x.label}</dt><dd>{x.text}</dd></div>
                        ))}
                      </Facts>
                    )}
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

        <Band $tone="white" aria-labelledby="more-title">
          <Container>
            <div data-reveal>
              <H2 id="more-title">Everything your days touch.</H2>
              <Lede>Switch modules on and off, and keep only what you use.</Lede>
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
                  <MaterialIcon aria-hidden $size={34}>{p.icon}</MaterialIcon>
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
              <H2 id="beta-title">Help shape Chronicles.</H2>
              <Lede>
                The beta is small on purpose, so every tester gets a direct line to the person building it.
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
