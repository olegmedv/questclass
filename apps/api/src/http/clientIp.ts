import { BlockList, isIP } from 'node:net';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './route';

/** Source of the trusted proxy CIDR list (the `http.trustedProxies` setting). */
export type TrustedProxiesSource = () => readonly string[];

/** Anything that can read the `http.trustedProxies` setting (the settings service). */
export interface TrustedProxiesSetting {
  get(key: 'http.trustedProxies'): readonly string[];
}

/** The trust list as configured in the admin UI (default: private IPv4 ranges). */
export function trustedProxiesFromSettings(settings: TrustedProxiesSetting): TrustedProxiesSource {
  return () => settings.get('http.trustedProxies');
}

const MAPPED_V4_PREFIX = '::ffff:';

/** Normalises an address (strips the IPv4-mapped IPv6 prefix); null if it is not an IP. */
export function normalizeIp(raw: string): string | null {
  let ip = raw.trim();
  const unmapped = ip.slice(MAPPED_V4_PREFIX.length);
  if (ip.toLowerCase().startsWith(MAPPED_V4_PREFIX) && isIP(unmapped) === 4) {
    ip = unmapped;
  }
  return isIP(ip) === 0 ? null : ip;
}

/** Builds a matcher from CIDR strings (`10.0.0.0/8`, `fd00::/8`) or single addresses. */
export function buildTrustList(cidrs: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of cidrs) {
    const [address = '', prefix] = entry.trim().split('/');
    const family = isIP(address);
    if (family === 0) {
      throw new Error(`Invalid trusted proxy address: ${entry}`);
    }
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, type);
    } else {
      list.addSubnet(address, Number(prefix), type);
    }
  }
  return list;
}

function isTrusted(list: BlockList, ip: string): boolean {
  return list.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Determines the client address. `X-Forwarded-For` is honoured only when the direct peer is a
 * trusted proxy; the chain is then walked right-to-left, skipping trusted hops, and the first
 * untrusted address is the client. A malformed entry stops the walk.
 */
export function resolveClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trusted: BlockList,
): string {
  const remote = remoteAddress === undefined ? null : normalizeIp(remoteAddress);
  if (remote === null) {
    return 'unknown';
  }
  if (!forwardedFor || !isTrusted(trusted, remote)) {
    return remote;
  }
  const hops = forwardedFor
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  let candidate = remote;
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = normalizeIp(hops[i] ?? '');
    if (hop === null) {
      return candidate;
    }
    candidate = hop;
    if (!isTrusted(trusted, hop)) {
      return hop;
    }
  }
  return candidate;
}

/** Middleware that resolves the client address once per request (read it with `clientIp`). */
export function clientIpMiddleware(source: TrustedProxiesSource): MiddlewareHandler<AppEnv> {
  let cachedKey: string | null = null;
  let cachedList = new BlockList();
  const trustList = (): BlockList => {
    const cidrs = source();
    const key = cidrs.join(',');
    if (key !== cachedKey) {
      cachedList = buildTrustList(cidrs);
      cachedKey = key;
    }
    return cachedList;
  };
  return async (c, next) => {
    const remote = c.env?.incoming?.socket.remoteAddress;
    c.set('clientIp', resolveClientIp(remote, c.req.header('x-forwarded-for'), trustList()));
    await next();
  };
}

/** Client address of the request, honouring trusted proxies. */
export function clientIp(c: Context<AppEnv>): string {
  return c.get('clientIp');
}
