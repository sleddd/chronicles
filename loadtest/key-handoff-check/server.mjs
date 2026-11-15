// Serves the key handoff check and prints what the two tabs report.
//   node loadtest/key-handoff-check/server.mjs
// then open http://localhost:8765/?role=holder and, in another tab of the SAME
// browser, http://localhost:8765/?role=asker. On a phone, use the deployed app
// itself instead: open it in a second tab and see whether it opens with no prompt.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)));
const port = Number(process.env.PORT ?? 8765);
const stopAfterMs = Number(process.env.STOP_AFTER_MS ?? 0);

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { console.log('RESULT ' + body); res.end('ok'); });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page);
}).listen(port, '127.0.0.1', () => console.log(`key handoff check on http://localhost:${port}/?role=holder`));
if (stopAfterMs) setTimeout(() => process.exit(0), stopAfterMs);
