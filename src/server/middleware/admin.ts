import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http.js";

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser?.isAdmin) {
    next(new HttpError(403, "仅管理员可操作"));
    return;
  }

  next();
}
