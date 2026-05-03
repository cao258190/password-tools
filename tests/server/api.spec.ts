import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app";
import { prisma } from "../../src/server/db";
import { defaultCategories, ensureDefaultCategories } from "../../src/server/services/defaults";

const app = createApp();

async function clearDatabase() {
  await prisma.account.deleteMany();
  await prisma.site.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

async function seedGlobalCategories() {
  await ensureDefaultCategories((category) =>
    prisma.category.upsert({
      where: { name: category.name },
      update: {
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder
      },
      create: { ...category }
    })
  );
}

async function registerAgent(email: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ email, password: "testpass123", name: "T" })
    .expect(201);
  return agent;
}

describe("password vault API", () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedGlobalCategories();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registers, authenticates, and returns the current user", async () => {
    const agent = await registerAgent("user@example.com");

    const response = await agent.get("/api/auth/me").expect(200);
    expect(response.body.user.email).toBe("user@example.com");
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

    const updated = await agent
      .patch("/api/auth/profile")
      .send({ email: "profile-new@example.com", name: "New Name" })
      .expect(200);

    expect(updated.body.user.email).toBe("profile-new@example.com");
    expect(updated.body.user.name).toBe("New Name");

    await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "wrongpass", newPassword: "newpass123" })
      .expect(400);

    await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "testpass123", newPassword: "newpass123" })
      .expect(204);

    await agent.post("/api/auth/logout").expect(204);
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
    const categories = await agent.get("/api/categories").expect(200);
    const work = categories.body.categories.find(
      (category: { name: string }) => category.name === "工作"
    );

    const created = await agent
      .post("/api/sites")
      .send({
        name: "Example",
        primaryUrl: "https://example.com",
        backupUrls: ["https://login.example.com"],
        categoryId: work.id,
        iconValue: "E",
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
    expect(detail.body.site.accountCount).toBe(1);
  });

  it("records viewing time without changing modified time", async () => {
    const agent = await registerAgent("view-time@example.com");
    const created = await agent
      .post("/api/sites")
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

    const created = await owner
      .post("/api/sites")
      .send({
        name: "Private",
        primaryUrl: "https://private.example.com",
        tags: [],
        backupUrls: [],
        accounts: []
      })
      .expect(201);

    await other.get(`/api/sites/${created.body.site.id}`).expect(404);
    await other.patch(`/api/sites/${created.body.site.id}`).send({ name: "Stolen" }).expect(404);
  });

  it("searches site, tag, note, and account fields", async () => {
    const agent = await registerAgent("search@example.com");

    await agent
      .post("/api/sites")
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

  it("returns tag counts for sidebar filters", async () => {
    const agent = await registerAgent("tags@example.com");

    await agent
      .post("/api/sites")
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
    const response = await agent.post("/api/password/generate").send({ length: 20 }).expect(200);

    expect(response.body.password).toHaveLength(20);
    expect(response.body.strength).toBe("strong");
  });
});
