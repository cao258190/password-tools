<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { KeyRound, RefreshCw, Save } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import { api } from "../api";
import type { Account, AccountInput } from "../types";
import { evaluatePasswordStrength, strengthLabel } from "../utils/password";

const props = defineProps<{
  open: boolean;
  account: Account | null;
  mode: "create" | "edit" | "generate";
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: AccountInput];
}>();

const form = reactive({
  label: "主账号",
  username: "",
  password: "",
  sortOrder: 0,
  generating: false
});

const title = computed(() => {
  if (props.mode === "generate") return "生成新密码";
  if (props.mode === "edit") return "编辑账号";
  return "添加账号";
});
const strength = computed(() => evaluatePasswordStrength(form.password));

watch(
  () => [props.open, props.account, props.mode] as const,
  () => {
    form.label = props.account?.label ?? "主账号";
    form.username = props.account?.username ?? "";
    form.password = props.account?.password ?? "";
    form.sortOrder = props.account?.sortOrder ?? 0;
    if (props.open && props.mode === "generate") {
      void generate();
    }
  },
  { immediate: true }
);

async function generate() {
  form.generating = true;
  try {
    const result = await api.generatePassword(20);
    form.password = result.password;
  } finally {
    form.generating = false;
  }
}

function submit() {
  emit("submit", {
    label: form.label,
    username: form.username,
    password: form.password,
    strength: strength.value,
    sortOrder: Number(form.sortOrder) || 0
  });
}
</script>

<template>
  <ModalFrame :open="open" :title="title" @close="emit('close')">
    <form class="modal-form" @submit.prevent="submit">
      <div class="form-grid">
        <label>
          账号名称
          <input v-model="form.label" required placeholder="主账号" />
        </label>
        <label>
          用户名
          <input v-model="form.username" required placeholder="user@example.com" />
        </label>
      </div>

      <label>
        排序号
        <input v-model.number="form.sortOrder" type="number" step="1" placeholder="数字越大越靠前" />
      </label>

      <label>
        密码
        <div class="input-with-button">
          <input v-model="form.password" required type="text" placeholder="输入或生成安全密码" />
          <button class="secondary" type="button" :disabled="form.generating" @click="generate">
            <RefreshCw v-if="form.generating" class="spin" :size="16" />
            <KeyRound v-else :size="16" />
            生成
          </button>
        </div>
      </label>

      <div class="password-preview" :class="`strength-${strength}`">
        <span>密码强度：{{ strengthLabel(strength) }}</span>
        <div class="strength-meter">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

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
