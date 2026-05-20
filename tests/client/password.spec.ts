import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluatePasswordStrength, relativeTime, strengthLabel } from "../../src/client/utils/password";

afterEach(() => {
  vi.useRealTimers();
});

describe("client password helpers", () => {
  it("labels weak, medium, and strong passwords", () => {
    expect(evaluatePasswordStrength("short")).toBe("weak");
    expect(evaluatePasswordStrength("Medium123456")).toBe("medium");
    expect(evaluatePasswordStrength("Strong#Password#2026")).toBe("strong");
    expect(strengthLabel("strong")).toBe("强");
  });

  it("formats relative time without falling back to a calendar date", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const ago = (milliseconds: number) => new Date(now.getTime() - milliseconds).toISOString();

    expect(relativeTime(ago(30 * 1000))).toBe("刚刚");
    expect(relativeTime(ago(5 * 60 * 1000))).toBe("5 分钟前");
    expect(relativeTime(ago(3 * 60 * 60 * 1000))).toBe("3 小时前");
    expect(relativeTime(ago(2 * 24 * 60 * 60 * 1000))).toBe("2 天前");
    expect(relativeTime(ago(45 * 24 * 60 * 60 * 1000))).toBe("1 个月前");
    expect(relativeTime(ago(400 * 24 * 60 * 60 * 1000))).toBe("1 年前");
  });
});
