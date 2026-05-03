<script setup lang="ts">
import { Database, Moon, ShieldCheck, X } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import { useVaultStore } from "../stores/vault";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const vault = useVaultStore();
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

      <section class="settings-section">
        <div class="settings-section-title">
          <Database :size="18" />
          <h3>存储空间</h3>
        </div>
        <div class="storage-bar">
          <i :style="{ width: `${Math.min((vault.stats.storageUsedMb / vault.stats.storageLimitMb) * 100, 100)}%` }" />
        </div>
        <p>已使用 {{ (vault.stats.storageUsedMb / 1000).toFixed(2) }} GB / {{ (vault.stats.storageLimitMb / 1000).toFixed(0) }} GB</p>
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
