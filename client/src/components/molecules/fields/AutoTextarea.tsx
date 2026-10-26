import { useCallback, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from 'react';

/* A textarea that stretches to show all of its text — no inner scrolling —
   refitting on every change and whenever its width changes; never smaller
   than its CSS min-height. The field forms' multi-line boxes build on it. Props only. */

type AutoTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function AutoTextarea({ ref, value, style, ...rest }: AutoTextareaProps) {
  const own = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback((el: HTMLTextAreaElement | null) => {
    own.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
  }, [ref]);

  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`; };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value]);

  return <textarea ref={setRef} value={value} style={{ overflow: 'hidden', resize: 'none', ...style }} {...rest} />;
}
