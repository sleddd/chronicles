/**
 * Download the Material Symbols Outlined subset the app uses and save it with
 * the other bundled fonts, so no page load ever calls Google (privacy: no IP
 * sent to Google Fonts; Safari can't block it; works offline).
 *
 *   npm run fonts:icons
 *
 * The glyph list is src/assets/fonts/material-symbols-icons.txt (one name per
 * line, A–Z). Add a new glyph there and re-run this, or it renders as text.
 * It also stamps the font's url in src/styles/fonts.css (?v=<hash>), so
 * browsers holding the old subset load the new one.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listFile = join(root, 'src/assets/fonts/material-symbols-icons.txt');
const outFile = join(root, 'src/assets/fonts/material-symbols-outlined.woff2');
const cssFile = join(root, 'src/styles/fonts.css');

const names = [...new Set(readFileSync(listFile, 'utf8').split(/\s+/).filter(Boolean))].sort();
writeFileSync(listFile, names.join('\n') + '\n');

const css = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=${names.join(',')}&display=block`;
// A modern browser UA so Google answers with woff2
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const sheet = await (await fetch(css, { headers: { 'User-Agent': ua } })).text();
const url = sheet.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/)?.[1];
if (!url) throw new Error(`No woff2 in Google's response:\n${sheet.slice(0, 400)}`);
const font = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': ua } })).arrayBuffer());
writeFileSync(outFile, font);
// Stamp the font's address in fonts.css with its fingerprint, so a browser that
// already has the old subset fetches the new one instead of showing names as text
const stamp = createHash('sha256').update(font).digest('hex').slice(0, 8);
const fontsCss = readFileSync(cssFile, 'utf8');
writeFileSync(cssFile, fontsCss.replace(/material-symbols-outlined\.woff2(\?v=[0-9a-f]+)?'/, `material-symbols-outlined.woff2?v=${stamp}'`));
console.log(`Saved ${names.length} glyphs (${(font.length / 1024).toFixed(0)} KB) to src/assets/fonts/material-symbols-outlined.woff2`);
