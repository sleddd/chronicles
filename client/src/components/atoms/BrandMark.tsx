/* The Chronicles logo mark: an outlined "C" with clock hands. The C's gradient
   runs into the user's accent colour (the --logo-* and --accent-* tokens from
   App.tsx), so it follows Settings → Theme. The clock hands are the accent too.
   Light theme starts the C from a deep accent shade so it holds up on white.

   gradientId must be unique on the page: a gradient defined inside a hidden SVG
   (e.g. the mobile bar on desktop) won't paint for another SVG that points at it. */

interface BrandMarkProps {
  size?: number;
  gradientId: string;
  /** Accessible name; omit when a visible "Chronicles" label sits beside it */
  title?: string;
}

export function BrandMark({ size = 32, gradientId, title }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="256" y1="100" x2="256" y2="412">
          <stop offset="0" style={{ stopColor: 'var(--logo-top)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--logo-mid)' }} />
          <stop offset="0.75" style={{ stopColor: 'var(--logo-low)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-end)' }} />
        </linearGradient>
      </defs>
      {/* The C is drawn 20% larger than the source art, around the centre, and the hands
          are shorter, so the clock sits well clear of the inner C even at small sizes */}
      <path
        transform="translate(256 256) scale(1.2) translate(-256 -256)"
        fill={`url(#${gradientId})`}
        fillRule="evenodd"
        d="M390.3 165.4 A162 162 0 1 0 390.3 346.6 L313.9 330.1 A94 94 0 1 1 313.9 181.9 Z M340.3 151.9 A134 134 0 1 0 340.3 360.1 L319.2 353.3 A116 116 0 1 1 319.2 158.7 Z"
      />
      <g style={{ stroke: 'var(--color-accent)' }} strokeWidth={13} strokeLinecap="round" fill="none">
        <line x1="256" y1="256" x2="256" y2="192" />
        <line x1="256" y1="256" x2="295" y2="295" />
      </g>
      <circle cx="256" cy="256" r="16" style={{ fill: 'var(--color-accent)' }} />
    </svg>
  );
}
