import net from 'net';

/**
 * The network an address belongs to, for lockout buckets: an IPv4 /24 or an
 * IPv6 /48 (what one person, office or hosting customer typically holds). A
 * stranger's wrong passwords and codes count per (account, network), so one
 * IP — or one network — can lock out only itself, never the owner signing in
 * from somewhere else.
 *
 * "4:203.0.113" / "6:2001:db8:1"; "?" when the address can't be read.
 */
export function networkKey(ip: string | undefined | null): string {
  if (!ip) return '?';
  let addr = ip.trim();
  // An IPv4 address seen through an IPv6 socket
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) addr = mapped[1];
  // A zone id ("fe80::1%eth0") names an interface, not a network
  addr = addr.split('%')[0];
  const kind = net.isIP(addr);
  if (kind === 4) return `4:${addr.split('.').slice(0, 3).join('.')}`;
  if (kind === 6) return `6:${expandIPv6(addr).slice(0, 3).join(':')}`;
  return '?';
}

/** The eight hextets of an IPv6 address, lower case, without leading zeros. */
function expandIPv6(addr: string): string[] {
  let text = addr.toLowerCase();
  // A trailing dotted IPv4 part ("::1.2.3.4") is two hextets
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = text.slice(0, v4.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? Array(Math.max(0, 8 - left.length - right.length)).fill('0') : [];
  return [...left, ...fill, ...right].map(h => (parseInt(h, 16) || 0).toString(16));
}
