import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { parseStringArray } from "../utils/json.js";

export const tagsRouter = Router();

tagsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sites = await prisma.site.findMany({
      where: { userId: req.authUser!.id },
      select: { tags: true }
    });

    const counts = new Map<string, number>();
    for (const site of sites) {
      for (const tag of parseStringArray(site.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const tags = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"))
      .slice(0, 12);

    res.json({ tags });
  })
);
