import styled from 'styled-components';

/* A row of small squares, one per day (or week) — Reports' "Symptoms at a
   glance" and a habit's days. The caller gives each square its colour.
   Props only. */

export const SquareRow = styled.span`
  display: flex;
  gap: 2px;
`;

export const Square = styled.i<{ $c: string }>`
  flex: 1;
  height: 18px;
  border-radius: 2px;
  background: ${({ $c }) => $c};
`;

/* A key for the squares: "■ Done  ■ Missed" */
export const SquareLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  span { display: inline-flex; align-items: center; gap: 6px; }
`;

export const SquareSwatch = styled.i<{ $c: string }>`
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: ${({ $c }) => $c};
`;

export function DaySquares({ colors, label }: { colors: string[]; label: string }) {
  return (
    <SquareRow role="img" aria-label={label}>
      {colors.map((c, i) => <Square key={i} $c={c} />)}
    </SquareRow>
  );
}
