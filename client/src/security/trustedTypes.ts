import DOMPurify from 'dompurify';

/* Trusted Types: with `require-trusted-types-for 'script'` in the CSP (set by
   the server's securityHeaders on every page), the browser refuses a plain
   string at an HTML or script sink (innerHTML, DOMParser, script src,
   service-worker URLs…). This default policy is what every such string goes
   through — ours and the libraries' (React, TipTap / ProseMirror, DOMPurify's
   own internals use their 'dompurify' policy):

   - HTML is sanitized with DOMPurify, keeping everything the app writes
     (the editor's drawing node keeps its `svgcontent` attribute), so an
     injected `<img onerror>` or `<script>` can't become code
   - script URLs must be this site's own
   - strings as code (eval, setTimeout("…")) are refused outright

   Installed first thing in main.tsx, before anything touches the DOM. Browsers
   without Trusted Types skip it (the CSP directive is ignored there too). */

/** What the default policy lets through as HTML */
export const TRUSTED_HTML_CONFIG = {
  // The drawing node's SVG lives in this attribute (DrawingNode: svgContent)
  ADD_ATTR: ['svgcontent', 'target'],
};

// A kept `target` (a link opening a new tab) always carries rel=noopener, so
// the opened page can never reach back to this one through window.opener
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node instanceof Element && node.hasAttribute('target')) node.setAttribute('rel', 'noopener noreferrer');
});

export function trustedHTML(input: string): string {
  return DOMPurify.sanitize(input, TRUSTED_HTML_CONFIG) as string;
}

export function trustedScriptURL(input: string, base = window.location.href): string {
  const url = new URL(input, base);
  if (url.origin !== new URL(base).origin) throw new TypeError(`Blocked a script from ${url.origin}`);
  return input;
}

export function installTrustedTypes(): void {
  const tt = (window as unknown as { trustedTypes?: { createPolicy: (name: string, rules: object) => unknown } }).trustedTypes;
  if (!tt?.createPolicy) return;
  try {
    tt.createPolicy('default', {
      createHTML: (input: string) => trustedHTML(input),
      createScriptURL: (input: string) => trustedScriptURL(input),
      createScript: () => { throw new TypeError('Code from strings is blocked'); },
    });
  } catch (err) {
    // Already made (a hot reload in development) — the first one stands
    console.warn('Trusted Types default policy not created:', err);
  }
}

installTrustedTypes();
