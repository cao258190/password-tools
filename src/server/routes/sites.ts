import type { Account, Category, Site } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";
import { parseStringArray, stringifyStringArray } from "../utils/json.js";
import { evaluateStrength } from "../utils/password.js";
import { colorSchema } from "../utils/validation.js";

export const sitesRouter = Router();

const accountCreateSchema = z.object({
  label: z.string().trim().min(1).max(40),
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
  strength: z.enum(["weak", "medium", "strong"]).optional(),
  favorite: z.boolean().optional()
});

const siteCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  primaryUrl: z.string().trim().url(),
  backupUrls: z.array(z.string().trim().url()).default([]),
  categoryId: z.string().nullable().optional(),
  iconType: z.string().trim().min(1).max(24).default("letter"),
  iconValue: z.string().trim().min(1).max(8).default("S"),
  iconBg: colorSchema.default("#2563eb"),
  iconColor: colorSchema.default("#ffffff"),
  favorite: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(20)).default([]),
  note: z.string().trim().max(800).optional(),
  accounts: z.array(accountCreateSchema).default([])
});

const sitePatchSchema = siteCreateSchema.partial().omit({ accounts: true });

type SiteWithRelations = Site & {
  category: Category | null;
  accounts: Account[];
};

function serializeSite(site: SiteWithRelations, userSalt?: string) {
  return {
    id: site.id,
    name: site.name,
    primaryUrl: site.primaryUrl,
    backupUrls: parseStringArray(site.backupUrls),
    categoryId: site.categoryId,
    category: site.category,
    iconType: site.iconType,
    iconValue: site.iconValue,
    iconBg: site.iconBg,
    iconColor: site.iconColor,
    favorite: site.favorite,
    tags: parseStringArray(site.tags),
    note: site.note ?? "",
    accountCount: site.accounts.length,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    lastUsedAt: site.lastUsedAt,
    accounts: userSalt
      ? site.accounts.map((account) => ({
          id: account.id,
          siteId: account.siteId,
          label: account.label,
          username: account.username,
          password: decryptSecret(account.passwordSecret, userSalt),
          strength: account.strength,
          favorite: account.favorite,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          lastUsedAt: account.lastUsedAt
        }))
      : undefined
  };
}

function matchesSearch(site: SiteWithRelations, search: string) {
  if (!search) return true;
  const haystack = [
    site.name,
    site.primaryUrl,
    site.note ?? "",
    ...parseStringArray(site.tags),
    ...site.accounts.flatMap((account) => [account.label, account.username])
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

sitesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authUser!.id;
    const search = String(req.query.search ?? "").trim();
    const categoryId = String(req.query.category ?? "").trim();
    const tag = String(req.query.tag ?? "").trim();
    const favoriteOnly = String(req.query.favorite ?? "") === "true" || req.query.scope === "favorites";
    const scope = String(req.query.scope ?? "all");
    const sort = String(req.query.sort ?? "recent");

    const sites = await prisma.site.findMany({
      where: {
        userId,
        ...(categoryId && categoryId !== "all" ? { categoryId } : {}),
        ...(favoriteOnly ? { favorite: true } : {})
      },
      include: {
        category: true,
        accounts: { orderBy: { updatedAt: "desc" } }
      },
      orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }]
    });

    const filtered = sites.filter((site) => {
      const tagMatch = !tag || parseStringArray(site.tags).includes(tag);
      const recentMatch = scope !== "recent" || Boolean(site.lastUsedAt);
      return tagMatch && recentMatch && matchesSearch(site, search);
    });

    filtered.sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "accounts") return right.accounts.length - left.accounts.length || left.name.localeCompare(right.name);
      if (scope === "recent") {
        return (right.lastUsedAt?.getTime() ?? 0) - (left.lastUsedAt?.getTime() ?? 0);
      }
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });

    res.json({
      sites: filtered.map((site) => {
        const { accounts: _accounts, ...summary } = serializeSite(site);
        return summary;
      })
    });
  })
);

sitesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = siteCreateSchema.parse(req.body);
    const user = req.authUser!;

    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new HttpError(400, "分类不存在");
    }

    const site = await prisma.site.create({
      data: {
        userId: user.id,
        categoryId: input.categoryId,
        name: input.name,
        primaryUrl: input.primaryUrl,
        backupUrls: stringifyStringArray(input.backupUrls),
        iconType: input.iconType,
        iconValue: input.iconValue,
        iconBg: input.iconBg,
        iconColor: input.iconColor,
        favorite: input.favorite,
        tags: stringifyStringArray(input.tags),
        note: input.note,
        accounts: {
          create: input.accounts.map((account) => ({
            userId: user.id,
            label: account.label,
            username: account.username,
            passwordSecret: encryptSecret(account.password, user.cryptoSalt),
            strength: account.strength ?? evaluateStrength(account.password),
            favorite: account.favorite ?? false
          }))
        }
      },
      include: { category: true, accounts: true }
    });

    res.status(201).json({ site: serializeSite(site, user.cryptoSalt) });
  })
);

sitesRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.authUser!;
    const site = await prisma.site.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: {
        category: true,
        accounts: { orderBy: { updatedAt: "desc" } }
      }
    });

    if (!site) {
      throw new HttpError(404, "网站不存在");
    }

    const viewedAt = new Date();
    await prisma.$executeRaw`UPDATE "Site" SET "lastUsedAt" = ${viewedAt} WHERE "id" = ${site.id}`;

    res.json({ site: serializeSite({ ...site, lastUsedAt: viewedAt }, user.cryptoSalt) });
  })
);

sitesRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = sitePatchSchema.parse(req.body);
    const user = req.authUser!;
    const site = await prisma.site.findFirst({
      where: { id: req.params.id, userId: user.id }
    });

    if (!site) {
      throw new HttpError(404, "网站不存在");
    }

    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new HttpError(400, "分类不存在");
    }

    const updated = await prisma.site.update({
      where: { id: site.id },
      data: {
        name: input.name,
        primaryUrl: input.primaryUrl,
        backupUrls: stringifyStringArray(input.backupUrls),
        categoryId: input.categoryId,
        iconType: input.iconType,
        iconValue: input.iconValue,
        iconBg: input.iconBg,
        iconColor: input.iconColor,
        favorite: input.favorite,
        tags: stringifyStringArray(input.tags),
        note: input.note
      },
      include: {
        category: true,
        accounts: { orderBy: { updatedAt: "desc" } }
      }
    });

    res.json({ site: serializeSite(updated, user.cryptoSalt) });
  })
);

sitesRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authUser!.id;
    const site = await prisma.site.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!site) {
      throw new HttpError(404, "网站不存在");
    }

    await prisma.site.delete({ where: { id: site.id } });
    res.status(204).end();
  })
);

sitesRouter.post(
  "/:id/accounts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = accountCreateSchema.parse(req.body);
    const user = req.authUser!;
    const site = await prisma.site.findFirst({
      where: { id: req.params.id, userId: user.id }
    });

    if (!site) {
      throw new HttpError(404, "网站不存在");
    }

    const account = await prisma.account.create({
      data: {
        userId: user.id,
        siteId: site.id,
        label: input.label,
        username: input.username,
        passwordSecret: encryptSecret(input.password, user.cryptoSalt),
        strength: input.strength ?? evaluateStrength(input.password),
        favorite: input.favorite ?? false
      }
    });

    await prisma.site.update({
      where: { id: site.id },
      data: { updatedAt: new Date() }
    });

    res.status(201).json({
      account: {
        id: account.id,
        siteId: account.siteId,
        label: account.label,
        username: account.username,
        password: input.password,
        strength: account.strength,
        favorite: account.favorite,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastUsedAt: account.lastUsedAt
      }
    });
  })
);
