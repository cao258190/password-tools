import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { prisma } from "../../src/server/db";
import { bootstrapSystem, setRegistrationEnabled } from "../../src/server/services/bootstrap";
import { defaultCategories } from "../../src/server/services/defaults";

const app = createApp();
const csrfHeader = "X-CSRF-Token";

async function clearDatabase() {
  await prisma.account.deleteMany();
  await prisma.site.deleteMany();
  await prisma.category.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();
}

async function registerAgent(email: string) {
  const agent = request.agent(app);
  const token = await csrfToken(agent);
  await agent
    .post("/api/auth/register")
    .set(csrfHeader, token)
    .send({ email, password: "testpass123", name: "T" })
    .expect(201);
  return agent;
}

async function csrfToken(agent: request.SuperAgentTest) {
  const response = await agent.get("/api/public/settings").expect(200);
  const cookie = response.headers["set-cookie"]
    ?.map((item: string) => item.split(";")[0])
    .find((item: string) => item.startsWith("vault_csrf="));
  if (!cookie) throw new Error("Missing CSRF cookie");
  return decodeURIComponent(cookie.slice("vault_csrf=".length));
}

async function loginAgent(email = "admin@example.com", password = "admin123456") {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);
  return agent;
}

describe("password vault API", () => {
  beforeEach(async () => {
    await clearDatabase();
    await bootstrapSystem();
    await setRegistrationEnabled(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers, authenticates, and returns the current user", async () => {
    const agent = await registerAgent("user@example.com");

    const response = await agent.get("/api/auth/me").expect(200);
    expect(response.body.user.email).toBe("user@example.com");
    expect(response.body.user.isAdmin).toBe(false);
  });

  it("creates a default admin and lets only admins control registration", async () => {
    await setRegistrationEnabled(false);

    const blockedAgent = request.agent(app);
    await blockedAgent
      .post("/api/auth/register")
      .set(csrfHeader, await csrfToken(blockedAgent))
      .send({ email: "blocked@example.com", password: "testpass123", name: "B" })
      .expect(403);

    const admin = await loginAgent();
    const loggedIn = await admin.get("/api/auth/me").expect(200);
    expect(loggedIn.body.user.isAdmin).toBe(true);
    const adminCsrf = await csrfToken(admin);

    const disabled = await admin.get("/api/admin/settings").expect(200);
    expect(disabled.body.settings.registrationEnabled).toBe(false);

    await admin
      .patch("/api/admin/settings")
      .set(csrfHeader, adminCsrf)
      .send({ registrationEnabled: true })
      .expect(200);

    const guest = request.agent(app);
    const guestCsrf = await csrfToken(guest);
    await guest
      .post("/api/auth/register")
      .set(csrfHeader, guestCsrf)
      .send({ email: "opened@example.com", password: "testpass123", name: "O" })
      .expect(201);

    const normalUser = await registerAgent("normal@example.com");
    await normalUser
      .patch("/api/admin/settings")
      .set(csrfHeader, await csrfToken(normalUser))
      .send({ registrationEnabled: false })
      .expect(403);
  });

  it("lets admins check GitHub version and keeps the update endpoint admin-only", async () => {
    const admin = await loginAgent();
    const token = await csrfToken(admin);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: "v9.9.9",
            html_url: "https://github.com/cao258190/password-tools/releases/tag/v9.9.9"
          })
        } as Response;
      }
      if (url.includes("/releases?")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              tag_name: "v9.9.9",
              html_url: "https://github.com/cao258190/password-tools/releases/tag/v9.9.9",
              published_at: "2026-05-05T00:00:00Z",
              prerelease: false
            },
            {
              tag_name: "v9.8.0",
              html_url: "https://github.com/cao258190/password-tools/releases/tag/v9.8.0",
              published_at: "2026-05-01T00:00:00Z",
              prerelease: false
            }
          ]
        } as Response;
      }
      throw new Error(`Unexpected GitHub URL: ${url}`);
    });

    const version = await admin.get("/api/admin/version?force=true").expect(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(version.body.version.latestVersion).toBe("v9.9.9");
    expect(version.body.version.updateAvailable).toBe(true);
    expect(version.body.version.updateEnabled).toBe(true);
    expect(version.body.version.releaseVersions.map((item: { version: string }) => item.version)).toEqual(["v9.9.9", "v9.8.0"]);

    await admin
      .post("/api/admin/update")
      .set(csrfHeader, token)
      .send({ targetVersion: version.body.version.currentVersion })
      .expect(400);

    const update = await admin.post("/api/admin/update").set(csrfHeader, token).send({ targetVersion: "9.8.0" }).expect(202);
    expect(update.body.update.status).toBe("running");
    expect(update.body.update.targetVersion).toBe("v9.8.0");

    const normalUser = await registerAgent("not-admin@example.com");
    await normalUser.get("/api/admin/version?force=true").expect(403);
    await normalUser.post("/api/admin/update").set(csrfHeader, await csrfToken(normalUser)).expect(403);
  });

  it("falls back to the repository package version instead of commit sha", async () => {
    const admin = await loginAgent();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return { ok: false, status: 404 } as Response;
      }
      if (url.includes("/releases?")) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes("/branches/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            commit: { sha: "abcdef1234567890" },
            html_url: "https://github.com/cao258190/password-tools/tree/master"
          })
        } as Response;
      }
      if (url.includes("/contents/package.json")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ version: "9.9.9" })
        } as Response;
      }
      throw new Error(`Unexpected GitHub URL: ${url}`);
    });

    const version = await admin.get("/api/admin/version?force=true").expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(version.body.version.latestVersion).toBe("9.9.9");
    expect(version.body.version.latestSha).toBe("abcdef1234567890");
    expect(version.body.version.source).toBe("package");
    expect(version.body.version.updateAvailable).toBe(true);
  });

  it("rejects mutating requests without CSRF token", async () => {
    const agent = await registerAgent("csrf@example.com");

    await agent
      .post("/api/sites")
      .send({
        name: "No CSRF",
        primaryUrl: "https://csrf.example.com",
        backupUrls: [],
        tags: [],
        accounts: []
      })
      .expect(403);
  });

  it("rate limits repeated failed login attempts", async () => {
    const agent = request.agent(app);

    for (let index = 0; index < 8; index += 1) {
      await agent
        .post("/api/auth/login")
        .send({ email: "missing@example.com", password: "wrongpass123" })
        .expect(401);
    }

    await agent
      .post("/api/auth/login")
      .send({ email: "missing@example.com", password: "wrongpass123" })
      .expect(429);
  });

  it("uses one shared fixed category set for every user", async () => {
    const first = await registerAgent("first@example.com");
    const second = await registerAgent("second@example.com");

    const firstCategories = await first.get("/api/categories").expect(200);
    const secondCategories = await second.get("/api/categories").expect(200);

    expect(await prisma.category.count()).toBe(defaultCategories.length);
    expect(firstCategories.body.categories.map((category: { id: string }) => category.id)).toEqual(
      secondCategories.body.categories.map((category: { id: string }) => category.id)
    );
    expect(firstCategories.body.categories.map((category: { name: string }) => category.name)).toContain(
      "AI中转站"
    );
  });

  it("updates profile information and changes password", async () => {
    const agent = await registerAgent("profile@example.com");
    const token = await csrfToken(agent);

    const updated = await agent
      .patch("/api/auth/profile")
      .set(csrfHeader, token)
      .send({ email: "profile-new@example.com", name: "New Name" })
      .expect(200);

    expect(updated.body.user.email).toBe("profile-new@example.com");
    expect(updated.body.user.name).toBe("New Name");

    await agent
      .patch("/api/auth/password")
      .set(csrfHeader, token)
      .send({ currentPassword: "wrongpass", newPassword: "newpass123" })
      .expect(400);

    await agent
      .patch("/api/auth/password")
      .set(csrfHeader, token)
      .send({ currentPassword: "testpass123", newPassword: "newpass123" })
      .expect(204);

    await agent.post("/api/auth/logout").set(csrfHeader, token).expect(204);
    await agent
      .post("/api/auth/login")
      .send({ email: "profile-new@example.com", password: "testpass123" })
      .expect(401);
    await agent
      .post("/api/auth/login")
      .send({ email: "profile-new@example.com", password: "newpass123" })
      .expect(200);
  });

  it("creates sites with encrypted account passwords and decrypts for the owner", async () => {
    const agent = await registerAgent("owner@example.com");
    const token = await csrfToken(agent);
    const categories = await agent.get("/api/categories").expect(200);
    const work = categories.body.categories.find(
      (category: { name: string }) => category.name === "工作"
    );

    const created = await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Example",
        primaryUrl: "https://example.com",
        backupUrls: ["https://login.example.com"],
        categoryId: work.id,
        iconValue: "E",
        iconBg: "#ffffff",
        iconColor: "#111827",
        tags: ["测试", "重要"],
        note: "A test vault item",
        accounts: [
          {
            label: "主账号",
            username: "owner@example.com",
            password: "PlainPass#2026"
          }
        ]
      })
      .expect(201);

    const siteId = created.body.site.id;
    const rawAccount = await prisma.account.findFirstOrThrow({
      where: { siteId }
    });
    expect(rawAccount.passwordSecret).not.toContain("PlainPass#2026");

    const detail = await agent.get(`/api/sites/${siteId}`).expect(200);
    expect(detail.body.site.accounts[0].password).toBe("PlainPass#2026");
    expect(detail.body.site.iconColor).toBe("#111827");
    expect(detail.body.site.accountCount).toBe(1);
  });

  it("rejects unsafe color values for icon styles", async () => {
    const agent = await registerAgent("color@example.com");

    await agent
      .post("/api/sites")
      .set(csrfHeader, await csrfToken(agent))
      .send({
        name: "Unsafe Color",
        primaryUrl: "https://color.example.com",
        backupUrls: [],
        iconBg: "url(javascript:alert(1))",
        iconColor: "#ffffff",
        tags: [],
        accounts: []
      })
      .expect(400);
  });

  it("records viewing time without changing modified time", async () => {
    const agent = await registerAgent("view-time@example.com");
    const token = await csrfToken(agent);
    const created = await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Viewed",
        primaryUrl: "https://viewed.example.com",
        backupUrls: [],
        tags: [],
        accounts: []
      })
      .expect(201);

    const siteId = created.body.site.id;
    const originalUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    await prisma.$executeRaw`UPDATE "Site" SET "updatedAt" = ${originalUpdatedAt}, "lastUsedAt" = NULL WHERE "id" = ${siteId}`;

    const detail = await agent.get(`/api/sites/${siteId}`).expect(200);
    const rawSite = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    expect(new Date(detail.body.site.updatedAt).getTime()).toBe(originalUpdatedAt.getTime());
    expect(rawSite.updatedAt.getTime()).toBe(originalUpdatedAt.getTime());
    expect(rawSite.lastUsedAt).toBeInstanceOf(Date);
  });

  it("keeps resources isolated between users", async () => {
    const owner = await registerAgent("owner@example.com");
    const other = await registerAgent("other@example.com");
    const ownerToken = await csrfToken(owner);
    const otherToken = await csrfToken(other);

    const created = await owner
      .post("/api/sites")
      .set(csrfHeader, ownerToken)
      .send({
        name: "Private",
        primaryUrl: "https://private.example.com",
        tags: [],
        backupUrls: [],
        accounts: []
      })
      .expect(201);

    await other.get(`/api/sites/${created.body.site.id}`).expect(404);
    await other
      .patch(`/api/sites/${created.body.site.id}`)
      .set(csrfHeader, otherToken)
      .send({ name: "Stolen" })
      .expect(404);
  });

  it("searches site, tag, note, and account fields", async () => {
    const agent = await registerAgent("search@example.com");
    const token = await csrfToken(agent);

    await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "GitHub",
        primaryUrl: "https://github.com",
        backupUrls: [],
        tags: ["代码"],
        note: "CI token lives here",
        accounts: [
          {
            label: "机器人",
            username: "company-bot",
            password: "BotPass#2026"
          }
        ]
      })
      .expect(201);

    const byAccount = await agent.get("/api/sites?search=company-bot").expect(200);
    expect(byAccount.body.sites).toHaveLength(1);

    const byTag = await agent.get(encodeURI("/api/sites?tag=代码")).expect(200);
    expect(byTag.body.sites).toHaveLength(1);
  });

  it("orders sites and accounts by sort order descending by default", async () => {
    const agent = await registerAgent("sort@example.com");
    const token = await csrfToken(agent);

    await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Low Sort",
        primaryUrl: "https://low.example.com",
        backupUrls: [],
        sortOrder: 10,
        tags: [],
        accounts: []
      })
      .expect(201);

    const high = await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "High Sort",
        primaryUrl: "https://high.example.com",
        backupUrls: [],
        sortOrder: 90,
        tags: [],
        accounts: [
          {
            label: "低排序账号",
            username: "low-account@example.com",
            password: "PlainPass#2026",
            sortOrder: 1
          },
          {
            label: "高排序账号",
            username: "high-account@example.com",
            password: "PlainPass#2026",
            sortOrder: 20
          }
        ]
      })
      .expect(201);

    const list = await agent.get("/api/sites").expect(200);
    expect(list.body.sites[0].name).toBe("High Sort");
    expect(list.body.sites[0].sortOrder).toBe(90);

    const detail = await agent.get(`/api/sites/${high.body.site.id}`).expect(200);
    expect(detail.body.site.accounts.map((account: { label: string }) => account.label)).toEqual([
      "高排序账号",
      "低排序账号"
    ]);
  });

  it("returns tag counts for sidebar filters", async () => {
    const agent = await registerAgent("tags@example.com");
    const token = await csrfToken(agent);

    await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Google",
        primaryUrl: "https://google.com",
        backupUrls: [],
        tags: ["搜索引擎", "重要"],
        accounts: []
      })
      .expect(201);

    await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Alipay",
        primaryUrl: "https://alipay.com",
        backupUrls: [],
        tags: ["支付", "重要"],
        accounts: []
      })
      .expect(201);

    const response = await agent.get("/api/tags").expect(200);
    expect(response.body.tags).toContainEqual({ name: "重要", count: 2 });
    expect(response.body.tags).toContainEqual({ name: "支付", count: 1 });
  });

  it("generates strong passwords", async () => {
    const agent = await registerAgent("generator@example.com");
    const response = await agent
      .post("/api/password/generate")
      .set(csrfHeader, await csrfToken(agent))
      .send({ length: 20 })
      .expect(200);

    expect(response.body.password).toHaveLength(20);
    expect(response.body.strength).toBe("strong");
  });
});
