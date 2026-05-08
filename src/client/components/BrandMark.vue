<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    iconType: string;
    iconValue: string;
    iconUrl?: string | null;
    iconBg: string;
    iconColor?: string;
    size?: number;
  }>(),
  { iconColor: "#ffffff", size: 36 }
);

const textSize = computed(() => {
  const length = props.iconValue.trim().length;
  const ratio = length > 2 ? 0.4 : length > 1 ? 0.5 : 0.6;
  return `${Math.max(Math.round(props.size * ratio), 15)}px`;
});

const imageFailed = ref(false);
const showImage = computed(() => props.iconType === "favicon" && Boolean(props.iconUrl) && !imageFailed.value);
const background = computed(() => (props.iconType === "favicon" ? "#ffffff" : props.iconBg));

watch(
  () => props.iconUrl,
  () => {
    imageFailed.value = false;
  }
);
</script>

<template>
  <span
    class="brand-mark"
    :class="[`brand-${props.iconType}`]"
    :style="{ width: `${props.size}px`, height: `${props.size}px`, background, color: props.iconColor }"
  >
    <img v-if="showImage" class="brand-mark-image" :src="props.iconUrl ?? ''" alt="" referrerpolicy="no-referrer" @error="imageFailed = true" />
    <span v-else-if="props.iconType === 'microsoft'" class="microsoft-grid">
      <i />
      <i />
      <i />
      <i />
    </span>
    <span v-else class="brand-mark-text" :style="{ fontSize: textSize }">{{ props.iconValue }}</span>
  </span>
</template>
