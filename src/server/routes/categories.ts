import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";

export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authUser!.id;
    const [categories, totalSites, groupedCounts] = await Promise.all([
      prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      prisma.site.count({ where: { userId } }),
      prisma.site.groupBy({
        by: ["categoryId"],
        where: {
          userId,
          categoryId: { not: null }
        },
        _count: { _all: true }
      })
    ]);
    const countByCategory = new Map(
      groupedCounts.map((item) => [item.categoryId, item._count._all])
    );

    res.json({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder,
        count: category.name === "全部" ? totalSites : countByCategory.get(category.id) ?? 0
      }))
    });
  })
);
