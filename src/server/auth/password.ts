import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;

/** scrypt password hash: scrypt$N$salt$hash */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N });
  return `scrypt$${N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n) });
  return timingSafeEqual(actual, expected);
}

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 12) problems.push("At least 12 characters");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) problems.push("Upper- and lower-case letters");
  if (!/\d/.test(password)) problems.push("At least one number");
  return { ok: problems.length === 0, problems };
}
