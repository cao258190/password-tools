import { defineStore } from "pinia";
import { api } from "../api";
import type { Account, AccountInput, AccountSecretInput, Category, SiteDetail, SiteInput, SiteSummary, Stats, TagSummary } from "../types";
import { decryptVaultText, deriveVaultKey, encryptVaultText, createVaultVerifier, isClientEncryptedSecret, verifyVaultKey } from "../utils/vaultCrypto";
import { useAuthStore } from "./auth";

export type ViewFilter = "all" | "recent" | "favorites";
export type SiteSortMode = "sort" | "recent" | "name" | "accounts";

type VaultState = {
  sites: SiteSummary[];
  selectedSite: SiteDetail | null;
  selectedSiteId: string;
  categories: Category[];
  tags: TagSummary[];
  stats: Stats;
  search: string;
  categoryFilter: string;
  tagFilter: string;
  viewFilter: ViewFilter;
  sortMode: SiteSortMode;
  loading: boolean;
  detailLoading: boolean;
  error: string;
  copiedId: string;
  visiblePasswords: Record<string, boolean>;
  vaultUnlocked: boolean;
  vaultBusy: boolean;
  vaultError: string;
  vaultNotice: string;
  legacyMigrationCount: number;
};

let activeVaultKey: CryptoKey | null = null;

const emptyStats: Stats = {
  sites: 0,
  accounts: 0,
  favorites: 0,
  weakAccounts: 0,
  mediumAccounts: 0,
  strongAccounts: 0
};

async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续使用下面的 textarea 兜底方案。
  }

  const textarea = document.createElement("textarea");
  const selection = document.getSelection();
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    activeElement?.focus();
  }

  return copied;
}

function requireVaultKey() {
  if (!activeVaultKey) {
    throw new Error("请先解锁保险库");
  }
  return activeVaultKey;
}

async function accountInputToSecretPayload(input: Partial<AccountInput>) {
  const { password, ...rest } = input;
  const payload: Partial<AccountSecretInput> = { ...rest };
  if (password !== undefined) {
    payload.passwordSecret = await encryptVaultText(password, requireVaultKey());
  }
  return payload;
}

async function hydrateAccount(account: Account): Promise<Account> {
  if (isClientEncryptedSecret(account.passwordSecret)) {
    if (!activeVaultKey) {
      return {
        ...account,
        password: "",
        encryptionVersion: "client-v1",
        locked: true
      };
    }

    try {
      return {
        ...account,
        password: await decryptVaultText(account.passwordSecret, activeVaultKey),
        encryptionVersion: "client-v1",
        locked: false,
        decryptError: undefined
      };
    } catch {
      return {
        ...account,
        password: "",
        encryptionVersion: "client-v1",
        locked: true,
        decryptError: "保险库主密码不正确或密文已损坏"
      };
    }
  }

  const legacyPassword = account.legacyPassword ?? account.password;
  return {
    ...account,
    password: legacyPassword ?? "",
    legacyPassword,
    encryptionVersion: "legacy-server",
    locked: !legacyPassword
  };
}

async function hydrateSite(site: SiteDetail): Promise<SiteDetail> {
  return {
    ...site,
    accounts: await Promise.all(site.accounts.map((account) => hydrateAccount(account)))
  };
}

export const useVaultStore = defineStore("vault", {
  state: (): VaultState => ({
    sites: [],
    selectedSite: null,
    selectedSiteId: "",
    categories: [],
    tags: [],
    stats: emptyStats,
    search: "",
    categoryFilter: "all",
    tagFilter: "",
    viewFilter: "all",
    sortMode: "sort",
    loading: false,
    detailLoading: false,
    error: "",
    copiedId: "",
    visiblePasswords: {},
    vaultUnlocked: false,
    vaultBusy: false,
    vaultError: "",
    vaultNotice: "",
    legacyMigrationCount: 0
  }),
  getters: {
    activeCategoryName(state) {
      if (state.tagFilter) return `关键词：${state.tagFilter}`;
      if (state.viewFilter === "recent") return "最近使用";
      if (state.viewFilter === "favorites") return "收藏夹";
      if (state.categoryFilter === "all") return "所有网站";
      return state.categories.find((category) => category.id === state.categoryFilter)?.name ?? "所有网站";
    },
    allTags(state) {
      return state.tags.map((tag) => tag.name);
    }
  },
  actions: {
    async loadShellData() {
      const [{ categories }, { tags }, { stats }] = await Promise.all([api.categories(), api.tags(), api.stats()]);
      this.categories = categories;
      this.tags = tags;
      this.stats = stats;
    },
    async loadSites(selectFirst = true) {
      this.loading = true;
      this.error = "";
      try {
        const { sites } = await api.sites({
          search: this.search,
          category: this.categoryFilter,
          tag: this.tagFilter,
          favorite: this.viewFilter === "favorites",
          scope: this.viewFilter,
          sort: this.sortMode
        });
        const visibleSites = this.viewFilter === "favorites" ? sites.filter((site) => site.favorite) : sites;
        this.sites = visibleSites;
        const stillVisible = visibleSites.some((site) => site.id === this.selectedSiteId);
        if (selectFirst && (!this.selectedSiteId || !stillVisible)) {
          const google = visibleSites.find((site) => site.name === "Google");
          const first = google ?? visibleSites[0];
          if (first) {
            await this.selectSite(first.id);
          } else {
            this.selectedSiteId = "";
            this.selectedSite = null;
          }
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "加载网站失败";
      } finally {
        this.loading = false;
      }
    },
    async loadAll() {
      await this.loadShellData();
      await this.loadSites();
    },
    async selectSite(id: string) {
      this.selectedSiteId = id;
      this.detailLoading = true;
      this.error = "";
      try {
        const { site } = await api.site(id);
        this.selectedSite = await hydrateSite(site);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "加载详情失败";
      } finally {
        this.detailLoading = false;
      }
    },
    async setSearch(value: string) {
      this.search = value;
      await this.loadSites();
    },
    async setCategory(value: string) {
      this.categoryFilter = value;
      this.tagFilter = "";
      this.viewFilter = "all";
      await this.loadSites();
    },
    async setViewFilter(value: ViewFilter) {
      this.viewFilter = value;
      if (value !== "all") {
        this.categoryFilter = "all";
      }
      await this.loadSites();
    },
    async setSort(value: SiteSortMode) {
      this.sortMode = value;
      await this.loadSites(false);
    },
    async setTag(value: string) {
      this.tagFilter = value;
      this.categoryFilter = "all";
      this.viewFilter = "all";
      await this.loadSites();
    },
    async clearFilters() {
      this.search = "";
      this.categoryFilter = "all";
      this.tagFilter = "";
      this.viewFilter = "all";
      this.sortMode = "sort";
      await this.loadSites();
    },
    async createSite(input: SiteInput) {
      const { site } = await api.createSite({ ...input, accounts: [] });
      await this.loadShellData();
      await this.loadSites(false);
      await this.selectSite(site.id);
    },
    async updateSite(id: string, input: Partial<SiteInput>) {
      const { site } = await api.updateSite(id, input);
      this.selectedSite = await hydrateSite(site);
      await this.loadShellData();
      await this.loadSites(false);
      if (!this.sites.some((visibleSite) => visibleSite.id === this.selectedSiteId)) {
        const nextSite = this.sites[0];
        if (nextSite) {
          await this.selectSite(nextSite.id);
        } else {
          this.selectedSiteId = "";
          this.selectedSite = null;
        }
      }
    },
    async deleteSite(id: string) {
      await api.deleteSite(id);
      this.selectedSite = null;
      this.selectedSiteId = "";
      await this.loadShellData();
      await this.loadSites();
    },
    async createAccount(siteId: string, input: AccountInput) {
      await api.createAccount(siteId, (await accountInputToSecretPayload(input)) as AccountSecretInput);
      await this.loadShellData();
      await this.loadSites(false);
      await this.selectSite(siteId);
    },
    async updateAccount(accountId: string, input: Partial<AccountInput>) {
      await api.updateAccount(accountId, await accountInputToSecretPayload(input));
      await this.loadShellData();
      await this.loadSites(false);
      if (this.selectedSiteId) await this.selectSite(this.selectedSiteId);
    },
    async deleteAccount(accountId: string) {
      await api.deleteAccount(accountId);
      await this.loadShellData();
      await this.loadSites(false);
      if (this.selectedSiteId) await this.selectSite(this.selectedSiteId);
    },
    async copy(text: string, id: string) {
      const copied = await writeClipboard(text);
      if (!copied) return false;

      this.copiedId = id;
      window.setTimeout(() => {
        if (this.copiedId === id) this.copiedId = "";
      }, 1400);
      return true;
    },
    togglePassword(id: string) {
      this.visiblePasswords[id] = !this.visiblePasswords[id];
    },
    lockVault() {
      activeVaultKey = null;
      this.vaultUnlocked = false;
      this.visiblePasswords = {};
      if (this.selectedSite) {
        this.selectedSite = {
          ...this.selectedSite,
          accounts: this.selectedSite.accounts.map((account) => ({
            ...account,
            password: "",
            locked: true
          }))
        };
      }
    },
    async unlockVault(masterPassword: string) {
      const auth = useAuthStore();
      if (!auth.user) {
        throw new Error("请先登录");
      }

      this.vaultBusy = true;
      this.vaultError = "";
      this.vaultNotice = "";
      this.legacyMigrationCount = 0;

      try {
        const key = await deriveVaultKey(masterPassword, auth.user.cryptoSalt, auth.user.vaultKdfIterations);
        if (auth.user.vaultVerifier) {
          const verified = await verifyVaultKey(auth.user.vaultVerifier, key);
          if (!verified) {
            throw new Error("保险库主密码不正确");
          }
        } else {
          const vaultVerifier = await createVaultVerifier(key);
          const { user } = await api.updateVault({ vaultVerifier });
          auth.user = user;
        }

        activeVaultKey = key;
        this.vaultUnlocked = true;
        await this.migrateLegacyAccounts();
        if (this.selectedSiteId) await this.selectSite(this.selectedSiteId);
      } catch (error) {
        activeVaultKey = null;
        this.vaultUnlocked = false;
        this.vaultError = error instanceof Error ? error.message : "保险库解锁失败";
        throw error;
      } finally {
        this.vaultBusy = false;
      }
    },
    async migrateLegacyAccounts() {
      const vaultKey = activeVaultKey;
      if (!vaultKey) return;

      const { accounts } = await api.legacyMigrationAccounts();
      if (accounts.length === 0) return;

      const migrationAccounts = await Promise.all(
        accounts.map(async (account) => ({
          id: account.id,
          passwordSecret: await encryptVaultText(account.legacyPassword, vaultKey)
        }))
      );
      const { migrated } = await api.submitLegacyMigration({ accounts: migrationAccounts });

      if (migrated > 0) {
        this.legacyMigrationCount = migrated;
        this.vaultNotice = `已将 ${migrated} 个旧账号密码迁移为客户端加密`;
        await this.loadShellData();
        await this.loadSites(false);
      }
    }
  }
});
