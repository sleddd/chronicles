import { useEffect, useRef, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { LandingTemplate, Container, DarkBand, ActionPill, TEAL_GRADIENT } from '../components/templates/LandingTemplate.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { FeatureShot } from '../components/organisms/landing/FeatureShot.js';
import { useScrollReveal } from '../hooks/useScrollReveal.js';
import { ScreenSlideshow } from '../components/organisms/landing/ScreenSlideshow.js';
import { BetaSignup } from '../components/organisms/landing/BetaSignup.js';
import { BETA_DETAILS } from '@shared/legal/index.js';

/* The public home page at `/`: what Chronicles is, how it works, what it does,
   how it keeps data private, the beta sign-up (full → waitlist), and questions. The app
   itself starts at /dashboard. Installed copies (the PWA, standalone) skip
   this page and open the app. */

const STEPS = [
  { title: 'Pick a topic', body: 'Start with the defaults or make your own with specialized custom fields.' },
  { title: 'Write one line', body: 'A meal, a dose, a bill, a thought. Enter as it happens in less than 15s.' },
  { title: 'Views sort it', body: 'One line shows up everywhere you need it — Finance, Health, Planning, and more.' },
];

/** Stagger for revealed items: each later one starts a beat after */
const delay = (i: number) => ({ '--reveal-delay': `${i * 0.1}s` }) as CSSProperties;

const FEATURES: { name: string; tag?: string; body: string; shot: string; alt: string }[] = [
  { name: 'Dashboard', body: 'Your day at a glance: weather, priorities, medication doses, the day’s menu, your shopping list and what’s ahead.', shot: 'dashboard', alt: 'The dashboard with a greeting, quick entry, the daily quote and the wellness check-in' },
  { name: 'Journal', body: 'Search by keyword, topic or date, bookmark what matters, add photos, dictate by voice, or write and draw with Apple Pencil.', shot: 'journal', alt: 'The journal with entries by topic and date and a meal entry open' },
  { name: 'Topics', body: 'Tasks, goals, meals, medication, recipes, books, quotes, or your own. Add, reorder and give them icons and fields of their own.', shot: 'topics', alt: 'The Topics list with an icon and entry count for each topic' },
  { name: 'Health', body: 'Nutrition against your goals, a medication schedule with doses to check off, symptoms and allergies, and reports on how water, sleep, food and mood relate. Lists print for appointments.', shot: 'health', alt: 'Today’s medications with morning doses checked off' },
  { name: 'Planning', body: 'Goals, milestones and tasks on boards or lists. Tasks roll up into milestones, and milestones into goals.', shot: 'planning', alt: 'The goals board with columns from New to Achieved' },
  { name: 'Calendar', body: 'Day, week and month views of events, deadlines, goal dates and bills due. Syncs both ways with Google Calendar, with a private feed for Apple Calendar.', shot: 'calendar', alt: 'The month calendar with bills, tasks and events on their days' },
  { name: 'From the Kitchen', body: 'A weekly menu, recipes with checkable ingredients, and a shopping list you can take with you to the store, made from the week’s menu in one tap.', shot: 'kitchen', alt: 'The kitchen dashboard with today’s meals and the shopping list' },
  { name: 'Finance', tag: 'Optional, off by default', body: 'A manual budget, bills and subscriptions, savings funds, money goals and reports. Nothing connects to your bank.', shot: 'finance', alt: 'The budget with planned, bills, spending and what’s left by category' },
  { name: 'AI assistant', tag: 'Optional, your own key', body: 'Estimates calories and nutrients for meals and exercise and helps with the app. Works with your key from Anthropic, OpenAI or Amazon Bedrock.', shot: 'ai', alt: 'The meals log with daily nutrient totals and a button to fill missing values with AI' },
];

const PRIVACY = [
  { icon: 'lock', title: 'Encrypted on your device', body: 'AES-256 encryption in the browser, and your password never leaves your device.' },
  { icon: 'visibility_off', title: 'No tracking', body: 'No analytics, telemetry or crash reporting. When something breaks, a bug form is how you report it.' },
  { icon: 'notifications_off', title: 'No pings, no marketing', body: 'No notifications and no marketing email. Chronicles waits until you open it.' },
  { icon: 'key', title: 'AI on your terms', body: 'The assistant is optional and uses your own key. Requests go from your browser straight to the provider, and it never sees your journal.' },
  { icon: 'image', title: 'Photos in your own storage', body: 'Photos are encrypted and kept in your own Cloudflare R2 bucket. They never touch the Chronicles server.' },
  { icon: 'download', title: 'Your data leaves with you', body: 'Export entries to CSV any time, and finance data as spreadsheets with a full JSON backup.' },
];

const QUESTIONS = [
  { q: 'Who is Chronicles for?', a: 'Adults who want one place for the details of their days. You must be 18 or older to join.' },
  { q: 'What will I do as a beta tester?', a: 'Use Chronicles for real days during the beta testing period. Report what breaks or confuses you through the in-app bug form, and share what you’d want next.' },
  { q: 'What do beta testers get?', a: 'Free access during the beta, and a direct say in what gets built.' },
  { q: 'Is there a phone app?', a: 'Chronicles runs in your browser on phones and tablets, and you can add it to your home screen like an app. Native iPhone and Android apps are planned after the beta.' },
  { q: 'What will it cost?', a: `Chronicles will be a paid subscription priced to cover hosting and maintenance. ${BETA_DETAILS.priceTerms}` },
  { q: 'What happens if I lose my password?', a: 'When you sign up you receive a recovery key. If you forget your password, it’s the only way back into your account, so keep it somewhere safe. If you lose both your password and your recovery key, no one can open your data, including us. It’s encrypted with keys only you hold. What we can do is delete your account and everything in it once you confirm the request from your account’s email address, so you can start again.' },
  { q: 'Does it connect to my bank or health apps?', a: 'No. Health and finance tracking are entered by you, and nothing connects to a bank. Google Calendar sync is the one connection, and you choose whether to turn it on.' },
];

const Section = styled.section`
  padding: 72px 0 0;
  @media (max-width: 768px) { padding-top: 56px; }
`;

const H2 = styled.h2`
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1.15;
  color: var(--text-primary);
  @media (max-width: 768px) { font-size: 34px; }
`;

const Lede = styled.p`
  max-width: 560px;
  margin: 0 0 32px;
  font-size: 17px;
  color: var(--text-soft);
`;

/* The hero: a centred headline, one sign-up pill, then the slideshow wide
   across the teal band */
const Hero = styled.div`
  max-width: 920px;
  margin: 0 auto;
  padding: 72px 24px 56px;
  text-align: center;
  @media (max-width: 768px) { padding: 40px 32px 40px; }
`;

const H1 = styled.h1`
  margin: 0 0 24px;
  font-family: var(--font-display);
  font-size: 76px;
  font-weight: 200;
  line-height: 1.05;
  color: var(--text-primary);
  /* The second half in a pale accent, the page's one coloured phrase */
  em { font-style: normal; color: #acdcd9; }
  @media (max-width: 768px) { font-size: 46px; }
`;

const HeroText = styled.p`
  max-width: 640px;
  margin: 0 auto 36px;
  font-size: 19px;
  color: var(--text-soft);
  @media (max-width: 768px) { font-size: 17px; }
`;

const BigPill = styled(ActionPill)`
  && { min-height: 52px; padding: 12px 34px; font-size: 16px; }
`;

const Showcase = styled.div`
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 24px;
  @media (max-width: 768px) { padding: 0 32px; }
`;

/* How it works: open columns under a hairline each, no cards, on a full-width
   band with a faint teal tint */
/* The sign-up section: title and intro centred over the centred form */
const CenterTitle = styled(H2)`
  margin-bottom: 20px;
  font-size: 60px;
  font-weight: 300;
  text-align: center;
  @media (max-width: 768px) { font-size: 42px; }
`;

/* A small label over a section heading: spaced teal capitals */
const Eyebrow = styled.p`
  margin: 0 0 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-align: center;
  color: var(--color-accent-line);
`;

/* Same width as the form under it, so the text and the form share both edges */
const CenterLede = styled(Lede)`
  max-width: 680px;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
  text-wrap: balance;
`;

/* Your data at a glance: 52px at 300, with room under it */
const FeaturesTitle = styled(H2)`
  margin-bottom: 24px;
  font-size: 52px;
  font-weight: 300;
  @media (max-width: 768px) { font-size: 42px; margin-bottom: 16px; }
`;

/* A section heading in title case (every word capitalised), at 200 */
const LightTitle = styled(H2)`
  margin: 0;
  font-size: 60px;
  font-weight: 200;
  line-height: 1.1;
  text-transform: capitalize;
  @media (max-width: 768px) { font-size: 42px; }
`;

/* Only You Can Read It: the heading on the left, the intro beside it */
const PrivacyHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 56px;
  align-items: center;
  p { margin: 0; font-size: 19px; line-height: 1.6; }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 20px; p { font-size: 17px; } }
`;

/* Section headings set in capitals */
const CapsTitle = styled(H2)`
  font-weight: 300;
  text-transform: uppercase;
`;

/* The How it works heading: title case, a touch heavier, more room under it */
const HowTitle = styled(H2)`
  margin: 0 0 30px;
  font-size: 60px;
  font-weight: 300;
  text-align: center;
  text-transform: capitalize;
  color: var(--text-primary);
  @media (max-width: 768px) { font-size: 42px; }
`;

/* The How it works intro: centred, at most 860px wide */
const WideLede = styled(Lede)`
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
`;

/* Questions on the app's dark page colour, with the dark theme's text tones */
const DarkAppBand = styled(Section)`
  --text-primary: #f7f8fa;
  --text-secondary: #e6e9ee;
  --text-soft: #a5a8b0;
  --text-muted: #a5a8b0;
  --border-default: rgba(255, 255, 255, 0.22);
  --border-subtle: rgba(255, 255, 255, 0.12);
  --shadow-ring: 0 0 0 3px rgba(52, 165, 162, 0.5);
  color-scheme: dark;
  padding: 96px 0 104px;
  background: #1f2229;
  color: var(--text-secondary);
  @media (max-width: 768px) { padding: 64px 0 72px; }
`;

/* A full-width band on the light theme's page colour (How it works, the sign-up) */
const TintBand = styled(Section)`
  padding: 96px 0 104px;
  background: var(--bg-app);
  @media (max-width: 768px) { padding: 64px 0 72px; }
`;

/* How it works gets more room above and below than the other tinted band */
const HowBand = styled(TintBand)`
  && { padding: 136px 0 144px; }
  @media (max-width: 768px) { && { padding: 88px 0 96px; } }
`;

/* How it works as a timeline: a teal ring with a centre dot above each step,
   a hairline joining the rings, the title and text centred underneath */
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
  border: 2px solid var(--color-accent-line);
  border-radius: 50%;
  background: radial-gradient(circle, var(--color-accent-line) 0 5px, transparent 5.5px);
`;

/* Your data at a glance: a white band of staggered rows — the words on one
   side, a real screenshot of that view on the other, swapping sides each row */
const FeaturesBand = styled(Section)`
  padding: 136px 0 144px;
  background: #ffffff;
  @media (max-width: 768px) { padding: 88px 0 96px; }
`;

const FeatureRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 112px;
  margin-top: 112px;
  @media (max-width: 900px) { gap: 64px; margin-top: 64px; }
`;

const FeatureRow = styled.article`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 72px;
  align-items: center;
  &:nth-child(even) > :first-child { order: 2; }
  > div > h3 { margin: 0 0 14px; font-family: var(--font-display); font-size: 36px; font-weight: 300; line-height: 1.15; color: var(--text-primary); }
  > div > p { margin: 0; font-size: 17px; line-height: 1.7; color: var(--text-soft); }
  /* The "Optional…" note: plain muted italic text under the title, no pill */
  > div > small {
    display: block;
    margin: -4px 0 16px;
    font-size: 14px;
    font-weight: 500;
    font-style: italic;
    color: var(--text-muted);
  }
  @media (max-width: 900px) {
    &, &:nth-child(even) { grid-template-columns: minmax(0, 1fr); gap: 28px; }
    &:nth-child(even) > :first-child { order: 0; }
    > div > h3 { font-size: 30px; }
  }
`;

/* Only you can read it: the hero's teal gradient, open columns each under a
   faint hairline — a Material icon, the title, the text — no cards */
const Band = styled(DarkBand)`
  background: ${TEAL_GRADIENT};
  --text-secondary: rgba(255, 255, 255, 0.86);
  --text-muted: rgba(255, 255, 255, 0.66);
  margin-top: 0;
  padding: 120px 0 104px;
  @media (max-width: 768px) { padding: 72px 0 60px; }
  p { color: var(--text-secondary); }
`;

/* Six items, left-aligned, each under a faint teal hairline — a pale teal
   icon, the title, the text */
const PrivacyGrid = styled.ul`
  list-style: none;
  margin: 88px 0 64px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 56px 64px;
  li { padding-top: 40px; border-top: 1px solid rgba(124, 196, 194, 0.32); }
  li > span { display: block; margin-bottom: 22px; color: #8fd1cd; }
  h3 { margin: 0 0 10px; font-family: var(--font-display); font-size: 24px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0; font-size: 16px; line-height: 1.7; }
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 44px 40px; }
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); gap: 36px; margin: 48px 0 48px; li { padding-top: 28px; } }
`;

const FinePrint = styled.p`
  max-width: 480px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  && { color: var(--text-muted); }
`;

/* The questions: no panel, hairlines between them and a firmer rule on top */
/* Questions: the title on the left, the list beside it on the right */
const FaqLayout = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 56px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 24px; }
`;

const Faq = styled.div`
  border-top: 1px solid var(--border-default);
  details { border-bottom: 1px solid var(--border-subtle); }
  summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 0;
    list-style: none;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 300;
    color: var(--text-primary);
    &::-webkit-details-marker { display: none; }
    /* The app's chevron (CollapsibleCard), on the right */
    &::after {
      content: '';
      flex: none;
      margin-left: auto;
      width: 8px;
      height: 8px;
      border-right: 1.5px solid var(--text-muted);
      border-bottom: 1.5px solid var(--text-muted);
      transform: translateY(-3px) rotate(45deg);
      transition: transform 0.15s ease;
    }
    &:focus-visible { outline: none; box-shadow: var(--shadow-ring); }
  }
  details[open] summary::after { transform: translateY(2px) rotate(-135deg); }
  p { margin: 0 0 20px; max-width: 640px; font-size: 15px; }
`;

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
    document.title = 'Chronicles — a journal for people too busy to journal';
    return () => { document.title = 'Chronicles'; };
  }, []);

  if (isInstalledApp()) return <Navigate to="/dashboard" replace />;

  return (
    <LandingTemplate
      signedIn={isAuthenticated}
      hero={(
        <section aria-labelledby="hero-title">
          <Hero>
            <H1 id="hero-title">A journal for people <em>too busy to journal.</em></H1>
            <HeroText>
              Pick a topic and write one line. Chronicles sorts it into your health, planning, calendar, kitchen and money,
              and every entry is encrypted on your device before it leaves the browser.
            </HeroText>
            <BigPill as="a" href="#beta">Sign Up for Beta</BigPill>
          </Hero>
          <Showcase>
            <ScreenSlideshow />
          </Showcase>
        </section>
      )}
    >
      <div ref={revealRef}>
      <HowBand id="how" aria-labelledby="how-title">
        <Container>
          <div data-reveal>
          <HowTitle id="how-title">How it works</HowTitle>
          <WideLede>
            Chronicles is inspired by bullet journaling, without the notebook. Every entry carries a topic, whether
            it’s a task, a meal or an event, and the views do the sorting for you. All it takes is one line a day.
          </WideLede>
          </div>
          <Steps>
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal style={delay(i)}>
                <Marker aria-hidden />
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </Steps>
        </Container>
      </HowBand>

      <FeaturesBand id="features" aria-labelledby="features-title">
        <Container>
          <FeaturesTitle id="features-title">Your data at a glance</FeaturesTitle>
          <Lede>
            You enter your data in one place and custom views help sort and structure it to make it more meaningful for
            tracking, planning, and organizing. All your data becomes available by topic at a glance.
          </Lede>
          <FeatureRows>
            {FEATURES.map(({ name, tag, body, shot, alt }) => (
              <FeatureRow key={name}>
                <div data-reveal>
                  <h3>{name}</h3>
                  {tag && <small>{tag}</small>}
                  <p>{body}</p>
                </div>
                <div data-reveal style={delay(1.2)}><FeatureShot shot={shot} alt={alt} /></div>
              </FeatureRow>
            ))}
          </FeatureRows>
        </Container>
      </FeaturesBand>

      <Band id="privacy" aria-labelledby="privacy-title">
        <Container>
          <PrivacyHead data-reveal>
            <LightTitle id="privacy-title">Only you can<br />read it</LightTitle>
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
      </Band>

      <TintBand id="beta" aria-labelledby="beta-title">
        <Container>
          <div data-reveal>
          <Eyebrow>Private beta</Eyebrow>
          <CenterTitle id="beta-title">Sign up to try</CenterTitle>
          <CenterLede>Chronicles is in active design and development. Beta seats are limited so we can give every tester’s feedback the attention it needs.</CenterLede>
          </div>
          <div data-reveal style={delay(1.5)}><BetaSignup /></div>
        </Container>
      </TintBand>

      <DarkAppBand aria-labelledby="faq-title">
        <FaqLayout>
          <CapsTitle id="faq-title" data-reveal>Questions</CapsTitle>
          <Faq>
            {QUESTIONS.map(({ q, a }, i) => (
              <details key={q} data-reveal style={delay(i * 0.6)}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </Faq>
        </FaqLayout>
      </DarkAppBand>
      </div>
    </LandingTemplate>
  );
}
