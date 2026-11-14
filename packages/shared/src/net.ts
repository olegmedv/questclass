/**
 * Proxies whose `X-Forwarded-For` header is trusted by default: private IPv4 ranges,
 * which is where a reverse proxy on the same Docker network (or LAN) lives.
 * The effective list is the `http.trustedProxies` setting; this is its default.
 */
export const DEFAULT_TRUSTED_PROXIES: readonly string[] = Object.freeze([
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
]);
