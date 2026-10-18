/**
 * Download the Material Symbols Outlined subset the app uses and save it with
 * the other bundled fonts, so no page load ever calls Google (privacy: no IP
 * sent to Google Fonts; Safari can't block it; works offline).
 *
 *   npm run fonts:icons
 *
 * The glyph list is src/assets/fonts/material-symbols-icons.txt (one name per
 * line, A–Z). Add a new glyph there and re-run this, or it renders as text.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listFile = join(root, 'src/assets/fonts/material-symbols-icons.txt');
const outFile = join(root, 'src/assets/fonts/material-symbols-outlined.woff2');

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
console.log(`Saved ${names.length} glyphs (${(font.length / 1024).toFixed(0)} KB) to src/assets/fonts/material-symbols-outlined.woff2`);
