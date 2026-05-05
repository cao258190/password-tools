import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http.js";
import { requireAdmin } from "../middleware/admin.js";
import { requireAuth } from "../middleware/auth.js";
import { getRegistrationEnabled, setRegistrationEnabled } from "../services/bootstrap.js";
import { checkVersion, getUpdateStatus, runUpdate } from "../services/version.js";

export const adminRouter = Router();

const settingsSchema = z.object({
  registrationEnabled: z.boolean()
});

const updateSchema = z.object({
  targetVersion: z
    .string()
    .trim()
    .regex(/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "版本号格式无效")
    .optional()
});

adminRouter.get(
  "/settings",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({
      settings: {
        registrationEnabled: await getRegistrationEnabled()
      }
    });
  })
);

adminRouter.patch(
  "/settings",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    await setRegistrationEnabled(input.registrationEnabled);
    res.json({
      settings: {
        registrationEnabled: input.registrationEnabled
      }
    });
  })
);

adminRouter.get(
  "/version",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const force = req.query.force === "true";
    res.json({
      version: await checkVersion(force)
    });
  })
);

adminRouter.get(
  "/update",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(getUpdateStatus());
  })
);

adminRouter.post(
  "/update",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const input = updateSchema.parse(_req.body ?? {});
    const update = await runUpdate(input.targetVersion);
    res.status(202).json({ update });
  })
);
