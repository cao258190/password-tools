import bcrypt from "bcryptjs";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { prisma } from "../src/server/db";
import { demoSites, demoUser } from "../src/server/services/demoData";
import { setRegistrationEnabled } from "../src/server/services/bootstrap";
import { ensureDefaultCategories } from "../src/server/services/defaults";
import { createUserSalt } from "../src/server/utils/crypto";
import { evaluateStrength } from "../src/server/utils/password";

const clientSecretPrefix = "vault:v1";
const vaultVerifierPlainText = "password-tools:vault-verifier:v1";
const vaultKdfIterations = 310_000;

function hexToBytes(value: string) {
  return Buffer.from(value, "hex");
}

function deriveVaultKey(masterPassword: string, salt: string) {
  return pbkdf2Sync(masterPassword, hexToBytes(salt), vaultKdfIterations, 32, "sha256");
}

function encryptClientSecret(plainText: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return `${clientSecretPrefix}:${iv.toString("base64url")}:${encrypted.toString("base64url")}`;
}

async function main() {
  await prisma.account.deleteMany();
  await prisma.site.deleteMany();
  await prisma.category.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();

  const cryptoSalt = createUserSalt();
  const vaultKey = deriveVaultKey(demoUser.password, cryptoSalt);
  const user = await prisma.user.create({
    data: {
      email: demoUser.email,
      name: demoUser.name,
      passwordHash: await bcrypt.hash(demoUser.password, 12),
      cryptoSalt,
      vaultVerifier: encryptClientSecret(vaultVerifierPlainText, vaultKey),
      vaultKdfIterations,
      isAdmin: true
    }
  });

  await setRegistrationEnabled(true);

  await ensureDefaultCategories((category) =>
    prisma.category.upsert({
      where: { name: category.name },
      update: {
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder
      },
      create: { ...category }
    })
  );
  const categories = await prisma.category.findMany();
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));

  const now = Date.now();

  for (const [index, site] of demoSites.entries()) {
    const created = await prisma.site.create({
      data: {
        userId: user.id,
        categoryId: categoryByName.get(site.category),
        name: site.name,
        primaryUrl: site.primaryUrl,
        backupUrls: JSON.stringify(site.backupUrls),
        iconType: site.iconType,
        iconValue: site.iconValue,
        iconBg: site.iconBg,
        iconColor: site.iconColor,
        favorite: site.favorite,
        sortOrder: demoSites.length - index,
        tags: JSON.stringify(site.tags),
        note: site.note,
        lastUsedAt: new Date(now - index * 60 * 60 * 1000)
      }
    });

    for (const [accountIndex, account] of site.accounts.entries()) {
      await prisma.account.create({
        data: {
          userId: user.id,
          siteId: created.id,
          label: account.label,
          username: account.username,
          passwordSecret: encryptClientSecret(account.password, vaultKey),
          strength: account.strength ?? evaluateStrength(account.password),
          favorite: account.favorite,
          sortOrder: site.accounts.length - accountIndex,
          lastUsedAt: new Date(now - index * 60 * 60 * 1000)
        }
      });
    }
  }

  console.log(`Seeded demo vault for ${demoUser.email} / ${demoUser.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
