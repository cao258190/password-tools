import { exec } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../env.js";
import { HttpError } from "../http.js";

const execAsync = promisify(exec);
const githubApiBase = "https://api.github.com";
const requestTimeoutMs = 8000;

export type VersionInfo = {
  currentVersion: string;
  currentCommit: string | null;
  latestVersion: string | null;
  latestSha: string | null;
  latestUrl: string | null;
  updateAvailable: boolean;
  updateEnabled: boolean;
  source: "release" | "branch";
  checkedAt: string;
  updateRunning: boolean;
  lastUpdate: UpdateStatus | null;
};

export type UpdateStatus = {
  status: "idle" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  message: string;
  output: string;
};

let cachedInfo: VersionInfo | null = null;
let cachedAt = 0;
let updateRunning = false;
let lastUpdate: UpdateStatus | null = null;

function normalizeVersion(version: string | null | undefined) {
  return (version ?? "").trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split(/[.-]/);
  const rightParts = normalizeVersion(right).split(/[.-]/);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? "0";
    const rightPart = rightParts[index] ?? "0";
    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1;
      continue;
    }

    const textCompare = leftPart.localeCompare(rightPart);
    if (textCompare !== 0) return textCompare > 0 ? 1 : -1;
  }

  return 0;
}

function trimOutput(output: string) {
  const normalized = output.replace(/\r\n/g, "\n").trim();
  return normalized.length > 5000 ? normalized.slice(-5000) : normalized;
}

async function githubJson<T>(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${githubApiBase}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "password-tools-updater"
      }
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new HttpError(response.status, `GitHub 检测失败：${response.statusText}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "无法连接 GitHub 检测版本");
  } finally {
    clearTimeout(timer);
  }
}

function versionFromSha(sha: string | null) {
  return sha ? `${env.updateCheckRef}-${sha.slice(0, 7)}` : null;
}

export function localVersion() {
  return env.appVersion;
}

function currentCommit() {
  return env.appCommit || null;
}

export async function checkVersion(force = false): Promise<VersionInfo> {
  const now = Date.now();
  if (!force && cachedInfo && now - cachedAt < 1000 * 60 * 5) {
    return {
      ...cachedInfo,
      updateRunning,
      lastUpdate
    };
  }

  const release = await githubJson<{
    tag_name?: string;
    html_url?: string;
  }>(`/repos/${env.githubOwner}/${env.githubRepo}/releases/latest`);

  let latestVersion: string | null = release?.tag_name ?? null;
  let latestSha: string | null = null;
  let latestUrl: string | null = release?.html_url ?? null;
  let source: VersionInfo["source"] = "release";

  if (!latestVersion) {
    const branch = await githubJson<{
      commit?: { sha?: string };
      html_url?: string;
    }>(`/repos/${env.githubOwner}/${env.githubRepo}/branches/${encodeURIComponent(env.updateCheckRef)}`);
    latestSha = branch?.commit?.sha ?? null;
    latestVersion = versionFromSha(latestSha);
    latestUrl = branch?.html_url ?? `https://github.com/${env.githubOwner}/${env.githubRepo}`;
    source = "branch";
  }

  const currentVersion = localVersion();
  const currentSha = currentCommit();
  const updateAvailable = latestVersion
    ? source === "release"
      ? compareVersions(latestVersion, currentVersion) > 0
      : Boolean(
          latestSha &&
            ((currentSha && latestSha !== currentSha) ||
              (!currentSha && currentVersion.includes(latestSha.slice(0, 7)) === false && currentVersion !== "0.0.0"))
        )
    : false;

  cachedInfo = {
    currentVersion,
    currentCommit: currentSha,
    latestVersion,
    latestSha,
    latestUrl,
    updateAvailable,
    updateEnabled: env.webUpdateEnabled && Boolean(env.updateCommand),
    source,
    checkedAt: new Date().toISOString(),
    updateRunning,
    lastUpdate
  };
  cachedAt = now;
  return cachedInfo;
}

export function getUpdateStatus() {
  return {
    updateEnabled: env.webUpdateEnabled && Boolean(env.updateCommand),
    updateRunning,
    lastUpdate
  };
}

export async function runUpdate() {
  if (!env.webUpdateEnabled || !env.updateCommand) {
    throw new HttpError(403, "服务器未开启 Web 在线更新");
  }
  if (updateRunning) {
    throw new HttpError(409, "已有更新任务正在执行");
  }

  updateRunning = true;
  lastUpdate = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "更新任务正在执行",
    output: ""
  };

  void execAsync(env.updateCommand, {
    cwd: process.cwd(),
    timeout: 1000 * 60 * 5,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  })
    .then((result) => {
      lastUpdate = {
        ...(lastUpdate as UpdateStatus),
        status: "success",
        finishedAt: new Date().toISOString(),
        message: "更新命令已执行完成",
        output: trimOutput(`${result.stdout}\n${result.stderr}`)
      };
      cachedAt = 0;
    })
    .catch((error: unknown) => {
      const output =
        error && typeof error === "object" && "stdout" in error
          ? `${String((error as { stdout?: unknown }).stdout ?? "")}\n${String((error as { stderr?: unknown }).stderr ?? "")}`
          : error instanceof Error
            ? error.message
            : "更新命令执行失败";
      lastUpdate = {
        ...(lastUpdate as UpdateStatus),
        status: "failed",
        finishedAt: new Date().toISOString(),
        message: "更新命令执行失败",
        output: trimOutput(output)
      };
    })
    .finally(() => {
      updateRunning = false;
    });

  return lastUpdate;
}
