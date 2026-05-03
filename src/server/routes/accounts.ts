import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { encryptSecret } from "../utils/crypto.js";
import { evaluateStrength } from "../utils/password.js";

export const accountsRouter = Router();

const accountPatchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  username: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(1).max(256).optional(),
  strength: z.enum(["weak", "medium", "strong"]).optional(),
  favorite: z.boolean().optional()
});

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

    const updated = await prisma.account.update({
      where: { id: account.id },
      data: {
        label: input.label,
        username: input.username,
        favorite: input.favorite,
        passwordSecret: input.password
          ? encryptSecret(input.password, user.cryptoSalt)
          : undefined,
        strength: input.password
          ? input.strength ?? evaluateStrength(input.password)
          : input.strength
      }
    });

    res.json({ account: updated });
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

    await prisma.account.delete({ where: { id: account.id } });
    res.status(204).end();
  })
);
