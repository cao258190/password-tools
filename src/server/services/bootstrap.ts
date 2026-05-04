import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { createUserSalt } from "../utils/crypto.js";
import { ensureDefaultCategories } from "./defaults.js";

export const settingKeys = {
  registrationEnabled: "registrationEnabled"
} as const;

export async function getRegistrationEnabled() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: settingKeys.registrationEnabled }
  });
  return setting?.value === "true";
}

export async function setRegistrationEnabled(enabled: boolean) {
  return prisma.appSetting.upsert({
    where: { key: settingKeys.registrationEnabled },
    update: { value: String(enabled) },
    create: {
      key: settingKeys.registrationEnabled,
      value: String(enabled)
    }
  });
}

export async function ensureDefaultAdmin() {
  const admin = await prisma.user.findUnique({
    where: { email: env.adminEmail },
    select: { id: true, isAdmin: true }
  });

  if (!admin) {
    await prisma.user.create({
      data: {
        email: env.adminEmail,
        name: "Admin",
        passwordHash: await bcrypt.hash(env.adminPassword, 12),
        cryptoSalt: createUserSalt(),
        isAdmin: true
      }
    });
    return;
  }

  if (!admin.isAdmin) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { isAdmin: true }
    });
  }
}

export async function bootstrapSystem() {
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

  await prisma.appSetting.upsert({
    where: { key: settingKeys.registrationEnabled },
    update: {},
    create: {
      key: settingKeys.registrationEnabled,
      value: String(env.registrationEnabledByDefault)
    }
  });

  await ensureDefaultAdmin();
}
