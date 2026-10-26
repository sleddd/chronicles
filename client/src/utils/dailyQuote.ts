/** A short quote for the day, the same all day, cycling through the list by day of the year. */
export const DAILY_QUOTES: { text: string; author: string }[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'You are never too old to set another goal or to dream a new dream.', author: 'C.S. Lewis' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'Don\'t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
  { text: 'Keep your face always toward the sunshine, and shadows will fall behind you.', author: 'Walt Whitman' },
  { text: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
  { text: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'An unexamined life is not worth living.', author: 'Socrates' },
  { text: 'Spread love everywhere you go. Let no one ever come to you without leaving happier.', author: 'Mother Teresa' },
  { text: 'When you reach the end of your rope, tie a knot in it and hang on.', author: 'Franklin D. Roosevelt' },
  { text: 'Always remember that you are absolutely unique. Just like everyone else.', author: 'Margaret Mead' },
  { text: 'Do not go where the path may lead, go instead where there is no path and leave a trail.', author: 'Ralph Waldo Emerson' },
  { text: 'You will face many defeats in life, but never let yourself be defeated.', author: 'Maya Angelou' },
  { text: 'The greatest glory in living lies not in never falling, but in rising every time we fall.', author: 'Nelson Mandela' },
  { text: 'In the end, it\'s not the years in your life that count. It\'s the life in your years.', author: 'Abraham Lincoln' },
  { text: 'Life is what happens when you\'re busy making other plans.', author: 'John Lennon' },
  { text: 'Spread your wings and let the fairy in you fly.', author: 'Unknown' },
  { text: 'You have brains in your head. You have feet in your shoes. You can steer yourself any direction you choose.', author: 'Dr. Seuss' },
  { text: 'If life were predictable it would cease to be life, and be without flavor.', author: 'Eleanor Roosevelt' },
  { text: 'If you look at what you have in life, you\'ll always have more.', author: 'Oprah Winfrey' },
  { text: 'If you want to live a happy life, tie it to a goal, not to people or things.', author: 'Albert Einstein' },
  { text: 'Never let the fear of striking out keep you from playing the game.', author: 'Babe Ruth' },
  { text: 'Money and success don\'t change people; they merely amplify what is already there.', author: 'Will Smith' },
  { text: 'Your time is limited, so don\'t waste it living someone else\'s life.', author: 'Steve Jobs' },
  { text: 'Not how long, but how well you have lived is the main thing.', author: 'Seneca' },
  { text: 'If life is not a great adventure, it is nothing.', author: 'Helen Keller' },
  { text: 'Many of life\'s failures are people who did not realize how close they were to success when they gave up.', author: 'Thomas A. Edison' },
  { text: 'You only live once, but if you do it right, once is enough.', author: 'Mae West' },
];

export interface Quote { text: string; author: string }

const QUOTE_MARKS = /^[“"'‘]+|[”"'’]+$/g;

/**
 * A Quote entry's text as quote + author: "“Quote” — Author" (what the Quotes
 * topic's fields write), the fields summary "Quote: … · Author: …",
 * "Quote - Author", or just the quote. null when empty.
 */
export function parseQuoteText(raw: string): Quote | null {
  const line = raw.replace(/\s+/g, ' ').trim();
  if (!line) return null;
  // The fields summary: "Quote: Life is… · Author: Oprah Winfrey" (labels optional on the quote)
  const parts = line.split(/\s+·\s+/);
  const labelled = parts.map(p => p.match(/^([A-Za-z][A-Za-z ]{0,29}):\s*(.*)$/));
  if (labelled.some(Boolean)) {
    let text = '';
    let author = '';
    parts.forEach((part, i) => {
      const m = labelled[i];
      const label = m ? m[1].toLowerCase() : '';
      const value = (m ? m[2] : part).trim();
      if (/author|by|source|who|said/.test(label)) author ||= value;
      else if (!m || /quote|text|saying|words/.test(label)) text ||= value;
    });
    text = text.replace(QUOTE_MARKS, '').trim();
    if (text) return { text, author };
  }
  // The author follows the last dash after the closing quote mark (or the last " — " / " - ")
  const m = line.match(/^(.*?[”"’]|.*)\s+[—–-]\s+([^—–]+)$/);
  const text = (m ? m[1] : line).trim().replace(QUOTE_MARKS, '').trim();
  const author = m ? m[2].trim() : '';
  return text ? { text, author } : null;
}

/** A repeatable shuffle: the same seed always gives the same order */
function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let x = seed || 1;
  const next = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Today's quote, the same all day: your own quotes (a Quote topic) mixed in
 * with the built-in ones, in a shuffled order that's fixed for the year, one a
 * day. Without quotes of your own it's the built-in list alone.
 */
export function dailyQuote(now = new Date(), mine: Quote[] = []): Quote {
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const pool = shuffled([...mine, ...DAILY_QUOTES], now.getFullYear());
  return pool[dayOfYear % pool.length];
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
