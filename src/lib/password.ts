import crypto from "node:crypto";

const PASSWORD_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, salt, hash] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, PASSWORD_KEYLEN);
  const expected = Buffer.from(hash, "base64url");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
