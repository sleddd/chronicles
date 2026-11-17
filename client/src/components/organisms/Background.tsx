import styled from 'styled-components';
import { litSheet, litSheetLight } from '../../styles/darkBackdrop.js';

/** Fixed canvas layer behind the app, so transparent pages show the page colour. */
const BackgroundWrapper = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  background-color: var(--paper, ${({ theme }) => theme.colors.background});
  /* Dark: the lit, grained sheet instead of a flat page colour */
  html[data-theme='dark'] & {
    ${litSheet}
  }
  html[data-theme='light'] & {
    ${litSheetLight}
  }
`;

export function Background() {
  return <BackgroundWrapper />;
}
