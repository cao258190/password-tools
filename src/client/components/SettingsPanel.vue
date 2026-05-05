<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { CheckCircle2, DownloadCloud, ExternalLink, Moon, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-vue-next";
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
const versionError = ref("");
const updateConfirmOpen = ref(false);
const updateRefreshOpen = ref(false);
const targetVersion = ref("");
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
  () => Boolean(versionInfo.value?.updateEnabled) && Boolean(selectedTargetVersion.value) && !targetMatchesCurrent.value && !versionInfo.value?.updateRunning
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
  updateConfirmOpen.value = false;
  if (!auth.user?.isAdmin) return;
  versionError.value = "";
  try {
    const { update } = await api.runUpdate({ targetVersion: selectedTargetVersion.value || undefined });
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
  }
}

function refreshPage() {
  window.location.reload();
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
        <p>登录密码使用 bcrypt 哈希保存，账号密码使用 AES-256-GCM 加密存储。</p>
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
            :class="{ active: registrationEnabled }"
            type="button"
            :disabled="savingRegistration"
            :aria-pressed="registrationEnabled"
            @click="toggleRegistration"
          >
            <i />
          </button>
        </label>
        <p v-if="settingsError" class="form-error">{{ settingsError }}</p>
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
              检测更新
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
              <DownloadCloud :size="16" />
              立即更新
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

  <ModalFrame :open="updateConfirmOpen" title="确认在线更新" @close="updateConfirmOpen = false">
    <div class="confirm-body">
      <DownloadCloud :size="28" />
      <p>确认更新到 {{ selectedTargetVersion || "所选版本" }}？更新过程中服务可能短暂不可用。</p>
    </div>
    <footer class="modal-footer">
      <button class="secondary" type="button" @click="updateConfirmOpen = false">取消</button>
      <button class="danger" type="button" @click="runVersionUpdate">确认更新</button>
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
</template>
