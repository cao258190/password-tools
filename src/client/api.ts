import type {
  Account,
  AccountInput,
  AdminSettings,
  Category,
  PublicSettings,
  SiteDetail,
  SiteInput,
  SiteSummary,
  Stats,
  TagSummary,
  User
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
  adminSettings() {
    return request<{ settings: AdminSettings }>("/api/admin/settings");
  },
  updateAdminSettings(input: AdminSettings) {
    return request<{ settings: AdminSettings }>("/api/admin/settings", withBody("PATCH", input));
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
    sort?: "recent" | "name" | "accounts";
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
  createSite(input: SiteInput & { accounts?: AccountInput[] }) {
    return request<{ site: SiteDetail }>("/api/sites", withBody("POST", input));
  },
  updateSite(id: string, input: Partial<SiteInput>) {
    return request<{ site: SiteDetail }>(`/api/sites/${id}`, withBody("PATCH", input));
  },
  deleteSite(id: string) {
    return request<void>(`/api/sites/${id}`, withBody("DELETE"));
  },
  createAccount(siteId: string, input: AccountInput) {
    return request<{ account: Account }>(`/api/sites/${siteId}/accounts`, withBody("POST", input));
  },
  updateAccount(id: string, input: Partial<AccountInput>) {
    return request<{ account: Account }>(`/api/accounts/${id}`, withBody("PATCH", input));
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
