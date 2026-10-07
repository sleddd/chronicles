/**
 * Compact navigation: phones AND tablets get the mobile top bar + slide-out
 * nav instead of the side rail. Narrow windows (≤1024px) plus touch-first
 * tablets up to iPad Pro landscape (1366px). Page layouts keep their own
 * (768px) breakpoints — this only decides which navigation shows.
 */
export const NAV_COMPACT = '@media (max-width: 1024px), (hover: none) and (pointer: coarse) and (max-width: 1366px)';
