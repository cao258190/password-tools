import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import "./types.js";
import { env } from "./env.js";
import { errorHandler } from "./http.js";
import { accountsRouter } from "./routes/accounts.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { passwordRouter } from "./routes/password.js";
import { publicRouter } from "./routes/public.js";
import { sitesRouter } from "./routes/sites.js";
import { statsRouter } from "./routes/stats.js";
import { tagsRouter } from "./routes/tags.js";
import { csrfProtection, securityHeaders } from "./middleware/security.js";

export function createApp() {
  const app = express();
  const defaultJsonParser = express.json({ limit: "1mb" });
  const backupJsonParser = express.json({ limit: "20mb" });

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true
    })
  );
  app.use(securityHeaders);
  app.use((req, res, next) => {
    const parser = req.path === "/api/admin/backup/import" ? backupJsonParser : defaultJsonParser;
    parser(req, res, next);
  });
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/sites", sitesRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/password", passwordRouter);
  app.use(errorHandler);

  return app;
}
