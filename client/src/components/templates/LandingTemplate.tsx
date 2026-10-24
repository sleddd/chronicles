import { useEffect, useRef, type ReactNode } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { BrandMark } from '../atoms/BrandMark.js';
import { PillButton } from '../atoms/PillButton.js';
import { BETA_DETAILS } from '@shared/legal/index.js';

/* The public landing page at `/` (layout only), in the app's own type, colours
   and controls: thin Work Sans headings, Open Sans text, round accent pills.
   Always the app's light theme, whatever theme the visitor last used: the DS
   tokens are pinned to their light values (default Teal accent) on the page
   root. The header and hero sit on a full-width teal gradient (`HeroBand`,
   white text and pills),
   and the privacy band re-pins them dark (`DarkBand`). */

const LIGHT = `
  --bg-app: #f4f5f7;
  --bg-panel: #fbfbfc;
  --bg-surface: #fbfbfc;
  --bg-sunken: #dcdfe4;
  --bg-band: #dcdfe4;
  --bg-hover: #eef0f3;
  --bg-active: #d3d7dd;
  --bg-control: #fefefe;
  --text-primary: #1f2128;
  --text-secondary: #1f2128;
  --text-soft: #4a505b;
  --text-muted: #575d68;
  --text-disabled: #6b7079;
  --border-subtle: #d3d7dd;
  --border-default: #bfc4cc;
  --border-card: #cdd1d8;
  --border-field: #cdd1d8;
  --border-pill: #80868f;
  --control-border: #80868f;
  --color-danger: #d8483f;
  --color-accent: #34a5a2;
  --color-accent-line: #23706e;
  --color-accent-soft: #23706e;
  --color-accent-hover: #2c8c8a;
  --color-accent-subtle: rgba(52, 165, 162, 0.10);
  --on-accent: #ffffff;
  --shadow-ring: 0 0 0 3px rgba(52, 165, 162, 0.35);
  --logo-top: rgb(23, 74, 73);
  --logo-mid: rgb(34, 107, 105);
  --logo-low: rgb(44, 140, 138);
  --logo-end: #34a5a2;
  color-scheme: light;
`;

/** The page's teal gradient: deep teal on the left easing to the accent on the
    right, with a soft light at the top right. The hero and the privacy band. */
export const TEAL_GRADIENT = `
  radial-gradient(circle at 88% 0%, rgba(255, 255, 255, 0.14), transparent 45%),
  linear-gradient(135deg, #123c3b 0%, #1b5a58 38%, #23706e 62%, #2f9895 100%)
`;

/* The full-width teal gradient behind the header and hero: deep teal where the
   text sits (white text stays ≥ 4.5:1) easing to the accent on the right, with
   a soft light at the top right. Text, links, the logo and pills turn white. */
const HeroBand = styled.div`
  --text-primary: #ffffff;
  --text-secondary: #ffffff;
  --text-soft: rgba(255, 255, 255, 0.9);
  --text-muted: rgba(255, 255, 255, 0.8);
  --shadow-ring: 0 0 0 3px rgba(255, 255, 255, 0.55);
  --logo-top: #ffffff;
  --logo-mid: #e3f3f2;
  --logo-low: #c9e9e7;
  --logo-end: #acdcd9;
  color-scheme: dark;
  padding-bottom: 88px;
  background: ${TEAL_GRADIENT};
  color: var(--text-secondary);
  @media (max-width: 768px) { padding-bottom: 56px; }

  /* Pills on teal: the primary turns white with teal text, the neutral one a white outline */
  --pill-primary-bg: #ffffff;
  --pill-primary-fg: #174a49;
  --pill-primary-hover: #e3f3f2;
  --pill-neutral-bg: transparent;
  --pill-neutral-border: rgba(255, 255, 255, 0.75);
  --pill-neutral-fg: #ffffff;
  --pill-neutral-hover: rgba(255, 255, 255, 0.12);
`;

export const DarkBand = styled.section`
  --bg-band-dark: #1f2229;
  --bg-panel: #24262d;
  --text-primary: #f7f8fa;
  --text-secondary: #e6e9ee;
  --text-soft: #a5a8b0;
  --text-muted: #a5a8b0;
  color-scheme: dark;
  background: var(--bg-band-dark);
  color: var(--text-secondary);
`;

const Page = styled.div`
  ${LIGHT}
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.55;

  section[id], [id='apply'] { scroll-margin-top: 24px; }

  /* Scroll reveal (useScrollReveal sets data-shown): fade up into place, after
     --reveal-delay for staggered rows. Off for reduced motion. */
  [data-reveal] {
    opacity: 0;
    transform: translateY(32px);
    transition:
      opacity 0.8s ease var(--reveal-delay, 0s),
      transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) var(--reveal-delay, 0s);
  }
  [data-reveal][data-shown] { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) {
    [data-reveal] { opacity: 1; transform: none; transition: none; }
  }
`;

/** One centred column, used by the header, each section and the footer */
export const Container = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px;
  @media (max-width: 768px) { padding: 0 32px; }
`;

/** The app's round pill button, always in its light-theme form (sentence
    case): `primary` is the filled accent pill (like Save entry), otherwise the
    neutral outlined pill. Works as a link with `as="a"`. */
export const ActionPill = styled(PillButton)<{ $primary?: boolean }>`
  && {
    gap: 0;
    min-height: 40px;
    padding: 8px 22px;
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
    text-decoration: none;
  }
  /* Colours come from --pill-* when a band sets them (the teal hero) */
  ${({ $primary }) => $primary ? `
    && { background: var(--pill-primary-bg, var(--color-accent-line)); border-color: var(--pill-primary-bg, var(--color-accent-line)); color: var(--pill-primary-fg, #fff); }
    &&:hover:not(:disabled) { background: var(--pill-primary-hover, var(--color-accent-hover)); border-color: var(--pill-primary-hover, var(--color-accent-hover)); }
  ` : `
    && { background: var(--pill-neutral-bg, var(--bg-control)); border-color: var(--pill-neutral-border, var(--border-pill)); color: var(--pill-neutral-fg, var(--text-secondary)); }
    &&:hover:not(:disabled) { background: var(--pill-neutral-hover, var(--bg-hover)); }
  `}
`;

const Header = styled.header`
  padding: 24px 0;
`;

const HeaderRow = styled(Container)`
  display: flex;
  align-items: center;
  gap: 32px;
`;

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
  text-decoration: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  @media (max-width: 480px) { font-size: 15px; letter-spacing: 0.12em; gap: 8px; }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 28px;
  a:not([data-button]) {
    white-space: nowrap;
    color: var(--text-soft);
    text-decoration: none;
    font-size: 15px;
    font-weight: 500;
    &:hover { color: var(--text-primary); }
  }
  @media (max-width: 900px) {
    gap: 16px;
    [data-section-link] { display: none; }
  }
`;

/** Sign up in the header: the white outlined pill, a step smaller than the hero's */
const HeaderPill = styled(ActionPill)`
  && { min-height: 36px; padding: 6px 18px; white-space: nowrap; }
`;

/* The app's dark page colour, like the Questions band above it, a hairline between */
const Footer = styled.footer`
  --text-primary: #f7f8fa;
  --text-soft: #a5a8b0;
  --color-accent-line: #7cc4c2;
  --logo-top: rgb(174, 219, 218);
  --logo-mid: #34a5a2;
  --logo-low: #34a5a2;
  --logo-end: rgb(44, 140, 138);
  margin-top: 0;
  padding: 32px 0;
  background: #1f2229;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 14px;
`;

const FooterRow = styled(Container)`
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  color: var(--text-soft);
  span { display: inline-flex; align-items: center; gap: 10px; margin-right: auto; }
  nav { display: flex; gap: 24px; }
  a { color: var(--text-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--color-accent-line); } }
  /* Phones: the copyright line and the links stacked and centred */
  @media (max-width: 768px) {
    flex-direction: column;
    justify-content: center;
    gap: 16px;
    text-align: center;
    span { margin-right: 0; justify-content: center; }
    nav { justify-content: center; flex-wrap: wrap; }
  }
`;

interface LandingTemplateProps {
  /** Signed in: the header offers Open Chronicles instead of Sign in */
  signedIn: boolean;
  /** The first section, shown with the header on the teal gradient */
  hero: ReactNode;
  children: ReactNode;
}

export function LandingTemplate({ signedIn, hero, children }: LandingTemplateProps) {
  const year = new Date().getFullYear();
  // Smooth scrolling (Lenis) on #root, the app's scroller — loaded only here,
  // and not for visitors who prefer less motion. It also glides the section
  // links (#how, #beta…). Gone again when the page unmounts.
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.getElementById('root');
    const content = pageRef.current;
    if (!root || !content || typeof ResizeObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let lenis: { destroy: () => void } | null = null;
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ wrapper: root, content, autoRaf: true, anchors: true, lerp: 0.1 });
    }).catch(() => { /* native scrolling still works */ });
    return () => { cancelled = true; lenis?.destroy(); };
  }, []);
  return (
    <Page ref={pageRef}>
      <HeroBand>
      <Header>
        <HeaderRow>
          <Brand to="/"><BrandMark size={28} gradientId="logo-landing" /> Chronicles</Brand>
          <Nav aria-label="Main">
            <a href="#how" data-section-link>How it works</a>
            <a href="#features" data-section-link>Features</a>
            <a href="#privacy" data-section-link>Privacy</a>
            {signedIn ? <Link to="/dashboard">Open Chronicles</Link> : <Link to="/login">Sign in</Link>}
            {!signedIn && <HeaderPill as="a" href="#beta" data-button>Sign up</HeaderPill>}
          </Nav>
        </HeaderRow>
      </Header>
      {hero}
      </HeroBand>
      <main>{children}</main>
      <Footer>
        <FooterRow>
          <span><BrandMark size={22} gradientId="logo-landing-foot" /> © 2025–{year} {BETA_DETAILS.copyrightHolder}</span>
          <nav aria-label="Legal">
            <Link to="/health-privacy">Privacy policy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/report-a-bug">Report a bug</Link>
            <a href={BETA_DETAILS.githubUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
        </FooterRow>
      </Footer>
    </Page>
  );
}
