/* The Chronicles logo mark: Material Symbols' "book_5" (Outlined, weight 400 —
   a book standing at an angle, its cover tilted open), drawn from its SVG path so
   it can take a gradient that runs into the user's accent colour (the --logo-*
   tokens from App.tsx) and follows Settings → Theme. Light theme starts it
   from a deep accent shade so it holds up on white.

   gradientId must be unique on the page: a gradient defined inside a hidden SVG
   (e.g. the mobile bar on desktop) won't paint for another SVG that points at it. */

/* Material Symbols "book_5", Outlined 400 (Apache 2.0), viewBox 0 -960 960 960 */
const BOOK_5 = 'M270-80q-45 0-77.5-29.64Q160-139.27 160-183v-564q0-36.57 22.12-65.43Q204.24-841.3 240-849l380-79v620l-360 77q-17.14 3.69-28.57 17.54Q220-199.62 220-183q0 19 15 31t35 12h470v-660h60v720H270Zm70-228 220-47v-499l-220 45v501Zm-60 12.81V-796l-20 4q-17 4-28.5 15.83Q220-764.35 220-747v471q9.06-5.2 19.03-9.1Q249-289 260-291l20-4.19ZM220-787v511-511Z';

interface BrandMarkProps {
  size?: number;
  gradientId: string;
  /** Accessible name; omit when a visible "Chronicles" label sits beside it */
  title?: string;
}

export function BrandMark({ size = 32, gradientId, title }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="480" y1="-928" x2="480" y2="-80">
          <stop offset="0" style={{ stopColor: 'var(--logo-top)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--logo-mid)' }} />
          <stop offset="0.75" style={{ stopColor: 'var(--logo-low)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-end)' }} />
        </linearGradient>
      </defs>
      <path d={BOOK_5} fill={`url(#${gradientId})`} />
    </svg>
  );
}
