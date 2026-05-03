import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../http.js";
import { clearAuthCookie, publicUser, requireAuth, setAuthCookie } from "../middleware/auth.js";
import { createUserSalt } from "../utils/crypto.js";

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

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = authSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new HttpError(409, "该邮箱已注册");
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name || input.email.slice(0, 1).toUpperCase(),
        passwordHash: await bcrypt.hash(input.password, 12),
        cryptoSalt: createUserSalt() || randomBytes(16).toString("hex")
      },
      select: { id: true, email: true, name: true, cryptoSalt: true }
    });

    setAuthCookie(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = authSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new HttpError(401, "邮箱或密码不正确");
    }

    setAuthCookie(res, user.id);
    res.json({
      user: publicUser({
        id: user.id,
        email: user.email,
        name: user.name,
        cryptoSalt: user.cryptoSalt
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
      select: { id: true, email: true, name: true, cryptoSalt: true }
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

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 12) }
    });

    res.status(204).end();
  })
);
