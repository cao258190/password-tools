import { config } from "dotenv";

config();

export const env = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  cryptoSecret: process.env.SERVER_CRYPTO_SECRET ?? "dev-crypto-secret-change-me",
  adminEmail: (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123456",
  registrationEnabledByDefault: process.env.REGISTRATION_ENABLED === "true",
  cookieName: "vault_token",
  isProduction: process.env.NODE_ENV === "production",
  cookieSecure:
    process.env.COOKIE_SECURE === undefined
      ? process.env.NODE_ENV === "production"
      : process.env.COOKIE_SECURE === "true"
};
