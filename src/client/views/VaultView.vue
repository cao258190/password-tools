<script setup lang="ts">
import { onMounted, ref } from "vue";
import { FileText, FolderTree, ListChecks, UsersRound } from "lucide-vue-next";
import AccountModal from "../components/AccountModal.vue";
import AccountPanel from "../components/AccountPanel.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import ProfileModal from "../components/ProfileModal.vue";
import SettingsPanel from "../components/SettingsPanel.vue";
import SidebarNav from "../components/SidebarNav.vue";
import SiteDetail from "../components/SiteDetail.vue";
import SiteList from "../components/SiteList.vue";
import SiteModal from "../components/SiteModal.vue";
import TopBar from "../components/TopBar.vue";
import { useAuthStore } from "../stores/auth";
import { useVaultStore } from "../stores/vault";
import type { Account, AccountInput, SiteDetail as SiteDetailType, SiteInput } from "../types";

const auth = useAuthStore();
const vault = useVaultStore();
const siteModalOpen = ref(false);
const accountModalOpen = ref(false);
const accountModalMode = ref<"create" | "edit" | "generate">("create");
const editingSite = ref<SiteDetailType | null>(null);
const editingAccount = ref<Account | null>(null);
const deletingSite = ref<SiteDetailType | null>(null);
const deletingAccount = ref<Account | null>(null);
const pendingBackupRemoval = ref<{ site: SiteDetailType; url: string } | null>(null);
const pendingAccountPayload = ref<AccountInput | null>(null);
const logoutConfirmOpen = ref(false);
const modalError = ref("");
const toast = ref("");
const settingsOpen = ref(false);
const profileOpen = ref(false);
const mobileView = ref<"filters" | "sites" | "detail" | "accounts">("sites");
let toastTimer = 0;

onMounted(() => {
  void vault.loadAll();
});

function openCreateSite() {
  editingSite.value = null;
  modalError.value = "";
  siteModalOpen.value = true;
}

function openMobileView(view: typeof mobileView.value) {
  mobileView.value = view;
}

function openEditSite(site: SiteDetailType) {
  editingSite.value = site;
  modalError.value = "";
  siteModalOpen.value = true;
}

function openCreateAccount() {
  editingAccount.value = null;
  modalError.value = "";
  accountModalMode.value = "create";
  accountModalOpen.value = true;
}

function handleSiteSelected() {
  mobileView.value = "detail";
}

function openEditAccount(account: Account) {
  editingAccount.value = account;
  modalError.value = "";
  accountModalMode.value = "edit";
  accountModalOpen.value = true;
}

function openGenerateAccount(account: Account) {
  editingAccount.value = account;
  modalError.value = "";
  accountModalMode.value = "generate";
  accountModalOpen.value = true;
}

async function saveSite(payload: SiteInput) {
  modalError.value = "";
  try {
    if (editingSite.value) {
      await vault.updateSite(editingSite.value.id, payload);
    } else {
      await vault.createSite(payload);
    }
    siteModalOpen.value = false;
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : "保存网站失败";
  }
}

async function persistAccount(payload: AccountInput) {
  if (!vault.selectedSiteId) return;
  modalError.value = "";
  try {
    if (editingAccount.value) {
      await vault.updateAccount(editingAccount.value.id, payload);
    } else {
      await vault.createAccount(vault.selectedSiteId, payload);
    }
    accountModalOpen.value = false;
    accountModalMode.value = "create";
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : "保存账号失败";
  }
}

async function saveAccount(payload: AccountInput) {
  if (editingAccount.value && payload.password !== editingAccount.value.password) {
    pendingAccountPayload.value = payload;
    return;
  }

  await persistAccount(payload);
}

async function confirmAccountPasswordChange() {
  if (!pendingAccountPayload.value) return;
  const payload = pendingAccountPayload.value;
  pendingAccountPayload.value = null;
  await persistAccount(payload);
}

async function confirmDeleteSite() {
  if (!deletingSite.value) return;
  await vault.deleteSite(deletingSite.value.id);
  deletingSite.value = null;
}

async function confirmDeleteAccount() {
  if (!deletingAccount.value) return;
  await vault.deleteAccount(deletingAccount.value.id);
  deletingAccount.value = null;
}

async function toggleFavorite(site: SiteDetailType) {
  await vault.updateSite(site.id, { favorite: !site.favorite });
  showToast(site.favorite ? "已取消收藏" : "已加入收藏");
}

async function removeBackupUrl(site: SiteDetailType, url: string) {
  pendingBackupRemoval.value = { site, url };
}

async function confirmRemoveBackupUrl() {
  if (!pendingBackupRemoval.value) return;
  const { site, url } = pendingBackupRemoval.value;
  const backupUrls = site.backupUrls.filter((item) => item !== url);
  await vault.updateSite(site.id, { backupUrls });
  pendingBackupRemoval.value = null;
  showToast("备用网址已移除");
}

async function confirmLogout() {
  logoutConfirmOpen.value = false;
  await auth.logout();
  window.location.assign("/login");
}

function showToast(message: string) {
  toast.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = "";
  }, 1600);
}
</script>

<template>
  <div class="vault-app" :class="`mobile-view-${mobileView}`">
    <TopBar
      :settings-open="settingsOpen"
      @open-settings="settingsOpen = true"
      @open-profile="profileOpen = true"
      @request-logout="logoutConfirmOpen = true"
    />
    <div class="vault-grid">
      <SidebarNav @add-site="openCreateSite" />
      <SiteList @selected="handleSiteSelected" />
      <SiteDetail
        :site="vault.selectedSite"
        :loading="vault.detailLoading"
        @edit="openEditSite"
        @delete="deletingSite = $event"
        @toggle-favorite="toggleFavorite"
        @copied="showToast"
        @remove-backup-url="removeBackupUrl"
      />
      <AccountPanel
        :site="vault.selectedSite"
        @add="openCreateAccount"
        @edit="openEditAccount"
        @generate="openGenerateAccount"
        @delete="deletingAccount = $event"
        @copied="showToast"
      />
    </div>

    <nav class="mobile-bottom-nav" aria-label="移动端导航">
      <button type="button" :class="{ active: mobileView === 'filters' }" @click="openMobileView('filters')">
        <FolderTree :size="18" />
        分类
      </button>
      <button type="button" :class="{ active: mobileView === 'sites' }" @click="openMobileView('sites')">
        <ListChecks :size="18" />
        网站
      </button>
      <button type="button" :class="{ active: mobileView === 'detail' }" :disabled="!vault.selectedSite && !vault.detailLoading" @click="openMobileView('detail')">
        <FileText :size="18" />
        详情
      </button>
      <button type="button" :class="{ active: mobileView === 'accounts' }" :disabled="!vault.selectedSite" @click="openMobileView('accounts')">
        <UsersRound :size="18" />
        账号
      </button>
    </nav>

    <p v-if="modalError" class="floating-error">{{ modalError }}</p>
    <p v-if="toast" class="floating-toast">{{ toast }}</p>

    <SiteModal
      :open="siteModalOpen"
      :site="editingSite"
      :categories="vault.categories"
      @close="siteModalOpen = false"
      @submit="saveSite"
    />

    <AccountModal
      :open="accountModalOpen"
      :account="editingAccount"
      :mode="accountModalMode"
      @close="accountModalOpen = false; accountModalMode = 'create'"
      @submit="saveAccount"
    />

    <ConfirmDialog
      :open="Boolean(deletingSite)"
      title="删除网站"
      :message="`确认删除 ${deletingSite?.name ?? ''}？该网站下的账号也会被删除。`"
      @close="deletingSite = null"
      @confirm="confirmDeleteSite"
    />

    <ConfirmDialog
      :open="Boolean(deletingAccount)"
      title="删除账号"
      :message="`确认删除 ${deletingAccount?.label ?? ''}？`"
      @close="deletingAccount = null"
      @confirm="confirmDeleteAccount"
    />

    <ConfirmDialog
      :open="Boolean(pendingBackupRemoval)"
      title="移除备用网址"
      :message="`确认移除 ${pendingBackupRemoval?.url ?? ''}？移除后需要重新编辑网站才能加回。`"
      confirm-text="确认移除"
      @close="pendingBackupRemoval = null"
      @confirm="confirmRemoveBackupUrl"
    />

    <ConfirmDialog
      :open="Boolean(pendingAccountPayload)"
      title="覆盖账号密码"
      :message="`确认更新 ${editingAccount?.label ?? ''} 的密码？保存后旧密码将被新密码替换。`"
      confirm-text="确认覆盖"
      @close="pendingAccountPayload = null"
      @confirm="confirmAccountPasswordChange"
    />

    <ConfirmDialog
      :open="logoutConfirmOpen"
      title="退出登录"
      message="确认退出当前账号？未保存的编辑内容会丢失。"
      confirm-text="退出"
      @close="logoutConfirmOpen = false"
      @confirm="confirmLogout"
    />

    <SettingsPanel :open="settingsOpen" @close="settingsOpen = false" />
    <ProfileModal :open="profileOpen" @close="profileOpen = false" @notice="showToast" />
  </div>
</template>
