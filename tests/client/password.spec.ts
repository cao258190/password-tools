import { describe, expect, it } from "vitest";
import { evaluatePasswordStrength, strengthLabel } from "../../src/client/utils/password";

describe("client password helpers", () => {
  it("labels weak, medium, and strong passwords", () => {
    expect(evaluatePasswordStrength("short")).toBe("weak");
    expect(evaluatePasswordStrength("Medium123456")).toBe("medium");
    expect(evaluatePasswordStrength("Strong#Password#2026")).toBe("strong");
    expect(strengthLabel("strong")).toBe("强");
  });
});
