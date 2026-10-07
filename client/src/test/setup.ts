import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrolling; components call it on mount
window.scrollTo = (() => {}) as typeof window.scrollTo;
Element.prototype.scrollIntoView = function scrollIntoView() {};
