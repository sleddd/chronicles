import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { LandingTemplate, Container, DarkBand, HERO_PHOTO_TORRES, PAGE_INK } from '../components/templates/LandingTemplate.js';
import { ShotSlides, type Slide } from '../components/organisms/landing/ShotSlides.js';
import { ScreenSlideshow } from '../components/organisms/landing/ScreenSlideshow.js';
import { BetaSignup } from '../components/organisms/landing/BetaSignup.js';
import { useScrollReveal } from '../hooks/useScrollReveal.js';
import { BETA_DETAILS } from '@shared/legal/index.js';

/* The public home page at `/` (2026-11, the user's mockup): the hero on the photo with the app's
   slideshow, the problem, how it works (with an example goal), what's inside and a numbered row
   per feature (text and screenshots, alternating sides), why not just a planner, the rest, privacy,
   why it exists with the beta sign-up, and questions. The app itself starts at /dashboard.
   Installed copies (the PWA, standalone) skip this page and open the app. */

/** The home page's title (also in index.html, for crawlers) */
export const SEO_TITLE = 'Chronicles — Zero-Knowledge Encrypted Journal & Digital Day Planner';

/* Feature screenshots (dark theme, test account): src/assets/landing/features/<key>-dark.jpg, else
   <key>.jpg. Only the files the rows below use are bundled: add a new shot's file name to this list */
const SHOTS = import.meta.glob<string>(
  '../assets/landing/features/{planning-vision,planning-goals-list,planning-milestones-list,planning-roadmap,planning-tasks-list,planning-tasks,planning-planner,health-meals,health-dashboard,health-habits,health-exercise-history,health-reports,finance,finance-bills,finance-savings,kitchen-dashboard,kitchen-recipes,kitchen-recipe-view,kitchen-shopping-lists,journal,topics-list,topic-research,topic-event,media,media-entry,media-following,ai-plan-share,ai-plan,ai-plan-roadmap,ai-insights-share,ai-insights}-dark.jpg',
  { eager: true, query: '?url', import: 'default' },
);
/* The one shot that has only a light copy */
const LIGHT_SHOTS = import.meta.glob<string>('../assets/landing/features/media-public.jpg', { eager: true, query: '?url', import: 'default' });
const shotUrl = (key: string) => {
  const path = `../assets/landing/features/${key}.jpg`;
  return SHOTS[path] ?? LIGHT_SHOTS[path];
};

/** A row's slides: one shot of each screen, in dark (the light one only where there's no dark) */
function slidesFor(f: Feature): Slide[] {
  const keys = Array.isArray(f.shot) ? f.shot : [f.shot];
  const alts = Array.isArray(f.alt) ? f.alt : [f.alt];
  return keys.flatMap((k, i) => {
    const alt = alts[i] ?? alts[0];
    const dark = shotUrl(`${k}-dark`);
    return [{ src: dark ?? shotUrl(k), alt: dark ? `${alt} (dark mode)` : alt, size: f.sizes?.[i] ?? f.size }].filter(sl => !!sl.src) as Slide[];
  });
}

/** Stagger for revealed items: each later one starts a beat after */
const delay = (i: number) => ({ '--reveal-delay': `${i * 0.1}s` }) as CSSProperties;

interface Feature {
  /** Its anchor (the What's inside pills link to it) */
  id: string;
  /** "Takes the place of …" under the facts */
  takes?: string;
  title: string;
  body: string;
  /** Label rows under the text: a small tracked-caps label beside a line (the mockup's STREAM / SEARCH / MEDIA) */
  facts?: { label: string; text: string }[];
  /** One screenshot key, or several for a slideshow */
  shot: string | string[];
  size: [number, number];
  /** A size per shot, where a slideshow's screenshots differ (else `size` for all) */
  sizes?: [number, number][];
  alt: string | string[];
}

const FEATURES: Feature[] = [
  {
    id: 'planning', title: 'Plan the decade.\nThen plan Thursday.',
    body: 'Every task ties back to a vision, goal, milestone, and tasks, so the small things you do each day add up to the big ones.',
    facts: [
      { label: 'Goals', text: 'Set a vision, then break it into goals and milestones on a draggable roadmap.' },
      { label: 'Tasks', text: 'Work as a list or a Kanban board, filtered by goal or category.' },
      { label: 'Planner', text: 'Drag tasks into your week, beside your events and bills.' },
    ],
    takes: 'your to-do list, goal planner and weekly planner.',
    // In the order of Planning's tabs: Vision, Goals, Milestones, Roadmap, Tasks (list, then board), Planner
    shot: ['planning-vision', 'planning-goals-list', 'planning-milestones-list', 'planning-roadmap', 'planning-tasks-list', 'planning-tasks', 'planning-planner'], size: [1268, 900],
    alt: [
      'Your vision, then a card per area of life with its goals, how far along each is and this week’s tasks',
      'Goals as a list by area of life, with progress rings, start dates, deadlines and task counts',
      'Milestones under their goals, with progress, start dates, deadlines and task counts',
      'The roadmap: goals and their milestones as bars across the months, grouped by category',
      'Tasks as a list under their goals, with priority, the day planned, the deadline and how late',
      'The tasks board by status with priorities, deadlines and estimates',
      'The week planner: tasks at their times around the week’s events and meetings',
    ],
  },
  {
    id: 'health', title: 'Your health, day by day.',
    body: 'Track what you eat, how you feel and what you take, then see how they connect.',
    facts: [
      { label: 'Wellness', text: 'Mood, sleep, water and meals, with calorie and nutrient targets.' },
      { label: 'Medication', text: 'A dose schedule you check off, with a full history behind it.' },
      { label: 'Habits', text: 'Check off the habits you’re building, see your streaks, and tie each one to a goal.' },
      { label: 'Reports', text: 'Spot symptom patterns and food triggers, and print lists for your doctor.' },
    ],
    takes: 'your calorie counter, pill reminder, habit tracker and symptom diary.',
    shot: ['health-meals', 'health-dashboard', 'health-habits', 'health-exercise-history', 'health-reports'],
    size: [1268, 1300],
    alt: [
      'The meals log with the day’s calories and vitamins against goals beside the protein, carbs and fat split, and what was eaten',
      'The health dashboard with nutrients against goals, the macro split, the wellness check-in, quick logs, today’s doses and a quick symptom log',
      'Habits as cards with the week’s check-ins, streaks and the goal each is part of, then each habit’s history',
      'Exercise history showing each exercise’s sessions, days, time and distance this month',
      'Health reports with mood, sleep, social time, exercise and stress over time, and what goes with better days',
    ],
  },
  {
    id: 'money', title: 'Know what’s left before you spend it.',
    body: 'Plan the month, log what you spend, and your balance keeps itself current.',
    facts: [
      { label: 'Budget', text: 'Set category budgets and recurring bills, then mark them paid as you go.' },
      { label: 'Savings', text: 'Build funds for what you’re working toward, and pay debts down beside them.' },
      { label: 'Reports', text: 'Compare planned against actual, and see where the money went.' },
    ],
    takes: 'your budgeting app and bill spreadsheet.',
    shot: ['finance', 'finance-bills', 'finance-savings'], size: [1268, 1440],
    alt: [
      'The budget with planned, bills, spending and what’s left, and where the money goes by category',
      'Bills and subscriptions with what’s due, paid and overdue this month',
      'Savings funds with each balance and its progress toward a target',
    ],
  },
  {
    id: 'kitchen', title: 'Plan the week.\nShop once.',
    body: 'Plan your meals, keep your recipes, and turn the menu into a shopping list.',
    facts: [
      { label: 'Menu', text: 'See today’s meals at a glance and plan the week ahead.' },
      { label: 'Recipes', text: 'Keep recipes with prep and cook times, servings and difficulty.' },
      { label: 'Shopping', text: 'Make a list from the week’s menu and tick items off as you shop.' },
    ],
    takes: 'your recipe box and grocery list.',
    shot: ['kitchen-dashboard', 'kitchen-recipes', 'kitchen-recipe-view', 'kitchen-shopping-lists'], size: [1268, 730],
    alt: [
      'The kitchen dashboard with today’s meals and the shopping list to tick off',
      'Recipes as a table with prep and cook times, servings and difficulty',
      'A recipe with its photo, servings to scale, ingredients to tick off and numbered steps',
      'Shopping lists with how many items each holds',
    ],
  },
  {
    id: 'journal', title: 'A journal that keeps up with you.',
    body: 'Everything you capture lands here, plans and all, in a stream you can search, review and edit.',
    facts: [
      { label: 'Stream', text: 'Notes, wellness checks and meals, newest first.' },
      { label: 'Search', text: 'Find any entry by word, topic or date.' },
      { label: 'Write', text: 'Type, dictate or use a pen, for any topic.' },
    ],
    takes: 'your notes app and paper journal.',
    shot: ['journal', 'topics-list', 'topic-research', 'topic-event'], size: [1268, 1000],
    sizes: [[1268, 1000], [1268, 730], [1268, 730], [1268, 730]],
    alt: [
      'The journal with everyday entries by month and a Sunday entry open',
      'Your topics, each with its icon and how many entries it holds',
      'A topic’s entries as a table you can group, sort, search and filter by tag',
      'Events with when each starts and ends, and where',
    ],
  },
  {
    id: 'media', title: 'A shelf for everything you read, watch and hear.',
    body: 'Keep track of your books, films, shows and albums at your own pace.',
    facts: [
      { label: 'Track', text: 'Drag a progress bar as you go, and rate in half stars.' },
      { label: 'Add', text: 'Search a title and the cover, creator, year and genre fill in for you.' },
      { label: 'Share', text: 'Put favorites on a public shelf with its own link. Notes and progress stay private.' },
    ],
    takes: 'your reading tracker and watch list.',
    shot: ['media', 'media-entry', 'media-public', 'media-following'], size: [1268, 910],
    alt: [
      'The media journal shelf of covers with ratings, progress and shelf status under each',
      'A book’s entry with its cover, author, year and genre filled in, shelf, tags, progress and a half-star rating',
      'A public shelf as visitors see it, with the shared covers and ratings',
      'The Following view: a box to paste a shelf link, and a followed shelf with its first covers, Open shelf and Unfollow',
    ],
  },
  {
    id: 'ai', title: 'An AI planner that asks first.',
    body: 'Bring your own AI key and let it plan your week or reflect on your journal. It runs only when you press the button, and only on what you agree to share.',
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

/* ——— Copy (the mockup's, as written) ——— */

const TOOLS = ['Goal planner', 'To-do list', 'Calorie counter', 'Pill reminder', 'Budget sheet', 'Journal'];

const STEPS = [
  { title: 'Pick a topic', body: 'A meal, a dose, an expense, a task, a thought. Each topic brings its own fields, and you can build your own.' },
  { title: 'Write it down', body: 'Under 15 seconds from the dashboard, typed, dictated or by pen. No forms to hunt for.' },
  { title: 'Watch it add up', body: 'The entry lands in its own view. Meals in Health, bills in Finance, tasks under their goal, and all of it in your journal.' },
];

const EXAMPLE = [
  { label: 'Roadmap', text: 'Milestones from the first 5K to race day', area: 'Planning' },
  { label: 'This week', text: 'Three runs dragged onto your calendar', area: 'Planner' },
  { label: 'Training', text: 'Each run logged, beside your sleep and meals', area: 'Health' },
  { label: 'Savings', text: 'A fund for shoes and the entry fee', area: 'Finance' },
  { label: 'Supplies', text: 'Gear to buy, listed under the goal', area: 'Goal' },
  { label: 'Notes', text: 'How the long run felt, in your own words', area: 'Journal' },
];

const INSIDE = [
  { id: 'planning', name: 'Planning' }, { id: 'health', name: 'Health' }, { id: 'money', name: 'Money' }, { id: 'kitchen', name: 'Kitchen' },
  { id: 'journal', name: 'Journal' }, { id: 'media', name: 'Media' }, { id: 'ai', name: 'AI planner' },
];

const REST = [
  { title: 'Calendar', body: 'Events, deadlines and bills by day, week or month, with Google Calendar sync and an Apple Calendar feed.' },
  { title: 'Optional photo storage', body: 'Off by default. Connect your own private bucket and encrypted photos go straight there.' },
  { title: 'Custom topics', body: 'Create and reorder any topic, each with its own icon and fields.' },
  { title: 'Time tracking', body: 'Time any task, workout or focus session from its entry.' },
  { title: 'Any device', body: 'Runs in your browser and installs to your phone’s home screen.' },
  { title: 'Your data leaves with you', body: 'Export a full backup, download CSVs, or print medical summaries at any time.' },
];

const PRIVACY = [
  { title: 'Encrypted on your device', body: 'Your password and keys never leave your browser.' },
  { title: 'No tracking', body: 'No analytics, telemetry or crash reporting. A bug form is how you report a problem.' },
  { title: 'No pings, no marketing', body: 'No notifications and no marketing email. Chronicles waits until you open it.' },
  { title: 'AI on your terms', body: 'Optional, with your own key. Requests go from your browser straight to the provider.' },
];

/* The price after the beta, from BETA_DETAILS (one source for the points and the answer) */
const PRICE = `$${BETA_DETAILS.priceMonthly} a month`;

const BETA_POINTS = ['Free for the whole beta', 'A say in what gets built next', `${PRICE} or less after release`];

/* The mockup shows the questions; the answers are the page's own */
const QUESTIONS = [
  { q: 'What will it cost?', a: `During active beta, access is completely free. After official release, pricing will be no more than ${PRICE}.` },
  { q: 'Is there a phone app?', a: 'Chronicles runs smoothly in any modern web browser and installs straight to your phone home screen for a seamless native app experience.' },
  { q: 'Can I import my existing notes or journal entries?', a: 'Yes. You can import entries from a CSV file, and export everything, as JSON and CSV, anytime.' },
  { q: 'What happens if I lose my password?', a: 'Because Chronicles uses zero-knowledge client-side encryption where your password and keys never leave your device, we can’t recover or reset your password for you. The recovery key you save when you sign up lets you set a new one. Without your password or that key, your journal can’t be opened.' },
  { q: 'How does optional AI work without compromising privacy?', a: 'You bring your own API key (Anthropic, OpenAI or Amazon Bedrock), and requests go from your browser straight to that provider, never through Chronicles. Calorie and nutrient estimates and the chat only see what you type into them. AI planning and journal insights are the two features that send your entries, and both are off until you turn them on. Before every run they list exactly what will be shared and wait for your OK. Anything you send leaves Chronicles’ encryption and is handled under your provider’s terms, including whether it’s kept or used for training. Chronicles never stores the request or the answer.' },
];

/* ——— Shared pieces ——— */

/* The teal of the mockup's buttons and dots, and the deep teal of its bands */
const TEAL = '#34a5a2';
const DEEP_TEAL = '#1b4b4b';

/* Section headings: big thin Work Sans, sentence case */
const H2 = styled.h2<{ $center?: boolean }>`
  margin: 0 0 22px;
  max-width: 950px;
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 200;
  line-height: 1.12;
  color: var(--text-primary);
  text-wrap: balance;
  ${({ $center }) => $center && 'margin-left: auto; margin-right: auto; text-align: center;'}
  @media (max-width: 768px) { font-size: 38px; }
`;

const Lede = styled.p<{ $center?: boolean }>`
  max-width: 950px;
  margin: 0;
  font-size: 19px;
  line-height: 1.65;
  color: var(--text-soft);
  ${({ $center }) => $center && 'margin-left: auto; margin-right: auto; text-align: center;'}
  @media (max-width: 768px) { font-size: 17px; }
`;

const Band = styled.section<{ $tone: 'page' | 'white'; $flush?: boolean }>`
  padding: ${({ $flush }) => ($flush ? 0 : '128px 0')};
  background: ${({ $tone }) => ($tone === 'white' ? '#ffffff' : 'var(--bg-app)')};
  @media (max-width: 768px) { padding: ${({ $flush }) => ($flush ? 0 : '80px 0')}; }
`;

/* ——— Hero ——— */

const Hero = styled.div`
  max-width: 1048px;
  margin: 0 auto;
  padding: 88px 24px 64px;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 2px 18px rgba(0, 0, 0, 0.45);
  @media (max-width: 768px) { padding: 48px 28px 44px; }
`;

const H1 = styled.h1`
  margin: 0 auto 28px;
  font-family: var(--font-display);
  font-size: 76px;
  font-weight: 200;
  line-height: 1.08;
  color: var(--text-primary);
  text-wrap: balance;
  @media (max-width: 1024px) { font-size: 64px; }
  @media (max-width: 768px) { font-size: 46px; }
`;

const HeroText = styled.p`
  max-width: 950px;
  margin: 0 auto;
  font-size: 20px;
  line-height: 1.6;
  color: var(--text-soft);
  @media (max-width: 768px) { font-size: 17px; }
`;

const HeroActions = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 40px;
`;

/* The mockup's buttons: round pills in tracked capitals — teal filled, or a white outline */
const HeroPill = styled.a<{ $solid?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 28px;
  border-radius: 999px;
  border: 1px solid ${({ $solid }) => ($solid ? TEAL : 'rgba(255, 255, 255, 0.8)')};
  background: ${({ $solid }) => ($solid ? TEAL : 'transparent')};
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  text-shadow: none;
  transition: background 150ms;
  &:hover { background: ${({ $solid }) => ($solid ? '#2c8c8a' : 'rgba(255, 255, 255, 0.12)')}; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
`;

/* The hero's slideshow of the app */
const Showcase = styled.div`
  max-width: 1048px;
  margin: 0 auto;
  /* A good deal of room under the slideshow's dots before the next section */
  padding: 0 24px 80px;
  @media (max-width: 768px) { padding: 0 20px 48px; }
`;

/* ——— The problem ——— */

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin: 48px auto 0;
  span { font-size: 15px; }
  .tool { padding: 9px 16px; border: 1px dashed #c3c8cf; border-radius: 999px; color: var(--text-soft); }
  .arrow { color: #a3a8b0; padding: 0 4px; }
  .us { padding: 10px 20px; border-radius: 999px; background: ${DEEP_TEAL}; color: #fff; font-weight: 600; }
`;

/* ——— How it works ——— */

const Steps = styled.ol`
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 40px;
  li { padding-top: 34px; }
  h3 { margin: 0 0 14px; font-family: var(--font-display); font-size: 24px; font-weight: 400; color: var(--text-primary); }
  p { margin: 0; font-size: 16px; line-height: 1.65; color: var(--text-soft); }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 32px; }
`;

const Example = styled.div`
  margin-top: 72px;
  padding: 44px 40px 40px;
  border: 1px solid var(--border-card);
  border-radius: 16px;
  background: #ffffff;
  > header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 18px; }
  h3 { margin: 0; font-family: var(--font-display); font-size: 26px; font-weight: 300; color: var(--text-primary); }
  header span { font-size: 15px; color: var(--text-muted); }
  ol {
    list-style: none;
    margin: 34px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 24px;
    /* A hairline joining the dots */
    background: linear-gradient(var(--border-default), var(--border-default)) top 5px left 0 / 100% 1px no-repeat;
  }
  li::before { content: ''; display: block; width: 10px; height: 10px; margin-bottom: 22px; border-radius: 50%; background: ${TEAL}; }
  .label, .area { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
  .label { margin-bottom: 8px; color: var(--text-secondary); }
  .area { margin-top: 12px; color: ${PAGE_INK}; }
  li p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--text-primary); }
  > p { margin: 40px 0 0; font-size: 16px; color: var(--text-soft); }
  @media (max-width: 900px) {
    padding: 32px 24px;
    ol { grid-template-columns: repeat(2, minmax(0, 1fr)); background: none; }
  }
  @media (max-width: 480px) { ol { grid-template-columns: minmax(0, 1fr); } }
`;

/* ——— What's inside ——— */

const Inside = styled.nav`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 40px;
  a {
    padding: 10px 18px;
    border: 1px solid #c3c8cf;
    border-radius: 999px;
    font-size: 15px;
    color: var(--text-primary);
    text-decoration: none;
    &:hover { border-color: ${TEAL}; color: ${PAGE_INK}; }
  }
`;

/* ——— Feature rows ——— */

const FeatureRows = styled.div`
  max-width: 1136px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
`;

/* Each row its own full-width band, alternating white and the page grey, text and
   screenshot swapping sides from one row to the next */
const FeatureRow = styled.article`
  padding: 120px 0;
  background: #ffffff;
  box-shadow: 0 0 0 100vmax #ffffff;
  clip-path: inset(0 -100vmax);
  scroll-margin-top: 24px;
  &:nth-child(even) { background: var(--bg-app); box-shadow: 0 0 0 100vmax var(--bg-app); }
  &:nth-child(even) > :first-child { order: 2; }
  display: grid;
  /* The text and a slightly smaller screenshot, well apart */
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr);
  &:nth-child(even) { grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr); }
  gap: 120px;
  @media (max-width: 1200px) { gap: 80px; }
  align-items: center;
  h3 { margin: 0 0 24px; font-family: var(--font-display); font-size: 52px; font-weight: 200; line-height: 1.04; color: var(--text-primary); }
  .lede { margin: 0; font-size: 19px; line-height: 1.55; color: var(--text-soft); }
  .takes { margin: 26px 0 0; font-size: 15px; color: var(--text-soft); strong { font-weight: 600; color: var(--text-primary); } }
  @media (max-width: 900px) {
    padding: 72px 0;
    && { grid-template-columns: minmax(0, 1fr); gap: 36px; }
    &:nth-child(even) > :first-child { order: 0; }
    h3 { font-size: 40px; }
  }
`;

/* A feature's label rows: a small tracked-caps label beside its line, hairlines between and round them */
const Facts = styled.dl`
  margin: 26px 0 0;
  padding: 0;
  border-bottom: 1px solid var(--border-default);
  & > div {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 16px;
    padding: 18px 0;
    border-top: 1px solid var(--border-default);
  }
  dt { padding-top: 2px; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-primary); }
  dd { margin: 0; font-size: 16px; line-height: 1.45; color: var(--text-soft); }
  @media (max-width: 560px) { & > div { grid-template-columns: minmax(0, 1fr); gap: 6px; } }
`;

/* ——— Why not just a planner ——— */

const WhyBand = styled.section`
  padding: 120px 0;
  background: ${DEEP_TEAL};
  text-align: center;
  --text-primary: #ffffff;
  --text-soft: rgba(255, 255, 255, 0.9);
  @media (max-width: 768px) { padding: 80px 0; }
`;

/* ——— The rest ——— */

const Rest = styled.ul`
  list-style: none;
  margin: 72px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 48px;
  li { padding: 34px 0 30px; border-top: 1px solid var(--border-default); }
  h3 { margin: 0 0 12px; font-family: var(--font-display); font-size: 24px; font-weight: 400; color: var(--text-primary); }
  p { margin: 0; font-size: 16px; line-height: 1.55; color: var(--text-soft); }
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

/* ——— Privacy (the dark band over the photo) ——— */

const PrivacyBand = styled(DarkBand)`
  background:
    linear-gradient(180deg, rgba(24, 27, 36, 0.9) 0%, rgba(24, 27, 36, 0.84) 45%, rgba(24, 27, 36, 0.94) 100%),
    #1f2229 url(${HERO_PHOTO_TORRES}) center 55% / cover no-repeat;
  --text-secondary: rgba(255, 255, 255, 0.88);
  --text-muted: rgba(255, 255, 255, 0.7);
  padding: 120px 0 96px;
  @media (max-width: 768px) { padding: 80px 0 64px; }
`;

const PrivacyGrid = styled.ul`
  list-style: none;
  margin: 0 0 40px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  li {
    padding: 26px 24px 28px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
  }
  h3 { margin: 0 0 10px; font-family: var(--font-display); font-size: 22px; font-weight: 400; line-height: 1.35; color: var(--text-primary); }
  p { margin: 0; font-size: 16px; line-height: 1.55; color: var(--text-secondary); }
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

const FinePrint = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-muted);
`;

/* ——— Why it exists, and the beta ——— */

const StoryLayout = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 88px;
  align-items: start;
  .story .body { margin: 0 0 20px; max-width: 950px; font-size: 18px; line-height: 1.6; color: var(--text-soft); }
  .story .from { margin: 28px 0 0; font-size: 15px; color: var(--text-muted); }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 48px; }
`;

/* The card's head: its title, a line and the points with teal dots */
const BetaHead = styled.div`
  h3 { margin: 0 0 14px; font-family: var(--font-display); font-size: 34px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0 0 22px; font-size: 16px; line-height: 1.55; color: var(--text-soft); }
  ul { list-style: none; margin: 0 0 26px; padding: 0; display: grid; gap: 12px; }
  li { display: flex; align-items: center; gap: 12px; font-size: 16px; color: var(--text-primary); }
  li::before { content: ''; flex: none; width: 16px; height: 16px; border-radius: 50%; background: ${TEAL}; }
`;

/* ——— Questions ——— */

const Faq = styled.div`
  max-width: 950px;
  margin: 48px auto 0;
  border-top: 1px solid var(--border-default);
  > div { border-bottom: 1px solid var(--border-default); }
  h3 { margin: 0; }
  button {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 22px 4px;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 18px;
    font-weight: 500;
    color: var(--text-primary);
    /* A plus on the right, turning to a minus as it opens */
    &::after { content: '+'; flex: none; margin-left: auto; font-size: 20px; font-weight: 300; color: var(--text-muted); }
    &[aria-expanded='true']::after { content: '−'; }
    &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  }
  [data-answer] {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition: grid-template-rows 0.35s ease, opacity 0.3s ease;
  }
  [data-answer][data-open='true'] { grid-template-rows: 1fr; opacity: 1; }
  [data-answer] > div { overflow: hidden; }
  p { margin: 0 4px 24px; max-width: 950px; font-size: 16px; line-height: 1.7; color: var(--text-soft); }
  @media (prefers-reduced-motion: reduce) { [data-answer] { transition: none; } }
`;

/** One question: a button that slides its answer open and shut. The answer is no region
    landmark (a page of closed ones would read as empty landmarks), and is inert while shut */
function FaqItem({ id, q, a, style }: { id: string; q: string; a: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-reveal style={style}>
      <h3>
        <button type="button" id={`${id}-q`} aria-expanded={open} aria-controls={`${id}-a`} onClick={() => setOpen(o => !o)}>{q}</button>
      </h3>
      <div data-answer id={`${id}-a`} aria-labelledby={`${id}-q`} data-open={open} inert={!open}>
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

/** A title written with \n where the mockup breaks its lines */
const lines = (t: string) => t.split('\n').map((line, n) => <span key={n}>{n > 0 && <br />}{line}</span>);

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
            <H1 id="hero-title">A planner that knows the rest of your life.</H1>
            <HeroText>
              Chronicles is a planner and dashboard that connects your goals and tasks to your health, money, meals and
              journal, so you plan around the life you have. Encrypted so only you can read it.
            </HeroText>
            <HeroActions>
              <HeroPill href="#beta" $solid>Join the beta</HeroPill>
              <HeroPill href="#how">See how it works</HeroPill>
            </HeroActions>
          </Hero>
          <Showcase>
            <ScreenSlideshow />
          </Showcase>
        </section>
      )}
    >
      <div ref={revealRef}>
        {/* The problem */}
        <Band $tone="white" aria-labelledby="problem-title">
          <Container>
            <div data-reveal>
              <H2 id="problem-title" $center>Your planner knows your deadlines.<br />It has no idea how your week went.</H2>
              <Lede $center>
                Goal apps stop at the to-do list. They can't see the four hours of sleep, the missed dose or the bill that
                came due. So the plan and the life drift apart, and you end up running each from a different app.
              </Lede>
            </div>
            <Tools data-reveal style={delay(1)}>
              {TOOLS.map(t => <span key={t} className="tool">{t}</span>)}
              <span className="arrow" aria-hidden>→</span>
              <span className="us">Chronicles</span>
            </Tools>
          </Container>
        </Band>

        {/* How it works */}
        <Band $tone="page" id="how" aria-labelledby="how-title">
          <Container>
            <div data-reveal>
              <H2 id="how-title" $center>Pick a topic, write it down, watch it add up.</H2>
            </div>
            <Steps>
              {STEPS.map((st, i) => (
                <li key={st.title} data-reveal style={delay(i)}>
                  <h3>{st.title}</h3>
                  <p>{st.body}</p>
                </li>
              ))}
            </Steps>
            <Example data-reveal>
              <header><h3>For example, a single goal</h3><span>Run a half marathon in May</span></header>
              <ol>
                {EXAMPLE.map(x => (
                  <li key={x.label}>
                    <span className="label">{x.label}</span>
                    <p>{x.text}</p>
                    <span className="area">{x.area}</span>
                  </li>
                ))}
              </ol>
              <p>A goal planner shows you the first two. Chronicles shows you the whole effort, so you can tell what's helping and what's in the way.</p>
            </Example>
          </Container>
        </Band>

        {/* What's inside, then a row per feature */}
        <Band $tone="white" id="features" aria-labelledby="features-title" style={{ paddingBottom: 8 }}>
          <Container>
            <div data-reveal>
              <H2 id="features-title" $center>A planner, and everything it needs to know.</H2>
              <Lede $center>Start with your goals. Switch on the rest as you need it.</Lede>
            </div>
            <Inside aria-label="Features" data-reveal style={delay(1)}>
              {INSIDE.map(x => <a key={x.id} href={`#${x.id}`}>{x.name}</a>)}
            </Inside>
          </Container>
        </Band>
        <Band $tone="white" $flush aria-label="Features in detail">
          <Container>
            <FeatureRows>
              {FEATURES.map((f, i) => (
                <FeatureRow key={f.id} id={f.id}>
                  <div data-reveal>
                    <h3>{lines(f.title)}</h3>
                    <p className="lede">{f.body}</p>
                    {f.facts && f.facts.length > 0 && (
                      <Facts>
                        {f.facts.map(x => <div key={x.label}><dt>{x.label}</dt><dd>{x.text}</dd></div>)}
                      </Facts>
                    )}
                    {f.takes && <p className="takes"><strong>Takes the place of</strong> {f.takes}</p>}
                  </div>
                  <div data-reveal style={delay(1.5)}>
                    <ShotSlides slides={slidesFor(f)} />
                  </div>
                </FeatureRow>
              ))}
            </FeatureRows>
          </Container>
        </Band>

        {/* Why not just a planner */}
        <WhyBand aria-labelledby="why-title">
          <Container>
            <div data-reveal>
              <H2 id="why-title" $center>More than a goal planner.</H2>
              <Lede $center>
                Goal planners know your deadlines. Chronicles also knows how you slept, what you ate, what you took and what
                you spent, so your plans sit beside the life that has to carry them out.
              </Lede>
            </div>
          </Container>
        </WhyBand>

        {/* And the rest */}
        <Band $tone="white" aria-labelledby="rest-title">
          <Container>
            <div data-reveal>
              <H2 id="rest-title" $center>Everything your days touch.</H2>
              <Lede $center>Switch modules on and off, and keep only what you use.</Lede>
            </div>
            <Rest>
              {REST.map((x, i) => (
                <li key={x.title} data-reveal style={delay(i % 3)}>
                  <h3>{x.title}</h3>
                  <p>{x.body}</p>
                </li>
              ))}
            </Rest>
          </Container>
        </Band>

        {/* Privacy */}
        <PrivacyBand id="privacy" aria-labelledby="privacy-title">
          <Container>
            <div data-reveal>
              <H2 id="privacy-title">Only you can read it.</H2>
              <Lede style={{ marginBottom: 40, color: 'var(--text-secondary)' }}>
                Health, money and a journal are the most private things you own. Chronicles encrypts every entry in your
                browser before it's saved, so the server only holds data it can't read.
              </Lede>
            </div>
            <PrivacyGrid>
              {PRIVACY.map((p, i) => (
                <li key={p.title} data-reveal style={delay(i)}>
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

        {/* Why it exists, and the beta */}
        <Band $tone="page" id="beta" aria-labelledby="story-title">
          <StoryLayout>
            <div className="story" data-reveal>
              <H2 id="story-title">Built by one person, to get through real days.</H2>
              <p className="body">
                Chronicles began during an illness, as a private daily anchor: somewhere to keep doses, meals, money and
                plans without handing them to five companies. The apps that came close either couldn't promise privacy or
                locked the useful parts behind a subscription.
              </p>
              <p className="body">So the source is available on request, for your own personal use. The hosted version carries a price after beta, to cover hosting and keep the project going.</p>
              <p className="from">From the developer of Chronicles</p>
            </div>
            <div data-reveal style={delay(1.5)}>
              <BetaSignup head={(
                <BetaHead>
                  <h3>Help shape Chronicles.</h3>
                  <p>The beta is small on purpose, so every tester gets a direct line to the person building it.</p>
                  <ul>{BETA_POINTS.map(b => <li key={b}>{b}</li>)}</ul>
                </BetaHead>
              )} />
            </div>
          </StoryLayout>
        </Band>

        {/* Questions */}
        <Band $tone="white" id="faq" aria-labelledby="faq-title">
          <Container>
            <H2 id="faq-title" $center data-reveal>Good to know</H2>
            <Faq>
              {QUESTIONS.map(({ q, a }, i) => (
                <FaqItem key={q} id={`faq-${i}`} q={q} a={a} style={delay(i * 0.6)} />
              ))}
            </Faq>
          </Container>
        </Band>
      </div>
    </LandingTemplate>
  );
}
