import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import "./types.js";
import { env } from "./env.js";
import { errorHandler } from "./http.js";
import { accountsRouter } from "./routes/accounts.js";
import { authRouter } from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { passwordRouter } from "./routes/password.js";
import { sitesRouter } from "./routes/sites.js";
import { statsRouter } from "./routes/stats.js";
import { tagsRouter } from "./routes/tags.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/sites", sitesRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/password", passwordRouter);
  app.use(errorHandler);

  return app;
}
