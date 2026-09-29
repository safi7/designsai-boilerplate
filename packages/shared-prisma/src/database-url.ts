/**
 * Normalise a MySQL connection string so special characters in the password
 * are URL-encoded. Secret managers happily generate passwords like `p@ss(w)rd`
 * that break Prisma's URL parser when interpolated raw.
 *
 * Idempotent: decoding before encoding means a second pass is a no-op.
 */
export function normalizeDatabaseUrl(databaseUrl: string): string {
  const encode = (password: string) => encodeURIComponent(password).replace(/\(/g, '%28').replace(/\)/g, '%29');

  try {
    const url = new URL(databaseUrl);
    if (!url.password) return databaseUrl;
    url.password = encode(decodeURIComponent(url.password));
    return url.toString();
  } catch {
    // The WHATWG parser rejects some raw passwords outright. Split on the last
    // '@' manually instead: the host part can never contain one.
    const match = databaseUrl.match(/^(mysql:\/\/)([^:]+):(.*)@([^@]+)$/);
    if (!match) return databaseUrl;
    const [, protocol, user, password, rest] = match;
    return `${protocol}${user}:${encode(password)}@${rest}`;
  }
}
