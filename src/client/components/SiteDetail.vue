<script setup lang="ts">
import {
  Copy,
  Edit3,
  ExternalLink,
  Globe2,
  PlusCircle,
  Star,
  Trash2,
  X
} from "lucide-vue-next";
import BrandMark from "./BrandMark.vue";
import type { SiteDetail } from "../types";
import { useVaultStore } from "../stores/vault";
import { relativeTime } from "../utils/password";

const props = defineProps<{
  site: SiteDetail | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  edit: [site: SiteDetail];
  delete: [site: SiteDetail];
  toggleFavorite: [site: SiteDetail];
  copied: [message: string];
  removeBackupUrl: [site: SiteDetail, url: string];
}>();

const vault = useVaultStore();

async function copyValue(value: string, id: string) {
  const copied = await vault.copy(value, id);
  emit("copied", copied ? "复制成功" : "复制失败，请手动复制");
}
</script>

<template>
  <main class="detail-pane">
    <div v-if="loading" class="detail-placeholder">正在载入详情...</div>
    <div v-else-if="!props.site" class="detail-placeholder">选择一个网站查看密钥详情</div>

    <template v-else>
      <header class="detail-title">
        <BrandMark :icon-type="props.site.iconType" :icon-value="props.site.iconValue" :icon-bg="props.site.iconBg" :size="44" />
        <div>
          <h1>{{ props.site.name }}</h1>
          <span>最近修改：{{ relativeTime(props.site.updatedAt) }}</span>
        </div>
        <div class="detail-actions">
          <button class="icon-button favorite-button" type="button" :class="{ active: props.site.favorite }" :title="props.site.favorite ? '取消收藏网站' : '收藏网站'" @click="emit('toggleFavorite', props.site)">
            <Star :size="17" :fill="props.site.favorite ? 'currentColor' : 'none'" />
          </button>
          <button class="secondary" type="button" @click="emit('edit', props.site)">
            <Edit3 :size="16" />
            编辑
          </button>
          <button class="icon-button" type="button" title="删除网站" @click="emit('delete', props.site)">
            <Trash2 :size="16" />
          </button>
        </div>
      </header>

      <section class="info-card">
        <h2>网站信息</h2>
        <label class="field-block">
          <span>主网站地址</span>
          <div class="url-box">
            <span>{{ props.site.primaryUrl }}</span>
            <button class="icon-button small" type="button" title="复制" @click="void copyValue(props.site.primaryUrl, `url-${props.site.id}`)">
              <Copy v-if="vault.copiedId !== `url-${props.site.id}`" :size="14" />
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
        <button class="add-link" type="button" @click="emit('edit', props.site)">
          <PlusCircle :size="15" />
          添加备用网址
        </button>
      </section>

      <section class="info-card">
        <h2>关键词标签</h2>
        <div class="tag-row">
          <button
            v-for="tag in props.site.tags"
            :key="tag"
            class="tag-chip"
            type="button"
            @click="void vault.setTag(vault.tagFilter === tag ? '' : tag)"
          >
            {{ tag }}
          </button>
          <button class="tag-chip add" type="button" title="添加关键词标签" @click="emit('edit', props.site)">+</button>
        </div>
      </section>

      <section class="info-card note-card">
        <h2>备注</h2>
        <p>{{ props.site.note || "暂无备注" }}</p>
        <button class="icon-button edit-note" type="button" title="编辑备注" @click="emit('edit', props.site)">
          <Edit3 :size="14" />
        </button>
      </section>

      <section class="info-card meta-card">
        <h2>其他信息</h2>
        <p>创建时间：{{ new Date(props.site.createdAt).toLocaleString("zh-CN") }}</p>
        <p>最后修改：{{ relativeTime(props.site.updatedAt) }}</p>
      </section>
    </template>
  </main>
</template>
