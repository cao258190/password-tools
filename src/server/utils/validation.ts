import { z } from "zod";

export const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式");
