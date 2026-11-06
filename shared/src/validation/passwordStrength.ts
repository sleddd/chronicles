/*
 * Password strength, checked in the browser (the server never sees the
 * password — only a secret derived from it). An estimate of how hard the
 * password is to guess, in bits: length × the character pool, less what
 * patterns give away — common passwords and words (with l33t swaps undone),
 * the email or username, repeats ("aaaa", "xY7!xY7!"), runs ("abcd", "1234"),
 * keyboard rows ("qwerty") and years. Pure, no dependencies.
 */

import { passwordSchema } from './schemas.js';

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthScore;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** Roughly how many guesses it would take, as bits */
  bits: number;
  /** The most useful thing to change, if anything */
  tip: string | null;
}

/** The score a new password needs */
export const MIN_PASSWORD_SCORE: StrengthScore = 3;

/* The most-used passwords and the words they're built from (lower case, no digits or symbols) */
const COMMON = new Set([
  'password', 'passw', 'passwd', 'pass', 'qwerty', 'qwertyuiop', 'asdf', 'asdfgh', 'zxcvbn', 'letmein', 'welcome', 'iloveyou',
  'admin', 'administrator', 'root', 'login', 'master', 'secret', 'dragon', 'monkey', 'football', 'baseball', 'basketball',
  'soccer', 'hockey', 'sunshine', 'princess', 'shadow', 'superman', 'batman', 'trustno', 'hello', 'freedom', 'whatever',
  'starwars', 'pokemon', 'charlie', 'michael', 'jennifer', 'jordan', 'hunter', 'ranger', 'buster', 'thomas', 'robert',
  'daniel', 'jessica', 'ashley', 'matthew', 'andrew', 'joshua', 'summer', 'winter', 'spring', 'autumn', 'flower', 'cookie',
  'chocolate', 'cheese', 'butterfly', 'purple', 'orange', 'yellow', 'banana', 'apple', 'computer', 'internet', 'google',
  'facebook', 'instagram', 'samsung', 'iphone', 'chronicles', 'chronicle', 'journal', 'diary', 'family', 'mother', 'father',
  'love', 'lovely', 'loveme', 'angel', 'baby', 'babygirl', 'killer', 'pepper', 'ginger', 'tigger', 'maggie', 'buddy',
  'abc', 'abcd', 'abcdef', 'qazwsx', 'changeme', 'default', 'guest', 'test', 'tester', 'temp', 'access', 'mustang', 'harley',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'secure', 'security', 'private', 'myname',
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function poolSize(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  return Math.max(pool, 10);
}

/** Lengths of runs that follow a pattern: repeats, a → b → c steps, or a keyboard row */
function patternChars(lower: string): number {
  let covered = 0;
  let i = 0;
  while (i < lower.length) {
    let j = i + 1;
    // repeats: aaaa
    while (j < lower.length && lower[j] === lower[i]) j++;
    let run = j - i;
    // steps: abcd, 4321
    let k = i + 1;
    const step = lower.charCodeAt(i + 1) - lower.charCodeAt(i);
    if (Math.abs(step) === 1) {
      while (k < lower.length && lower.charCodeAt(k) - lower.charCodeAt(k - 1) === step) k++;
      run = Math.max(run, k - i);
    }
    // keyboard rows: qwerty, asdf
    for (const row of KEYBOARD_ROWS) {
      for (const r of [row, [...row].reverse().join('')]) {
        let m = 0;
        while (i + m < lower.length && r.includes(lower.slice(i, i + m + 1))) m++;
        run = Math.max(run, m);
      }
    }
    if (run >= 3) { covered += run; i += run; } else i++;
  }
  return covered;
}

/** The longest common word (or personal word) inside the password, l33t swaps undone */
function longestWord(pw: string, personal: string[]): { word: string; personal: boolean } | null {
  const lower = pw.toLowerCase();
  const unleet = [...lower].map(c => LEET[c] ?? c).join('');
  let best: { word: string; personal: boolean } | null = null;
  const consider = (word: string, isPersonal: boolean) => {
    if (word.length < 3 || (!lower.includes(word) && !unleet.includes(word))) return;
    if (!best || word.length > best.word.length) best = { word, personal: isPersonal };
  };
  for (const w of COMMON) consider(w, false);
  for (const w of personal) consider(w, true);
  return best;
}

/** The email's name part and the username, split into the bits someone would try ("jane.doe" → jane, doe, janedoe) */
function personalWords(context: { email?: string; username?: string }): string[] {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    if (!s) return;
    const base = s.toLowerCase();
    const whole = base.replace(/[^a-z0-9]/g, '');
    if (whole.length >= 3) out.add(whole);
    for (const part of base.split(/[^a-z0-9]+/)) if (part.length >= 3) out.add(part);
  };
  add(context.email?.split('@')[0]);
  add(context.username);
  return [...out];
}

const LABELS: PasswordStrength['label'][] = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

export function passwordStrength(pw: string, context: { email?: string; username?: string } = {}): PasswordStrength {
  if (!pw) return { score: 0, label: 'Too weak', bits: 0, tip: null };
  const lower = pw.toLowerCase();
  const pool = poolSize(pw);
  const perChar = Math.log2(pool);

  // Characters a guesser gets for free: a known word costs ~10 bits in all, a pattern ~1 bit a character
  const word = longestWord(pw, personalWords(context));
  const patterned = Math.min(patternChars(lower), pw.length);
  const wordLen = word ? word.word.length : 0;
  const freeChars = Math.min(pw.length, wordLen + Math.max(0, patterned - wordLen));
  let bits = (pw.length - freeChars) * perChar + (wordLen ? 10 : 0) + Math.max(0, patterned - wordLen);
  // A password that's only a word with a few digits / symbols tacked on is barely better than the word
  if (word && pw.length - wordLen <= 4) bits = Math.min(bits, 10 + (pw.length - wordLen) * 5);
  // Years (1950–2039) are guessed early: count four year digits as about 7 bits
  const years = (pw.match(/(19[5-9]\d|20[0-3]\d)/g) ?? []).length;
  bits -= years * Math.max(0, 4 * perChar - 7);
  // The same chunk over and over ("xY7!xY7!xY7!") is barely stronger than the chunk once
  for (let size = 1; size <= pw.length / 2; size++) {
    if (pw.length % size === 0 && pw.slice(0, size).repeat(pw.length / size) === pw) {
      bits = Math.min(bits, size * perChar + Math.log2(pw.length / size) + 1);
      break;
    }
  }
  bits = Math.max(0, Math.round(bits));

  const score: StrengthScore = pw.length < 8 || bits < 28 ? 0 : bits < 40 ? 1 : bits < 55 ? 2 : bits < 72 ? 3 : 4;

  let tip: string | null = null;
  if (word?.personal) tip = 'Leave out your name and email.';
  else if (word && COMMON.has(word.word) && pw.length - wordLen <= 4) tip = 'That’s close to a common password. Try a few unrelated words together.';
  else if (patterned >= 4 || /^(.+)\1+$/.test(pw)) tip = 'Avoid repeats, runs like abcd or 1234, and keyboard rows.';
  else if (pw.length < 12) tip = 'Make it at least 12 characters.';
  else if (score < 4) tip = 'Longer is stronger. Add another word or two.';
  return { score, label: LABELS[score], bits, tip };
}

/**
 * Why a new password can't be used, or null when it can: the basic rules
 * (passwordSchema), then strength — it must score Good or better and not be
 * built on the email or username.
 */
export function newPasswordProblem(pw: string, context: { email?: string; username?: string } = {}): string | null {
  const rules = passwordSchema.safeParse(pw);
  if (!rules.success) return rules.error.issues[0].message;
  const s = passwordStrength(pw, context);
  if (s.tip === 'Leave out your name and email.') return 'Leave your name and email out of your password.';
  if (s.score < MIN_PASSWORD_SCORE) return `That password is too easy to guess. ${s.tip ?? 'Try a longer one.'}`;
  return null;
}
