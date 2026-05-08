<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { CheckCircle2, Database, DownloadCloud, ExternalLink, Loader2, Moon, RefreshCw, ShieldCheck, UploadCloud, UserPlus, X } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import { api } from "../api";
import { useAuthStore } from "../stores/auth";
import { useVaultStore } from "../stores/vault";
import type { UpdateStatus, VersionInfo } from "../types";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const vault = useVaultStore();
const auth = useAuthStore();
const registrationEnabled = ref(false);
const savingRegistration = ref(false);
const settingsError = ref("");
const versionInfo = ref<VersionInfo | null>(null);
const versionLoading = ref(false);
const updatingVersion = ref(false);
const versionError = ref("");
const updateConfirmOpen = ref(false);
const updateRefreshOpen = ref(false);
const importConfirmOpen = ref(false);
const targetVersion = ref("");
const backupExporting = ref(false);
const backupImporting = ref(false);
const backupError = ref("");
const backupNotice = ref("");
const backupFileInput = ref<HTMLInputElement | null>(null);
const pendingBackup = ref<unknown | null>(null);
const pendingBackupName = ref("");
let updateTimer = 0;
let updateWasRunning = false;
let promptedUpdateKey = "";

const updateStatusText = computed(() => {
  if (!versionInfo.value) return "尚未检测";
  if (versionInfo.value.updateRunning) return "更新中";
  if (versionInfo.value.updateAvailable) return "发现新版本";
  return "已是最新";
});

const lastUpdateOutput = computed(() => versionInfo.value?.lastUpdate?.output.trim() || "");
const selectableVersions = computed(() => {
  const releases = versionInfo.value?.releaseVersions ?? [];
  const seen = new Set<string>();
  return releases.filter((release) => {
    if (seen.has(release.version)) return false;
    seen.add(release.version);
    return true;
  });
});
const selectedTargetVersion = computed(() => targetVersion.value || versionInfo.value?.latestVersion || "");
const targetMatchesCurrent = computed(() => {
  if (!versionInfo.value || !selectedTargetVersion.value) return false;
  return normalizeVersion(selectedTargetVersion.value) === normalizeVersion(versionInfo.value.currentVersion);
});
const canRunVersionUpdate = computed(
  () =>
    Boolean(versionInfo.value?.updateEnabled) &&
    Boolean(selectedTargetVersion.value) &&
    !targetMatchesCurrent.value &&
    !versionInfo.value?.updateRunning &&
    !updatingVersion.value
);

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, "");
}

function updateKey(update: UpdateStatus) {
  return `${update.startedAt}:${update.finishedAt ?? ""}:${update.status}`;
}

async function loadAdminSettings() {
  if (!auth.user?.isAdmin) return;
  try {
    const { settings } = await api.adminSettings();
    registrationEnabled.value = settings.registrationEnabled;
    auth.publicSettings = settings;
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : "加载管理员设置失败";
  }
}

async function loadVersion(force = false) {
  if (!auth.user?.isAdmin || versionLoading.value) return;
  versionLoading.value = true;
  versionError.value = "";
  try {
    const { version } = await api.adminVersion(force);
    versionInfo.value = version;
    if (!targetVersion.value && version.latestVersion) {
      targetVersion.value = version.latestVersion;
    }
  } catch (error) {
    versionError.value = error instanceof Error ? error.message : "检测版本失败";
  } finally {
    versionLoading.value = false;
  }
}

async function refreshUpdateStatus() {
  if (!auth.user?.isAdmin) return;
  try {
    const status = await api.updateStatus();
    if (versionInfo.value) {
      versionInfo.value = {
        ...versionInfo.value,
        updateEnabled: status.updateEnabled,
        updateRunning: status.updateRunning,
        lastUpdate: status.lastUpdate
      };
    }
    if (status.updateRunning) {
      updateWasRunning = true;
      scheduleUpdateRefresh();
    } else {
      if (updateTimer) {
        window.clearTimeout(updateTimer);
        updateTimer = 0;
      }
      if (updateWasRunning) {
        updateWasRunning = false;
        void loadVersion(true);
        if (status.lastUpdate?.status === "success") {
          const key = updateKey(status.lastUpdate);
          if (key !== promptedUpdateKey) {
            promptedUpdateKey = key;
            updateRefreshOpen.value = true;
          }
        }
      }
    }
  } catch {
    if (updateTimer) {
      window.clearTimeout(updateTimer);
      updateTimer = 0;
    }
    if (updateWasRunning) {
      scheduleUpdateRefresh();
    }
  }
}

function scheduleUpdateRefresh() {
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(() => {
    void refreshUpdateStatus();
  }, 2500);
}

async function runVersionUpdate() {
  if (!auth.user?.isAdmin || updatingVersion.value) return;
  updatingVersion.value = true;
  versionError.value = "";
  try {
    const { update } = await api.runUpdate({ targetVersion: selectedTargetVersion.value || undefined });
    updateConfirmOpen.value = false;
    updateWasRunning = update.status === "running";
    if (versionInfo.value) {
      versionInfo.value = {
        ...versionInfo.value,
        updateRunning: update.status === "running",
        lastUpdate: update
      };
    }
    scheduleUpdateRefresh();
  } catch (error) {
    versionError.value = error instanceof Error ? error.message : "启动更新失败";
  } finally {
    updatingVersion.value = false;
  }
}

function refreshPage() {
  window.location.reload();
}

function backupFileName(exportedAt: string) {
  return `password-tools-backup-${exportedAt.replace(/[:.]/g, "-")}.json`;
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function exportBackup() {
  if (!auth.user?.isAdmin || backupExporting.value) return;
  backupExporting.value = true;
  backupError.value = "";
  backupNotice.value = "";
  try {
    const { backup } = await api.exportBackup();
    downloadJsonFile(backupFileName(backup.exportedAt), backup);
    backupNotice.value = `已导出 ${backup.tables.users.length} 个用户、${backup.tables.sites.length} 个网站、${backup.tables.accounts.length} 个账号`;
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : "导出备份失败";
  } finally {
    backupExporting.value = false;
  }
}

function chooseBackupFile() {
  backupError.value = "";
  backupNotice.value = "";
  backupFileInput.value?.click();
}

async function onBackupFileSelected(event: Event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  const file = input?.files?.[0];
  if (input) input.value = "";
  if (!file) return;

  try {
    pendingBackup.value = JSON.parse(await file.text());
    pendingBackupName.value = file.name;
    importConfirmOpen.value = true;
  } catch {
    pendingBackup.value = null;
    pendingBackupName.value = "";
    backupError.value = "备份文件不是有效 JSON";
  }
}

async function confirmImportBackup() {
  if (!auth.user?.isAdmin || !pendingBackup.value || backupImporting.value) return;
  backupImporting.value = true;
  backupError.value = "";
  backupNotice.value = "";
  try {
    const { result } = await api.importBackup({ backup: pendingBackup.value, confirm: "RESTORE" });
    backupNotice.value = `导入完成：${result.users} 个用户、${result.sites} 个网站、${result.accounts} 个账号`;
    pendingBackup.value = null;
    pendingBackupName.value = "";
    importConfirmOpen.value = false;
    window.setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : "导入备份失败";
  } finally {
    backupImporting.value = false;
  }
}

async function toggleRegistration() {
  if (!auth.user?.isAdmin || savingRegistration.value) return;
  savingRegistration.value = true;
  settingsError.value = "";
  try {
    const nextValue = !registrationEnabled.value;
    const { settings } = await api.updateAdminSettings({ registrationEnabled: nextValue });
    registrationEnabled.value = settings.registrationEnabled;
    auth.publicSettings = settings;
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : "保存管理员设置失败";
  } finally {
    savingRegistration.value = false;
  }
}

function loadSettingsPanelData() {
  if (!props.open || !auth.user?.isAdmin) return;
  void loadAdminSettings();
  void loadVersion();
  void refreshUpdateStatus();
}

watch(
  () => auth.publicSettings.registrationEnabled,
  (enabled) => {
    registrationEnabled.value = enabled;
  },
  { immediate: true }
);

watch(() => props.open, loadSettingsPanelData, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(updateTimer);
});
</script>

<template>
  <ModalFrame :open="open" title="保险库设置" @close="emit('close')">
    <div class="settings-panel">
      <section class="settings-section">
        <div class="settings-section-title">
          <ShieldCheck :size="18" />
          <h3>安全状态</h3>
        </div>
        <p>登录密码使用 bcrypt 哈希保存，账号密码在浏览器内用保险库主密码加密。</p>
        <div class="settings-kpis">
          <span>
            <strong>{{ vault.stats.sites }}</strong>
            网站
          </span>
          <span>
            <strong>{{ vault.stats.accounts }}</strong>
            账号
          </span>
          <span>
            <strong>{{ vault.stats.favorites }}</strong>
            收藏
          </span>
        </div>
      </section>

      <section v-if="auth.user?.isAdmin" class="settings-section">
        <div class="settings-section-title">
          <UserPlus :size="18" />
          <h3>注册控制</h3>
        </div>
        <label class="settings-toggle-row">
          <span>
            <strong>允许新用户注册</strong>
            <small>{{ registrationEnabled ? "新用户可以在登录页创建账号" : "登录页将隐藏注册入口" }}</small>
          </span>
          <button
            class="switch-button"
            :class="{ active: registrationEnabled, loading: savingRegistration }"
            type="button"
            :disabled="savingRegistration"
            :aria-pressed="registrationEnabled"
            @click="toggleRegistration"
          >
            <RefreshCw v-if="savingRegistration" class="spin switch-loading-icon" :size="14" />
            <i v-else />
          </button>
        </label>
        <p v-if="settingsError" class="form-error">{{ settingsError }}</p>
      </section>

      <section v-if="auth.user?.isAdmin" class="settings-section">
        <div class="settings-section-title">
          <Database :size="18" />
          <h3>数据备份</h3>
        </div>
        <div class="backup-card">
          <p>导出文件包含全系统用户、分类、网站和账号密文数据。客户端加密账号不依赖服务器密钥。</p>
          <div class="backup-actions">
            <button class="secondary" type="button" :disabled="backupExporting" @click="exportBackup">
              <DownloadCloud :class="{ spin: backupExporting }" :size="16" />
              {{ backupExporting ? "导出中" : "导出数据" }}
            </button>
            <button class="danger subtle" type="button" :disabled="backupImporting" @click="chooseBackupFile">
              <UploadCloud :class="{ spin: backupImporting }" :size="16" />
              {{ backupImporting ? "导入中" : "导入数据" }}
            </button>
          </div>
          <input ref="backupFileInput" class="hidden-file-input" type="file" accept="application/json,.json" @change="onBackupFileSelected" />
          <p v-if="backupNotice" class="form-success">{{ backupNotice }}</p>
          <p v-if="backupError" class="form-error">{{ backupError }}</p>
        </div>
      </section>

      <section v-if="auth.user?.isAdmin" class="settings-section">
        <div class="settings-section-title">
          <DownloadCloud :size="18" />
          <h3>版本更新</h3>
        </div>
        <div class="version-card" :class="{ pending: versionInfo?.updateAvailable, running: versionInfo?.updateRunning }">
          <div class="version-status-row">
            <span>
              <strong>{{ updateStatusText }}</strong>
              <small v-if="versionInfo">检测时间：{{ new Date(versionInfo.checkedAt).toLocaleString("zh-CN") }}</small>
              <small v-else>从 GitHub 检测当前项目最新版本</small>
            </span>
            <span class="version-badge">{{ versionInfo?.source === "release" ? "Release" : "版本号" }}</span>
          </div>
          <div class="settings-facts version-facts">
            <span>
              <strong>当前版本</strong>
              {{ versionInfo?.currentVersion ?? "未知" }}
            </span>
            <span>
              <strong>最新版本</strong>
              {{ versionInfo?.latestVersion ?? "未检测到" }}
            </span>
            <span v-if="versionInfo?.latestSha">
              <strong>对应提交</strong>
              {{ versionInfo.latestSha.slice(0, 12) }}
            </span>
          </div>
          <label v-if="selectableVersions.length" class="version-target-row">
            <span>
              <strong>目标版本</strong>
              <small>可选择最新版本或回退到历史 Release</small>
            </span>
            <select v-model="targetVersion" :disabled="versionInfo?.updateRunning">
              <option v-for="release in selectableVersions" :key="release.version" :value="release.version">
                {{ release.version }}{{ release.prerelease ? " 预发布" : "" }}
              </option>
            </select>
          </label>
          <p v-if="!versionInfo?.updateEnabled">Web 在线更新未启用，请在服务器配置 WEB_UPDATE_ENABLED 和 UPDATE_COMMAND。</p>
          <p v-else-if="targetMatchesCurrent">当前已是 {{ selectedTargetVersion }}，无需重复更新。</p>
          <p v-else-if="selectedTargetVersion">将更新到 {{ selectedTargetVersion }}，更新完成后会提示是否刷新页面。</p>
          <p v-else>当前部署未检测到可用更新。</p>
          <p v-if="versionError" class="form-error">{{ versionError }}</p>
          <div v-if="versionInfo?.lastUpdate" class="update-log">
            <strong>{{ versionInfo.lastUpdate.message }}</strong>
            <small>
              {{ versionInfo.lastUpdate.startedAt ? new Date(versionInfo.lastUpdate.startedAt).toLocaleString("zh-CN") : "" }}
              <template v-if="versionInfo.lastUpdate.finishedAt"> - {{ new Date(versionInfo.lastUpdate.finishedAt).toLocaleString("zh-CN") }}</template>
            </small>
            <pre v-if="lastUpdateOutput">{{ lastUpdateOutput }}</pre>
          </div>
          <div class="version-actions">
            <button class="secondary" type="button" :disabled="versionLoading || versionInfo?.updateRunning" @click="loadVersion(true)">
              <RefreshCw :class="{ spin: versionLoading }" :size="16" />
              {{ versionLoading ? "检测中" : "检测更新" }}
            </button>
            <a v-if="versionInfo?.latestUrl" class="secondary" :href="versionInfo.latestUrl" target="_blank" rel="noreferrer">
              <ExternalLink :size="16" />
              GitHub
            </a>
            <button
              class="primary"
              type="button"
              :disabled="!canRunVersionUpdate"
              @click="updateConfirmOpen = true"
            >
              <RefreshCw v-if="versionInfo?.updateRunning" class="spin" :size="16" />
              <DownloadCloud v-else :size="16" />
              {{ versionInfo?.updateRunning ? "更新中" : "立即更新" }}
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section-title">
          <Moon :size="18" />
          <h3>界面偏好</h3>
        </div>
        <p>顶部月亮按钮可在暗色与浅色模式间切换，并会保存到本地浏览器。</p>
      </section>

      <footer class="modal-footer">
        <button class="secondary" type="button" @click="emit('close')">
          <X :size="16" />
          关闭
        </button>
      </footer>
    </div>
  </ModalFrame>

  <ModalFrame :open="updateConfirmOpen" title="确认在线更新" :dismissible="!updatingVersion" @close="updateConfirmOpen = false">
    <div class="confirm-body">
      <DownloadCloud :size="28" />
      <p>确认更新到 {{ selectedTargetVersion || "所选版本" }}？更新过程中服务可能短暂不可用。</p>
    </div>
    <footer class="modal-footer">
      <button class="secondary" type="button" :disabled="updatingVersion" @click="updateConfirmOpen = false">取消</button>
      <button class="danger" type="button" :disabled="updatingVersion" @click="runVersionUpdate">
        <Loader2 v-if="updatingVersion" class="spin" :size="16" />
        <DownloadCloud v-else :size="16" />
        {{ updatingVersion ? "启动中" : "确认更新" }}
      </button>
    </footer>
  </ModalFrame>

  <ModalFrame :open="updateRefreshOpen" title="更新完成" @close="updateRefreshOpen = false">
    <div class="confirm-body success">
      <CheckCircle2 :size="28" />
      <p>新版本已部署完成。是否立即刷新页面以加载最新前端资源？</p>
    </div>
    <footer class="modal-footer">
      <button class="secondary" type="button" @click="updateRefreshOpen = false">稍后刷新</button>
      <button class="primary" type="button" @click="refreshPage">立即刷新</button>
    </footer>
  </ModalFrame>

  <ModalFrame :open="importConfirmOpen" title="确认导入数据" :dismissible="!backupImporting" @close="importConfirmOpen = false">
    <div class="confirm-body">
      <UploadCloud :size="28" />
      <p>确认导入 {{ pendingBackupName || "所选备份文件" }}？当前系统中的用户、网站、账号和设置会被备份内容覆盖。</p>
    </div>
    <p v-if="backupError" class="modal-inline-error">{{ backupError }}</p>
    <footer class="modal-footer">
      <button class="secondary" type="button" :disabled="backupImporting" @click="importConfirmOpen = false">取消</button>
      <button class="danger" type="button" :disabled="backupImporting" @click="confirmImportBackup">
        <Loader2 v-if="backupImporting" class="spin" :size="16" />
        <UploadCloud v-else :size="16" />
        {{ backupImporting ? "导入中" : "确认导入" }}
      </button>
    </footer>
  </ModalFrame>
</template>
