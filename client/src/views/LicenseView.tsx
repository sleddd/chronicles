import { LegalTemplate } from '../components/templates/LegalTemplate.js';
import licenseText from '../../../LICENSE?raw';

/* The license, public at /license, read straight from the repo's LICENSE so the
   page and the file never drift apart. The file's hard-wrapped lines are joined
   back into paragraphs: "1. Permitted use" lines become headings, "a. …" items
   start their own paragraph. */

type Block = { kind: 'h2' | 'p'; text: string };

/** Turns the LICENSE file into headings and paragraphs */
export function parseLicense(raw: string): { title: string; meta: string; blocks: Block[] } {
  const chunks = raw.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const [title = 'License', meta = '', ...rest] = chunks.map(c => c.trim());
  const blocks: Block[] = [];
  for (const chunk of rest) {
    const lines = chunk.split('\n').map(l => l.trim());
    if (lines.length === 1 && /^\d+\.\s/.test(lines[0])) {
      blocks.push({ kind: 'h2', text: lines[0] });
      continue;
    }
    let para: string[] = [];
    const flush = () => { if (para.length) blocks.push({ kind: 'p', text: para.join(' ') }); para = []; };
    for (const line of lines) {
      if (/^[a-z]\.\s/.test(line)) flush();
      para.push(line);
    }
    flush();
  }
  return { title, meta, blocks };
}

export function LicenseView() {
  const { title, meta, blocks } = parseLicense(licenseText);
  return (
    <LegalTemplate title={title} meta={meta}>
      {blocks.map((b, i) => (b.kind === 'h2' ? <h2 key={i}>{b.text}</h2> : <p key={i}>{b.text}</p>))}
    </LegalTemplate>
  );
}
