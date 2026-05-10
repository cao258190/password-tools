export const clientSecretPrefix = "vault:v1:";
const clientSecretPattern = /^vault:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

export function isClientEncryptedSecret(value: string) {
  return clientSecretPattern.test(value);
}
