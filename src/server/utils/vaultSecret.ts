export const clientSecretPrefix = "vault:v1:";

export function isClientEncryptedSecret(value: string) {
  return value.startsWith(clientSecretPrefix);
}
