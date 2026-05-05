import type { Account } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";
import { evaluateStrength } from "../utils/password.js";

export const accountsRouter = Router();

const accountPatchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  username: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(1).max(256).optional(),
  strength: z.enum(["weak", "medium", "strong"]).optional(),
  favorite: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(-999999).max(999999).optional()
});

function serializeAccount(account: Account, userSalt: string) {
  return {
    id: account.id,
    siteId: account.siteId,
    label: account.label,
    username: account.username,
    password: decryptSecret(account.passwordSecret, userSalt),
    strength: account.strength,
    favorite: account.favorite,
    sortOrder: account.sortOrder,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastUsedAt: account.lastUsedAt
  };
}

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
          passwordSecret: input.password
            ? encryptSecret(input.password, user.cryptoSalt)
            : undefined,
          strength: input.password
            ? input.strength ?? evaluateStrength(input.password)
            : input.strength
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
