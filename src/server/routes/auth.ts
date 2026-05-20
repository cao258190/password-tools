import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { clearAuthCookie, publicUser, requireAuth, setAuthCookie } from "../middleware/auth.js";
import {
  assertRateLimitAvailable,
  rateLimit,
  recordRateLimitAttempt,
  resetRateLimit
} from "../middleware/security.js";
import { getRegistrationEnabled } from "../services/bootstrap.js";
import { createUserSalt } from "../utils/crypto.js";
import { isClientEncryptedSecret } from "../utils/vaultSecret.js";

export const authRouter = Router();

const authSchema = z.object({
  email: z.string().email("请输入有效邮箱").transform((email) => email.toLowerCase()),
  password: z.string().min(8, "密码至少 8 位"),
  name: z.string().trim().max(24).optional()
});

const profileSchema = z.object({
  email: z.string().email("请输入有效邮箱").transform((email) => email.toLowerCase()),
  name: z.string().trim().max(24).optional()
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z.string().min(8, "新密码至少 8 位")
});

const vaultSchema = z.object({
  vaultVerifier: z
    .string()
    .min(1, "请设置保险库主密码")
    .max(4096)
    .refine(isClientEncryptedSecret, "保险库验证器必须先在客户端加密")
});

const vaultPasswordSchema = vaultSchema.extend({
  accounts: z
    .array(
      z.object({
        id: z.string().min(1),
        passwordSecret: z
          .string()
          .min(1)
          .max(4096)
          .refine(isClientEncryptedSecret, "账号密码必须先在客户端加密")
      })
    )
    .max(5000)
    .refine((accounts) => new Set(accounts.map((account) => account.id)).size === accounts.length, "Duplicate accounts")
});

const registerRateLimit = {
  keyPrefix: "register",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "注册尝试过于频繁，请稍后再试"
};

const loginRateLimit = {
  keyPrefix: "login",
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "登录尝试过于频繁，请 15 分钟后再试"
};

const userSelect = {
  id: true,
  email: true,
  name: true,
  cryptoSalt: true,
  vaultVerifier: true,
  vaultKdfIterations: true,
  isAdmin: true,
  tokenVersion: true
} as const;

authRouter.post(
  "/register",
  rateLimit(registerRateLimit),
  asyncHandler(async (req, res) => {
    const input = authSchema.parse(req.body);
    const registrationEnabled = await getRegistrationEnabled();
    if (!registrationEnabled) {
      throw new HttpError(403, "管理员已关闭新用户注册");
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new HttpError(409, "该邮箱已注册");
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name || input.email.slice(0, 1).toUpperCase(),
        passwordHash: await bcrypt.hash(input.password, 12),
        cryptoSalt: createUserSalt()
      },
      select: userSelect
    });

    setAuthCookie(res, user.id, user.tokenVersion);
    res.status(201).json({ user: publicUser(user) });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = authSchema.pick({ email: true, password: true }).parse(req.body);
    req.body.email = input.email;
    assertRateLimitAvailable(req, loginRateLimit);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      recordRateLimitAttempt(req, loginRateLimit);
      throw new HttpError(401, "邮箱或密码不正确");
    }

    resetRateLimit(req, loginRateLimit);
    setAuthCookie(res, user.id, user.tokenVersion);
    res.json({
      user: publicUser({
        id: user.id,
        email: user.email,
        name: user.name,
        cryptoSalt: user.cryptoSalt,
        vaultVerifier: user.vaultVerifier,
        vaultKdfIterations: user.vaultKdfIterations,
        isAdmin: user.isAdmin,
        tokenVersion: user.tokenVersion
      })
    });
  })
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.authUser!) });
  })
);

authRouter.patch(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = profileSchema.parse(req.body);
    const userId = req.authUser!.id;
    const emailOwner = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true }
    });

    if (emailOwner && emailOwner.id !== userId) {
      throw new HttpError(409, "该邮箱已被使用");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: input.email,
        name: input.name || null
      },
      select: userSelect
    });

    res.json({ user: publicUser(user) });
  })
);

authRouter.patch(
  "/vault/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = vaultPasswordSchema.parse(req.body);
    const userId = req.authUser!.id;
    const accountIds = input.accounts.map((account) => account.id);
    const accountSecrets = new Map(input.accounts.map((account) => [account.id, account.passwordSecret]));

    const [allAccountCount, matchedAccounts] = await Promise.all([
      prisma.account.count({ where: { userId } }),
      accountIds.length
        ? prisma.account.findMany({
            where: {
              id: { in: accountIds },
              userId
            },
            select: { id: true }
          })
        : Promise.resolve([])
    ]);

    if (matchedAccounts.length !== input.accounts.length) {
      throw new HttpError(404, "账号不存在");
    }

    if (allAccountCount !== input.accounts.length) {
      throw new HttpError(400, "需要重新加密所有账号后才能更新保险库主密码");
    }

    const user = await prisma.$transaction(async (transaction) => {
      await Promise.all(
        matchedAccounts.map((account) =>
          transaction.$executeRaw`UPDATE "Account" SET "passwordSecret" = ${accountSecrets.get(account.id)!} WHERE "id" = ${account.id} AND "userId" = ${userId}`
        )
      );

      return transaction.user.update({
        where: { id: userId },
        data: { vaultVerifier: input.vaultVerifier },
        select: userSelect
      });
    });

    res.json({ user: publicUser(user) });
  })
);

authRouter.patch(
  "/vault",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = vaultSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: { vaultVerifier: true }
    });
    if (existing?.vaultVerifier) {
      throw new HttpError(409, "保险库主密码已设置");
    }

    const user = await prisma.user.update({
      where: { id: req.authUser!.id },
      data: { vaultVerifier: input.vaultVerifier },
      select: userSelect
    });

    res.json({ user: publicUser(user) });
  })
);

authRouter.patch(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = passwordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: { id: true, passwordHash: true }
    });

    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new HttpError(400, "当前密码不正确");
    }

    if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
      throw new HttpError(400, "新密码不能与当前密码相同");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(input.newPassword, 12),
        tokenVersion: { increment: 1 }
      },
      select: { id: true, tokenVersion: true }
    });

    setAuthCookie(res, updated.id, updated.tokenVersion);
    res.status(204).end();
  })
);
