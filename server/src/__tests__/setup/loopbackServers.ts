/*
 * Test servers listen on 127.0.0.1 itself.
 *
 * supertest starts a server per request with `app.listen(0)` — every interface,
 * a port the system picks — and then connects to 127.0.0.1:<that port>. macOS
 * will hand out a port number that another program already holds on 127.0.0.1
 * alone (an editor's helper, a local tool: several run on a developer's
 * machine), and a connection to 127.0.0.1 goes to whoever holds the address
 * itself, not to "every interface". The request then reached that other
 * program, which answered 404 for a route it has never heard of — or nothing,
 * and the test ran out its timeout. That was the "a random test fails under a
 * full run": a different one each time, never when run alone.
 *
 * Bound to 127.0.0.1 itself, a test server is always the one its own request
 * reaches. The address is bound here, at once, because supertest reads the
 * port straight after calling listen: naming a host to listen() would bind a
 * moment later (after a lookup), too late for that.
 */
import http from 'http';
import net from 'net';

type Listen = (...args: unknown[]) => http.Server;
const listen = http.Server.prototype.listen as unknown as Listen;
// Node's own helper: a TCP handle already bound, or an error number
const bound = (net as unknown as { _createServerHandle?: (address: string, port: number, family: number) => unknown })._createServerHandle;

(http.Server.prototype as unknown as { listen: Listen }).listen = function (this: http.Server, ...args: unknown[]) {
  // listen(port) or listen(port, callback): no host was named
  const noHost = typeof args[0] === 'number' && (args.length === 1 || typeof args[1] === 'function');
  if (noHost && typeof bound === 'function') {
    const handle = bound('127.0.0.1', args[0] as number, 4);
    // A number is an error (the port is taken, say): leave that to Node's own listen
    if (handle && typeof handle === 'object') return listen.call(this, handle, ...args.slice(1));
  }
  return listen.apply(this, args);
};
