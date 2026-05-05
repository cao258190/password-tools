import { mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const defaultCategories = [
  { name: "全部", color: "#3b82f6", icon: "sparkles", sortOrder: 0 },
  { name: "社交媒体", color: "#ec4899", icon: "heart", sortOrder: 1 },
  { name: "工作", color: "#8b5cf6", icon: "briefcase", sortOrder: 2 },
  { name: "AI中转站", color: "#38bdf8", icon: "bot", sortOrder: 3 },
  { name: "金融理财", color: "#22c55e", icon: "wallet", sortOrder: 4 },
  { name: "购物", color: "#f59e0b", icon: "shopping", sortOrder: 5 },
  { name: "娱乐", color: "#ef4444", icon: "play", sortOrder: 6 },
  { name: "工具", color: "#06b6d4", icon: "tool", sortOrder: 7 },
  { name: "教育", color: "#10b981", icon: "book", sortOrder: 8 },
  { name: "生活", color: "#a855f7", icon: "home", sortOrder: 9 }
];

const reset = process.argv.includes("--reset");
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123456";
const registrationEnabledByDefault = process.env.REGISTRATION_ENABLED === "true";

if (!databaseUrl.startsWith("file:")) {
  throw new Error("scripts/init-db.mjs only supports SQLite file: DATABASE_URL values.");
}

const rawPath = databaseUrl.replace(/^file:/, "");
const dbPath = resolve("prisma", rawPath);

if (reset) {
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-journal`, { force: true });
}

mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT NOT NULL,
  "cryptoSalt" TEXT NOT NULL,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "color" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Site" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "primaryUrl" TEXT NOT NULL,
  "backupUrls" TEXT NOT NULL DEFAULT '[]',
  "iconType" TEXT NOT NULL DEFAULT 'letter',
  "iconValue" TEXT NOT NULL DEFAULT 'S',
  "iconBg" TEXT NOT NULL DEFAULT '#2563eb',
  "iconColor" TEXT NOT NULL DEFAULT '#ffffff',
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "lastUsedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Site_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordSecret" TEXT NOT NULL,
  "strength" TEXT NOT NULL DEFAULT 'weak',
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "lastUsedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Account_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "Site_userId_idx" ON "Site"("userId");
CREATE INDEX IF NOT EXISTS "Site_categoryId_idx" ON "Site"("categoryId");
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Account_siteId_idx" ON "Account"("siteId");
`);

const userColumns = db
  .prepare(`PRAGMA table_info("User")`)
  .all()
  .map((column) => column.name);
if (!userColumns.includes("isAdmin")) {
  db.exec(`ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;`);
}

const siteColumns = db
  .prepare(`PRAGMA table_info("Site")`)
  .all()
  .map((column) => column.name);
if (!siteColumns.includes("iconColor")) {
  db.exec(`ALTER TABLE "Site" ADD COLUMN "iconColor" TEXT NOT NULL DEFAULT '#ffffff';`);
  db.exec(`
UPDATE "Site"
SET "iconColor" = CASE
  WHEN lower("iconBg") IN ('#ffffff', '#fff', 'white') THEN '#111827'
  ELSE '#ffffff'
END
`);
}

const categoryColumns = db
  .prepare(`PRAGMA table_info("Category")`)
  .all()
  .map((column) => column.name);

if (categoryColumns.includes("userId")) {
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec(`
CREATE TABLE "Category_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "color" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
`);

    const categories = db
      .prepare(
        `SELECT "id", "name", "color", "icon", "sortOrder", "createdAt", "updatedAt"
         FROM "Category"
         ORDER BY "sortOrder" ASC, "createdAt" ASC`
      )
      .all();
    const canonicalByName = new Map();
    const insertCategory = db.prepare(`
INSERT INTO "Category_new" ("id", "name", "color", "icon", "sortOrder", "createdAt", "updatedAt")
VALUES (?, ?, ?, ?, ?, ?, ?)
`);
    const updateSiteCategory = db.prepare(
      `UPDATE "Site" SET "categoryId" = ? WHERE "categoryId" = ?`
    );

    for (const category of categories) {
      if (!canonicalByName.has(category.name)) {
        canonicalByName.set(category.name, category.id);
        insertCategory.run(
          category.id,
          category.name,
          category.color,
          category.icon,
          category.sortOrder,
          category.createdAt,
          category.updatedAt
        );
      } else {
        updateSiteCategory.run(canonicalByName.get(category.name), category.id);
      }
    }

    db.exec(`
DROP TABLE "Category";
ALTER TABLE "Category_new" RENAME TO "Category";
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");
`);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

const legacyCategoryIndex = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'Category_userId_name_key'`
  )
  .get();
if (legacyCategoryIndex) {
  db.exec(`DROP INDEX "Category_userId_name_key";`);
}

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");`);

const now = new Date().toISOString();
const upsertCategory = db.prepare(`
INSERT INTO "Category" ("id", "name", "color", "icon", "sortOrder", "createdAt", "updatedAt")
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT("name") DO UPDATE SET
  "color" = excluded."color",
  "icon" = excluded."icon",
  "sortOrder" = excluded."sortOrder",
  "updatedAt" = excluded."updatedAt"
`);

for (const category of defaultCategories) {
  upsertCategory.run(
    `category-${category.sortOrder}`,
    category.name,
    category.color,
    category.icon,
    category.sortOrder,
    now,
    now
  );
}

const insertSetting = db.prepare(`
INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (?, ?, ?, ?)
ON CONFLICT("key") DO NOTHING
`);
insertSetting.run(
  "registrationEnabled",
  String(registrationEnabledByDefault),
  now,
  now
);

const existingAdmin = db
  .prepare(`SELECT "id", "isAdmin", "passwordHash" FROM "User" WHERE "email" = ?`)
  .get(adminEmail);
if (!existingAdmin) {
  db.prepare(`
INSERT INTO "User" ("id", "email", "name", "passwordHash", "cryptoSalt", "isAdmin", "createdAt", "updatedAt")
VALUES (?, ?, ?, ?, ?, true, ?, ?)
`).run(
    `admin-${randomBytes(8).toString("hex")}`,
    adminEmail,
    "Admin",
    await bcrypt.hash(adminPassword, 12),
    randomBytes(16).toString("hex"),
    now,
    now
  );
} else {
  const shouldPromoteAdmin = !existingAdmin.isAdmin;
  const shouldReplaceDefaultPassword =
    adminPassword !== defaultAdminPassword &&
    (await bcrypt.compare(defaultAdminPassword, existingAdmin.passwordHash));

  if (shouldPromoteAdmin || shouldReplaceDefaultPassword) {
    const passwordHash = shouldReplaceDefaultPassword
      ? await bcrypt.hash(adminPassword, 12)
      : existingAdmin.passwordHash;
    db.prepare(
      `UPDATE "User" SET "isAdmin" = true, "passwordHash" = ?, "updatedAt" = ? WHERE "id" = ?`
    ).run(passwordHash, now, existingAdmin.id);
  }
}

db.close();

console.log(`SQLite schema ready at ${dbPath}`);
