import request from "supertest";
import { Buffer } from "node:buffer";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { prisma } from "../../src/server/db";
import { bootstrapSystem, setRegistrationEnabled } from "../../src/server/services/bootstrap";
import { defaultCategories } from "../../src/server/services/defaults";

const app = createApp();
const csrfHeader = "X-CSRF-Token";

function clientSecret(label: string) {
  return `vault:v1:${Buffer.from(`iv-${label}`).toString("base64url")}:${Buffer.from(`cipher-${label}`).toString("base64url")}`;
}

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
    expect(response.body.user.cryptoSalt).toBeTruthy();
    expect(response.body.user.vaultVerifier).toBeNull();

    const token = await csrfToken(agent);
    await agent
      .patch("/api/auth/vault")
      .set(csrfHeader, token)
      .send({ vaultVerifier: "vault:v1:missing-cipher" })
      .expect(400);

    const verifier = clientSecret("verifier");
    const updated = await agent
      .patch("/api/auth/vault")
      .set(csrfHeader, token)
      .send({ vaultVerifier: verifier })
      .expect(200);
    expect(updated.body.user.vaultVerifier).toBe(verifier);

    await agent
      .patch("/api/auth/vault")
      .set(csrfHeader, token)
      .send({ vaultVerifier: clientSecret("second-verifier") })
      .expect(409);
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

  it("lets admins export and restore encrypted system backups", async () => {
    const admin = await loginAgent();
    const token = await csrfToken(admin);
    const normalUser = await registerAgent("backup-user@example.com");

    await normalUser.get("/api/admin/backup/export").expect(403);

    const created = await admin
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Backup Site",
        primaryUrl: "https://backup.example.com",
        backupUrls: [],
        tags: ["备份"],
        accounts: [
          {
            label: "备份账号",
            username: "backup@example.com",
            passwordSecret: clientSecret("export")
          }
        ]
      })
      .expect(201);

    const exported = await admin.get("/api/admin/backup/export").expect(200);
    const backup = exported.body.backup;
    expect(backup.kind).toBe("password-tools-backup");
    expect(backup.encryption.mode).toBe("client-pbkdf2-aes-256-gcm");
    expect(backup.encryption.requiresSameServerCryptoSecret).toBe(false);
    expect(JSON.stringify(backup)).not.toContain("ExportPass#2026");
    expect(backup.tables.accounts[0].passwordSecret).toBeTruthy();

    await prisma.account.deleteMany();
    await prisma.site.deleteMany();
    expect(await prisma.site.count()).toBe(0);

    const imported = await admin
      .post("/api/admin/backup/import")
      .set(csrfHeader, token)
      .send({ confirm: "RESTORE", backup })
      .expect(200);

    expect(imported.body.result.sites).toBeGreaterThan(0);
    const detail = await admin.get(`/api/sites/${created.body.site.id}`).expect(200);
    expect(detail.body.site.name).toBe("Backup Site");
    expect(detail.body.site.accounts[0].password).toBe("");
    expect(detail.body.site.accounts[0].passwordSecret).toBe(backup.tables.accounts[0].passwordSecret);
  });

  it("rejects invalid or unsafe backup imports", async () => {
    const admin = await loginAgent();
    const token = await csrfToken(admin);
    await admin
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Unsafe Backup Site",
        primaryUrl: "https://unsafe-backup.example.com",
        backupUrls: [],
        tags: [],
        accounts: [
          {
            label: "备份账号",
            username: "unsafe-backup@example.com",
            passwordSecret: clientSecret("unsafe-backup")
          }
        ]
      })
      .expect(201);

    const exported = await admin.get("/api/admin/backup/export").expect(200);
    const backup = {
      ...exported.body.backup,
      tables: {
        ...exported.body.backup.tables,
        users: exported.body.backup.tables.users.map((user: { isAdmin: boolean }) => ({
          ...user,
          isAdmin: false
        }))
      }
    };

    await admin
      .post("/api/admin/backup/import")
      .set(csrfHeader, token)
      .send({ confirm: "RESTORE", backup })
      .expect(400);

    await admin
      .post("/api/admin/backup/import")
      .set(csrfHeader, token)
      .send({ confirm: "NOPE", backup: exported.body.backup })
      .expect(400);

    const crossUserBackup = {
      ...exported.body.backup,
      tables: {
        ...exported.body.backup.tables,
        users: [
          ...exported.body.backup.tables.users,
          {
            ...exported.body.backup.tables.users[0],
            id: "backup-other-user",
            email: "backup-other-user@example.com",
            isAdmin: false
          }
        ],
        accounts: exported.body.backup.tables.accounts.map((account: { userId: string }, index: number) =>
          index === 0 ? { ...account, userId: "backup-other-user" } : account
        )
      }
    };

    await admin
      .post("/api/admin/backup/import")
      .set(csrfHeader, token)
      .send({ confirm: "RESTORE", backup: crossUserBackup })
      .expect(400);
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

  it("does not count successful logins against the failed login limiter", async () => {
    const agent = request.agent(app);

    for (let index = 0; index < 9; index += 1) {
      await agent
        .post("/api/auth/login")
        .send({ email: "admin@example.com", password: "admin123456" })
        .expect(200);
    }
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

  it("invalidates old sessions after password changes", async () => {
    const agent = await registerAgent("session@example.com");
    const secondSession = await loginAgent("session@example.com", "testpass123");

    await secondSession.get("/api/auth/me").expect(200);
    await agent
      .patch("/api/auth/password")
      .set(csrfHeader, await csrfToken(agent))
      .send({ currentPassword: "testpass123", newPassword: "newpass123" })
      .expect(204);

    await agent.get("/api/auth/me").expect(200);
    await secondSession.get("/api/auth/me").expect(401);
  });

  it("creates sites with client-encrypted account passwords", async () => {
    const agent = await registerAgent("owner@example.com");
    const token = await csrfToken(agent);
    const categories = await agent.get("/api/categories").expect(200);
    const work = categories.body.categories.find(
      (category: { name: string }) => category.name === "工作"
    );

    await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Malformed Secret",
        primaryUrl: "https://malformed.example.com",
        backupUrls: [],
        tags: [],
        accounts: [
          {
            label: "主账号",
            username: "owner@example.com",
            passwordSecret: "vault:v1:missing-cipher"
          }
        ]
      })
      .expect(400);

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
            passwordSecret: clientSecret("owner")
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
    expect(detail.body.site.accounts[0].password).toBe("");
    expect(detail.body.site.accounts[0].passwordSecret).toBe(rawAccount.passwordSecret);
    expect(detail.body.site.iconColor).toBe("#111827");
    expect(detail.body.site.accountCount).toBe(1);
  });

  it("resolves and stores favicons from website addresses", async () => {
    const agent = await registerAgent("favicon@example.com");
    const iconBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return new Response('<html><head><link rel="icon" href="/assets/icon.png"></head></html>', {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }
      if (url === "https://example.com/assets/icon.png") {
        return new Response(iconBytes, {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      if (url === "https://example.com/favicon.ico") {
        return new Response("", { status: 404 });
      }
      throw new Error(`Unexpected favicon URL: ${url}`);
    });

    const resolved = await agent.get("/api/sites/favicon?url=https%3A%2F%2Fexample.com").expect(200);
    const iconUrl = `data:image/png;base64,${Buffer.from(iconBytes).toString("base64")}`;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(resolved.body.favicon.sourceUrl).toBe("https://example.com/assets/icon.png");
    expect(resolved.body.favicon.iconUrl).toBe(iconUrl);
    expect(resolved.body.icons).toHaveLength(1);
    expect(resolved.body.icons[0].iconUrl).toBe(iconUrl);

    const created = await agent
      .post("/api/sites")
      .set(csrfHeader, await csrfToken(agent))
      .send({
        name: "Icon Site",
        primaryUrl: "https://example.com",
        backupUrls: [],
        iconType: "favicon",
        iconValue: "I",
        iconUrl,
        tags: [],
        accounts: []
      })
      .expect(201);

    expect(created.body.site.iconUrl).toBe(iconUrl);
  });

  it("prefers dynamically configured site logos over static fallback favicons", async () => {
    const agent = await registerAgent("dynamic-favicon@example.com");
    const configuredIcon = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]).toString("base64")}`;
    const fallbackIcon = Uint8Array.from([137, 80, 78, 71, 5, 6, 7, 8]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://dynamic.example.com/") {
        return new Response(
          `<html><head><link rel="icon" href="/logo.png"><script>window.__APP_CONFIG__=${JSON.stringify({
            site_logo: configuredIcon
          })}</script></head></html>`,
          {
            status: 200,
            headers: { "content-type": "text/html" }
          }
        );
      }
      if (url === "https://dynamic.example.com/logo.png") {
        return new Response(fallbackIcon, {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      if (url === "https://dynamic.example.com/favicon.ico") {
        return new Response("", { status: 404 });
      }
      throw new Error(`Unexpected dynamic favicon URL: ${url}`);
    });

    const resolved = await agent.get("/api/sites/favicon?url=https%3A%2F%2Fdynamic.example.com").expect(200);
    const fallbackIconUrl = `data:image/png;base64,${Buffer.from(fallbackIcon).toString("base64")}`;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(resolved.body.favicon.sourceUrl).toBe("https://dynamic.example.com/#site_logo");
    expect(resolved.body.favicon.iconUrl).toBe(configuredIcon);
    expect(resolved.body.icons.map((icon: { iconUrl: string }) => icon.iconUrl)).toEqual([
      configuredIcon,
      fallbackIconUrl
    ]);
  });

  it("serializes account updates and refreshes the parent site modified time", async () => {
    const agent = await registerAgent("account-update@example.com");
    const token = await csrfToken(agent);
    const created = await agent
      .post("/api/sites")
      .set(csrfHeader, token)
      .send({
        name: "Account Site",
        primaryUrl: "https://account.example.com",
        backupUrls: [],
        tags: [],
        accounts: [
          {
            label: "主账号",
            username: "before@example.com",
            passwordSecret: clientSecret("before")
          }
        ]
      })
      .expect(201);

    const siteId = created.body.site.id;
    const accountId = created.body.site.accounts[0].id;
    const originalUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    await prisma.$executeRaw`UPDATE "Site" SET "updatedAt" = ${originalUpdatedAt} WHERE "id" = ${siteId}`;

    const updated = await agent
      .patch(`/api/accounts/${accountId}`)
      .set(csrfHeader, token)
      .send({ username: "after@example.com", passwordSecret: clientSecret("after") })
      .expect(200);

    expect(updated.body.account.username).toBe("after@example.com");
    expect(updated.body.account.password).toBe("");
    expect(updated.body.account.passwordSecret).toBe(clientSecret("after"));
    expect(updated.body.account.userId).toBeUndefined();

    const rawSite = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    expect(rawSite.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

    const afterPatchUpdatedAt = rawSite.updatedAt;
    await prisma.$executeRaw`UPDATE "Site" SET "updatedAt" = ${originalUpdatedAt} WHERE "id" = ${siteId}`;
    await agent.delete(`/api/accounts/${accountId}`).set(csrfHeader, token).expect(204);

    const afterDelete = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    expect(afterDelete.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    expect(afterDelete.updatedAt.getTime()).toBeGreaterThanOrEqual(afterPatchUpdatedAt.getTime());
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
            passwordSecret: clientSecret("bot")
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
            passwordSecret: clientSecret("low-sort"),
            sortOrder: 1
          },
          {
            label: "高排序账号",
            username: "high-account@example.com",
            passwordSecret: clientSecret("high-sort"),
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
