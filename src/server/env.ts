import { config } from "dotenv";

config();

const isProduction = process.env.NODE_ENV === "production";
const defaultJwtSecret = "dev-jwt-secret-change-me";
const defaultCryptoSecret = "dev-crypto-secret-change-me";
const defaultAdminPassword = "admin123456";
const defaultUpdateCommand =
  process.env.NODE_ENV === "test" ? "node -e \"console.log('test update')\"" : "npm run web:update";
const jwtSecret = process.env.JWT_SECRET ?? defaultJwtSecret;
const cryptoSecret = process.env.SERVER_CRYPTO_SECRET ?? defaultCryptoSecret;
const adminPassword = process.env.ADMIN_PASSWORD ?? defaultAdminPassword;

if (isProduction) {
  const weakSecrets = [
    !process.env.JWT_SECRET || jwtSecret === defaultJwtSecret || jwtSecret.length < 32,
    !process.env.SERVER_CRYPTO_SECRET ||
      cryptoSecret === defaultCryptoSecret ||
      cryptoSecret.length < 32
  ];
  if (weakSecrets.some(Boolean)) {
    throw new Error("Production requires strong JWT_SECRET and SERVER_CRYPTO_SECRET values.");
  }
  if (adminPassword === defaultAdminPassword || adminPassword.length < 12) {
    throw new Error("Production requires a non-default ADMIN_PASSWORD with at least 12 characters.");
  }
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  jwtSecret,
  cryptoSecret,
  appVersion: process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.0.0",
  appCommit: process.env.APP_COMMIT ?? "",
  githubOwner: process.env.GITHUB_OWNER ?? "cao258190",
  githubRepo: process.env.GITHUB_REPO ?? "password-tools",
  updateCheckRef: process.env.UPDATE_CHECK_REF ?? "master",
  webUpdateEnabled: process.env.WEB_UPDATE_ENABLED === undefined ? true : process.env.WEB_UPDATE_ENABLED === "true",
  updateCommand: process.env.UPDATE_COMMAND ?? defaultUpdateCommand,
  updateDetached: process.env.UPDATE_DETACHED === "true",
  updateStatusFile: process.env.UPDATE_STATUS_FILE ?? ".update-status.json",
  adminEmail: (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase(),
  adminPassword,
  registrationEnabledByDefault: process.env.REGISTRATION_ENABLED === "true",
  cookieName: "vault_token",
  isProduction,
  cookieSecure:
    process.env.COOKIE_SECURE === undefined
      ? process.env.NODE_ENV === "production"
      : process.env.COOKIE_SECURE === "true"
};
