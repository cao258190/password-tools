import { Router } from "express";
import { asyncHandler } from "../http.js";
import { getRegistrationEnabled } from "../services/bootstrap.js";

export const publicRouter = Router();

publicRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json({
      settings: {
        registrationEnabled: await getRegistrationEnabled()
      }
    });
  })
);
