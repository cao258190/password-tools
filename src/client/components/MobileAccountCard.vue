<script setup lang="ts">
import { Copy, Eye, EyeOff, Pencil, RefreshCw, Trash2 } from "lucide-vue-next";
import type { Account } from "../types";
import { useVaultStore } from "../stores/vault";
import { relativeTime, strengthLabel } from "../utils/password";

const props = withDefaults(defineProps<{
  account: Account;
  featured?: boolean;
}>(), {
  featured: false
});

const emit = defineEmits<{
  edit: [account: Account];
  generate: [account: Account];
  delete: [account: Account];
  copied: [message: string];
}>();

const vault = useVaultStore();

async function copyValue(value: string, id: string) {
  if (!value) return;
  const copied = await vault.copy(value, id);
  emit("copied", copied ? "复制成功" : "复制失败，请手动复制");
}
</script>

<template>
  <article class="mobile-account-card" :class="[`strength-${props.account.strength}`, { featured: props.featured }]">
    <div class="account-card-head">
      <span class="account-badge">{{ props.account.label }}</span>
      <div>
        <button class="icon-button small" type="button" title="编辑账号" :disabled="props.account.locked" @click="emit('edit', props.account)">
          <Pencil :size="14" />
        </button>
        <button class="icon-button small" type="button" title="删除账号" @click="emit('delete', props.account)">
          <Trash2 :size="14" />
        </button>
      </div>
    </div>

    <label>
      用户名
      <div class="secret-line">
        <span class="secret-value">{{ props.account.username }}</span>
        <span class="secret-actions">
          <button class="icon-button small" type="button" title="复制用户名" @click="void copyValue(props.account.username, `mobile-user-${props.account.id}`)">
            <Copy v-if="vault.copiedId !== `mobile-user-${props.account.id}`" :size="14" />
            <span v-else class="copy-done">✓</span>
          </button>
        </span>
      </div>
    </label>

    <label>
      密码
      <div class="secret-line">
        <span class="secret-value password-text">
          {{ props.account.decryptError ? "解密失败" : props.account.locked ? "需要解锁" : vault.visiblePasswords[props.account.id] ? props.account.password : "••••••••••••••••" }}
        </span>
        <span class="secret-actions">
          <button class="icon-button small" type="button" title="显示密码" :disabled="props.account.locked" @click="vault.togglePassword(props.account.id)">
            <EyeOff v-if="vault.visiblePasswords[props.account.id]" :size="14" />
            <Eye v-else :size="14" />
          </button>
          <button class="icon-button small" type="button" title="复制密码" :disabled="props.account.locked" @click="void copyValue(props.account.password, `mobile-pass-${props.account.id}`)">
            <Copy v-if="vault.copiedId !== `mobile-pass-${props.account.id}`" :size="14" />
            <span v-else class="copy-done">✓</span>
          </button>
          <button class="icon-button small" type="button" title="生成新密码" :disabled="props.account.locked" @click="emit('generate', props.account)">
            <RefreshCw :size="14" />
          </button>
        </span>
      </div>
    </label>

    <div class="strength-row">
      <span>密码强度：{{ strengthLabel(props.account.strength) }}</span>
      <div class="strength-meter">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
    <small>排序号：{{ props.account.sortOrder }} · 最近修改：{{ relativeTime(props.account.updatedAt) }}</small>
  </article>
</template>
