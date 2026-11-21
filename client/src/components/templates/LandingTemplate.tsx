import { useEffect, useRef, useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { Link } from 'react-router-dom';
import { PillButton } from '../atoms/PillButton.js';
import { BOOK_5 } from '../atoms/BrandMark.js';
import { BETA_DETAILS } from '@shared/legal/index.js';
import { LIGHT_TOKENS } from '../../styles/lightTokens.js';

/* The public landing page at `/` (layout only), in the app's own type, colours
   and controls: thin Work Sans headings, Open Sans text, round pills.
   Always the app's light theme, whatever theme the visitor last used: the DS
   tokens are pinned to their light values (default Teal accent) on the page
   root. The header and hero sit on a photo (`HeroBand`: Philipp Torres's
   mountains, `HERO_PHOTO_TORRES`, under a dark shade) with white text and pills,
   fading into the page colour at its foot. Dark bands (the privacy band) re-pin
   dark text tones (`DarkBand`). */

/** The light theme's tokens, pinned on a page root (the public pages read them from styles/lightTokens) */
export { LIGHT_TOKENS };

/** The page's ink (the slide dots and arrows, the example's area names, the
    feature pills' hover): the app's teal, deepened for text on white */
export const TEAL_INK = '#23706e';
export const PAGE_INK = TEAL_INK;

/** The hero's photo, and the privacy band's: Philipp Torres's LNYdZutqsi0 (served from public/wallpapers) */
export const HERO_PHOTO_TORRES = '/wallpapers/philipp-torres-LNYdZutqsi0.jpg';

/* The header's height: it sits over the top of the hero's photo, so the hero pads by it */
const HEADER_HEIGHT = '90px';

/* White text on the photo: the header and the hero */
const onPhotoTokens = css`
  --text-primary: #ffffff;
  --text-secondary: #ffffff;
  --text-soft: rgba(255, 255, 255, 0.92);
  --text-muted: rgba(255, 255, 255, 0.82);
  --shadow-ring: 0 0 0 3px rgba(255, 255, 255, 0.55);
`;

/* The hero on the photo, shaded so the white text reads, fading into the page
   colour at its foot so the screenshot lands on the light page. It starts at
   the very top, under the header, which lies over it */
const HeroBand = styled.div`
  ${onPhotoTokens}
  position: relative;
  isolation: isolate;
  /* Above the next band, so the screenshot's shadow fades out over it instead of
     stopping at a hard edge */
  z-index: 1;
  padding-top: ${HEADER_HEIGHT};
  background:
    linear-gradient(180deg, transparent 78%, var(--bg-app) 98%),
    /* The shade over the photo, light enough to let it show */
    linear-gradient(rgba(10, 12, 17, 0.48), rgba(10, 12, 17, 0.48)),
    #141a2e url(${HERO_PHOTO_TORRES}) center 30% / cover no-repeat;
  color: var(--text-secondary);
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

/* "Skip to content": hidden until reached with Tab, then a pill at the top left */
const SkipLink = styled.a`
  position: absolute;
  left: 16px;
  top: 12px;
  z-index: 100;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--bg-panel);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  transform: translateY(-200%);
  &:focus, &:focus-visible { transform: none; outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/* Where the skip link lands: the start of the page's content (the hero), just past the header */
const Main = styled.main`
  &:focus { outline: none; }
`;

const Page = styled.div`
  ${LIGHT_TOKENS}
  position: relative;
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
  /* Colours come from --pill-* when a band sets them */
  ${({ $primary }) => $primary ? `
    && { background: var(--pill-primary-bg, var(--color-accent-line)); border-color: var(--pill-primary-border, var(--pill-primary-bg, var(--color-accent-line))); color: var(--pill-primary-fg, #fff); }
    &&:hover:not(:disabled) { background: var(--pill-primary-hover, var(--color-accent-hover)); border-color: var(--pill-primary-border, var(--pill-primary-hover, var(--color-accent-hover))); }
  ` : `
    && { background: var(--pill-neutral-bg, var(--bg-control)); border-color: var(--pill-neutral-border, var(--border-pill)); color: var(--pill-neutral-fg, var(--text-secondary)); }
    &&:hover:not(:disabled) { background: var(--pill-neutral-hover, var(--bg-hover)); }
  `}
`;

/* Over the top of the hero's photo, in white */
const Header = styled.header`
  ${onPhotoTokens}
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  /* 24px above and below its tallest control (the 42px pill or menu button) = HEADER_HEIGHT */
  padding: 24px 0;
`;

/* The header lines up with the hero's screenshot frame */
const HeaderRow = styled(Container)`
  && { max-width: 1048px; }
  position: relative;
  display: flex;
  align-items: center;
  gap: 32px;
  @media (max-width: 480px) { gap: 12px; }
`;

/* The logo: the book mark in a pale teal gradient (pale at the top to the accent at the
   foot; pale taupe for a while, the dusk colours before that) beside "Chronicles"
   in thin Work Sans — no tile; the tile is the app icon, for the home screen only */
function DuskMark({ id }: { id: string }) {
  return (
    <svg viewBox="0 -960 960 960" aria-hidden="true">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="480" y1="-928" x2="480" y2="-80">
          {/* Pale teal (pale taupe #efe8e1 → #d2c4b7 → #a89482 for a while) */}
          <stop offset="0" stopColor="#e1f3f2" />
          <stop offset="0.5" stopColor="#a6dedb" />
          <stop offset="1" stopColor="#5cb6b2" />
        </linearGradient>
      </defs>
      <path d={BOOK_5} fill={`url(#${id})`} />
    </svg>
  );
}

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-right: auto;
  text-decoration: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 300;
  letter-spacing: 0.01em;
  svg { display: block; width: 30px; height: 30px; flex-shrink: 0; }
  @media (max-width: 480px) { font-size: 22px; gap: 10px; svg { width: 26px; height: 26px; } }
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
  /* Tablets and phones: the menu button holds the section links and Sign in / Open Chronicles */
  @media (max-width: 1000px) {
    gap: 16px;
    [data-section-link], [data-sign-in] { display: none; }
  }
  @media (max-width: 480px) { gap: 10px; a:not([data-button]) { font-size: 14px; } }
`;

/* Phones and tablets (≤1000px): a round menu button — three lines, a × while
   open — drawn in CSS (the bundled icon font has no menu glyph) */
const MenuBtn = styled.button`
  display: none;
  position: relative;
  flex: none;
  width: 42px;
  height: 42px;
  padding: 0;
  /* A plain hamburger: just the three lines, no circle or fill */
  border: none;
  border-radius: 6px;
  background: none;
  color: #fff;
  cursor: pointer;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
  &:hover { opacity: 0.8; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  span {
    position: absolute;
    left: 12px;
    right: 12px;
    height: 1.5px;
    border-radius: 1px;
    background: currentColor;
    transition: transform 160ms ease, opacity 160ms ease, top 160ms ease;
  }
  span:nth-child(1) { top: 14px; }
  span:nth-child(2) { top: 20px; }
  span:nth-child(3) { top: 26px; }
  &[aria-expanded='true'] span:nth-child(1) { top: 20px; transform: rotate(45deg); }
  &[aria-expanded='true'] span:nth-child(2) { opacity: 0; }
  &[aria-expanded='true'] span:nth-child(3) { top: 20px; transform: rotate(-45deg); }
  @media (prefers-reduced-motion: reduce) { span { transition: none; } }
  @media (max-width: 1000px) { display: inline-block; }
  @media (max-width: 480px) { width: 38px; height: 38px; span { left: 11px; right: 11px; } span:nth-child(1) { top: 12px; } span:nth-child(2), &[aria-expanded='true'] span:nth-child(1), &[aria-expanded='true'] span:nth-child(3) { top: 18px; } span:nth-child(3) { top: 24px; } }
`;

/* The menu it opens: a dark glass card under the header, a row per link */
const MenuPanel = styled.nav`
  position: absolute;
  top: calc(100% + 12px);
  right: 24px;
  left: 24px;
  z-index: 50;
  display: grid;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  background: #47525f;
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  a {
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 0 16px;
    border-radius: 10px;
    color: #fff;
    font-size: 16px;
    font-weight: 500;
    text-decoration: none;
    &:hover { background: rgba(255, 255, 255, 0.1); }
    &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  }
  @media (min-width: 1001px) { display: none; }
  @media (max-width: 480px) { right: 16px; left: 16px; }
`;

/** Sign in / Open Chronicles in the header: a white-outlined pill, no fill */
const HeaderPill = styled(ActionPill)`
  && { min-height: 42px; padding: 8px 20px; white-space: nowrap; font-weight: 600; background: transparent; border-color: rgba(255, 255, 255, 0.7); color: #fff; }
  &&:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
  @media (max-width: 480px) { && { min-height: 38px; padding: 6px 14px; font-size: 14px; } }
`;

/* One row on the darkest band: the name and a line on the left, the promise on the right,
   then a quiet row of the legal pages and the copyright */
const Footer = styled.footer`
  padding: 44px 0 36px;
  background: #161922;
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
`;

const FooterRow = styled(Container)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px 32px;
  flex-wrap: wrap;
`;

const FooterLinks = styled(Container)`
  margin-top: 22px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  a { color: rgba(255, 255, 255, 0.62); text-decoration: none; &:hover { color: #fff; } }
`;

interface LandingTemplateProps {
  /** Signed in: the header offers Open Chronicles instead of Sign in */
  signedIn: boolean;
  /** The first section, shown on the photo under the header */
  hero: ReactNode;
  children: ReactNode;
}

export function LandingTemplate({ signedIn, hero, children }: LandingTemplateProps) {
  const year = new Date().getFullYear();
  // Phones / tablets: the menu button's panel; a link, a click outside or Escape closes it
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !menuBtnRef.current?.contains(t)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
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
      <SkipLink
        href="#main-content"
        onClick={e => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </SkipLink>
      <Header>
        <HeaderRow>
          <Brand to="/"><DuskMark id="landing-mark-head" /> Chronicles</Brand>
          <Nav aria-label="Main">
            <a href="#how" data-section-link>How it works</a>
            <a href="#features" data-section-link>Features</a>
            <a href="#privacy" data-section-link>Privacy</a>
            <a href="#faq" data-section-link>FAQ</a>
            {/* One outlined pill: Sign in, or Open Chronicles once signed in (in the menu on phones and tablets) */}
            <HeaderPill as={Link} to={signedIn ? '/dashboard' : '/login'} data-button data-sign-in>
              {signedIn ? 'Open Chronicles' : 'Sign in'}
            </HeaderPill>
            <MenuBtn ref={menuBtnRef} type="button" aria-expanded={menuOpen} aria-controls="landing-menu"
              aria-label={menuOpen ? 'Close the menu' : 'Open the menu'} onClick={() => setMenuOpen(o => !o)}>
              <span /><span /><span />
            </MenuBtn>
          </Nav>
          {menuOpen && (
            <MenuPanel id="landing-menu" ref={menuRef} aria-label="Menu" onClick={e => { if ((e.target as HTMLElement).closest('a')) setMenuOpen(false); }}>
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#privacy">Privacy</a>
              <a href="#faq">FAQ</a>
              {signedIn ? <Link to="/dashboard">Open Chronicles</Link> : <Link to="/login">Sign in</Link>}
            </MenuPanel>
          )}
        </HeaderRow>
      </Header>
      <Main id="main-content" tabIndex={-1}>
        <HeroBand>{hero}</HeroBand>
        {children}
      </Main>
      <Footer>
        <FooterRow>
          <span>Chronicles · An encrypted life dashboard, journal and day planner</span>
          <span>No analytics. No tracking. No ads.</span>
        </FooterRow>
        <FooterLinks as="nav" aria-label="Legal and help">
          <Link to="/health-privacy">Privacy policy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/license">License</Link>
          <Link to="/report-a-bug">Feedback/Report a Bug</Link>
          <span>© {year} {BETA_DETAILS.copyrightHolder}</span>
        </FooterLinks>
      </Footer>
    </Page>
  );
}
