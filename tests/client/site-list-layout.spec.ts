import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/client/styles.css"), "utf8");

function rulesFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))];
  if (matches.length === 0) throw new Error(`Missing CSS rule for ${selector}`);
  return matches.map((match) => match[1].replace(/\s+/g, " ").trim()).join(" ");
}

describe("site list layout", () => {
  it("allocates enough row height for the three-line site summary", () => {
    expect(rulesFor(".site-row")).toContain("min-height: 58px");
    expect(rulesFor(".site-row-main")).toContain("grid-template-rows: 16px 14px 14px");
    expect(rulesFor(".site-row-main")).toContain("gap: 1px");
    expect(rulesFor(".site-row-meta")).toContain("grid-template-rows: 16px 14px 14px");
    expect(rulesFor(".site-row-meta")).toContain("gap: 1px");
  });

  it("constrains every site summary text line inside the middle column", () => {
    expect(rulesFor(".site-row-main")).toContain("display: grid");
    expect(rulesFor(".site-row-main strong")).toContain("max-width: 100%");
    expect(rulesFor(".site-row-main small")).toContain("max-width: 100%");
  });

  it("keeps right-side metadata aligned with the three-line site summary", () => {
    expect(rulesFor(".site-row-meta")).toContain("align-self: stretch");
    expect(rulesFor(".site-favorite-slot")).toContain("grid-row: 1");
    expect(rulesFor(".site-time-lock")).toContain("grid-row: 2");
  });
});
