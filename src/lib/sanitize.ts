import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Used for rich text content before encryption/storage
 */
export function sanitizeHtml(dirty: string): string {
  // Only run on client side
  if (typeof window === 'undefined') {
    return dirty;
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'del',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'sub', 'sup'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', // for links
      'class', // for styling
      'data-*' // for custom data attributes used by editor
    ],
    // Force all links to have safe attributes
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target'],
    // Force links to open in new tab with security
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}

/**
 * Sanitize plain text (strip all HTML)
 * Used for fields that shouldn't contain any HTML
 */
export function sanitizePlainText(dirty: string): string {
  if (typeof window === 'undefined') {
    return dirty;
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
}

/**
 * Hook to transform links to be safe
 */
if (typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Set all links to open in new tab with noopener
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}
