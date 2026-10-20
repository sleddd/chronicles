// A tiny round-robin load balancer for testing several server instances:
// every request goes to the next backend in turn, and the response says which
// one answered (x-instance). Headers pass through unchanged, so with
// TRUST_PROXY=1 each test client keeps its own X-Forwarded-For address.
//   node rr-proxy.mjs <port> <backendPort> <backendPort> …
import http from 'node:http';
const [port, ...backends] = process.argv.slice(2).map(Number);
let next = 0;
http.createServer((req, res) => {
  const target = backends[next++ % backends.length];
  const up = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, 'x-instance': String(target) });
    r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(port, '127.0.0.1', () => console.log(`round-robin :${port} -> ${backends.join(', ')}`));
