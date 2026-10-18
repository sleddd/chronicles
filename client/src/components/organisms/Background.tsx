import styled from 'styled-components';

/** Fixed canvas layer behind the app, so transparent pages show the page colour. */
const BackgroundWrapper = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  background-color: var(--paper, ${({ theme }) => theme.colors.background});
`;

export function Background() {
  return <BackgroundWrapper />;
}
