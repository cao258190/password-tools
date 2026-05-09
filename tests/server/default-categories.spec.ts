import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCategories } from "../../src/server/services/defaults";

const sharedCategoriesUrl = new URL("../../shared/default-categories.json", import.meta.url);
const initDbName = "default-categories-init-test.db";
const initDbPath = resolve("prisma", initDbName);
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

afterEach(() => {
  rmSync(initDbPath, { force: true });
  rmSync(`${initDbPath}-journal`, { force: true });
});

describe("default categories", () => {
  it("loads server defaults from the shared category file", () => {
    const sharedCategories = JSON.parse(readFileSync(sharedCategoriesUrl, "utf8"));
    const sortOrders = defaultCategories.map((category) => category.sortOrder);

    expect(defaultCategories).toEqual(sharedCategories);
    expect(new Set(defaultCategories.map((category) => category.name)).size).toBe(defaultCategories.length);
    expect(sortOrders).toEqual(defaultCategories.map((_, index) => index));
  });

  it("seeds init-db categories from the shared category file", () => {
    const result = spawnSync(process.execPath, ["scripts/init-db.mjs", "--reset"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ADMIN_EMAIL: "init-defaults@example.com",
        ADMIN_PASSWORD: "init-defaults-password",
        DATABASE_URL: `file:./${initDbName}`
      },
      encoding: "utf8"
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

    const queryScript = `
      import { DatabaseSync } from "node:sqlite";

      const db = new DatabaseSync(${JSON.stringify(initDbPath)});
      const seededCategories = db
        .prepare(
          'SELECT "name", "color", "icon", "sortOrder" FROM "Category" ORDER BY "sortOrder" ASC'
        )
        .all();
      db.close();

      console.log(JSON.stringify(seededCategories));
    `;
    const queryResult = spawnSync(
      process.execPath,
      ["--no-warnings", "--input-type=module", "--eval", queryScript],
      {
        encoding: "utf8"
      }
    );

    expect(queryResult.status, `${queryResult.stdout}\n${queryResult.stderr}`).toBe(0);
    const seededCategories = JSON.parse(queryResult.stdout);

    expect(seededCategories).toEqual(defaultCategories);
  });
});
