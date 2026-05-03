import { randomInt } from "node:crypto";

const lower = "abcdefghijkmnopqrstuvwxyz";
const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const digits = "23456789";
const symbols = "!@#$%^&*+-_=?.";

export type PasswordStrength = "weak" | "medium" | "strong";

export function evaluateStrength(password: string): PasswordStrength {
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

export function generatePassword(length = 18) {
  const safeLength = Math.min(Math.max(length, 12), 48);
  const groups = [lower, upper, digits, symbols];
  const password = [
    lower[randomInt(lower.length)],
    upper[randomInt(upper.length)],
    digits[randomInt(digits.length)],
    symbols[randomInt(symbols.length)]
  ];

  const all = groups.join("");
  while (password.length < safeLength) {
    password.push(all[randomInt(all.length)]);
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  const value = password.join("");
  return {
    password: value,
    strength: evaluateStrength(value)
  };
}
