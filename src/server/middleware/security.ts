import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { HttpError } from "../http.js";

const csrfMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfCookieName = "vault_csrf";
const csrfHeaderName = "x-csrf-token";

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function sameToken(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (env.cookieSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  let token = req.cookies?.[csrfCookieName];
  if (!token || typeof token !== "string" || token.length < 32) {
    token = randomBytes(32).toString("base64url");
  }

  res.cookie(csrfCookieName, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/"
  });

  if (!csrfMethods.has(req.method) || req.path === "/api/auth/login") {
    next();
    return;
  }

  const header = req.get(csrfHeaderName);
  if (!header || !sameToken(token, header)) {
    next(new HttpError(403, "安全校验失败，请刷新页面后重试"));
    return;
  }

  next();
}

export function rateLimit(options: {
  keyPrefix: string;
  windowMs: number;
  max: number;
  message?: string;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.keyPrefix}:${clientIp(req)}:${String(req.body?.email ?? "").toLowerCase()}`;
    const current = rateBuckets.get(key);
    const bucket: RateBucket =
      current && current.resetAt > now
        ? current
        : {
            count: 0,
            resetAt: now + options.windowMs
          };

    bucket.count += 1;
    rateBuckets.set(key, bucket);

    if (bucket.count > options.max) {
      next(new HttpError(429, options.message ?? "操作过于频繁，请稍后再试"));
      return;
    }

    if (rateBuckets.size > 1000) {
      for (const [bucketKey, value] of rateBuckets.entries()) {
        if (value.resetAt <= now) rateBuckets.delete(bucketKey);
      }
    }

    next();
  };
}
