<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
const backdrop = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !props.open) return;
  const layers = Array.from(document.querySelectorAll(".modal-backdrop"));
  if (layers.at(-1) === backdrop.value) emit("close");
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" ref="backdrop" class="modal-backdrop" @pointerdown.self="emit('close')">
      <section class="modal-frame">
        <header class="modal-header">
          <h2>{{ title }}</h2>
          <button class="icon-button" type="button" aria-label="关闭" @click="emit('close')">
            <X :size="18" />
          </button>
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
