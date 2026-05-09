import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/server/http";
import { accountsRouter } from "../../src/server/routes/accounts";

const mocks = vi.hoisted(() => {
  const transaction = {
    account: {
      update: vi.fn()
    },
    site: {
      updateMany: vi.fn()
    }
  };

  return {
    authUser: {
      id: "user-1",
      email: "user@example.com",
      name: null,
      cryptoSalt: "salt-1",
      vaultVerifier: null,
      vaultKdfIterations: 310000,
      isAdmin: false,
      tokenVersion: 0
    },
    decryptSecret: vi.fn(),
    prisma: {
      account: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      site: {
        update: vi.fn(),
        updateMany: vi.fn()
      },
      $transaction: vi.fn()
    },
    transaction
  };
});

vi.mock("../../src/server/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("../../src/server/middleware/auth", () => ({
  requireAuth: (req: { authUser?: typeof mocks.authUser }, _res: unknown, next: () => void) => {
    req.authUser = mocks.authUser;
    next();
  }
}));

vi.mock("../../src/server/utils/crypto", () => ({
  decryptSecret: mocks.decryptSecret
}));

function clientSecret(label: string) {
  return `vault:v1:iv-${label}:cipher-${label}`;
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/accounts", accountsRouter);
  app.use(errorHandler);
  return app;
}

const app = createTestApp();

describe("legacy account migration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction)
    );
    mocks.transaction.account.update.mockResolvedValue({});
    mocks.transaction.site.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns only decryptable legacy accounts with the fields needed for migration", async () => {
    mocks.prisma.account.findMany.mockResolvedValue([
      { id: "client-1", passwordSecret: clientSecret("current") },
      { id: "legacy-1", passwordSecret: "legacy-secret-1" },
      { id: "broken-1", passwordSecret: "broken-secret" }
    ]);
    mocks.decryptSecret.mockImplementation((secret: string, salt: string) => {
      expect(salt).toBe("salt-1");
      if (secret === "legacy-secret-1") return "Plain#2026";
      throw new Error("cannot decrypt");
    });

    const response = await request(app).get("/api/accounts/legacy-migration").expect(200);

    expect(response.body.accounts).toEqual([{ id: "legacy-1", legacyPassword: "Plain#2026" }]);
    expect(Object.keys(response.body.accounts[0]).sort()).toEqual(["id", "legacyPassword"]);
    expect(mocks.decryptSecret).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        id: true,
        passwordSecret: true
      },
      orderBy: { id: "asc" }
    });
  });

  it("submits legacy migration secrets in one batch and refreshes touched sites once", async () => {
    const input = {
      accounts: [
        { id: "legacy-1", passwordSecret: clientSecret("new-1") },
        { id: "legacy-2", passwordSecret: clientSecret("new-2") },
        { id: "already-1", passwordSecret: clientSecret("new-3") }
      ]
    };
    mocks.prisma.account.findMany.mockResolvedValue([
      { id: "legacy-1", siteId: "site-1", passwordSecret: "legacy-secret-1" },
      { id: "legacy-2", siteId: "site-1", passwordSecret: "legacy-secret-2" },
      { id: "already-1", siteId: "site-2", passwordSecret: clientSecret("existing") }
    ]);

    const response = await request(app).post("/api/accounts/legacy-migration").send(input).expect(200);

    expect(response.body).toEqual({ migrated: 2 });
    expect(mocks.prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["legacy-1", "legacy-2", "already-1"] },
        userId: "user-1"
      },
      select: {
        id: true,
        siteId: true,
        passwordSecret: true
      }
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.account.update).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.account.update).toHaveBeenNthCalledWith(1, {
      where: { id: "legacy-1" },
      data: { passwordSecret: clientSecret("new-1") }
    });
    expect(mocks.transaction.account.update).toHaveBeenNthCalledWith(2, {
      where: { id: "legacy-2" },
      data: { passwordSecret: clientSecret("new-2") }
    });
    expect(mocks.transaction.site.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["site-1"] },
        userId: "user-1"
      },
      data: { updatedAt: expect.any(Date) }
    });
  });

  it("rejects batch migration updates for accounts outside the current user", async () => {
    mocks.prisma.account.findMany.mockResolvedValue([
      { id: "legacy-1", siteId: "site-1", passwordSecret: "legacy-secret-1" }
    ]);

    await request(app)
      .post("/api/accounts/legacy-migration")
      .send({
        accounts: [
          { id: "legacy-1", passwordSecret: clientSecret("new-1") },
          { id: "other-user-account", passwordSecret: clientSecret("new-2") }
        ]
      })
      .expect(404);

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("keeps the migration endpoint limited to client-encrypted secrets", async () => {
    await request(app)
      .post("/api/accounts/legacy-migration")
      .send({
        accounts: [{ id: "legacy-1", passwordSecret: "not-client-encrypted" }]
      })
      .expect(400);

    expect(mocks.prisma.account.findMany).not.toHaveBeenCalled();
  });
});
