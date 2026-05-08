<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  dismissible?: boolean;
}>(), {
  dismissible: true
});

const emit = defineEmits<{
  close: [];
}>();
const backdrop = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !props.open) return;
  const layers = Array.from(document.querySelectorAll(".modal-backdrop"));
  if (layers.at(-1) === backdrop.value) requestClose();
}

function requestClose() {
  if (props.dismissible) emit("close");
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
    <div v-if="open" ref="backdrop" class="modal-backdrop" @pointerdown.self="requestClose">
      <section class="modal-frame">
        <header class="modal-header">
          <h2>{{ title }}</h2>
          <button class="icon-button" type="button" aria-label="关闭" :disabled="!dismissible" @click="requestClose">
            <X :size="18" />
          </button>
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
