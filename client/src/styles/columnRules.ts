/* Spreadsheet column borders for grid-based table rows (finance tables, entry
   lists). A hairline runs the full row height between columns, so the vertical
   padding moves from the row into the cells and the grid gap becomes cell padding.
   Cells stretch and sit at the top, like a spreadsheet.

   Padding uses :where() (zero specificity), so a cell's own padding or
   hide-on-mobile rule still wins; the column rule itself does not yield. Put it AFTER the row's own padding/gap.

   padY — the row's old vertical padding; padX — space either side of each rule. */
export function columnRules(padY: string, padX = '10px'): string {
  return `
    align-items: stretch;
    gap: 0;
    padding-top: 0;
    padding-bottom: 0;
    :where(&) > * { padding: ${padY} ${padX}; }
    :where(&) > :first-child { padding-left: 0; }
    :where(&) > :last-child { padding-right: 0; }
    /* The rule itself beats a cell's own border reset (e.g. an input with border: none);
       a row variant that deliberately drops it (wrapped phone cells) is injected later and wins */
    && > * + * { border-left: 1px solid var(--border-subtle); }
  `;
}

/* The same rule for real <table>s: a hairline between cells. */
export const tableColumnRules = `
  th + th, td + td { border-left: 1px solid var(--border-subtle); }
`;

/* A cell that wraps onto its own line on phones (actions spanning the row) breaks
   the column rules above and below it. This paints them back across it: one 1px
   line per column boundary, given as its distance from the wrapped cell's right
   edge — the columns to its right MINUS the row's right padding (the cell stops
   at the padding; the next column's rule starts at its track). */
export function continueRules(...fromRight: number[]): string {
  const line = 'linear-gradient(var(--border-subtle), var(--border-subtle))';
  return `
    background-image: ${fromRight.map(() => line).join(', ')};
    background-size: ${fromRight.map(() => '1px 100%').join(', ')};
    background-repeat: no-repeat;
    background-position: ${fromRight.map(r => `right ${r - 1}px top 0`).join(', ')};
  `;
}
