import styled from 'styled-components';

/**
 * Google Material Symbols (outlined) icon. The glyph is the element's text
 * content (a ligature name). Requires the Material Symbols Outlined font
 * (bundled — src/styles/fonts.css). Color follows `currentColor`.
 */
export const MaterialIcon = styled.span<{ $size?: number }>`
  font-family: 'Material Symbols Outlined';
  /* Matches the wght below: Safari (iPad / iOS) draws the variable font at the
     CSS weight, so the two must agree (a thinner override sets both too) */
  font-weight: 300;
  font-style: normal;
  font-size: ${({ $size }) => $size ?? 20}px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  display: inline-block;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
`;
