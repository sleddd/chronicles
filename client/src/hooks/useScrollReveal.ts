import { useEffect, type RefObject } from 'react';

/**
 * Reveals each `[data-reveal]` element inside `container` as it scrolls into
 * view by setting `data-shown` on it (the CSS does the fade and lift). The app
 * scrolls `#root`, not the window, so that's the observer's root. Shows
 * everything at once when IntersectionObserver is missing (tests, old
 * browsers) or the visitor prefers reduced motion, so nothing stays hidden.
 */
export function useScrollReveal(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));
    const showAll = () => items.forEach(i => i.setAttribute('data-shown', ''));
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') { showAll(); return; }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-shown', '');
        observer.unobserve(entry.target);
      }
    }, { root: document.getElementById('root'), rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    items.forEach(i => observer.observe(i));
    return () => observer.disconnect();
  }, [container]);
}
