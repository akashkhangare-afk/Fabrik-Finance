import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "fabrik-dev-only-secret-do-not-use-in-production";

function secret(name: "SESSION_SECRET" | "ENCRYPTION_KEY"): string {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (process.env.NODE_ENV === "production" && process.env.FABRIK_DEMO_MODE !== "true") {
    throw new Error(`${name} must be set (16+ chars) in production`);
  }
  return `${DEV_SECRET}:${name}`;
}

let encKey: Buffer | undefined;
function encryptionKey(): Buffer {
  encKey ??= scryptSync(secret("ENCRYPTION_KEY"), "fabrik-at-rest-v1", 32);
  return encKey;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). Used for OAuth tokens and MFA secrets. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sign(value: string): string {
  return createHmac("sha256", secret("SESSION_SECRET")).update(value).digest("base64url");
}

export function signedValue(value: string): string {
  return `${value}.${sign(value)}`;
}

export function verifySigned(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const mac = Buffer.from(signed.slice(i + 1));
  const expected = Buffer.from(sign(value));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return value;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHmac("sha256", "fabrik-token-hash").update(value).digest("hex");
}
