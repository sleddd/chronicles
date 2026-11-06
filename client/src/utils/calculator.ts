/** A tiny four-function calculator (immediate execution, like a pocket one). Pure. */

export type CalcOp = '+' | '-' | '×' | '÷';

export interface CalcState {
  /** What the screen shows */
  display: string;
  /** The left-hand number waiting for an operator's right-hand one */
  stored: number | null;
  op: CalcOp | null;
  /** The next digit starts a new number (after an operator or =) */
  fresh: boolean;
  /** Short line above the figure: "120 +" */
  trail: string;
}

export const CALC_START: CalcState = { display: '0', stored: null, op: null, fresh: true, trail: '' };

export type CalcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | CalcOp | '=' | 'C' | '⌫' | '%';

const MAX_DIGITS = 14;

/** Trims floating-point noise (0.1 + 0.2 → 0.3) and very long figures */
export function formatCalc(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const tidy = Number(n.toPrecision(12));
  const s = String(tidy);
  return s.length > MAX_DIGITS + 2 ? tidy.toExponential(6) : s;
}

function apply(a: number, b: number, op: CalcOp): number {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '×') return a * b;
  return b === 0 ? NaN : a / b;
}

/** "1,234.5" for the screen (the stored string stays plain) */
export function showCalc(display: string): string {
  if (display === 'Error' || display.includes('e')) return display;
  const [int, dec] = display.split('.');
  const neg = int.startsWith('-');
  const digits = (neg ? int.slice(1) : int).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${digits}${dec !== undefined ? `.${dec}` : ''}`;
}

export function pressCalc(s: CalcState, key: CalcKey): CalcState {
  if (key === 'C') return CALC_START;
  if (s.display === 'Error') s = CALC_START;

  if (key === '⌫') {
    if (s.fresh) return s;
    const next = s.display.slice(0, -1);
    return { ...s, display: next === '' || next === '-' ? '0' : next };
  }

  if (/^[0-9]$/.test(key)) {
    if (s.fresh) return { ...s, display: key, fresh: false };
    if (s.display.replace(/[-.]/g, '').length >= MAX_DIGITS) return s;
    return { ...s, display: s.display === '0' ? key : s.display + key };
  }

  if (key === '.') {
    if (s.fresh) return { ...s, display: '0.', fresh: false };
    return s.display.includes('.') ? s : { ...s, display: `${s.display}.` };
  }

  if (key === '%') return { ...s, display: formatCalc(Number(s.display) / 100), fresh: false };

  const current = Number(s.display);

  if (key === '=') {
    if (s.op === null || s.stored === null) return { ...s, fresh: true };
    const result = formatCalc(apply(s.stored, current, s.op));
    return { display: result, stored: null, op: null, fresh: true, trail: `${showCalc(formatCalc(s.stored))} ${s.op} ${showCalc(formatCalc(current))} =` };
  }

  const op = key as CalcOp;
  // An operator: change it if no number was typed since, else work out what's pending first
  if (s.op !== null && s.fresh && s.stored !== null) {
    return { ...s, op, trail: `${showCalc(formatCalc(s.stored))} ${op}` };
  }
  const left = s.op !== null && s.stored !== null ? apply(s.stored, current, s.op) : current;
  const shown = formatCalc(left);
  if (shown === 'Error') return { ...CALC_START, display: 'Error' };
  return { display: shown, stored: Number(shown), op, fresh: true, trail: `${showCalc(shown)} ${op}` };
}

/** The key a keyboard press means, if any */
export function calcKeyFor(key: string): CalcKey | null {
  if (/^[0-9]$/.test(key) || key === '.' || key === '+' || key === '-' || key === '%') return key as CalcKey;
  if (key === '*' || key === 'x') return '×';
  if (key === '/') return '÷';
  if (key === '=' || key === 'Enter') return '=';
  if (key === 'Backspace') return '⌫';
  if (key === 'Delete' || key === 'c' || key === 'C') return 'C';
  return null;
}
