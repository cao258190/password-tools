<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    iconType: string;
    iconValue: string;
    iconBg: string;
    size?: number;
  }>(),
  { size: 36 }
);

const textSize = computed(() => {
  const length = props.iconValue.trim().length;
  const ratio = length > 2 ? 0.4 : length > 1 ? 0.5 : 0.6;
  return `${Math.max(Math.round(props.size * ratio), 15)}px`;
});
</script>

<template>
  <span
    class="brand-mark"
    :class="[`brand-${props.iconType}`]"
    :style="{ width: `${props.size}px`, height: `${props.size}px`, background: props.iconBg }"
  >
    <span v-if="props.iconType === 'microsoft'" class="microsoft-grid">
      <i />
      <i />
      <i />
      <i />
    </span>
    <span v-else class="brand-mark-text" :style="{ fontSize: textSize }">{{ props.iconValue }}</span>
  </span>
</template>
