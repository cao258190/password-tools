import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { generatePassword } from "../utils/password.js";

export const passwordRouter = Router();

const generateSchema = z.object({
  length: z.coerce.number().int().min(12).max(48).optional()
});

passwordRouter.post(
  "/generate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = generateSchema.parse(req.body ?? {});
    res.json(generatePassword(input.length ?? 18));
  })
);
