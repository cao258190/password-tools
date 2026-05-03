<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BookOpen,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  FolderLock,
  Heart,
  Home,
  Hash,
  RotateCcw,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Tags,
  WalletCards,
  Wrench
} from "lucide-vue-next";
import { useVaultStore } from "../stores/vault";
import { useDismissableLayer } from "../composables/useDismissableLayer";

const emit = defineEmits<{
  addSite: [];
}>();

const vault = useVaultStore();
const addMenuOpen = ref(false);
const addMenuHost = ref<HTMLElement | null>(null);
const securityScore = computed(() => {
  const total = vault.stats.accounts;
  if (!total) return 100;
  const weighted = vault.stats.strongAccounts * 100 + vault.stats.mediumAccounts * 62 + vault.stats.weakAccounts * 24;
  return Math.round(weighted / total);
});
const securityTone = computed(() => {
  if (vault.stats.weakAccounts > 0) return "risk";
  if (securityScore.value < 80) return "warn";
  return "safe";
});
const securityLabel = computed(() => {
  if (securityTone.value === "risk") return "建议处理弱密码";
  if (securityTone.value === "warn") return "强度仍可提升";
  return "整体状态良好";
});

useDismissableLayer(
  addMenuHost,
  () => addMenuOpen.value,
  () => {
    addMenuOpen.value = false;
  }
);

const iconMap = {
  sparkles: Sparkles,
  heart: Heart,
  briefcase: BriefcaseBusiness,
  bot: Bot,
  wallet: WalletCards,
  shopping: ShoppingCart,
  play: Play,
  tool: Wrench,
  book: BookOpen,
  home: Home
};

function selectCategory(id: string, name: string) {
  void vault.setCategory(name === "全部" ? "all" : id);
}

function openAddSite() {
  addMenuOpen.value = false;
  emit("addSite");
}
</script>

<template>
  <aside class="sidebar">
    <div ref="addMenuHost" class="sidebar-action-row menu-host">
      <button class="primary add-site" type="button" @click="emit('addSite')">
        <Plus :size="16" />
        添加网站
      </button>
      <button class="primary icon-split" type="button" title="添加菜单" @click="addMenuOpen = !addMenuOpen">
        <ChevronDown :size="16" />
      </button>
      <div v-if="addMenuOpen" class="menu-popover sidebar-add-menu">
        <button class="menu-item" type="button" @click="openAddSite">
          <Plus :size="15" />
          添加网站
        </button>
        <button class="menu-item" type="button" @click="void vault.clearFilters(); addMenuOpen = false">
          <RotateCcw :size="15" />
          清空筛选
        </button>
        <button class="menu-item" type="button" @click="void vault.setViewFilter('favorites'); addMenuOpen = false">
          <Star :size="15" />
          查看收藏
        </button>
      </div>
    </div>

    <nav class="side-nav">
      <button class="side-item" :class="{ active: vault.viewFilter === 'all' && vault.categoryFilter === 'all' && !vault.tagFilter }" type="button" @click="void vault.clearFilters()">
        <FolderLock :size="16" />
        所有网站
        <span>{{ vault.stats.sites }}</span>
      </button>
      <button class="side-item" :class="{ active: vault.viewFilter === 'recent' }" type="button" @click="void vault.setViewFilter('recent')">
        <Clock3 :size="16" />
        最近使用
      </button>
      <button class="side-item" :class="{ active: vault.viewFilter === 'favorites' }" type="button" @click="void vault.setViewFilter('favorites')">
        <Star :size="16" />
        收藏夹
        <span>{{ vault.stats.favorites }}</span>
      </button>
    </nav>

    <div class="sidebar-section-title">
      <span>分类</span>
    </div>

    <nav class="category-list">
      <button
        v-for="category in vault.categories"
        :key="category.id"
        class="side-item category-item"
        :class="{ active: vault.viewFilter === 'all' && !vault.tagFilter && (vault.categoryFilter === category.id || (category.name === '全部' && vault.categoryFilter === 'all')) }"
        type="button"
        @click="selectCategory(category.id, category.name)"
      >
        <component :is="iconMap[category.icon as keyof typeof iconMap] || Sparkles" :size="16" :style="{ color: category.color }" />
        {{ category.name }}
        <span>{{ category.count }}</span>
      </button>
    </nav>

    <div v-if="vault.tags.length" class="sidebar-section-title">
      <span>关键词标签</span>
      <Tags :size="14" />
    </div>

    <nav v-if="vault.tags.length" class="tag-list">
      <button
        v-for="tag in vault.tags"
        :key="tag.name"
        class="side-item tag-item"
        :class="{ active: vault.tagFilter === tag.name }"
        type="button"
        @click="void vault.setTag(vault.tagFilter === tag.name ? '' : tag.name)"
      >
        <Hash :size="15" />
        {{ tag.name }}
        <span>{{ tag.count }}</span>
      </button>
    </nav>

    <div class="security-summary-card" :class="`tone-${securityTone}`">
      <div class="security-summary-head">
        <span>
          <ShieldAlert v-if="securityTone === 'risk'" :size="16" />
          <ShieldCheck v-else :size="16" />
          安全概览
        </span>
        <strong>{{ securityScore }}</strong>
      </div>
      <div class="security-score-bar">
        <i :style="{ width: `${securityScore}%` }" />
      </div>
      <p>{{ securityLabel }}</p>
      <div class="security-summary-grid">
        <span class="risk-count">
          <strong>{{ vault.stats.weakAccounts }}</strong>
          弱密码
        </span>
        <span class="safe-count">
          <strong>{{ vault.stats.strongAccounts }}</strong>
          强密码
        </span>
        <span class="total-count">
          <strong>{{ vault.stats.accounts }}</strong>
          全部账号
        </span>
      </div>
    </div>
  </aside>
</template>
