export type PasswordStrength = "weak" | "medium" | "strong";

export type User = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

export type PublicSettings = {
  registrationEnabled: boolean;
};

export type AdminSettings = PublicSettings;

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

export type SystemBackup = {
  kind: "password-tools-backup";
  schemaVersion: number;
  appVersion?: string;
  exportedAt: string;
  encryption: {
    mode: string;
    requiresSameServerCryptoSecret: boolean;
  };
  tables: {
    users: unknown[];
    appSettings: unknown[];
    categories: unknown[];
    sites: unknown[];
    accounts: unknown[];
  };
};

export type BackupImportResult = {
  users: number;
  appSettings: number;
  categories: number;
  sites: number;
  accounts: number;
  importedAt: string;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  count: number;
};

export type TagSummary = {
  name: string;
  count: number;
};

export type Account = {
  id: string;
  siteId: string;
  label: string;
  username: string;
  password: string;
  strength: PasswordStrength;
  favorite: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type SiteSummary = {
  id: string;
  name: string;
  primaryUrl: string;
  backupUrls: string[];
  categoryId: string | null;
  category?: Category | null;
  iconType: string;
  iconValue: string;
  iconBg: string;
  iconColor: string;
  favorite: boolean;
  sortOrder: number;
  tags: string[];
  note: string;
  accountCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type SiteDetail = SiteSummary & {
  accounts: Account[];
};

export type Stats = {
  sites: number;
  accounts: number;
  favorites: number;
  weakAccounts: number;
  mediumAccounts: number;
  strongAccounts: number;
};

export type SiteInput = {
  name: string;
  primaryUrl: string;
  backupUrls: string[];
  categoryId?: string | null;
  iconType: string;
  iconValue: string;
  iconBg: string;
  iconColor: string;
  favorite: boolean;
  sortOrder: number;
  tags: string[];
  note?: string;
};

export type AccountInput = {
  label: string;
  username: string;
  password: string;
  strength?: PasswordStrength;
  favorite?: boolean;
  sortOrder?: number;
};
