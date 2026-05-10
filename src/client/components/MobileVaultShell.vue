<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ArrowDownAZ,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  FolderLock,
  FolderTree,
  Globe2,
  Hash,
  Heart,
  Home,
  KeyRound,
  ListChecks,
  ListOrdered,
  LogOut,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Tags,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  Wrench,
  X
} from "lucide-vue-next";
import BrandMark from "./BrandMark.vue";
import MobileAccountCard from "./MobileAccountCard.vue";
import { useDismissableLayer } from "../composables/useDismissableLayer";
import { useAuthStore } from "../stores/auth";
import { useVaultStore } from "../stores/vault";
import type { Account, Category, SiteDetail } from "../types";
import { relativeTime } from "../utils/password";

type MobileView = "home" | "categories" | "sites" | "detail" | "accounts";
type AccountSort = "sort" | "updated" | "strength" | "label";

const props = defineProps<{
  site: SiteDetail | null;
  loading: boolean;
  favoriteSavingId?: string;
  settingsOpen: boolean;
}>();

const emit = defineEmits<{
  openSettings: [];
  openProfile: [];
  requestLogout: [];
  addSite: [];
  editSite: [site: SiteDetail];
  deleteSite: [site: SiteDetail];
  toggleFavorite: [site: SiteDetail];
  removeBackupUrl: [site: SiteDetail, url: string];
  addAccount: [];
  editAccount: [account: Account];
  generateAccount: [account: Account];
  deleteAccount: [account: Account];
  copied: [message: string];
}>();

const auth = useAuthStore();
const vault = useVaultStore();
const mobileView = ref<MobileView>("home");
const searchValue = ref(vault.search);
const searchInput = ref<HTMLInputElement | null>(null);
const theme = ref<"dark" | "soft">("dark");
const moreMenuOpen = ref(false);
const siteFilterMenuOpen = ref(false);
const siteSortMenuOpen = ref(false);
const accountSortMenuOpen = ref(false);
const moreMenuHost = ref<HTMLElement | null>(null);
const siteFilterMenuHost = ref<HTMLElement | null>(null);
const siteSortMenuHost = ref<HTMLElement | null>(null);
const accountSortMenuHost = ref<HTMLElement | null>(null);
const accountSort = ref<AccountSort>("sort");
let searchTimer = 0;

const initial = computed(() => auth.user?.name?.slice(0, 1).toUpperCase() || "U");
const displayName = computed(() => auth.user?.name || auth.user?.email || "个人中心");
const previewSites = computed(() => vault.sites.slice(0, 3));
const selectedSiteAccounts = computed(() => props.site?.accounts ?? []);

const strengthScore = {
  weak: 0,
  medium: 1,
  strong: 2
};

const sortedAccounts = computed(() => {
  const accounts = [...selectedSiteAccounts.value];
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

const primaryAccount = computed(() => sortedAccounts.value[0] ?? null);
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
  if (securityTone.value === "risk") return "发现弱密码，建议尽快处理";
  if (securityTone.value === "warn") return "强度仍可提升";
  return "整体状态良好";
});

const categoryIconMap = {
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

useDismissableLayer(
  moreMenuHost,
  () => moreMenuOpen.value,
  () => {
    moreMenuOpen.value = false;
  }
);

useDismissableLayer(
  siteFilterMenuHost,
  () => siteFilterMenuOpen.value,
  () => {
    siteFilterMenuOpen.value = false;
  }
);

useDismissableLayer(
  siteSortMenuHost,
  () => siteSortMenuOpen.value,
  () => {
    siteSortMenuOpen.value = false;
  }
);

useDismissableLayer(
  accountSortMenuHost,
  () => accountSortMenuOpen.value,
  () => {
    accountSortMenuOpen.value = false;
  }
);

watch(
  () => vault.search,
  (value) => {
    if (value !== searchValue.value) searchValue.value = value;
  }
);

function categoryIcon(icon: string) {
  return categoryIconMap[icon as keyof typeof categoryIconMap] || Sparkles;
}

function categoryStyle(category: Category) {
  return {
    color: category.color,
    background: `${category.color}1f`
  };
}

function applyTheme(value: "dark" | "soft") {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  window.localStorage.setItem("vault-theme", value);
}

function toggleTheme() {
  applyTheme(theme.value === "dark" ? "soft" : "dark");
}

function onSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void vault.setSearch(searchValue.value);
  }, 220);
}

function openSearch() {
  mobileView.value = "sites";
  window.setTimeout(() => {
    searchInput.value?.focus();
    searchInput.value?.select();
  }, 0);
}

async function clearSearch() {
  searchValue.value = "";
  await vault.setSearch("");
}

async function selectSite(id: string) {
  await vault.selectSite(id);
  mobileView.value = "detail";
}

async function showAllSites() {
  await vault.clearFilters();
  mobileView.value = "sites";
}

async function showViewFilter(value: "recent" | "favorites") {
  await vault.setViewFilter(value);
  mobileView.value = "sites";
}

async function showCategory(category: Category) {
  await vault.setCategory(category.name === "全部" ? "all" : category.id);
  mobileView.value = "sites";
}

async function showTag(tag: string) {
  await vault.setTag(vault.tagFilter === tag ? "" : tag);
  mobileView.value = "sites";
}

async function setSiteSort(value: typeof vault.sortMode) {
  await vault.setSort(value);
  siteSortMenuOpen.value = false;
}

async function copyValue(value: string, id: string) {
  const copied = await vault.copy(value, id);
  emit("copied", copied ? "复制成功" : "复制失败，请手动复制");
}

function openDetailView() {
  if (props.site || props.loading) mobileView.value = "detail";
}

function openAccountsView() {
  if (props.site) mobileView.value = "accounts";
}

function closeMenus() {
  moreMenuOpen.value = false;
  siteFilterMenuOpen.value = false;
  siteSortMenuOpen.value = false;
  accountSortMenuOpen.value = false;
}

onMounted(() => {
  const savedTheme = window.localStorage.getItem("vault-theme");
  applyTheme(savedTheme === "soft" ? "soft" : "dark");
});

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
});
</script>

<template>
  <section class="mobile-shell" :class="`mobile-shell-${mobileView}`">
    <main class="mobile-main" @click="closeMenus">
      <section v-if="mobileView === 'home'" class="mobile-pane mobile-home-pane" @click.stop>
        <header class="mobile-home-hero">
          <div class="mobile-home-top">
            <div>
              <span>我的密码空间</span>
              <h1>保险库</h1>
            </div>
            <div class="mobile-hero-actions">
              <button class="icon-button" type="button" title="添加网站" @click="emit('addSite')">
                <Plus :size="18" />
              </button>
              <button class="icon-button" :class="{ active: theme === 'soft' }" type="button" :title="theme === 'dark' ? '切换浅色模式' : '切换暗色模式'" @click="toggleTheme">
                <Sun v-if="theme === 'soft'" :size="18" />
                <Moon v-else :size="18" />
              </button>
              <button class="icon-button" :class="{ active: props.settingsOpen }" type="button" title="设置" @click="emit('openSettings')">
                <Settings :size="18" />
              </button>
            </div>
          </div>

          <label class="mobile-search">
            <Search :size="18" />
            <input ref="searchInput" v-model="searchValue" placeholder="搜索网站、账号、标签或备注" @input="onSearch" @focus="mobileView = 'sites'" />
          </label>
        </header>

        <div class="mobile-profile-strip">
          <button class="mobile-profile-card" type="button" @click="emit('openProfile')">
            <span class="mobile-avatar">{{ initial }}</span>
            <span>
              <strong>{{ displayName }}</strong>
              <small>个人中心</small>
            </span>
            <UserRound :size="17" />
          </button>
          <button class="secondary compact" type="button" @click="emit('openSettings')">
            <Settings :size="15" />
            设置
          </button>
          <button class="secondary compact" type="button" @click="emit('requestLogout')">
            <LogOut :size="15" />
            退出
          </button>
        </div>

        <div class="mobile-action-grid">
          <button type="button" @click="emit('addSite')">
            <span class="tone-blue"><Plus :size="21" /></span>
            新增网站
          </button>
          <button type="button" :disabled="!props.site || !vault.vaultUnlocked" @click="emit('addAccount')">
            <span class="tone-green"><KeyRound :size="21" /></span>
            新增账号
          </button>
          <button type="button" @click="void showViewFilter('favorites')">
            <span class="tone-amber"><Star :size="21" /></span>
            收藏夹
          </button>
          <button type="button" :disabled="!props.site" @click="openAccountsView">
            <span class="tone-rose"><UsersRound :size="21" /></span>
            账号列表
          </button>
        </div>

        <section class="mobile-card">
          <div class="mobile-card-title">
            <span>
              <small>当前列表</small>
              <strong>常用站点</strong>
            </span>
            <button class="link-button" type="button" @click="mobileView = 'sites'">
              全部
              <ChevronRight :size="15" />
            </button>
          </div>
          <div v-if="previewSites.length" class="mobile-home-sites">
            <button v-for="siteItem in previewSites" :key="siteItem.id" type="button" @click="void selectSite(siteItem.id)">
              <BrandMark :icon-type="siteItem.iconType" :icon-value="siteItem.iconValue" :icon-url="siteItem.iconUrl" :icon-bg="siteItem.iconBg" :icon-color="siteItem.iconColor" :size="36" />
              <span>
                <strong>{{ siteItem.name }}</strong>
                <small>{{ siteItem.accountCount }} 个账号 · {{ relativeTime(siteItem.updatedAt) }}</small>
              </span>
              <ChevronRight :size="17" />
            </button>
          </div>
          <div v-else class="empty-state">暂无匹配网站</div>
        </section>

        <section class="mobile-security-card" :class="`tone-${securityTone}`">
          <div class="mobile-card-title">
            <span>
              <small>安全概览</small>
              <strong>{{ securityScore }}</strong>
            </span>
            <ShieldAlert v-if="securityTone === 'risk'" :size="22" />
            <ShieldCheck v-else :size="22" />
          </div>
          <div class="security-score-bar">
            <i :style="{ width: `${securityScore}%` }" />
          </div>
          <p>{{ securityLabel }}</p>
          <div class="mobile-stat-grid">
            <span>
              <strong>{{ vault.stats.weakAccounts }}</strong>
              弱密码
            </span>
            <span>
              <strong>{{ vault.stats.mediumAccounts }}</strong>
              中等密码
            </span>
            <span>
              <strong>{{ vault.stats.strongAccounts }}</strong>
              强密码
            </span>
          </div>
        </section>
      </section>

      <section v-else-if="mobileView === 'categories'" class="mobile-pane" @click.stop>
        <header class="mobile-page-head">
          <h1>分类</h1>
          <div class="mobile-page-actions">
            <button class="icon-button" type="button" title="搜索" @click="openSearch">
              <Search :size="18" />
            </button>
            <div ref="moreMenuHost" class="menu-host">
              <button class="icon-button" type="button" title="更多" @click="moreMenuOpen = !moreMenuOpen">
                <MoreHorizontal :size="18" />
              </button>
              <div v-if="moreMenuOpen" class="menu-popover mobile-menu-popover">
                <button class="menu-item" type="button" @click="emit('addSite'); moreMenuOpen = false">
                  <Plus :size="15" />
                  添加网站
                </button>
                <button class="menu-item" type="button" @click="void vault.clearFilters(); moreMenuOpen = false">
                  <RotateCcw :size="15" />
                  清空筛选
                </button>
              </div>
            </div>
          </div>
        </header>

        <div class="mobile-filter-stack">
          <button class="mobile-filter-row" type="button" @click="void showAllSites()">
            <span class="tone-blue"><FolderLock :size="20" /></span>
            <span>
              <strong>全部</strong>
              <small>{{ vault.stats.sites }} 个网站</small>
            </span>
            <ChevronRight :size="18" />
          </button>
          <button class="mobile-filter-row" type="button" @click="void showViewFilter('favorites')">
            <span class="tone-amber"><Star :size="20" /></span>
            <span>
              <strong>收藏夹</strong>
              <small>{{ vault.stats.favorites }} 个收藏</small>
            </span>
            <ChevronRight :size="18" />
          </button>
          <button class="mobile-filter-row" type="button" @click="void showViewFilter('recent')">
            <span class="tone-teal"><Clock3 :size="20" /></span>
            <span>
              <strong>最近使用</strong>
              <small>按最近访问排序</small>
            </span>
            <ChevronRight :size="18" />
          </button>
        </div>

        <section class="mobile-card mobile-list-card">
          <button
            v-for="category in vault.categories"
            :key="category.id"
            class="mobile-filter-row category"
            type="button"
            @click="void showCategory(category)"
          >
            <span class="category-icon-box" :style="categoryStyle(category)">
              <component :is="categoryIcon(category.icon)" :size="19" />
            </span>
            <span>
              <strong>{{ category.name }}</strong>
              <small>{{ category.count }} 项</small>
            </span>
            <strong class="mobile-count">{{ category.count }}</strong>
            <ChevronRight :size="18" />
          </button>
        </section>

        <section v-if="vault.tags.length" class="mobile-card mobile-list-card">
          <div class="mobile-section-label">
            <Tags :size="15" />
            关键词标签
          </div>
          <button v-for="tag in vault.tags" :key="tag.name" class="mobile-filter-row tag" type="button" @click="void showTag(tag.name)">
            <span class="tone-blue"><Hash :size="18" /></span>
            <span>
              <strong>{{ tag.name }}</strong>
              <small>{{ tag.count }} 个网站</small>
            </span>
            <ChevronRight :size="18" />
          </button>
        </section>
      </section>

      <section v-else-if="mobileView === 'sites'" class="mobile-pane mobile-sites-pane" @click.stop>
        <header class="mobile-page-head">
          <div ref="siteFilterMenuHost" class="menu-host">
            <button class="mobile-title-select" type="button" @click="siteFilterMenuOpen = !siteFilterMenuOpen">
              {{ vault.activeCategoryName }}
              <ChevronDown :size="16" />
            </button>
            <div v-if="siteFilterMenuOpen" class="menu-popover mobile-menu-popover">
              <button class="menu-item" type="button" @click="void showAllSites(); siteFilterMenuOpen = false">
                <Check :size="15" />
                所有网站
                <span>{{ vault.stats.sites }}</span>
              </button>
              <button
                v-for="category in vault.categories"
                :key="category.id"
                class="menu-item"
                :class="{ active: (category.name === '全部' && vault.categoryFilter === 'all' && !vault.tagFilter) || vault.categoryFilter === category.id }"
                type="button"
                @click="void showCategory(category); siteFilterMenuOpen = false"
              >
                <Check :size="15" />
                {{ category.name }}
                <span>{{ category.count }}</span>
              </button>
              <div v-if="vault.allTags.length" class="menu-separator" />
              <button
                v-for="tag in vault.allTags"
                :key="tag"
                class="menu-item"
                :class="{ active: vault.tagFilter === tag }"
                type="button"
                @click="void showTag(tag); siteFilterMenuOpen = false"
              >
                <Check :size="15" />
                关键词：{{ tag }}
              </button>
            </div>
          </div>

          <div ref="siteSortMenuHost" class="menu-host">
            <button class="icon-button" type="button" title="排序与筛选" @click="siteSortMenuOpen = !siteSortMenuOpen">
              <SlidersHorizontal :size="18" />
            </button>
            <div v-if="siteSortMenuOpen" class="menu-popover mobile-menu-popover">
              <button class="menu-item" :class="{ active: vault.sortMode === 'sort' }" type="button" @click="void setSiteSort('sort')">
                <ListOrdered :size="15" />
                排序号优先
              </button>
              <button class="menu-item" :class="{ active: vault.sortMode === 'recent' }" type="button" @click="void setSiteSort('recent')">
                <Clock3 :size="15" />
                最近修改优先
              </button>
              <button class="menu-item" :class="{ active: vault.sortMode === 'name' }" type="button" @click="void setSiteSort('name')">
                <ArrowDownAZ :size="15" />
                网站名排序
              </button>
              <button class="menu-item" :class="{ active: vault.sortMode === 'accounts' }" type="button" @click="void setSiteSort('accounts')">
                <UsersRound :size="15" />
                账号数排序
              </button>
              <div class="menu-separator" />
              <button class="menu-item" :class="{ active: vault.viewFilter === 'favorites' }" type="button" @click="void showViewFilter('favorites'); siteSortMenuOpen = false">
                <Star :size="15" />
                只看收藏
              </button>
              <button class="menu-item" type="button" @click="void vault.clearFilters(); siteSortMenuOpen = false">
                <X :size="15" />
                清空筛选
              </button>
            </div>
          </div>
        </header>

        <label class="mobile-search mobile-page-search">
          <Search :size="18" />
          <input ref="searchInput" v-model="searchValue" placeholder="搜索网站、账号、标签或备注" @input="onSearch" />
          <button v-if="searchValue" class="icon-button small" type="button" title="清空搜索" @click="void clearSearch()">
            <X :size="14" />
          </button>
        </label>

        <div v-if="vault.error" class="inline-error">{{ vault.error }}</div>
        <div v-else-if="vault.loading" class="detail-placeholder">正在加载网站...</div>
        <div v-else-if="vault.sites.length === 0" class="empty-state">暂无匹配网站</div>

        <div v-else class="mobile-site-list">
          <button
            v-for="siteItem in vault.sites"
            :key="siteItem.id"
            class="mobile-site-row"
            :class="{ selected: siteItem.id === vault.selectedSiteId }"
            type="button"
            @click="void selectSite(siteItem.id)"
          >
            <BrandMark :icon-type="siteItem.iconType" :icon-value="siteItem.iconValue" :icon-url="siteItem.iconUrl" :icon-bg="siteItem.iconBg" :icon-color="siteItem.iconColor" :size="42" />
            <span>
              <strong>{{ siteItem.name }}</strong>
              <small>{{ siteItem.accountCount }} 个账号</small>
              <small>排序号：{{ siteItem.sortOrder }}</small>
            </span>
            <span class="mobile-site-meta">
              <Star v-if="siteItem.favorite" :size="13" />
              <small>{{ relativeTime(siteItem.updatedAt) }}</small>
            </span>
          </button>
        </div>
      </section>

      <section v-else-if="mobileView === 'detail'" class="mobile-pane mobile-detail-pane" @click.stop>
        <div v-if="props.loading" class="detail-placeholder">正在载入详情...</div>
        <div v-else-if="!props.site" class="mobile-empty-panel">
          <FileText :size="28" />
          <strong>选择一个网站查看详情</strong>
          <button class="primary" type="button" @click="mobileView = 'sites'">去选择网站</button>
        </div>

        <template v-else>
          <header class="mobile-detail-head">
            <BrandMark
              :icon-type="props.site.iconType"
              :icon-value="props.site.iconValue"
              :icon-url="props.site.iconUrl"
              :icon-bg="props.site.iconBg"
              :icon-color="props.site.iconColor"
              :size="48"
            />
            <div>
              <h1>{{ props.site.name }}</h1>
              <span>最近修改：{{ relativeTime(props.site.updatedAt) }}</span>
            </div>
          </header>

          <div class="mobile-detail-actions">
            <button class="icon-button favorite-button" type="button" :class="{ active: props.site.favorite }" :title="props.site.favorite ? '取消收藏网站' : '收藏网站'" :disabled="props.favoriteSavingId === props.site.id" @click="emit('toggleFavorite', props.site)">
              <Star :size="18" :fill="props.site.favorite ? 'currentColor' : 'none'" />
            </button>
            <button class="secondary" type="button" @click="emit('editSite', props.site)">
              <Pencil :size="16" />
              编辑
            </button>
            <button class="icon-button" type="button" title="删除网站" @click="emit('deleteSite', props.site)">
              <Trash2 :size="17" />
            </button>
          </div>

          <section v-if="primaryAccount" class="mobile-card">
            <div class="mobile-card-title">
              <span>
                <small>默认账号</small>
                <strong>快速使用</strong>
              </span>
              <button class="link-button" type="button" @click="mobileView = 'accounts'">
                全部账号
                <ChevronRight :size="15" />
              </button>
            </div>
            <MobileAccountCard
              :account="primaryAccount"
              featured
              @edit="emit('editAccount', $event)"
              @generate="emit('generateAccount', $event)"
              @delete="emit('deleteAccount', $event)"
              @copied="emit('copied', $event)"
            />
          </section>

          <section class="info-card mobile-info-card">
            <h2>网站信息</h2>
            <label class="field-block">
              <span>主网站地址</span>
              <div class="url-box">
                <span>{{ props.site.primaryUrl }}</span>
                <button class="icon-button small" type="button" title="复制" @click="void copyValue(props.site.primaryUrl, `mobile-url-${props.site.id}`)">
                  <Copy v-if="vault.copiedId !== `mobile-url-${props.site.id}`" :size="14" />
                  <span v-else>✓</span>
                </button>
                <a class="icon-button small" :href="props.site.primaryUrl" target="_blank" rel="noreferrer" title="打开">
                  <Globe2 :size="14" />
                </a>
              </div>
            </label>

            <label class="field-block">
              <span>备用网址 / 备用域名</span>
              <div v-if="props.site.backupUrls.length" class="backup-list">
                <div v-for="url in props.site.backupUrls" :key="url" class="url-box">
                  <span>{{ url }}</span>
                  <a class="icon-button small" :href="url" target="_blank" rel="noreferrer" title="打开备用网址">
                    <ExternalLink :size="14" />
                  </a>
                  <button class="icon-button small" type="button" title="移除备用网址" @click="emit('removeBackupUrl', props.site, url)">
                    <X :size="14" />
                  </button>
                </div>
              </div>
              <div v-else class="muted-box">暂无备用网址</div>
            </label>
            <button class="add-link" type="button" @click="emit('editSite', props.site)">
              <PlusCircle :size="15" />
              添加备用网址
            </button>
          </section>

          <section class="info-card mobile-info-card">
            <h2>关键词标签</h2>
            <div class="tag-row">
              <button v-for="tag in props.site.tags" :key="tag" class="tag-chip" type="button" @click="void showTag(tag)">
                {{ tag }}
              </button>
              <button class="tag-chip add" type="button" title="添加关键词标签" @click="emit('editSite', props.site)">+</button>
            </div>
          </section>

          <section class="info-card mobile-info-card note-card">
            <h2>备注</h2>
            <p>{{ props.site.note || "暂无备注" }}</p>
            <button class="icon-button edit-note" type="button" title="编辑备注" @click="emit('editSite', props.site)">
              <Pencil :size="14" />
            </button>
          </section>

          <section class="info-card mobile-info-card meta-card">
            <h2>其他信息</h2>
            <p>创建时间：{{ new Date(props.site.createdAt).toLocaleString("zh-CN") }}</p>
            <p>最后修改：{{ relativeTime(props.site.updatedAt) }}</p>
          </section>
        </template>
      </section>

      <section v-else class="mobile-pane mobile-accounts-pane" @click.stop>
        <header class="mobile-page-head">
          <div>
            <h1>账号列表（{{ selectedSiteAccounts.length }}）</h1>
            <small v-if="props.site">{{ props.site.name }}</small>
          </div>
          <div class="mobile-page-actions">
            <button class="primary compact" type="button" :disabled="!props.site || !vault.vaultUnlocked" @click="emit('addAccount')">
              <Plus :size="16" />
              添加账号
            </button>
            <div ref="accountSortMenuHost" class="menu-host">
              <button class="icon-button" type="button" title="账号排序" :disabled="!props.site" @click="accountSortMenuOpen = !accountSortMenuOpen">
                <ChevronDown :size="17" />
              </button>
              <div v-if="accountSortMenuOpen" class="menu-popover mobile-menu-popover">
                <button class="menu-item" :class="{ active: accountSort === 'sort' }" type="button" @click="accountSort = 'sort'; accountSortMenuOpen = false">
                  <ListOrdered :size="15" />
                  排序号优先
                </button>
                <button class="menu-item" :class="{ active: accountSort === 'updated' }" type="button" @click="accountSort = 'updated'; accountSortMenuOpen = false">
                  <RefreshCw :size="15" />
                  最近修改
                </button>
                <button class="menu-item" :class="{ active: accountSort === 'strength' }" type="button" @click="accountSort = 'strength'; accountSortMenuOpen = false">
                  <ShieldCheck :size="15" />
                  强度优先
                </button>
                <button class="menu-item" :class="{ active: accountSort === 'label' }" type="button" @click="accountSort = 'label'; accountSortMenuOpen = false">
                  <ArrowDownAZ :size="15" />
                  标签排序
                </button>
              </div>
            </div>
          </div>
        </header>

        <div v-if="!props.site" class="mobile-empty-panel">
          <UsersRound :size="28" />
          <strong>选择网站后管理账号</strong>
          <button class="primary" type="button" @click="mobileView = 'sites'">去选择网站</button>
        </div>
        <div v-else-if="selectedSiteAccounts.length === 0" class="mobile-empty-panel">
          <KeyRound :size="28" />
          <strong>暂无账号</strong>
          <button class="primary" type="button" :disabled="!vault.vaultUnlocked" @click="emit('addAccount')">添加账号</button>
        </div>

        <div v-else class="mobile-account-list">
          <MobileAccountCard
            v-for="account in sortedAccounts"
            :key="account.id"
            :account="account"
            @edit="emit('editAccount', $event)"
            @generate="emit('generateAccount', $event)"
            @delete="emit('deleteAccount', $event)"
            @copied="emit('copied', $event)"
          />
        </div>
      </section>
    </main>

    <nav class="mobile-bottom-nav" aria-label="移动端导航">
      <button type="button" :class="{ active: mobileView === 'home' }" @click="mobileView = 'home'">
        <Home :size="18" />
        首页
      </button>
      <button type="button" :class="{ active: mobileView === 'categories' }" @click="mobileView = 'categories'">
        <FolderTree :size="18" />
        分类
      </button>
      <button type="button" :class="{ active: mobileView === 'sites' }" @click="mobileView = 'sites'">
        <ListChecks :size="18" />
        网站
      </button>
      <button type="button" :class="{ active: mobileView === 'detail' }" :disabled="!props.site && !props.loading" @click="openDetailView">
        <FileText :size="18" />
        详情
      </button>
      <button type="button" :class="{ active: mobileView === 'accounts' }" :disabled="!props.site" @click="openAccountsView">
        <UsersRound :size="18" />
        账户
      </button>
    </nav>
  </section>
</template>
