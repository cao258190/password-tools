import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../http.js";
import type { AuthUser } from "../types.js";

type TokenPayload = {
  userId: string;
};

export function signAuthToken(userId: string) {
  return jwt.sign({ userId }, env.jwtSecret, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, userId: string) {
  res.cookie(env.cookieName, signAuthToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/"
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(env.cookieName, {
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/"
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.cookieName];
  if (!token) {
    next(new HttpError(401, "请先登录"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, cryptoSalt: true, isAdmin: true }
    });

    if (!user) {
      next(new HttpError(401, "登录状态已失效"));
      return;
    }

    req.authUser = user satisfies AuthUser;
    next();
  } catch {
    next(new HttpError(401, "登录状态已失效"));
  }
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin
  };
}
