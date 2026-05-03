<script setup lang="ts">
import { AlertTriangle } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";

defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <ModalFrame :open="open" :title="title" @close="emit('close')">
    <div class="confirm-body">
      <AlertTriangle :size="28" />
      <p>{{ message }}</p>
    </div>
    <footer class="modal-footer">
      <button class="secondary" type="button" @click="emit('close')">取消</button>
      <button class="danger" type="button" @click="emit('confirm')">{{ confirmText ?? "删除" }}</button>
    </footer>
  </ModalFrame>
</template>
