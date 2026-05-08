import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../http.js";

const dateSchema = z.string().transform((value, context) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "日期格式无效"
    });
    return z.NEVER;
  }
  return date;
});

const nullableDateSchema = dateSchema.nullable();

const userBackupSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable(),
  passwordHash: z.string().min(1),
  cryptoSalt: z.string().min(1),
  isAdmin: z.boolean(),
  tokenVersion: z.number().int().min(0).default(0),
  createdAt: dateSchema,
  updatedAt: dateSchema
});

const appSettingBackupSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  createdAt: dateSchema,
  updatedAt: dateSchema
});

const categoryBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().min(1),
  sortOrder: z.number().int(),
  createdAt: dateSchema,
  updatedAt: dateSchema
});

const siteBackupSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  name: z.string().min(1),
  primaryUrl: z.string().min(1),
  backupUrls: z.string(),
  iconType: z.string().min(1),
  iconValue: z.string().min(1),
  iconUrl: z.string().nullable().default(null),
  iconBg: z.string().min(1),
  iconColor: z.string().min(1),
  favorite: z.boolean(),
  sortOrder: z.number().int(),
  tags: z.string(),
  note: z.string().nullable(),
  lastUsedAt: nullableDateSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema
});

const accountBackupSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  siteId: z.string().min(1),
  label: z.string().min(1),
  username: z.string().min(1),
  passwordSecret: z.string().min(1),
  strength: z.string().min(1),
  favorite: z.boolean(),
  sortOrder: z.number().int(),
  lastUsedAt: nullableDateSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema
});

const backupSchema = z.object({
  kind: z.literal("password-tools-backup"),
  schemaVersion: z.literal(1),
  appVersion: z.string().optional(),
  exportedAt: dateSchema,
  encryption: z.object({
    mode: z.literal("server-aes-256-gcm"),
    requiresSameServerCryptoSecret: z.literal(true)
  }),
  tables: z.object({
    users: z.array(userBackupSchema),
    appSettings: z.array(appSettingBackupSchema),
    categories: z.array(categoryBackupSchema),
    sites: z.array(siteBackupSchema),
    accounts: z.array(accountBackupSchema)
  })
});

export type SystemBackup = z.input<typeof backupSchema>;
type ParsedSystemBackup = z.output<typeof backupSchema>;

function isoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new HttpError(400, `${label} 存在重复值：${value}`);
    }
    seen.add(value);
  }
}

function validateBackupRelations(backup: ParsedSystemBackup) {
  const userIds = new Set(backup.tables.users.map((user) => user.id));
  const categoryIds = new Set(backup.tables.categories.map((category) => category.id));
  const siteIds = new Set(backup.tables.sites.map((site) => site.id));
  const siteUserIds = new Map(backup.tables.sites.map((site) => [site.id, site.userId]));

  if (!backup.tables.users.some((user) => user.isAdmin)) {
    throw new HttpError(400, "备份中至少需要包含一个管理员账号");
  }

  assertUnique(backup.tables.users.map((user) => user.id), "用户 ID");
  assertUnique(backup.tables.users.map((user) => user.email), "用户邮箱");
  assertUnique(backup.tables.appSettings.map((setting) => setting.key), "设置项");
  assertUnique(backup.tables.categories.map((category) => category.id), "分类 ID");
  assertUnique(backup.tables.categories.map((category) => category.name), "分类名称");
  assertUnique(backup.tables.sites.map((site) => site.id), "网站 ID");
  assertUnique(backup.tables.accounts.map((account) => account.id), "账号 ID");

  for (const site of backup.tables.sites) {
    if (!userIds.has(site.userId)) {
      throw new HttpError(400, `网站 ${site.name} 引用了不存在的用户`);
    }
    if (site.categoryId && !categoryIds.has(site.categoryId)) {
      throw new HttpError(400, `网站 ${site.name} 引用了不存在的分类`);
    }
  }

  for (const account of backup.tables.accounts) {
    if (!userIds.has(account.userId)) {
      throw new HttpError(400, `账号 ${account.label} 引用了不存在的用户`);
    }
    if (!siteIds.has(account.siteId)) {
      throw new HttpError(400, `账号 ${account.label} 引用了不存在的网站`);
    }
    if (siteUserIds.get(account.siteId) !== account.userId) {
      throw new HttpError(400, `账号 ${account.label} 与所属网站的用户不一致`);
    }
  }
}

async function createManyIfNeeded<T>(
  createMany: (args: { data: T[] }) => Promise<unknown>,
  data: T[]
) {
  if (data.length === 0) return;
  await createMany({ data });
}

export async function exportSystemBackup() {
  const [users, appSettings, categories, sites, accounts] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" } }),
    prisma.appSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.site.findMany({ orderBy: { id: "asc" } }),
    prisma.account.findMany({ orderBy: { id: "asc" } })
  ]);

  return {
    kind: "password-tools-backup",
    schemaVersion: 1,
    appVersion: env.appVersion,
    exportedAt: new Date().toISOString(),
    encryption: {
      mode: "server-aes-256-gcm",
      requiresSameServerCryptoSecret: true
    },
    tables: {
      users: users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      })),
      appSettings: appSettings.map((setting) => ({
        ...setting,
        createdAt: setting.createdAt.toISOString(),
        updatedAt: setting.updatedAt.toISOString()
      })),
      categories: categories.map((category) => ({
        ...category,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString()
      })),
      sites: sites.map((site) => ({
        ...site,
        lastUsedAt: isoDate(site.lastUsedAt),
        createdAt: site.createdAt.toISOString(),
        updatedAt: site.updatedAt.toISOString()
      })),
      accounts: accounts.map((account) => ({
        ...account,
        lastUsedAt: isoDate(account.lastUsedAt),
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString()
      }))
    }
  } satisfies SystemBackup;
}

export async function importSystemBackup(input: unknown) {
  const backup = backupSchema.parse(input);
  validateBackupRelations(backup);

  await prisma.$transaction(async (transaction) => {
    await transaction.account.deleteMany();
    await transaction.site.deleteMany();
    await transaction.category.deleteMany();
    await transaction.appSetting.deleteMany();
    await transaction.user.deleteMany();

    await createManyIfNeeded((args) => transaction.user.createMany(args), backup.tables.users);
    await createManyIfNeeded(
      (args) => transaction.appSetting.createMany(args),
      backup.tables.appSettings
    );
    await createManyIfNeeded(
      (args) => transaction.category.createMany(args),
      backup.tables.categories
    );
    await createManyIfNeeded((args) => transaction.site.createMany(args), backup.tables.sites);
    await createManyIfNeeded(
      (args) => transaction.account.createMany(args),
      backup.tables.accounts
    );
  });

  return {
    users: backup.tables.users.length,
    appSettings: backup.tables.appSettings.length,
    categories: backup.tables.categories.length,
    sites: backup.tables.sites.length,
    accounts: backup.tables.accounts.length,
    importedAt: new Date().toISOString()
  };
}
