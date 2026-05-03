import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    sequence: {
      hooks: "list"
    }
  }
});
