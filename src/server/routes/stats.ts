import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";

export const statsRouter = Router();

statsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authUser!.id;
    const [sites, accounts, favorites, weakAccounts, mediumAccounts, strongAccounts] = await Promise.all([
      prisma.site.count({ where: { userId } }),
      prisma.account.count({ where: { userId } }),
      prisma.site.count({ where: { userId, favorite: true } }),
      prisma.account.count({ where: { userId, strength: "weak" } }),
      prisma.account.count({ where: { userId, strength: "medium" } }),
      prisma.account.count({ where: { userId, strength: "strong" } })
    ]);

    res.json({
      stats: {
        sites,
        accounts,
        favorites,
        weakAccounts,
        mediumAccounts,
        strongAccounts
      }
    });
  })
);
