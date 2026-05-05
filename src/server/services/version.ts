import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { env } from "../env.js";
import { HttpError } from "../http.js";

const execAsync = promisify(exec);
const githubApiBase = "https://api.github.com";
const requestTimeoutMs = 8000;
const updateRunningTimeoutMs = 1000 * 60 * 20;

export type VersionInfo = {
  currentVersion: string;
  currentCommit: string | null;
  latestVersion: string | null;
  latestSha: string | null;
  latestUrl: string | null;
  updateAvailable: boolean;
  updateEnabled: boolean;
  source: "release" | "package";
  checkedAt: string;
  updateRunning: boolean;
  lastUpdate: UpdateStatus | null;
  releaseVersions: ReleaseVersion[];
};

export type UpdateStatus = {
  status: "idle" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  message: string;
  output: string;
  targetVersion?: string | null;
};

export type ReleaseVersion = {
  version: string;
  url: string | null;
  publishedAt: string | null;
  prerelease: boolean;
};

let cachedInfo: VersionInfo | null = null;
let cachedAt = 0;
let updateRunning = false;
let lastUpdate: UpdateStatus | null = null;

function updateStatusFilePath() {
  return resolve(process.cwd(), env.updateStatusFile);
}

function readStoredUpdateStatus() {
  if (!env.updateStatusFile || !existsSync(updateStatusFilePath())) return null;
  try {
    const status = JSON.parse(readFileSync(updateStatusFilePath(), "utf8")) as UpdateStatus;
    if (!["idle", "running", "success", "failed"].includes(status.status)) return null;
    if (status.status === "running") {
      const startedAt = Date.parse(status.startedAt);
      if (Number.isFinite(startedAt) && Date.now() - startedAt > updateRunningTimeoutMs) {
        const staleStatus: UpdateStatus = {
          ...status,
          status: "failed",
          finishedAt: new Date().toISOString(),
          message: "更新任务超时，请查看服务器 Docker 日志",
          output: trimOutput(status.output)
        };
        writeStoredUpdateStatus(staleStatus);
        return staleStatus;
      }
    }
    return status;
  } catch {
    return null;
  }
}

function writeStoredUpdateStatus(status: UpdateStatus) {
  if (!env.updateStatusFile) return;
  try {
    writeFileSync(updateStatusFilePath(), `${JSON.stringify(status, null, 2)}\n`);
  } catch {
    // 状态文件只用于页面恢复更新进度，写入失败不影响实际更新命令执行。
  }
}

function currentUpdateState() {
  const storedStatus = readStoredUpdateStatus();
  const effectiveLastUpdate = storedStatus ?? lastUpdate;
  const effectiveRunning = updateRunning || effectiveLastUpdate?.status === "running";

  if (storedStatus) {
    lastUpdate = storedStatus;
    updateRunning = storedStatus.status === "running";
  }

  return {
    updateRunning: effectiveRunning,
    lastUpdate: effectiveLastUpdate
  };
}

function normalizeVersion(version: string | null | undefined) {
  return (version ?? "").trim().replace(/^v/i, "");
}

function normalizeTargetVersion(version: string | null | undefined) {
  const normalized = normalizeVersion(version);
  return normalized ? `v${normalized}` : null;
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

async function githubText(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${githubApiBase}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github.raw",
        "User-Agent": "password-tools-updater"
      }
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new HttpError(response.status, `GitHub 检测失败：${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "无法连接 GitHub 检测版本");
  } finally {
    clearTimeout(timer);
  }
}

function parsePackageVersion(content: string | null) {
  if (!content) return null;
  try {
    const packageJson = JSON.parse(content) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    throw new HttpError(502, "GitHub package.json 版本格式无效");
  }
}

export function localVersion() {
  return env.appVersion;
}

function currentCommit() {
  return env.appCommit || null;
}

export async function checkVersion(force = false): Promise<VersionInfo> {
  const now = Date.now();
  const updateState = currentUpdateState();
  if (!force && cachedInfo && now - cachedAt < 1000 * 60 * 5) {
    return {
      ...cachedInfo,
      updateRunning: updateState.updateRunning,
      lastUpdate: updateState.lastUpdate
    };
  }

  const release = await githubJson<{
    tag_name?: string;
    html_url?: string;
  }>(`/repos/${env.githubOwner}/${env.githubRepo}/releases/latest`);
  const releases =
    (await githubJson<
      {
        tag_name?: string;
        html_url?: string;
        published_at?: string | null;
        prerelease?: boolean;
      }[]
    >(`/repos/${env.githubOwner}/${env.githubRepo}/releases?per_page=20`)) ?? [];
  const releaseVersions = releases
    .filter((item) => typeof item.tag_name === "string" && item.tag_name.trim())
    .map((item) => ({
      version: normalizeTargetVersion(item.tag_name) ?? item.tag_name ?? "",
      url: item.html_url ?? null,
      publishedAt: item.published_at ?? null,
      prerelease: Boolean(item.prerelease)
    }));

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
    latestVersion = parsePackageVersion(
      await githubText(
        `/repos/${env.githubOwner}/${env.githubRepo}/contents/package.json?ref=${encodeURIComponent(env.updateCheckRef)}`
      )
    );
    latestUrl = branch?.html_url ?? `https://github.com/${env.githubOwner}/${env.githubRepo}`;
    source = "package";
  }

  const currentVersion = localVersion();
  const currentSha = currentCommit();
  const updateAvailable = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

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
    updateRunning: updateState.updateRunning,
    lastUpdate: updateState.lastUpdate,
    releaseVersions
  };
  cachedAt = now;
  return cachedInfo;
}

export function getUpdateStatus() {
  const updateState = currentUpdateState();
  return {
    updateEnabled: env.webUpdateEnabled && Boolean(env.updateCommand),
    updateRunning: updateState.updateRunning,
    lastUpdate: updateState.lastUpdate
  };
}

export async function runUpdate(targetVersion?: string) {
  if (!env.webUpdateEnabled || !env.updateCommand) {
    throw new HttpError(403, "服务器未开启 Web 在线更新");
  }
  if (currentUpdateState().updateRunning) {
    throw new HttpError(409, "已有更新任务正在执行");
  }

  const normalizedTargetVersion = normalizeTargetVersion(targetVersion);
  updateRunning = true;
  lastUpdate = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: normalizedTargetVersion ? `正在更新到 ${normalizedTargetVersion}` : "更新任务正在执行",
    output: "",
    targetVersion: normalizedTargetVersion
  };
  writeStoredUpdateStatus(lastUpdate);

  const commandTimeout = env.updateDetached ? 1000 * 60 : 1000 * 60 * 5;

  void execAsync(env.updateCommand, {
    cwd: process.cwd(),
    timeout: commandTimeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      ...(normalizedTargetVersion ? { TARGET_VERSION: normalizedTargetVersion } : {})
    }
  })
    .then((result) => {
      if (env.updateDetached) {
        lastUpdate = {
          ...(lastUpdate as UpdateStatus),
          status: "running",
          message: "更新后台容器已启动",
          output: trimOutput(`${result.stdout}\n${result.stderr}`)
        };
        cachedAt = 0;
        return;
      } else {
        lastUpdate = {
          ...(lastUpdate as UpdateStatus),
          status: "success",
          finishedAt: new Date().toISOString(),
          message: "更新命令已执行完成",
          output: trimOutput(`${result.stdout}\n${result.stderr}`)
        };
        updateRunning = false;
      }
      writeStoredUpdateStatus(lastUpdate);
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
      updateRunning = false;
      writeStoredUpdateStatus(lastUpdate);
    });

  return lastUpdate;
}
