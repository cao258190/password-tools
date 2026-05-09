import { Buffer } from "node:buffer";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { HttpError } from "../http.js";

const htmlByteLimit = 900_000;
const iconByteLimit = 650_000;
const requestTimeoutMs = 6000;
const maxIconCandidates = 8;
const maxIconResults = 6;
const dataImagePattern =
  /^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,([a-z0-9+/=]+)$/i;
const dnsLookupOptions = { all: true, verbatim: true } as const;

const supportedImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon"
]);

export type FaviconResult = {
  iconUrl: string;
  sourceUrl: string;
  contentType: string;
};

type IconCandidate = {
  href: string;
  sourceUrl?: string;
};

class BlockedFaviconHostError extends HttpError {
  constructor() {
    super(400, "暂不支持获取本机或内网地址的图标");
  }
}

const blockedIpAddresses = new BlockList();
blockedIpAddresses.addSubnet("0.0.0.0", 8, "ipv4");
blockedIpAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedIpAddresses.addSubnet("100.64.0.0", 10, "ipv4");
blockedIpAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedIpAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedIpAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedIpAddresses.addSubnet("192.0.0.0", 24, "ipv4");
blockedIpAddresses.addSubnet("192.0.2.0", 24, "ipv4");
blockedIpAddresses.addSubnet("192.88.99.0", 24, "ipv4");
blockedIpAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedIpAddresses.addSubnet("198.18.0.0", 15, "ipv4");
blockedIpAddresses.addSubnet("198.51.100.0", 24, "ipv4");
blockedIpAddresses.addSubnet("203.0.113.0", 24, "ipv4");
blockedIpAddresses.addSubnet("224.0.0.0", 4, "ipv4");
blockedIpAddresses.addSubnet("240.0.0.0", 4, "ipv4");
blockedIpAddresses.addAddress("::", "ipv6");
blockedIpAddresses.addAddress("::1", "ipv6");
blockedIpAddresses.addSubnet("100::", 64, "ipv6");
blockedIpAddresses.addSubnet("2001:db8::", 32, "ipv6");
blockedIpAddresses.addSubnet("fc00::", 7, "ipv6");
blockedIpAddresses.addSubnet("fe80::", 10, "ipv6");
blockedIpAddresses.addSubnet("ff00::", 8, "ipv6");

function normalizeWebsiteUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  const withProtocol = /^[a-z][a-z\d+\-.]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new HttpError(400, "请输入有效的网站地址");
  }

  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new HttpError(400, "仅支持 http 或 https 网站地址");
  }

  if (url.username || url.password) {
    throw new HttpError(400, "网站地址不能包含用户名或密码");
  }

  if (isBlockedHost(url.hostname)) {
    throw new BlockedFaviconHostError();
  }

  return url;
}

function normalizeHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1);
  return host;
}

function isBlockedHost(hostname: string) {
  const host = normalizeHostname(hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  return isBlockedAddress(host);
}

function isBlockedAddress(address: string) {
  const ipVersion = isIP(address);
  if (!ipVersion) return false;

  return blockedIpAddresses.check(address, ipVersion === 4 ? "ipv4" : "ipv6");
}

async function assertSafeRequestHostname(url: URL) {
  const hostname = normalizeHostname(url.hostname);
  if (isBlockedHost(hostname)) {
    throw new BlockedFaviconHostError();
  }

  if (isIP(hostname)) return;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, dnsLookupOptions);
  } catch {
    return;
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BlockedFaviconHostError();
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  let currentUrl = normalizeWebsiteUrl(url);

  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    await assertSafeRequestHostname(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(currentUrl.toString(), {
        ...init,
        redirect: "manual",
        headers: {
          "User-Agent": "password-tools favicon resolver",
          ...(init.headers ?? {})
        },
        signal: controller.signal
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return response;
        currentUrl = normalizeWebsiteUrl(new URL(location, currentUrl).toString());
        continue;
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("too many redirects");
}

async function readLimitedBytes(response: Response, limit: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > limit) {
    throw new Error("response too large");
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > limit) throw new Error("response too large");
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("response too large");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, total);
}

async function readTextPreview(response: Response, limit: number) {
  if (!response.body) {
    return Buffer.from(await response.arrayBuffer()).subarray(0, limit).toString("utf8");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const remaining = limit - total;
    if (remaining <= 0) {
      await reader.cancel();
      break;
    }

    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(chunk);
    total += chunk.byteLength;

    if (value.byteLength > remaining || total >= limit) {
      await reader.cancel();
      break;
    }
  }

  return Buffer.concat(chunks, total).toString("utf8");
}

function parseAttributes(tag: string) {
  const attrs = new Map<string, string>();
  const pattern = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(tag))) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function extractJsonObject(text: string, marker: string) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (character === "\\") {
        escaping = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function normalizeIconCandidate(value: unknown, baseUrl: URL) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (dataImagePattern.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }

  return null;
}

function extractConfiguredIconCandidates(html: string, baseUrl: URL) {
  const candidates: IconCandidate[] = [];
  const json = extractJsonObject(html, "window.__APP_CONFIG__");
  if (!json) return candidates;

  try {
    const config = JSON.parse(json) as Record<string, unknown>;
    const configuredIcon =
      normalizeIconCandidate(config.site_logo, baseUrl) ??
      normalizeIconCandidate(config.siteLogo, baseUrl) ??
      normalizeIconCandidate(config.favicon, baseUrl) ??
      normalizeIconCandidate(config.icon, baseUrl);

    if (configuredIcon) {
      candidates.push({
        href: configuredIcon,
        sourceUrl: new URL("#site_logo", baseUrl).toString()
      });
    }
  } catch {
    // Ignore malformed app config blocks from remote pages.
  }

  return candidates;
}

function iconPriority(rel: string) {
  const tokens = rel.toLowerCase().split(/\s+/);
  if (tokens.includes("apple-touch-icon")) return 0;
  if (tokens.includes("icon")) return tokens.includes("shortcut") ? 2 : 1;
  if (tokens.includes("mask-icon")) return 3;
  return null;
}

function extractIconCandidates(html: string, baseUrl: URL) {
  const candidates: Array<{ href: string; priority: number }> = [];
  const linkPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const href = attrs.get("href");
    const rel = attrs.get("rel") ?? "";
    const priority = iconPriority(rel);
    if (!href || priority === null) continue;

    try {
      const url = new URL(href, baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        candidates.push({ href: url.toString(), priority });
      }
    } catch {
      // Ignore malformed link tags from remote pages.
    }
  }

  return candidates.sort((left, right) => left.priority - right.priority).map((item) => ({ href: item.href }));
}

function guessImageType(url: URL) {
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return "";
}

function normalizeImageType(response: Response, url: URL) {
  const rawType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (supportedImageTypes.has(rawType)) return rawType;
  return guessImageType(url);
}

async function fetchHomePage(url: URL) {
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "text/html,application/xhtml+xml"
    }
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) {
    return "";
  }

  return readTextPreview(response, htmlByteLimit);
}

function decodeDataIcon(candidate: IconCandidate) {
  const match = candidate.href.match(dataImagePattern);
  if (!match) return null;

  const contentType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > iconByteLimit) {
    throw new Error("inline favicon is too large");
  }

  return {
    iconUrl: candidate.href,
    sourceUrl: candidate.sourceUrl ?? "inline:image",
    contentType
  };
}

async function fetchIcon(candidate: IconCandidate) {
  const inlineIcon = decodeDataIcon(candidate);
  if (inlineIcon) return inlineIcon;

  const candidateUrl = candidate.href;
  const url = normalizeWebsiteUrl(candidateUrl);
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*;q=0.8,*/*;q=0.5"
    }
  });

  if (!response.ok) {
    throw new Error(`favicon request failed with ${response.status}`);
  }

  const contentType = normalizeImageType(response, url);
  if (!supportedImageTypes.has(contentType)) {
    throw new Error("unsupported favicon type");
  }

  const bytes = await readLimitedBytes(response, iconByteLimit);
  if (bytes.byteLength === 0) throw new Error("empty favicon");

  return {
    iconUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
    sourceUrl: candidate.sourceUrl ?? url.toString(),
    contentType
  };
}

export async function resolveFavicon(rawUrl: string): Promise<FaviconResult> {
  const icons = await resolveFavicons(rawUrl);
  return icons[0];
}

export async function resolveFavicons(rawUrl: string): Promise<FaviconResult[]> {
  const websiteUrl = normalizeWebsiteUrl(rawUrl);
  const seen = new Set<string>();
  const candidates: IconCandidate[] = [];
  const iconResults: FaviconResult[] = [];
  const seenIconUrls = new Set<string>();

  function addCandidate(candidate: IconCandidate) {
    if (seen.has(candidate.href)) return;
    seen.add(candidate.href);
    candidates.push(candidate);
  }

  try {
    const html = await fetchHomePage(websiteUrl);
    for (const candidate of extractConfiguredIconCandidates(html, websiteUrl)) {
      addCandidate(candidate);
    }
    for (const candidate of extractIconCandidates(html, websiteUrl).slice(0, maxIconCandidates - 1)) {
      addCandidate(candidate);
    }
  } catch (error) {
    if (error instanceof BlockedFaviconHostError) throw error;
    // The conventional favicon path is still worth trying.
  }

  addCandidate({ href: new URL("/favicon.ico", websiteUrl).toString() });

  for (const candidate of candidates) {
    try {
      const icon = await fetchIcon(candidate);
      if (!seenIconUrls.has(icon.iconUrl)) {
        seenIconUrls.add(icon.iconUrl);
        iconResults.push(icon);
      }
      if (iconResults.length >= maxIconResults) break;
    } catch {
      // Try the next candidate.
    }
  }

  if (iconResults.length > 0) return iconResults;

  throw new HttpError(404, "没有找到可用的网站图标");
}
