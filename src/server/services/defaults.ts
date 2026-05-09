import { readFileSync } from "node:fs";

export type DefaultCategory = {
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
};

const defaultCategoriesUrl = new URL("../../../shared/default-categories.json", import.meta.url);

function parseDefaultCategories(value: unknown): readonly DefaultCategory[] {
  if (!Array.isArray(value)) {
    throw new Error("default-categories.json must contain an array.");
  }

  return value.map((category, index) => {
    if (
      !category ||
      typeof category !== "object" ||
      typeof category.name !== "string" ||
      typeof category.color !== "string" ||
      typeof category.icon !== "string" ||
      typeof category.sortOrder !== "number"
    ) {
      throw new Error(`Invalid default category at index ${index}.`);
    }

    return {
      name: category.name,
      color: category.color,
      icon: category.icon,
      sortOrder: category.sortOrder
    };
  });
}

export const defaultCategories = parseDefaultCategories(
  JSON.parse(readFileSync(defaultCategoriesUrl, "utf8"))
);

export async function ensureDefaultCategories(
  upsert: (category: DefaultCategory) => Promise<unknown>
) {
  await Promise.all(
    defaultCategories.map((category) => upsert(category))
  );
}
