import type { Account } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { decryptSecret } from "../utils/crypto.js";
import { isClientEncryptedSecret } from "../utils/vaultSecret.js";

export const accountsRouter = Router();

const passwordSecretSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(isClientEncryptedSecret, "账号密码必须先在客户端加密");

const accountPatchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  username: z.string().trim().min(1).max(120).optional(),
  passwordSecret: passwordSecretSchema.optional(),
  strength: z.enum(["weak", "medium", "strong"]).optional(),
  favorite: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(-999999).max(999999).optional()
});

const legacyMigrationSchema = z.object({
  accounts: z
    .array(
      z.object({
        id: z.string().min(1),
        passwordSecret: passwordSecretSchema
      })
    )
    .max(1000)
    .refine((accounts) => new Set(accounts.map((account) => account.id)).size === accounts.length, "Duplicate accounts")
});

function serializeAccount(account: Account, userSalt: string) {
  const clientEncrypted = isClientEncryptedSecret(account.passwordSecret);
  let legacyPassword: string | undefined;
  let decryptError: string | undefined;

  if (!clientEncrypted) {
    try {
      legacyPassword = decryptSecret(account.passwordSecret, userSalt);
    } catch {
      decryptError = "旧账号密码无法用当前服务器密钥解密";
    }
  }

  return {
    id: account.id,
    siteId: account.siteId,
    label: account.label,
    username: account.username,
    password: legacyPassword ?? "",
    passwordSecret: account.passwordSecret,
    legacyPassword,
    encryptionVersion: clientEncrypted ? "client-v1" : "legacy-server",
    decryptError,
    strength: account.strength,
    favorite: account.favorite,
    sortOrder: account.sortOrder,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastUsedAt: account.lastUsedAt
  };
}

accountsRouter.get(
  "/vault-rotation",
  requireAuth,
  asyncHandler(async (req, res) => {
    const accounts = await prisma.account.findMany({
      where: { userId: req.authUser!.id },
      select: {
        id: true,
        passwordSecret: true
      },
      orderBy: { id: "asc" }
    });

    res.json({
      accounts: accounts.filter((account) => isClientEncryptedSecret(account.passwordSecret))
    });
  })
);

accountsRouter.get(
  "/legacy-migration",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.authUser!;
    const accounts = await prisma.account.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        passwordSecret: true
      },
      orderBy: { id: "asc" }
    });

    const legacyAccounts = accounts.flatMap((account) => {
      if (isClientEncryptedSecret(account.passwordSecret)) return [];

      try {
        const legacyPassword = decryptSecret(account.passwordSecret, user.cryptoSalt);
        return legacyPassword ? [{ id: account.id, legacyPassword }] : [];
      } catch {
        return [];
      }
    });

    res.json({ accounts: legacyAccounts });
  })
);

accountsRouter.post(
  "/legacy-migration",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = legacyMigrationSchema.parse(req.body);
    const userId = req.authUser!.id;

    if (input.accounts.length === 0) {
      res.json({ migrated: 0 });
      return;
    }

    const migrationById = new Map(input.accounts.map((account) => [account.id, account.passwordSecret]));
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: input.accounts.map((account) => account.id) },
        userId
      },
      select: {
        id: true,
        siteId: true,
        passwordSecret: true
      }
    });

    if (accounts.length !== input.accounts.length) {
      throw new HttpError(404, "Account not found");
    }

    const legacyAccounts = accounts.filter((account) => !isClientEncryptedSecret(account.passwordSecret));

    if (legacyAccounts.length > 0) {
      const siteIds = [...new Set(legacyAccounts.map((account) => account.siteId))];
      const updatedAt = new Date();

      await prisma.$transaction(async (transaction) => {
        await Promise.all(
          legacyAccounts.map((account) =>
            transaction.account.update({
              where: { id: account.id },
              data: { passwordSecret: migrationById.get(account.id)! }
            })
          )
        );

        await transaction.site.updateMany({
          where: {
            id: { in: siteIds },
            userId
          },
          data: { updatedAt }
        });
      });
    }

    res.json({ migrated: legacyAccounts.length });
  })
);

accountsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = accountPatchSchema.parse(req.body);
    const user = req.authUser!;
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: user.id }
    });

    if (!account) {
      throw new HttpError(404, "账号不存在");
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const updatedAccount = await transaction.account.update({
        where: { id: account.id },
        data: {
          label: input.label,
          username: input.username,
          favorite: input.favorite,
          sortOrder: input.sortOrder,
          passwordSecret: input.passwordSecret,
          strength: input.strength
        }
      });
      await transaction.site.update({
        where: { id: account.siteId },
        data: { updatedAt: new Date() }
      });
      return updatedAccount;
    });

    res.json({ account: serializeAccount(updated, user.cryptoSalt) });
  })
);

accountsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authUser!.id;
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!account) {
      throw new HttpError(404, "账号不存在");
    }

    await prisma.$transaction([
      prisma.account.delete({ where: { id: account.id } }),
      prisma.site.update({
        where: { id: account.siteId },
        data: { updatedAt: new Date() }
      })
    ]);
    res.status(204).end();
  })
);
