/* The app's light-theme design tokens, pinned on the public pages' roots (the
   landing page, public shelves) so they read light whatever theme the visitor
   last used. Kept apart from LandingTemplate so a public page can use them
   without pulling in the landing page, which the installed app never loads. */
export const LIGHT_TOKENS = `
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
