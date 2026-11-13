import { useEffect, useRef, type ReactNode } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { PillButton } from '../atoms/PillButton.js';
import { BETA_DETAILS } from '@shared/legal/index.js';
import { LIGHT_TOKENS } from '../../styles/lightTokens.js';

/* The public landing page at `/` (layout only), in the app's own type, colours
   and controls: thin Work Sans headings, Open Sans text, round accent pills.
   Always the app's light theme, whatever theme the visitor last used: the DS
   tokens are pinned to their light values (default Teal accent) on the page
   root. The header and hero sit on a night-sky photo (`HeroBand`: Benjamin
   Voros's Milky Way over mountains, one of the app's wallpapers) with white
   text and pills, fading into the page colour at its foot. The privacy band
   uses the night-sky gradient (`SKY_GRADIENT`, colours taken from the hero photo) and dark bands re-pin dark text
   tones (`DarkBand`). */

/** The light theme's tokens, pinned on a page root — the landing page and the public shelf use them */
export { LIGHT_TOKENS };

/** The page's teal gradient: deep teal on the left easing to the accent on the
    right, with a soft light at the top right. The hero and the privacy band. */
/** The night sky's indigo (from the hero photo), for the form button and the page's icons */
export const SKY_INK = '#3b4580';
export const SKY_INK_HOVER = '#2c3566';

export const SKY_GRADIENT = `
  radial-gradient(circle at 88% 0%, rgba(255, 255, 255, 0.12), transparent 45%),
  linear-gradient(135deg, #0d2249 0%, #183e6e 36%, #3b4580 66%, #64598f 100%)
`;

/** The hero's photo (served from public/wallpapers, like the app's backgrounds) */
export const HERO_PHOTO = '/wallpapers/benjamin-voros-phIFdC6lA4E.jpg';

/* The night sky behind the header and hero: a shade at the top so the white
   text reads, the photo, and a long fade into the page colour at the foot so
   the screenshot frame lands on the light page. Text, links and pills turn white. */
const HeroBand = styled.div`
  --text-primary: #ffffff;
  --text-secondary: #ffffff;
  --text-soft: rgba(255, 255, 255, 0.92);
  --text-muted: rgba(255, 255, 255, 0.82);
  --shadow-ring: 0 0 0 3px rgba(255, 255, 255, 0.55);
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(180deg, transparent 78%, var(--bg-app) 98%),
    linear-gradient(rgba(10, 12, 17, 0.5), rgba(10, 12, 17, 0.5)),
    #141a2e url(${HERO_PHOTO}) center 28% / cover no-repeat;
  color: var(--text-secondary);

  /* Pills on the photo: the primary turns white with deep teal text, the neutral one a white glass outline */
  --pill-primary-bg: #ffffff;
  --pill-primary-fg: #174a49;
  --pill-primary-hover: #e3f3f2;
  --pill-neutral-bg: rgba(255, 255, 255, 0.14);
  --pill-neutral-border: rgba(255, 255, 255, 0.7);
  --pill-neutral-fg: #ffffff;
  --pill-neutral-hover: rgba(255, 255, 255, 0.24);
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
  ${LIGHT_TOKENS}
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
  max-width: 1184px;
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
  @media (max-width: 480px) { gap: 12px; }
`;

/* The app icon (the rounded teal tile) beside the name in Work Sans */
const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-right: auto;
  text-decoration: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: 0.01em;
  img { display: block; width: 36px; height: 36px; border-radius: 9px; }
  @media (max-width: 480px) { font-size: 19px; gap: 10px; img { width: 32px; height: 32px; } }
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
  @media (max-width: 1000px) {
    gap: 16px;
    [data-section-link] { display: none; }
  }
  @media (max-width: 480px) { gap: 12px; a:not([data-button]) { font-size: 14px; } }
`;

/** Join the beta in the header: the white pill, a step smaller than the hero's */
const HeaderPill = styled(ActionPill)`
  && { min-height: 42px; padding: 8px 20px; white-space: nowrap; }
  @media (max-width: 480px) { && { min-height: 38px; padding: 6px 14px; font-size: 14px; } }
`;

/* A step darker than the Questions band above it, a hairline between: the
   brand and a line about it, Product / Trust / Help columns, then the
   copyright under a rule */
const Footer = styled.footer`
  --text-primary: #f7f8fa;
  --text-soft: #b4b7be;
  padding: 72px 0 36px;
  background: #1a1c21;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-soft);
  font-size: 14px;
  @media (max-width: 768px) { padding: 56px 0 32px; }
`;

const FooterTop = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr));
  gap: 40px;
  > div:first-child p { max-width: 360px; margin: 22px 0 0; line-height: 1.65; }
  h2 {
    margin: 10px 0 18px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-primary);
  }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  a { color: var(--text-soft); text-decoration: none; &:hover { color: var(--text-primary); } }
  @media (max-width: 900px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    > div:first-child { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const FooterBrand = styled(Brand)`
  font-size: 21px;
  && { color: var(--text-soft); }
`;

/* The copyright and the promise, under a rule the column's width */
const FooterBottom = styled(Container)`
  margin-top: 56px;
  > div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding-top: 28px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
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
          <Brand to="/"><img src="/chronicles-logo-sky.svg" alt="" /> Chronicles</Brand>
          <Nav aria-label="Main">
            <a href="#how" data-section-link>How it works</a>
            <a href="#features" data-section-link>Features</a>
            <a href="#privacy" data-section-link>Privacy</a>
            <a href="#faq" data-section-link>FAQ</a>
            {signedIn ? <Link to="/dashboard">Open Chronicles</Link> : <Link to="/login">Sign in</Link>}
            {!signedIn && <HeaderPill as="a" href="#beta" $primary data-button>Join the beta</HeaderPill>}
          </Nav>
        </HeaderRow>
      </Header>
      {hero}
      </HeroBand>
      <main>{children}</main>
      <Footer>
        <FooterTop>
          <div>
            <FooterBrand to="/"><img src="/chronicles-logo-sky.svg" alt="" /> Chronicles</FooterBrand>
            <p>A zero-knowledge encrypted life dashboard, journal and digital day planner.</p>
          </div>
          <nav aria-labelledby="foot-product">
            <h2 id="foot-product">Product</h2>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#beta">Join the beta</a></li>
            </ul>
          </nav>
          <nav aria-labelledby="foot-trust">
            <h2 id="foot-trust">Trust</h2>
            <ul>
              <li><a href="#privacy">Privacy and encryption</a></li>
              <li><Link to="/health-privacy">Privacy policy</Link></li>
              <li><Link to="/terms">Terms</Link></li>
              <li><a href={`${BETA_DETAILS.githubUrl}/blob/rebuild/LICENSE`} target="_blank" rel="noopener noreferrer">License</a></li>
            </ul>
          </nav>
          <nav aria-labelledby="foot-help">
            <h2 id="foot-help">Help</h2>
            <ul>
              <li><a href="#faq">FAQ</a></li>
              <li><Link to="/report-a-bug">Report a bug</Link></li>
              <li>{signedIn ? <Link to="/dashboard">Open Chronicles</Link> : <Link to="/login">Sign in</Link>}</li>
            </ul>
          </nav>
        </FooterTop>
        <FooterBottom>
          <div>
            <span>© {year} {BETA_DETAILS.copyrightHolder}</span>
            <span>No analytics. No tracking. No ads.</span>
          </div>
        </FooterBottom>
      </Footer>
    </Page>
  );
}
