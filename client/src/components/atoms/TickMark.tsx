/* The app's one checkmark look (the same drawing as the core Checkbox,
   `ch-check`): ticked = an accent check-circle — a ring with the tick breaking
   out of it, stroke only, never a fill; unticked = a plain grey ring
   (--control-border). Every round tick (shopping lists, priorities, doses,
   recipe ingredients, dashboards) draws this inside a bare button. Props only. */

interface TickMarkProps {
  checked: boolean;
  size?: number;
}

/** Every tick is drawn a bit smaller than the size it is asked for (the user's call,
 *  app-wide): 22 → 20, 20 → 18, 18 → 16, 16 → 14. Callers keep their own tap targets. */
const DRAWN = 0.89;

export function TickMark({ checked, size = 20 }: TickMarkProps) {
  const px = Math.round(size * DRAWN);
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
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
