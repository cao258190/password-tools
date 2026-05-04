<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { Database, Moon, ShieldCheck, UserPlus, X } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import { api } from "../api";
import { useAuthStore } from "../stores/auth";
import { useVaultStore } from "../stores/vault";

defineProps<{
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

watch(
  () => auth.publicSettings.registrationEnabled,
  (enabled) => {
    registrationEnabled.value = enabled;
  },
  { immediate: true }
);

onMounted(() => {
  void loadAdminSettings();
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

      <section class="settings-section">
        <div class="settings-section-title">
          <Database :size="18" />
          <h3>数据范围</h3>
        </div>
        <div class="settings-facts">
          <span>
            <strong>用户隔离</strong>
            仅返回当前登录用户的网站和账号
          </span>
          <span>
            <strong>固定分类</strong>
            所有用户共用同一套分类字典
          </span>
          <span>
            <strong>加密字段</strong>
            账号密码在数据库中以密文保存
          </span>
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
</template>
