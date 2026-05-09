import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/server/http";
import { sitesRouter } from "../../src/server/routes/sites";

const mocks = vi.hoisted(() => ({
  authUser: {
    id: "user-list",
    email: "list@example.com",
    name: null,
    cryptoSalt: "salt-list",
    vaultVerifier: null,
    vaultKdfIterations: 310000,
    isAdmin: false,
    tokenVersion: 0
  },
  prisma: {
    site: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    category: {
      findUnique: vi.fn()
    },
    $executeRaw: vi.fn()
  }
}));

vi.mock("../../src/server/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("../../src/server/middleware/auth", () => ({
  requireAuth: (req: { authUser?: typeof mocks.authUser }, _res: unknown, next: () => void) => {
    req.authUser = mocks.authUser;
    next();
  }
}));

function siteSummary(input: {
  id: string;
  name: string;
  accountCount: number;
  categoryId?: string | null;
  favorite?: boolean;
  tags?: string;
  note?: string | null;
  lastUsedAt?: Date | null;
}) {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: input.id,
    name: input.name,
    primaryUrl: `https://${input.id}.example.com`,
    backupUrls: "[]",
    categoryId: input.categoryId ?? null,
    category: input.categoryId
      ? {
          id: input.categoryId,
          name: "工作",
          color: "#8b5cf6",
          icon: "briefcase",
          sortOrder: 2,
          createdAt: now,
          updatedAt: now
        }
      : null,
    iconType: "letter",
    iconValue: input.name.slice(0, 1),
    iconUrl: null,
    iconBg: "#2563eb",
    iconColor: "#ffffff",
    favorite: input.favorite ?? false,
    sortOrder: 0,
    tags: input.tags ?? "[]",
    note: input.note ?? "",
    createdAt: now,
    updatedAt: now,
    lastUsedAt: input.lastUsedAt ?? null,
    _count: { accounts: input.accountCount }
  };
}

function createTestApp() {
  const app = express();
  app.use("/api/sites", sitesRouter);
  app.use(errorHandler);
  return app;
}

const app = createTestApp();

describe("sites list query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches account fields without selecting account secrets for list summaries", async () => {
    mocks.prisma.site.findMany.mockResolvedValueOnce([
      siteSummary({
        id: "github",
        name: "GitHub",
        accountCount: 2,
        categoryId: "category-work",
        tags: JSON.stringify(["code"]),
        note: "CI token lives here"
      })
    ]);

    const response = await request(app).get("/api/sites?search=company-bot").expect(200);

    expect(response.body.sites).toEqual([
      expect.objectContaining({
        id: "github",
        name: "GitHub",
        primaryUrl: "https://github.example.com",
        tags: ["code"],
        note: "CI token lives here",
        accountCount: 2
      })
    ]);
    expect(response.body.sites[0]).not.toHaveProperty("accounts");
    expect(JSON.stringify(response.body.sites)).not.toContain("passwordSecret");

    expect(mocks.prisma.site.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.site.findMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select.accounts).toBeUndefined();
    expect(args.select._count).toEqual({ select: { accounts: true } });
    expect(JSON.stringify(args.select)).not.toContain("passwordSecret");
    expect(JSON.stringify(args.where)).toContain("company-bot");
    expect(JSON.stringify(args.where)).toContain("label");
    expect(JSON.stringify(args.where)).toContain("username");
    expect(JSON.stringify(args.where)).not.toContain("passwordSecret");
  });

  it("pushes list filters and sort modes into the Prisma query", async () => {
    mocks.prisma.site.findMany
      .mockResolvedValueOnce([
        siteSummary({
          id: "github",
          name: "GitHub",
          accountCount: 2,
          categoryId: "category-work",
          favorite: true,
          lastUsedAt: new Date("2026-01-04T00:00:00.000Z")
        })
      ])
      .mockResolvedValueOnce([
        siteSummary({ id: "beta-bank", name: "Beta Bank", accountCount: 3 }),
        siteSummary({ id: "github", name: "GitHub", accountCount: 2 }),
        siteSummary({ id: "alpha-tools", name: "Alpha Tools", accountCount: 1 }),
        siteSummary({ id: "zed-mail", name: "Zed Mail", accountCount: 0 })
      ])
      .mockResolvedValueOnce([
        siteSummary({ id: "zed-mail", name: "Zed Mail", accountCount: 0, lastUsedAt: new Date("2026-01-05T00:00:00.000Z") }),
        siteSummary({ id: "github", name: "GitHub", accountCount: 2, lastUsedAt: new Date("2026-01-04T00:00:00.000Z") }),
        siteSummary({ id: "beta-bank", name: "Beta Bank", accountCount: 3, lastUsedAt: new Date("2026-01-02T00:00:00.000Z") })
      ])
      .mockResolvedValueOnce([
        siteSummary({
          id: "beta-bank",
          name: "Beta Bank",
          accountCount: 3,
          tags: JSON.stringify(["backup"])
        })
      ]);

    const filtered = await request(app)
      .get("/api/sites?category=category-work&favorite=true&scope=recent&sort=name")
      .expect(200);

    expect(filtered.body.sites.map((site: { name: string }) => site.name)).toEqual(["GitHub"]);
    let args = mocks.prisma.site.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      userId: "user-list",
      categoryId: "category-work",
      favorite: true
    });
    expect(args.where.AND).toContainEqual({ lastUsedAt: { not: null } });
    expect(args.orderBy).toEqual([{ name: "asc" }, { sortOrder: "desc" }, { updatedAt: "desc" }]);

    const byAccounts = await request(app).get("/api/sites?sort=accounts").expect(200);
    expect(byAccounts.body.sites.map((site: { name: string }) => site.name)).toEqual([
      "Beta Bank",
      "GitHub",
      "Alpha Tools",
      "Zed Mail"
    ]);
    args = mocks.prisma.site.findMany.mock.calls[1][0];
    expect(args.orderBy).toEqual([
      { accounts: { _count: "desc" } },
      { name: "asc" },
      { sortOrder: "desc" },
      { updatedAt: "desc" }
    ]);

    const recent = await request(app).get("/api/sites?scope=recent").expect(200);
    expect(recent.body.sites.map((site: { name: string }) => site.name)).toEqual([
      "Zed Mail",
      "GitHub",
      "Beta Bank"
    ]);
    args = mocks.prisma.site.findMany.mock.calls[2][0];
    expect(args.where.AND).toContainEqual({ lastUsedAt: { not: null } });

    const tagged = await request(app).get("/api/sites?tag=backup").expect(200);
    expect(tagged.body.sites.map((site: { name: string }) => site.name)).toEqual(["Beta Bank"]);
    args = mocks.prisma.site.findMany.mock.calls[3][0];
    expect(args.where.AND).toContainEqual({ tags: { contains: JSON.stringify("backup") } });
  });
});
