/* The app's one checkmark look (the same drawing as the core Checkbox,
   `ch-check`): ticked = an accent check-circle — a ring with the tick breaking
   out of it, stroke only, never a fill; unticked = a plain grey ring
   (--control-border). Every round tick (shopping lists, priorities, doses,
   recipe ingredients, dashboards) draws this inside a bare button. Props only. */

interface TickMarkProps {
  checked: boolean;
  size?: number;
}

export function TickMark({ checked, size = 20 }: TickMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      {checked ? (
        <g style={{ stroke: 'var(--color-accent)' }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4 12 14.01l-3-3" />
        </g>
      ) : (
        <circle cx="12" cy="12" r="10" style={{ stroke: 'var(--control-border)' }} />
      )}
    </svg>
  );
}
