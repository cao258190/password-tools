import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db";
import { demoSites, demoUser } from "../src/server/services/demoData";
import { setRegistrationEnabled } from "../src/server/services/bootstrap";
import { ensureDefaultCategories } from "../src/server/services/defaults";
import { createUserSalt, encryptSecret } from "../src/server/utils/crypto";
import { evaluateStrength } from "../src/server/utils/password";

async function main() {
  await prisma.account.deleteMany();
  await prisma.site.deleteMany();
  await prisma.category.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();

  const cryptoSalt = createUserSalt();
  const user = await prisma.user.create({
    data: {
      email: demoUser.email,
      name: demoUser.name,
      passwordHash: await bcrypt.hash(demoUser.password, 12),
      cryptoSalt,
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
        tags: JSON.stringify(site.tags),
        note: site.note,
        lastUsedAt: new Date(now - index * 60 * 60 * 1000)
      }
    });

    for (const account of site.accounts) {
      await prisma.account.create({
        data: {
          userId: user.id,
          siteId: created.id,
          label: account.label,
          username: account.username,
          passwordSecret: encryptSecret(account.password, cryptoSalt),
          strength: account.strength ?? evaluateStrength(account.password),
          favorite: account.favorite,
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
