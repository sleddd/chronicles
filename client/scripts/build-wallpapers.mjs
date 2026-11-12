/**
 * Wallpapers: turns the Unsplash originals into what the app serves and
 * rewrites the list in src/utils/wallpapers.ts.
 *
 *   node scripts/build-wallpapers.mjs            (npm run wallpapers)
 *
 * Originals: src/assets/wallpaper/wallpapers/<name>-<11-char id>-unsplash.jpg
 * (not committed), with Unsplash's metadata.txt beside them for the credits.
 * Each one missing from public/wallpapers gets a 2,400px copy and a
 * 480 × 300 thumbnail. A photo already in public/wallpapers stays, whether or
 * not its original is still here. To drop one, add its 11-character id to
 * scripts/wallpapers-removed.txt and run this again: its copies are deleted
 * and it is never built again. Needs ImageMagick (`magick`).
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src/assets/wallpaper/wallpapers');
const OUT = join(root, 'public/wallpapers');
const THUMBS = join(OUT, 'thumbs');
const LIST = join(root, 'src/utils/wallpapers.ts');

const ID = /^(.+)-([A-Za-z0-9_-]{11})$/;

/* Photos taken out: their copies go, and they're skipped from here on */
const removedFile = join(root, 'scripts/wallpapers-removed.txt');
const removed = new Set(existsSync(removedFile)
  ? readFileSync(removedFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : []);
const isRemoved = id => removed.has(id.match(ID)[2]);
const tidy = s => s.replace(/\s+/g, ' ').trim();

/* Credits, as Unsplash gives them: "Uploaded by: Luca Bravo (@lucabravo) - …" */
const credits = new Map();
const metaFile = join(SRC, 'metadata.txt');
if (existsSync(metaFile)) {
  for (const block of readFileSync(metaFile, 'utf8').split(/\n\s*\n/)) {
    const file = block.match(/^File:\s*(.+)-unsplash\.jpg\s*$/m)?.[1];
    const by = block.match(/^Uploaded by:\s*(.+?)\s*\(@/m)?.[1];
    if (file && by) credits.set(file, tidy(by));
  }
}

/* Names already in the list win, so a credit never changes under a photo */
const source = readFileSync(LIST, 'utf8');
const known = new Map();
for (const m of source.matchAll(/\{ id: '([^']+)', by: '((?:[^'\\]|\\.)*)'/g)) known.set(m[1], m[2].replace(/\\'/g, "'"));

const fromFileName = id => id.match(ID)[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

mkdirSync(THUMBS, { recursive: true });
const originals = existsSync(SRC)
  ? readdirSync(SRC).filter(f => f.endsWith('-unsplash.jpg')).map(f => f.slice(0, -'-unsplash.jpg'.length)).filter(id => ID.test(id) && !isRemoved(id))
  : [];

const todo = originals.filter(id => !existsSync(join(OUT, `${id}.jpg`)) || !existsSync(join(THUMBS, `${id}.jpg`)));
let done = 0;
async function worker() {
  for (let id = todo.pop(); id; id = todo.pop()) {
    const from = join(SRC, `${id}-unsplash.jpg`);
    await run('magick', [from, '-auto-orient', '-resize', '2400x2400>', '-strip', '-interlace', 'JPEG', '-quality', '76', join(OUT, `${id}.jpg`)]);
    await run('magick', [from, '-auto-orient', '-resize', '480x300^', '-gravity', 'center', '-extent', '480x300', '-strip', '-quality', '72', join(THUMBS, `${id}.jpg`)]);
    done += 1;
  }
}
await Promise.all(Array.from({ length: Math.max(2, cpus().length - 2) }, worker));

let dropped = 0;
for (const f of readdirSync(OUT).filter(f => f.endsWith('.jpg'))) {
  const id = f.slice(0, -4);
  if (!ID.test(id) || !isRemoved(id)) continue;
  rmSync(join(OUT, f));
  rmSync(join(THUMBS, f), { force: true });
  dropped += 1;
}

const ids = readdirSync(OUT)
  .filter(f => f.endsWith('.jpg'))
  .map(f => f.slice(0, -4))
  .filter(id => ID.test(id) && existsSync(join(THUMBS, `${id}.jpg`)))
  .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

const rows = ids.map(id => {
  const by = known.get(id) ?? credits.get(id) ?? fromFileName(id);
  return `  { id: '${id}', by: '${by.replace(/'/g, "\\'")}', url: 'https://unsplash.com/photos/${id.match(ID)[2]}' },`;
});
const block = /export const WALLPAPERS: Wallpaper\[\] = \[[\s\S]*?\n\];/;
if (!block.test(source)) throw new Error('WALLPAPERS list not found in wallpapers.ts');
writeFileSync(LIST, source.replace(block, () => `export const WALLPAPERS: Wallpaper[] = [\n${rows.join('\n')}\n];`));

console.log(`${done} resized, ${dropped} removed, ${ids.length} wallpapers in the list`);
