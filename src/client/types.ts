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
  tags: string[];
  note?: string;
};

export type AccountInput = {
  label: string;
  username: string;
  password: string;
  strength?: PasswordStrength;
  favorite?: boolean;
};
