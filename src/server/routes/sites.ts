import type { Account, Category, Prisma, Site } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { resolveFavicons } from "../services/favicon.js";
import { decryptSecret } from "../utils/crypto.js";
import { parseStringArray, stringifyStringArray } from "../utils/json.js";
import { colorSchema } from "../utils/validation.js";
import { isClientEncryptedSecret } from "../utils/vaultSecret.js";

export const sitesRouter = Router();

const passwordSecretSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(isClientEncryptedSecret, "账号密码必须先在客户端加密");

const accountCreateSchema = z.object({
  label: z.string().trim().min(1).max(40),
  username: z.string().trim().min(1).max(120),
  passwordSecret: passwordSecretSchema,
  strength: z.enum(["weak", "medium", "strong"]).optional(),
  favorite: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(-999999).max(999999).default(0)
});

const iconUrlSchema = z
  .union([
    z.literal(""),
    z.null(),
    z
      .string()
      .trim()
      .max(900_000)
      .refine(
        (value) =>
          /^https?:\/\//i.test(value) ||
          /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i.test(value),
        "图标地址格式不正确"
      )
  ])
  .transform((value) => (value === "" ? null : value));

const siteCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  primaryUrl: z.string().trim().url(),
  backupUrls: z.array(z.string().trim().url()).default([]),
  categoryId: z.string().nullable().optional(),
  iconType: z.string().trim().min(1).max(24).default("letter"),
  iconValue: z.string().trim().min(1).max(8).default("S"),
  iconUrl: iconUrlSchema.default(null),
  iconBg: colorSchema.default("#2563eb"),
  iconColor: colorSchema.default("#ffffff"),
  favorite: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(-999999).max(999999).default(0),
  tags: z.array(z.string().trim().min(1).max(20)).default([]),
  note: z.string().trim().max(800).optional(),
  accounts: z.array(accountCreateSchema).default([])
});

const sitePatchSchema = siteCreateSchema.partial().omit({ accounts: true });

type SiteWithRelations = Site & {
  category: Category | null;
  accounts: Account[];
};

const siteListSelect = {
  id: true,
  name: true,
  primaryUrl: true,
  backupUrls: true,
  categoryId: true,
  category: true,
  iconType: true,
  iconValue: true,
  iconUrl: true,
  iconBg: true,
  iconColor: true,
  favorite: true,
  sortOrder: true,
  tags: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  _count: { select: { accounts: true } }
} satisfies Prisma.SiteSelect;

type SiteListItem = Prisma.SiteGetPayload<{ select: typeof siteListSelect }>;

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

function serializeSiteSummary(site: SiteListItem) {
  return {
    id: site.id,
    name: site.name,
    primaryUrl: site.primaryUrl,
    backupUrls: parseStringArray(site.backupUrls),
    categoryId: site.categoryId,
    category: site.category,
    iconType: site.iconType,
    iconValue: site.iconValue,
    iconUrl: site.iconUrl,
    iconBg: site.iconBg,
    iconColor: site.iconColor,
    favorite: site.favorite,
    sortOrder: site.sortOrder,
    tags: parseStringArray(site.tags),
    note: site.note ?? "",
    accountCount: site._count.accounts,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    lastUsedAt: site.lastUsedAt
  };
}

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
    iconUrl: site.iconUrl,
    iconBg: site.iconBg,
    iconColor: site.iconColor,
    favorite: site.favorite,
    sortOrder: site.sortOrder,
    tags: parseStringArray(site.tags),
    note: site.note ?? "",
    accountCount: site.accounts.length,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    lastUsedAt: site.lastUsedAt,
    accounts: userSalt
      ? site.accounts.map((account) => serializeAccount(account, userSalt))
      : undefined
  };
}

function buildSiteListSearchWhere(search: string): Prisma.SiteWhereInput | undefined {
  if (!search) return undefined;

  return {
    OR: [
      { name: { contains: search } },
      { primaryUrl: { contains: search } },
      { note: { contains: search } },
      { tags: { contains: search } },
      {
        accounts: {
          some: {
            OR: [
              { label: { contains: search } },
              { username: { contains: search } }
            ]
          }
        }
      }
    ]
  };
}

function buildSiteListWhere(input: {
  userId: string;
  search: string;
  categoryId: string;
  tag: string;
  favoriteOnly: boolean;
  scope: string;
}): Prisma.SiteWhereInput {
  const and: Prisma.SiteWhereInput[] = [];

  if (input.scope === "recent") {
    and.push({ lastUsedAt: { not: null } });
  }

  if (input.tag) {
    and.push({ tags: { contains: JSON.stringify(input.tag) } });
  }

  const searchWhere = buildSiteListSearchWhere(input.search);
  if (searchWhere) {
    and.push(searchWhere);
  }

  return {
    userId: input.userId,
    ...(input.categoryId && input.categoryId !== "all" ? { categoryId: input.categoryId } : {}),
    ...(input.favoriteOnly ? { favorite: true } : {}),
    ...(and.length ? { AND: and } : {})
  };
}

function buildSiteListOrderBy(sort: string, scope: string): Prisma.SiteOrderByWithRelationInput[] {
  if (sort === "name") {
    return [{ name: "asc" }, { sortOrder: "desc" }, { updatedAt: "desc" }];
  }

  if (sort === "accounts") {
    return [{ accounts: { _count: "desc" } }, { name: "asc" }, { sortOrder: "desc" }, { updatedAt: "desc" }];
  }

  if (sort === "recent" || scope === "recent") {
    return [{ lastUsedAt: "desc" }, { sortOrder: "desc" }, { updatedAt: "desc" }];
  }

  return [{ sortOrder: "desc" }, { updatedAt: "desc" }];
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
    const sort = String(req.query.sort ?? "sort");

    const sites = await prisma.site.findMany({
      where: buildSiteListWhere({
        userId,
        search,
        categoryId,
        tag,
        favoriteOnly,
        scope
      }),
      select: siteListSelect,
      orderBy: buildSiteListOrderBy(sort, scope)
    });

    res.json({
      sites: sites.map((site) => serializeSiteSummary(site))
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
        iconUrl: input.iconUrl,
        iconBg: input.iconBg,
        iconColor: input.iconColor,
        favorite: input.favorite,
        sortOrder: input.sortOrder,
        tags: stringifyStringArray(input.tags),
        note: input.note,
        accounts: {
          create: input.accounts.map((account) => ({
            userId: user.id,
            label: account.label,
            username: account.username,
            passwordSecret: account.passwordSecret,
            strength: account.strength ?? "weak",
            favorite: account.favorite ?? false,
            sortOrder: account.sortOrder
          }))
        }
      },
      include: { category: true, accounts: true }
    });

    res.status(201).json({ site: serializeSite(site, user.cryptoSalt) });
  })
);

sitesRouter.get(
  "/favicon",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = z.object({ url: z.string().trim().min(1).max(2048) }).parse(req.query);
    const icons = await resolveFavicons(input.url);
    res.json({ favicon: icons[0], icons });
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
        accounts: { orderBy: [{ sortOrder: "desc" }, { updatedAt: "desc" }] }
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
        iconUrl: input.iconUrl,
        iconBg: input.iconBg,
        iconColor: input.iconColor,
        favorite: input.favorite,
        sortOrder: input.sortOrder,
        tags: stringifyStringArray(input.tags),
        note: input.note
      },
      include: {
        category: true,
        accounts: { orderBy: [{ sortOrder: "desc" }, { updatedAt: "desc" }] }
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
        passwordSecret: input.passwordSecret,
        strength: input.strength ?? "weak",
        favorite: input.favorite ?? false,
        sortOrder: input.sortOrder
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
        password: "",
        passwordSecret: account.passwordSecret,
        encryptionVersion: "client-v1",
        strength: account.strength,
        favorite: account.favorite,
        sortOrder: account.sortOrder,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastUsedAt: account.lastUsedAt
      }
    });
  })
);
