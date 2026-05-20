import { setActivePinia, createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/client/api";
import { useAuthStore } from "../../src/client/stores/auth";
import { useVaultStore } from "../../src/client/stores/vault";
import type { Account, User } from "../../src/client/types";
import { createVaultVerifier, decryptVaultText, deriveVaultKey, encryptVaultText, verifyVaultKey } from "../../src/client/utils/vaultCrypto";

vi.mock("../../src/client/api", () => ({
  api: {
    vaultRotationAccounts: vi.fn(),
    legacyMigrationAccounts: vi.fn(),
    submitLegacyMigration: vi.fn(),
    rotateVaultPassword: vi.fn()
  }
}));

const cryptoImpl = globalThis.crypto;
Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: cryptoImpl
});

function testUser(vaultVerifier: string): User {
  return {
    id: "user-1",
    email: "owner@example.com",
    name: "Owner",
    cryptoSalt: "00112233445566778899aabbccddeeff",
    isAdmin: false,
    vaultKdfIterations: 1,
    vaultVerifier
  };
}

function testAccount(input: Partial<Account> & Pick<Account, "id" | "passwordSecret">): Account {
  return {
    id: input.id,
    siteId: input.siteId ?? "site-1",
    label: input.label ?? "主账号",
    username: input.username ?? "owner@example.com",
    password: input.password ?? "",
    passwordSecret: input.passwordSecret,
    encryptionVersion: input.encryptionVersion ?? "client-v1",
    locked: input.locked,
    decryptError: input.decryptError,
    strength: input.strength ?? "strong",
    favorite: input.favorite ?? false,
    sortOrder: input.sortOrder ?? 0,
    createdAt: input.createdAt ?? new Date("2026-05-20T00:00:00.000Z").toISOString(),
    updatedAt: input.updatedAt ?? new Date("2026-05-20T00:00:00.000Z").toISOString(),
    lastUsedAt: input.lastUsedAt ?? null
  };
}

describe("vault store password rotation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api.vaultRotationAccounts).mockReset();
    vi.mocked(api.legacyMigrationAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(api.submitLegacyMigration).mockReset();
    vi.mocked(api.submitLegacyMigration).mockResolvedValue({ migrated: 0 });
    vi.mocked(api.rotateVaultPassword).mockReset();
  });

  it("rejects an incorrect current vault password before sending updates", async () => {
    const oldKey = await deriveVaultKey("old-master-pass", "00112233445566778899aabbccddeeff", 1);
    const verifier = await createVaultVerifier(oldKey);
    const auth = useAuthStore();
    const vault = useVaultStore();
    auth.user = testUser(verifier);

    await expect(vault.rotateVaultPassword("wrong-master-pass", "new-master-pass")).rejects.toThrow("当前保险库主密码不正确");
    expect(api.vaultRotationAccounts).not.toHaveBeenCalled();
    expect(api.rotateVaultPassword).not.toHaveBeenCalled();
  });

  it("re-encrypts every loaded account with the new vault password", async () => {
    const oldKey = await deriveVaultKey("old-master-pass", "00112233445566778899aabbccddeeff", 1);
    const verifier = await createVaultVerifier(oldKey);
    const firstSecret = await encryptVaultText("first-password", oldKey);
    const secondSecret = await encryptVaultText("second-password", oldKey);
    const thirdSecret = await encryptVaultText("third-password", oldKey);
    const rotatedUser = testUser("rotated-verifier");
    vi.mocked(api.vaultRotationAccounts).mockResolvedValue({
      accounts: [
        { id: "account-1", passwordSecret: firstSecret },
        { id: "account-2", passwordSecret: secondSecret },
        { id: "account-3", passwordSecret: thirdSecret }
      ]
    });
    vi.mocked(api.rotateVaultPassword).mockResolvedValue({ user: rotatedUser });

    const auth = useAuthStore();
    const vault = useVaultStore();
    auth.user = testUser(verifier);
    vault.selectedSiteId = "site-1";
    vault.selectedSite = {
      id: "site-1",
      name: "Example",
      primaryUrl: "https://example.com",
      backupUrls: [],
      categoryId: null,
      iconType: "letter",
      iconValue: "E",
      iconUrl: null,
      iconBg: "#2563eb",
      iconColor: "#ffffff",
      favorite: false,
      sortOrder: 0,
      tags: [],
      note: "",
      accountCount: 2,
      createdAt: new Date("2026-05-20T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-05-20T00:00:00.000Z").toISOString(),
      lastUsedAt: null,
      accounts: [
        testAccount({ id: "account-1", password: "first-password", passwordSecret: firstSecret }),
        testAccount({ id: "account-2", password: "second-password", passwordSecret: secondSecret })
      ]
    };

    await vault.unlockVault("old-master-pass");
    vi.mocked(api.rotateVaultPassword).mockClear();

    await vault.rotateVaultPassword("old-master-pass", "new-master-pass");

    expect(api.rotateVaultPassword).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.rotateVaultPassword).mock.calls[0][0];
    expect(payload.accounts.map((account) => account.id)).toEqual(["account-1", "account-2", "account-3"]);
    expect(payload.accounts.map((account) => account.passwordSecret)).not.toContain(firstSecret);
    const newKey = await deriveVaultKey("new-master-pass", "00112233445566778899aabbccddeeff", 1);
    await expect(Promise.all(payload.accounts.map((account) => decryptVaultText(account.passwordSecret, newKey)))).resolves.toEqual([
      "first-password",
      "second-password",
      "third-password"
    ]);
    await expect(verifyVaultKey(payload.vaultVerifier, newKey)).resolves.toBe(true);
    expect(auth.user).toEqual(rotatedUser);
    expect(vault.vaultUnlocked).toBe(true);
  });

  it("migrates legacy account secrets before rotating the vault password", async () => {
    const oldKey = await deriveVaultKey("old-master-pass", "00112233445566778899aabbccddeeff", 1);
    const verifier = await createVaultVerifier(oldKey);
    const migratedLegacySecret = await encryptVaultText("legacy-password", oldKey);
    vi.mocked(api.legacyMigrationAccounts).mockResolvedValue({
      accounts: [{ id: "legacy-account", legacyPassword: "legacy-password" }]
    });
    vi.mocked(api.vaultRotationAccounts).mockResolvedValue({
      accounts: [{ id: "legacy-account", passwordSecret: migratedLegacySecret }]
    });
    vi.mocked(api.rotateVaultPassword).mockResolvedValue({ user: testUser("rotated-verifier") });

    const auth = useAuthStore();
    const vault = useVaultStore();
    auth.user = testUser(verifier);

    await vault.rotateVaultPassword("old-master-pass", "new-master-pass");

    expect(api.submitLegacyMigration).toHaveBeenCalledTimes(1);
    const migrationPayload = vi.mocked(api.submitLegacyMigration).mock.calls[0][0];
    expect(migrationPayload.accounts.map((account) => account.id)).toEqual(["legacy-account"]);
    await expect(decryptVaultText(migrationPayload.accounts[0].passwordSecret, oldKey)).resolves.toBe("legacy-password");
  });
});
