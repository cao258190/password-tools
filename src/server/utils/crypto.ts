import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../env.js";

const algorithm = "aes-256-gcm";

function deriveKey(userSalt: string) {
  if (!env.cryptoSecret) {
    throw new Error("Legacy server crypto secret is not configured");
  }
  return scryptSync(env.cryptoSecret, userSalt, 32);
}

export function createUserSalt() {
  return randomBytes(16).toString("hex");
}

export function encryptSecret(plainText: string, userSalt: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, deriveKey(userSalt), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string, userSalt: string) {
  const [iv, tag, encrypted] = payload.split(":");
  if (!iv || !tag || !encrypted) return "";

  const decipher = createDecipheriv(
    algorithm,
    deriveKey(userSalt),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
