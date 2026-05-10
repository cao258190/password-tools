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

function originOf(value: string | undefined) {
  if (!value || value === "null") return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function addHttpOriginVariants(origins: Set<string>, origin: string | null) {
  if (!origin) return;
  origins.add(origin);

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;

    const alternate = new URL(url.toString());
    alternate.protocol = url.protocol === "http:" ? "https:" : "http:";
    origins.add(alternate.origin);
  } catch {
    // originOf already validates values before they get here.
  }
}

function requestOrigin(req: Request) {
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host");
  if (!host) return null;

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return originOf(`${forwardedProto || req.protocol}://${host}`);
}

function trustedOrigins(req: Request) {
  const origins = new Set<string>();
  const configuredOrigin = originOf(env.corsOrigin);
  const currentOrigin = requestOrigin(req);

  addHttpOriginVariants(origins, configuredOrigin);
  addHttpOriginVariants(origins, currentOrigin);

  return origins;
}

function isTrustedSource(req: Request) {
  const fetchSite = req.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origins = trustedOrigins(req);
  const sourceHeaders = [req.get("origin"), req.get("referer")];

  for (const source of sourceHeaders) {
    if (!source) continue;

    const sourceOrigin = originOf(source);
    if (!sourceOrigin || !origins.has(sourceOrigin)) return false;
  }

  return true;
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

  if (csrfMethods.has(req.method) && !isTrustedSource(req)) {
    next(new HttpError(403, "Request origin validation failed"));
    return;
  }

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
