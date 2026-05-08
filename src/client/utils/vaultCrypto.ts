const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const CLIENT_SECRET_PREFIX = "vault:v1";
export const DEFAULT_VAULT_KDF_ITERATIONS = 310_000;

const verifierPlainText = "password-tools:vault-verifier:v1";

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function saltToBytes(value: string) {
  return /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0
    ? hexToBytes(value)
    : textEncoder.encode(value);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function isClientEncryptedSecret(value?: string | null) {
  return Boolean(value?.startsWith(`${CLIENT_SECRET_PREFIX}:`));
}

export async function deriveVaultKey(masterPassword: string, salt: string, iterations = DEFAULT_VAULT_KDF_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltToBytes(salt),
      iterations
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVaultText(plainText: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(plainText))
  );
  return `${CLIENT_SECRET_PREFIX}:${bytesToBase64Url(iv)}:${bytesToBase64Url(encrypted)}`;
}

export async function decryptVaultText(secret: string, key: CryptoKey) {
  if (!isClientEncryptedSecret(secret)) {
    throw new Error("账号密码不是客户端加密格式");
  }

  const parts = secret.split(":");
  if (parts.length !== 4) {
    throw new Error("账号密码密文格式无效");
  }

  const iv = base64UrlToBytes(parts[2]);
  const encrypted = base64UrlToBytes(parts[3]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return textDecoder.decode(decrypted);
}

export async function createVaultVerifier(key: CryptoKey) {
  return encryptVaultText(verifierPlainText, key);
}

export async function verifyVaultKey(verifier: string, key: CryptoKey) {
  try {
    return (await decryptVaultText(verifier, key)) === verifierPlainText;
  } catch {
    return false;
  }
}
