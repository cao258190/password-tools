import type { PasswordStrength } from "../types";

export function evaluatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score >= 5) return "strong";
  if (score >= 3) return "medium";
  return "weak";
}

export function strengthLabel(strength: PasswordStrength) {
  return {
    weak: "弱",
    medium: "中等",
    strong: "强"
  }[strength];
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "从未";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 3) return "2 分钟前";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN");
}
