<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { KeyRound, Save, UserRound } from "lucide-vue-next";
import ConfirmDialog from "./ConfirmDialog.vue";
import ModalFrame from "./ModalFrame.vue";
import { useAuthStore } from "../stores/auth";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notice: [message: string];
}>();

const auth = useAuthStore();

const profileForm = reactive({
  name: "",
  email: "",
  saving: false,
  error: ""
});

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  saving: false,
  error: ""
});
const passwordConfirmOpen = ref(false);

watch(
  () => [props.open, auth.user, auth.user?.email, auth.user?.name],
  () => {
    if (!props.open) {
      passwordConfirmOpen.value = false;
      return;
    }
    profileForm.name = auth.user?.name ?? "";
    profileForm.email = auth.user?.email ?? "";
    profileForm.error = "";
    resetPasswordForm();
  },
  { immediate: true }
);

function resetPasswordForm() {
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
  passwordForm.error = "";
  passwordConfirmOpen.value = false;
}

async function saveProfile() {
  profileForm.error = "";
  profileForm.saving = true;
  try {
    await auth.updateProfile({
      name: profileForm.name.trim(),
      email: profileForm.email.trim()
    });
    emit("notice", "个人信息已更新");
  } catch (error) {
    profileForm.error = error instanceof Error ? error.message : "保存个人信息失败";
  } finally {
    profileForm.saving = false;
  }
}

function requestPasswordChange() {
  passwordForm.error = "";
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordForm.error = "两次输入的新密码不一致";
    return;
  }

  passwordConfirmOpen.value = true;
}

async function changePassword() {
  passwordConfirmOpen.value = false;
  passwordForm.saving = true;
  try {
    await auth.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    });
    resetPasswordForm();
    emit("notice", "密码已更新");
  } catch (error) {
    passwordForm.error = error instanceof Error ? error.message : "修改密码失败";
  } finally {
    passwordForm.saving = false;
  }
}
</script>

<template>
  <ModalFrame :open="open" title="个人中心" @close="emit('close')">
    <div class="profile-panel">
      <section class="profile-section">
        <div class="profile-section-title">
          <UserRound :size="18" />
          <h3>个人信息</h3>
        </div>
        <form class="modal-form profile-form" @submit.prevent="saveProfile">
          <div class="form-grid">
            <label>
              昵称
              <input v-model="profileForm.name" maxlength="24" placeholder="输入昵称" />
            </label>
            <label>
              邮箱
              <input v-model="profileForm.email" required type="email" placeholder="name@example.com" />
            </label>
          </div>
          <p v-if="profileForm.error" class="form-error">{{ profileForm.error }}</p>
          <footer class="modal-footer">
            <button class="primary" type="submit" :disabled="profileForm.saving">
              <Save :size="16" />
              {{ profileForm.saving ? "保存中" : "保存信息" }}
            </button>
          </footer>
        </form>
      </section>

      <section class="profile-section">
        <div class="profile-section-title">
          <KeyRound :size="18" />
          <h3>修改密码</h3>
        </div>
        <form class="modal-form profile-form" @submit.prevent="requestPasswordChange">
          <label>
            当前密码
            <input v-model="passwordForm.currentPassword" required type="password" autocomplete="current-password" placeholder="输入当前登录密码" />
          </label>
          <div class="form-grid">
            <label>
              新密码
              <input v-model="passwordForm.newPassword" required minlength="8" type="password" autocomplete="new-password" placeholder="至少 8 位" />
            </label>
            <label>
              确认新密码
              <input v-model="passwordForm.confirmPassword" required minlength="8" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
            </label>
          </div>
          <p v-if="passwordForm.error" class="form-error">{{ passwordForm.error }}</p>
          <footer class="modal-footer">
            <button class="secondary" type="button" @click="resetPasswordForm">清空</button>
            <button class="primary" type="submit" :disabled="passwordForm.saving">
              <KeyRound :size="16" />
              {{ passwordForm.saving ? "更新中" : "更新密码" }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </ModalFrame>

  <ConfirmDialog
    :open="passwordConfirmOpen"
    title="更新登录密码"
    message="确认更新登录密码？更新后需要使用新密码登录。"
    confirm-text="确认更新"
    @close="passwordConfirmOpen = false"
    @confirm="changePassword"
  />
</template>
