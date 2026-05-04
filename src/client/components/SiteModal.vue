<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { Save } from "lucide-vue-next";
import BrandMark from "./BrandMark.vue";
import ModalFrame from "./ModalFrame.vue";
import type { Category, SiteDetail, SiteInput } from "../types";

const props = defineProps<{
  open: boolean;
  site: SiteDetail | null;
  categories: Category[];
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: SiteInput];
}>();

const backgroundColors = ["#4285f4", "#2563eb", "#22c55e", "#f97316", "#ef4444", "#8b5cf6", "#06b6d4", "#111827", "#ffffff"];
const textColors = ["#ffffff", "#111827", "#2563eb", "#22c55e", "#f97316", "#ef4444", "#8b5cf6", "#06b6d4"];
const title = computed(() => (props.site ? "编辑网站" : "添加网站"));

const form = reactive({
  name: "",
  primaryUrl: "",
  backupUrls: "",
  categoryId: "",
  iconType: "letter",
  iconValue: "S",
  iconBg: backgroundColors[0],
  iconColor: "#ffffff",
  favorite: false,
  tags: "",
  note: ""
});

watch(
  () => [props.open, props.site, props.categories] as const,
  () => {
    const fallbackCategory = props.categories.find((category) => category.name !== "全部")?.id ?? "";
    form.name = props.site?.name ?? "";
    form.primaryUrl = props.site?.primaryUrl ?? "";
    form.backupUrls = props.site?.backupUrls.join("\n") ?? "";
    form.categoryId = props.site?.categoryId ?? fallbackCategory;
    form.iconType = props.site?.iconType ?? "letter";
    form.iconValue = props.site?.iconValue ?? "S";
    form.iconBg = props.site?.iconBg ?? backgroundColors[0];
    form.iconColor = props.site?.iconColor ?? (form.iconBg.toLowerCase() === "#ffffff" ? "#111827" : "#ffffff");
    form.favorite = props.site?.favorite ?? false;
    form.tags = props.site?.tags.join(", ") ?? "";
    form.note = props.site?.note ?? "";
  },
  { immediate: true }
);

function splitLines(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function submit() {
  emit("submit", {
    name: form.name,
    primaryUrl: form.primaryUrl,
    backupUrls: splitLines(form.backupUrls),
    categoryId: form.categoryId || null,
    iconType: form.iconType,
    iconValue: form.iconValue || form.name.slice(0, 1).toUpperCase() || "S",
    iconBg: form.iconBg,
    iconColor: form.iconColor,
    favorite: form.favorite,
    tags: splitLines(form.tags),
    note: form.note
  });
}
</script>

<template>
  <ModalFrame :open="open" :title="title" @close="emit('close')">
    <form class="modal-form" @submit.prevent="submit">
      <div class="form-grid">
        <label>
          网站名称
          <input v-model="form.name" required placeholder="Google" @input="form.iconValue = form.iconValue || form.name.slice(0, 1)" />
        </label>
        <label>
          分类
          <select v-model="form.categoryId">
            <option value="">未分类</option>
            <option v-for="category in categories.filter((item) => item.name !== '全部')" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </label>
      </div>

      <label>
        主网站地址
        <input v-model="form.primaryUrl" required type="url" placeholder="https://www.google.com" />
      </label>

      <label>
        备用网址 / 备用域名
        <textarea v-model="form.backupUrls" rows="3" placeholder="每行一个网址" />
      </label>

      <div class="form-grid">
        <label>
          图标文字
          <input v-model="form.iconValue" maxlength="8" />
        </label>
        <label>
          图标类型
          <select v-model="form.iconType">
            <option value="letter">文字图标</option>
            <option value="google">Google</option>
            <option value="microsoft">Microsoft</option>
            <option value="github">GitHub</option>
          </select>
        </label>
      </div>

      <div class="icon-color-editor">
        <BrandMark
          :icon-type="form.iconType"
          :icon-value="form.iconValue || form.name.slice(0, 1).toUpperCase() || 'S'"
          :icon-bg="form.iconBg"
          :icon-color="form.iconColor"
          :size="44"
        />
        <div>
          <div class="swatch-row">
            <span>背景颜色</span>
            <button
              v-for="color in backgroundColors"
              :key="color"
              class="swatch"
              :class="{ selected: form.iconBg === color }"
              :style="{ background: color }"
              type="button"
              @click="form.iconBg = color"
            />
          </div>
          <div class="swatch-row">
            <span>文字颜色</span>
            <button
              v-for="color in textColors"
              :key="color"
              class="swatch"
              :class="{ selected: form.iconColor === color }"
              :style="{ background: color }"
              type="button"
              @click="form.iconColor = color"
            />
          </div>
        </div>
      </div>

      <label>
        关键词标签
        <input v-model="form.tags" placeholder="搜索引擎, 重要, 工作" />
      </label>

      <label>
        备注
        <textarea v-model="form.note" rows="4" placeholder="记录用途、二次验证或注意事项" />
      </label>

      <footer class="modal-footer">
        <button class="secondary" type="button" @click="emit('close')">取消</button>
        <button class="primary" type="submit">
          <Save :size="16" />
          保存
        </button>
      </footer>
    </form>
  </ModalFrame>
</template>
