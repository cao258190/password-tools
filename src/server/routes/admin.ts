import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http.js";
import { requireAdmin } from "../middleware/admin.js";
import { requireAuth } from "../middleware/auth.js";
import { getRegistrationEnabled, setRegistrationEnabled } from "../services/bootstrap.js";

export const adminRouter = Router();

const settingsSchema = z.object({
  registrationEnabled: z.boolean()
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
