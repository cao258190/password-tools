<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LogOut, Moon, Search, Settings, ShieldCheck, Sun } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { useVaultStore } from "../stores/vault";

defineProps<{
  settingsOpen: boolean;
}>();

const emit = defineEmits<{
  openSettings: [];
  openProfile: [];
  requestLogout: [];
}>();

const auth = useAuthStore();
const vault = useVaultStore();
const searchValue = ref(vault.search);
const searchInput = ref<HTMLInputElement | null>(null);
const theme = ref<"dark" | "soft">("dark");
let searchTimer = 0;

const initial = computed(() => auth.user?.name?.slice(0, 1).toUpperCase() || "U");

watch(
  () => vault.search,
  (value) => {
    if (value !== searchValue.value) searchValue.value = value;
  }
);

function onSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void vault.setSearch(searchValue.value);
  }, 220);
}

function applyTheme(value: "dark" | "soft") {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  window.localStorage.setItem("vault-theme", value);
}

function toggleTheme() {
  applyTheme(theme.value === "dark" ? "soft" : "dark");
}

function clearSearch() {
  searchValue.value = "";
  void vault.setSearch("");
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.value?.focus();
    searchInput.value?.select();
  }
  if (event.key === "Escape" && document.activeElement === searchInput.value) {
    clearSearch();
    searchInput.value?.blur();
  }
}

onMounted(() => {
  const savedTheme = window.localStorage.getItem("vault-theme");
  applyTheme(savedTheme === "soft" ? "soft" : "dark");
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.clearTimeout(searchTimer);
});
</script>

<template>
  <header class="top-bar">
    <div class="app-title">
      <span class="shield-logo"><ShieldCheck :size="18" /></span>
      <strong>安全密钥管家</strong>
    </div>

    <label class="global-search">
      <Search :size="17" />
      <input ref="searchInput" v-model="searchValue" placeholder="搜索网站、账号、标签或备注" @input="onSearch" />
      <kbd>Ctrl + K</kbd>
    </label>

    <div class="top-actions">
      <button class="icon-button" :class="{ active: theme === 'soft' }" type="button" :title="theme === 'dark' ? '切换浅色模式' : '切换暗色模式'" @click="toggleTheme">
        <Sun v-if="theme === 'soft'" :size="17" />
        <Moon v-else :size="17" />
      </button>
      <button class="icon-button" :class="{ active: settingsOpen }" type="button" title="设置" @click="emit('openSettings')">
        <Settings :size="17" />
      </button>
      <button class="profile-pill" type="button" :title="auth.user?.email" @click="emit('openProfile')">
        {{ initial }}
      </button>
      <button class="icon-button" type="button" title="退出登录" @click="emit('requestLogout')">
        <LogOut :size="17" />
      </button>
    </div>
  </header>
</template>
