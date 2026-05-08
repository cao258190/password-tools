<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { KeyRound, Loader2, LockKeyhole, Save } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";

const props = defineProps<{
  open: boolean;
  setupMode: boolean;
  busy: boolean;
  error: string;
  notice: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [masterPassword: string];
}>();

const form = reactive({
  masterPassword: "",
  confirmPassword: "",
  localError: ""
});

const minMasterPasswordLength = 6;
const title = computed(() => (props.setupMode ? "设置保险库主密码" : "解锁保险库"));

watch(
  () => props.open,
  (open) => {
    if (!open) {
      form.masterPassword = "";
      form.confirmPassword = "";
      form.localError = "";
    }
  }
);

function submit() {
  form.localError = "";
  if (form.masterPassword.length < minMasterPasswordLength) {
    form.localError = `保险库主密码至少 ${minMasterPasswordLength} 位`;
    return;
  }
  if (props.setupMode && form.masterPassword !== form.confirmPassword) {
    form.localError = "两次输入的保险库主密码不一致";
    return;
  }
  emit("submit", form.masterPassword);
}
</script>

<template>
  <ModalFrame :open="open" :title="title" :dismissible="!busy" @close="emit('close')">
    <form class="modal-form vault-unlock-form" @submit.prevent="submit">
      <div class="unlock-intro">
        <LockKeyhole :size="28" />
        <p>
          {{ setupMode ? "这个密码只在浏览器中用于解密账号密码，服务器不会保存。" : "输入保险库主密码后才能查看和保存账号密码。" }}
        </p>
      </div>

      <label>
        保险库主密码
        <input v-model="form.masterPassword" type="password" autocomplete="current-password" required :minlength="minMasterPasswordLength" />
      </label>

      <label v-if="setupMode">
        再次输入
        <input v-model="form.confirmPassword" type="password" autocomplete="new-password" required :minlength="minMasterPasswordLength" />
      </label>

      <p v-if="form.localError || error" class="form-error">{{ form.localError || error }}</p>
      <p v-else-if="notice" class="form-success">{{ notice }}</p>

      <footer class="modal-footer">
        <button class="secondary" type="button" :disabled="busy" @click="emit('close')">稍后</button>
        <button class="primary" type="submit" :disabled="busy">
          <Loader2 v-if="busy" class="spin" :size="16" />
          <Save v-else-if="setupMode" :size="16" />
          <KeyRound v-else :size="16" />
          {{ busy ? "处理中" : setupMode ? "设置并解锁" : "解锁" }}
        </button>
      </footer>
    </form>
  </ModalFrame>
</template>
