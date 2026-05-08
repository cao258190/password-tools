<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowDownAZ, ChevronDown, Copy, Eye, EyeOff, ListOrdered, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-vue-next";
import type { Account, SiteDetail } from "../types";
import { useVaultStore } from "../stores/vault";
import { relativeTime, strengthLabel } from "../utils/password";
import { useDismissableLayer } from "../composables/useDismissableLayer";

const props = defineProps<{
  site: SiteDetail | null;
}>();

const emit = defineEmits<{
  add: [];
  edit: [account: Account];
  generate: [account: Account];
  delete: [account: Account];
  copied: [message: string];
}>();

const vault = useVaultStore();
const sortMenuOpen = ref(false);
const sortMenuHost = ref<HTMLElement | null>(null);
const accountSort = ref<"sort" | "updated" | "strength" | "label">("sort");

useDismissableLayer(
  sortMenuHost,
  () => sortMenuOpen.value,
  () => {
    sortMenuOpen.value = false;
  }
);

const strengthScore = {
  weak: 0,
  medium: 1,
  strong: 2
};

const sortedAccounts = computed(() => {
  const accounts = [...(props.site?.accounts ?? [])];
  if (accountSort.value === "strength") {
    return accounts.sort((left, right) => strengthScore[right.strength] - strengthScore[left.strength] || left.label.localeCompare(right.label));
  }
  if (accountSort.value === "label") {
    return accounts.sort((left, right) => left.label.localeCompare(right.label));
  }
  if (accountSort.value === "updated") {
    return accounts.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }
  return accounts.sort((left, right) => right.sortOrder - left.sortOrder || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
});

async function copyValue(value: string, id: string) {
  if (!value) return;
  const copied = await vault.copy(value, id);
  emit("copied", copied ? "复制成功" : "复制失败，请手动复制");
}
</script>

<template>
  <aside class="account-pane">
    <header class="account-header">
      <div>
        <h2>账号列表（{{ site?.accounts.length ?? 0 }}）</h2>
      </div>
      <button class="primary compact" type="button" :disabled="!site || !vault.vaultUnlocked" @click="emit('add')">
        <Plus :size="16" />
        添加账号
      </button>
      <div ref="sortMenuHost" class="menu-host">
        <button class="icon-button" type="button" title="账号排序" :disabled="!site" @click="sortMenuOpen = !sortMenuOpen">
          <ChevronDown :size="16" />
        </button>
        <div v-if="sortMenuOpen" class="menu-popover account-sort-menu">
          <button class="menu-item" :class="{ active: accountSort === 'sort' }" type="button" @click="accountSort = 'sort'; sortMenuOpen = false">
            <ListOrdered :size="15" />
            排序号优先
          </button>
          <button class="menu-item" :class="{ active: accountSort === 'updated' }" type="button" @click="accountSort = 'updated'; sortMenuOpen = false">
            <RefreshCw :size="15" />
            最近修改
          </button>
          <button class="menu-item" :class="{ active: accountSort === 'strength' }" type="button" @click="accountSort = 'strength'; sortMenuOpen = false">
            <ShieldCheck :size="15" />
            强度优先
          </button>
          <button class="menu-item" :class="{ active: accountSort === 'label' }" type="button" @click="accountSort = 'label'; sortMenuOpen = false">
            <ArrowDownAZ :size="15" />
            标签排序
          </button>
        </div>
      </div>
    </header>

    <div v-if="!site" class="empty-state">选择网站后管理账号</div>
    <div v-else-if="site.accounts.length === 0" class="empty-state">暂无账号，点击添加账号开始记录</div>

    <div v-else class="account-list">
      <article v-for="account in sortedAccounts" :key="account.id" class="account-card" :class="`strength-${account.strength}`">
        <div class="account-card-head">
          <span class="account-badge">{{ account.label }}</span>
          <div>
            <button class="icon-button small" type="button" title="编辑" :disabled="account.locked" @click="emit('edit', account)">
              <Pencil :size="14" />
            </button>
            <button class="icon-button small" type="button" title="删除" @click="emit('delete', account)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <label>
          用户名
          <div class="secret-line">
            <span class="secret-value">{{ account.username }}</span>
            <span class="secret-actions">
              <button class="icon-button small" type="button" title="复制用户名" @click="void copyValue(account.username, `user-${account.id}`)">
                <Copy v-if="vault.copiedId !== `user-${account.id}`" :size="14" />
                <span v-else class="copy-done">✓</span>
              </button>
            </span>
          </div>
        </label>

        <label>
          密码
          <div class="secret-line">
            <span class="secret-value password-text">{{ account.decryptError ? "解密失败" : account.locked ? "需要解锁" : vault.visiblePasswords[account.id] ? account.password : "••••••••••••••••" }}</span>
            <span class="secret-actions">
              <button class="icon-button small" type="button" title="显示密码" :disabled="account.locked" @click="vault.togglePassword(account.id)">
                <EyeOff v-if="vault.visiblePasswords[account.id]" :size="14" />
                <Eye v-else :size="14" />
              </button>
              <button class="icon-button small" type="button" title="复制密码" :disabled="account.locked" @click="void copyValue(account.password, `pass-${account.id}`)">
                <Copy v-if="vault.copiedId !== `pass-${account.id}`" :size="14" />
                <span v-else class="copy-done">✓</span>
              </button>
              <button class="icon-button small" type="button" title="生成新密码" :disabled="account.locked" @click="emit('generate', account)">
                <RefreshCw :size="14" />
              </button>
            </span>
          </div>
        </label>

        <div class="strength-row">
          <span>密码强度：{{ strengthLabel(account.strength) }}</span>
          <div class="strength-meter">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <small>排序号：{{ account.sortOrder }} · 最近修改：{{ relativeTime(account.updatedAt) }}</small>
      </article>
    </div>
  </aside>
</template>
