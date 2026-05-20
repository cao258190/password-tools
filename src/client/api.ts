import type {
  Account,
  AccountInput,
  AccountSecretInput,
  AdminSettings,
  BackupImportResult,
  Category,
  LegacyMigrationAccount,
  LegacyMigrationSecretInput,
  PublicSettings,
  SiteDetail,
  SiteInput,
  SiteSummary,
  Stats,
  SystemBackup,
  TagSummary,
  UpdateStatus,
  User,
  VaultRotationAccount,
  VersionInfo
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

function cookieValue(name: string) {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrfToken = cookieValue("vault_csrf");
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": decodeURIComponent(csrfToken) } : {}),
      ...(options.headers ?? {})
    }
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.message ?? "请求失败", data.details);
  }
  return data as T;
}

function withBody(method: string, body?: unknown): RequestInit {
  return {
    method,
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

export const api = {
  register(input: { email: string; password: string; name?: string }) {
    return request<{ user: User }>("/api/auth/register", withBody("POST", input));
  },
  publicSettings() {
    return request<{ settings: PublicSettings }>("/api/public/settings");
  },
  login(input: { email: string; password: string }) {
    return request<{ user: User }>("/api/auth/login", withBody("POST", input));
  },
  logout() {
    return request<void>("/api/auth/logout", withBody("POST"));
  },
  me() {
    return request<{ user: User }>("/api/auth/me");
  },
  updateProfile(input: { email: string; name?: string }) {
    return request<{ user: User }>("/api/auth/profile", withBody("PATCH", input));
  },
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return request<void>("/api/auth/password", withBody("PATCH", input));
  },
  updateVault(input: { vaultVerifier: string }) {
    return request<{ user: User }>("/api/auth/vault", withBody("PATCH", input));
  },
  rotateVaultPassword(input: { vaultVerifier: string; accounts: { id: string; passwordSecret: string }[] }) {
    return request<{ user: User }>("/api/auth/vault/password", withBody("PATCH", input));
  },
  adminSettings() {
    return request<{ settings: AdminSettings }>("/api/admin/settings");
  },
  updateAdminSettings(input: AdminSettings) {
    return request<{ settings: AdminSettings }>("/api/admin/settings", withBody("PATCH", input));
  },
  adminVersion(force = false) {
    const suffix = force ? "?force=true" : "";
    return request<{ version: VersionInfo }>(`/api/admin/version${suffix}`);
  },
  updateStatus() {
    return request<{
      updateEnabled: boolean;
      updateRunning: boolean;
      lastUpdate: UpdateStatus | null;
    }>("/api/admin/update");
  },
  runUpdate(input: { targetVersion?: string } = {}) {
    return request<{ update: UpdateStatus }>("/api/admin/update", withBody("POST", input));
  },
  exportBackup() {
    return request<{ backup: SystemBackup }>("/api/admin/backup/export");
  },
  importBackup(input: { backup: unknown; confirm: "RESTORE" }) {
    return request<{ result: BackupImportResult }>("/api/admin/backup/import", withBody("POST", input));
  },
  categories() {
    return request<{ categories: Category[] }>("/api/categories");
  },
  tags() {
    return request<{ tags: TagSummary[] }>("/api/tags");
  },
  stats() {
    return request<{ stats: Stats }>("/api/stats");
  },
  sites(params: {
    search?: string;
    category?: string;
    tag?: string;
    favorite?: boolean;
    scope?: "all" | "recent" | "favorites";
    sort?: "sort" | "recent" | "name" | "accounts";
  } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.category) query.set("category", params.category);
    if (params.tag) query.set("tag", params.tag);
    if (params.favorite) query.set("favorite", "true");
    if (params.scope) query.set("scope", params.scope);
    if (params.sort) query.set("sort", params.sort);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ sites: SiteSummary[] }>(`/api/sites${suffix}`);
  },
  site(id: string) {
    return request<{ site: SiteDetail }>(`/api/sites/${id}`);
  },
  siteFavicon(url: string) {
    const query = new URLSearchParams({ url });
    return request<{
      favicon: { iconUrl: string; sourceUrl: string; contentType: string };
      icons: { iconUrl: string; sourceUrl: string; contentType: string }[];
    }>(`/api/sites/favicon?${query.toString()}`);
  },
  createSite(input: SiteInput & { accounts?: AccountSecretInput[] }) {
    return request<{ site: SiteDetail }>("/api/sites", withBody("POST", input));
  },
  updateSite(id: string, input: Partial<SiteInput>) {
    return request<{ site: SiteDetail }>(`/api/sites/${id}`, withBody("PATCH", input));
  },
  deleteSite(id: string) {
    return request<void>(`/api/sites/${id}`, withBody("DELETE"));
  },
  createAccount(siteId: string, input: AccountSecretInput) {
    return request<{ account: Account }>(`/api/sites/${siteId}/accounts`, withBody("POST", input));
  },
  updateAccount(id: string, input: Partial<AccountSecretInput>) {
    return request<{ account: Account }>(`/api/accounts/${id}`, withBody("PATCH", input));
  },
  legacyMigrationAccounts() {
    return request<{ accounts: LegacyMigrationAccount[] }>("/api/accounts/legacy-migration");
  },
  vaultRotationAccounts() {
    return request<{ accounts: VaultRotationAccount[] }>("/api/accounts/vault-rotation");
  },
  submitLegacyMigration(input: { accounts: LegacyMigrationSecretInput[] }) {
    return request<{ migrated: number }>("/api/accounts/legacy-migration", withBody("POST", input));
  },
  deleteAccount(id: string) {
    return request<void>(`/api/accounts/${id}`, withBody("DELETE"));
  },
  generatePassword(length = 18) {
    return request<{ password: string; strength: AccountInput["strength"] }>(
      "/api/password/generate",
      withBody("POST", { length })
    );
  }
};
