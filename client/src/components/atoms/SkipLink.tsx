import styled from 'styled-components';

/* "Skip to content": the first thing a keyboard user reaches on a page, hidden
   until it has focus, then shown in the top-left corner. Jumps to the page's
   main area (id "main-content"). Props only. */

const Link = styled.a`
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  z-index: 9999;
  padding: 8px 16px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  text-decoration: none;
  border: 2px solid var(--focus-ring, #80868f);
  border-radius: 6px;
  &:focus {
    position: fixed;
    left: 8px;
    top: calc(8px + env(safe-area-inset-top, 0px));
    width: auto;
    height: auto;
  }
`;

export function SkipLink({ target = 'main-content' }: { target?: string }) {
  return <Link href={`#${target}`}>Skip to content</Link>;
}
