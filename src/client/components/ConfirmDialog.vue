<script setup lang="ts">
import { AlertTriangle, Loader2 } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  loading?: boolean;
  loadingText?: string;
}>(), {
  loading: false
});

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

function requestClose() {
  if (!props.loading) emit("close");
}

function confirm() {
  if (!props.loading) emit("confirm");
}
</script>

<template>
  <ModalFrame :open="open" :title="title" :dismissible="!props.loading" @close="requestClose">
    <div class="confirm-body">
      <AlertTriangle :size="28" />
      <p>{{ message }}</p>
    </div>
    <footer class="modal-footer">
      <button class="secondary" type="button" :disabled="props.loading" @click="requestClose">取消</button>
      <button class="danger" type="button" :disabled="props.loading" @click="confirm">
        <Loader2 v-if="props.loading" class="spin" :size="16" />
        {{ props.loading ? (loadingText ?? "处理中") : (confirmText ?? "删除") }}
      </button>
    </footer>
  </ModalFrame>
</template>
