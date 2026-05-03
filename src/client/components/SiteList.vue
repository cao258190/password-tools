<script setup lang="ts">
import { ref } from "vue";
import { ArrowDownAZ, Check, ChevronDown, Clock3, SlidersHorizontal, Star, UsersRound, X } from "lucide-vue-next";
import BrandMark from "./BrandMark.vue";
import { useVaultStore } from "../stores/vault";
import { relativeTime } from "../utils/password";
import { useDismissableLayer } from "../composables/useDismissableLayer";

const vault = useVaultStore();
const categoryMenuOpen = ref(false);
const filterMenuOpen = ref(false);
const categoryMenuHost = ref<HTMLElement | null>(null);
const filterMenuHost = ref<HTMLElement | null>(null);

useDismissableLayer(
  categoryMenuHost,
  () => categoryMenuOpen.value,
  () => {
    categoryMenuOpen.value = false;
  }
);

useDismissableLayer(
  filterMenuHost,
  () => filterMenuOpen.value,
  () => {
    filterMenuOpen.value = false;
  }
);

function chooseCategory(id: string, name: string) {
  categoryMenuOpen.value = false;
  void vault.setCategory(name === "全部" ? "all" : id);
}
</script>

<template>
  <section class="site-list-pane">
    <header class="pane-header">
      <div ref="categoryMenuHost" class="menu-host">
        <button class="section-select" type="button" @click="categoryMenuOpen = !categoryMenuOpen">
          {{ vault.activeCategoryName }}
          <ChevronDown :size="15" />
        </button>
        <div v-if="categoryMenuOpen" class="menu-popover section-menu">
          <button
            v-for="category in vault.categories"
            :key="category.id"
            class="menu-item"
            :class="{ active: (category.name === '全部' && vault.categoryFilter === 'all' && !vault.tagFilter) || vault.categoryFilter === category.id }"
            type="button"
            @click="chooseCategory(category.id, category.name)"
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
            @click="categoryMenuOpen = false; void vault.setTag(vault.tagFilter === tag ? '' : tag)"
          >
            <Check :size="15" />
            关键词：{{ tag }}
          </button>
        </div>
      </div>

      <div ref="filterMenuHost" class="menu-host">
        <button class="icon-button" type="button" title="筛选" @click="filterMenuOpen = !filterMenuOpen">
        <SlidersHorizontal :size="16" />
      </button>
        <div v-if="filterMenuOpen" class="menu-popover filter-menu">
          <button class="menu-item" :class="{ active: vault.sortMode === 'recent' }" type="button" @click="void vault.setSort('recent'); filterMenuOpen = false">
            <Clock3 :size="15" />
            最近修改优先
          </button>
          <button class="menu-item" :class="{ active: vault.sortMode === 'name' }" type="button" @click="void vault.setSort('name'); filterMenuOpen = false">
            <ArrowDownAZ :size="15" />
            网站名排序
          </button>
          <button class="menu-item" :class="{ active: vault.sortMode === 'accounts' }" type="button" @click="void vault.setSort('accounts'); filterMenuOpen = false">
            <UsersRound :size="15" />
            账号数排序
          </button>
          <div class="menu-separator" />
          <button class="menu-item" :class="{ active: vault.viewFilter === 'favorites' }" type="button" @click="void vault.setViewFilter(vault.viewFilter === 'favorites' ? 'all' : 'favorites'); filterMenuOpen = false">
            <Star :size="15" />
            只看收藏
          </button>
          <button class="menu-item" type="button" @click="void vault.clearFilters(); filterMenuOpen = false">
            <X :size="15" />
            清空筛选
          </button>
        </div>
      </div>
    </header>

    <div v-if="vault.error" class="inline-error">{{ vault.error }}</div>
    <div v-else-if="!vault.loading && vault.sites.length === 0" class="empty-state">暂无匹配网站</div>

    <div class="site-list">
      <button
        v-for="site in vault.sites"
        :key="site.id"
        class="site-row"
        :class="{ selected: site.id === vault.selectedSiteId }"
        type="button"
        @click="void vault.selectSite(site.id)"
      >
        <BrandMark :icon-type="site.iconType" :icon-value="site.iconValue" :icon-bg="site.iconBg" :size="34" />
        <span class="site-row-main">
          <strong>{{ site.name }}</strong>
          <small>{{ site.accountCount }} 个账号</small>
        </span>
        <span class="site-row-meta">
          <span class="site-favorite-slot">
            <Star v-if="site.favorite" class="site-favorite-indicator" :size="13" />
          </span>
          <span class="site-time-lock">
            <small>{{ relativeTime(site.updatedAt) }}</small>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>
