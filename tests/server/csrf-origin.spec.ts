import request from "supertest";
import { describe, it } from "vitest";
import { createApp } from "../../src/server/app";

const app = createApp();
const csrfHeader = "X-CSRF-Token";
const trustedOrigin = "http://localhost:5173";
const loginPayload = {
  email: "missing-csrf-origin-user@example.com",
  password: "testpass123"
};

async function csrfToken(agent: request.SuperAgentTest) {
  const response = await agent.get("/api/health").expect(200);
  const cookie = response.headers["set-cookie"]
    ?.map((item: string) => item.split(";")[0])
    .find((item: string) => item.startsWith("vault_csrf="));

  if (!cookie) throw new Error("Missing CSRF cookie");
  return decodeURIComponent(cookie.slice("vault_csrf=".length));
}

describe("CSRF origin validation", () => {
  it("keeps API-client login attempts without browser source headers compatible", async () => {
    await request(app).post("/api/auth/login").send(loginPayload).expect(401);
  });

  it("allows the configured frontend origin to reach login without a CSRF token", async () => {
    await request(app).post("/api/auth/login").set("Origin", trustedOrigin).send(loginPayload).expect(401);
  });

  it("allows same-origin requests reconstructed from forwarded host and proto", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Host", "api:2697")
      .set("X-Forwarded-Host", "vault.example:3910")
      .set("X-Forwarded-Proto", "https")
      .set("Origin", "https://vault.example:3910")
      .send(loginPayload)
      .expect(401);
  });

  it("allows same-host HTTPS origins when TLS is terminated before the app proxy", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Host", "api:2697")
      .set("X-Forwarded-Host", "vault.example")
      .set("X-Forwarded-Proto", "http")
      .set("Origin", "https://vault.example")
      .send(loginPayload)
      .expect(401);
  });

  it("still rejects same-host origins on a different port", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Host", "api:2697")
      .set("X-Forwarded-Host", "vault.example:3910")
      .set("X-Forwarded-Proto", "http")
      .set("Origin", "https://vault.example")
      .send(loginPayload)
      .expect(403);
  });

  it("rejects cross-site login origins before credentials are processed", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://attacker.example")
      .send(loginPayload)
      .expect(403);
  });

  it("rejects cross-site login referers when Origin is absent", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Referer", "https://attacker.example/login")
      .send(loginPayload)
      .expect(403);
  });

  it("rejects browser-reported cross-site login submissions without Origin or Referer", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Sec-Fetch-Site", "cross-site")
      .send(loginPayload)
      .expect(403);
  });

  it("does not accept a CSRF token by itself from an untrusted origin", async () => {
    const agent = request.agent(app);
    const token = await csrfToken(agent);

    await agent
      .post("/api/auth/register")
      .set("Origin", "https://attacker.example")
      .set(csrfHeader, token)
      .send({ email: "csrf-origin-register@example.com", password: "testpass123", name: "T" })
      .expect(403);
  });
});
