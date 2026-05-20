<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { KeyRound, Loader2, Save, ShieldCheck, UserRound } from "lucide-vue-next";
import ConfirmDialog from "./ConfirmDialog.vue";
import ModalFrame from "./ModalFrame.vue";
import { useAuthStore } from "../stores/auth";
import { useVaultStore } from "../stores/vault";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notice: [message: string];
}>();

const auth = useAuthStore();
const vault = useVaultStore();

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

const vaultPasswordForm = reactive({
  currentMasterPassword: "",
  newMasterPassword: "",
  confirmMasterPassword: "",
  saving: false,
  error: ""
});
const vaultPasswordConfirmOpen = ref(false);

watch(
  () => [props.open, auth.user, auth.user?.email, auth.user?.name],
  () => {
    if (!props.open) {
      passwordConfirmOpen.value = false;
      vaultPasswordConfirmOpen.value = false;
      return;
    }
    profileForm.name = auth.user?.name ?? "";
    profileForm.email = auth.user?.email ?? "";
    profileForm.error = "";
    resetPasswordForm();
    resetVaultPasswordForm();
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

function resetVaultPasswordForm() {
  vaultPasswordForm.currentMasterPassword = "";
  vaultPasswordForm.newMasterPassword = "";
  vaultPasswordForm.confirmMasterPassword = "";
  vaultPasswordForm.error = "";
  vaultPasswordConfirmOpen.value = false;
}

async function saveProfile() {
  if (profileForm.saving) return;
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
  if (passwordForm.saving) return;
  passwordForm.error = "";
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordForm.error = "两次输入的新密码不一致";
    return;
  }

  passwordConfirmOpen.value = true;
}

async function changePassword() {
  if (passwordForm.saving) return;
  passwordForm.saving = true;
  passwordForm.error = "";
  try {
    await auth.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    });
    resetPasswordForm();
    emit("notice", "密码已更新");
  } catch (error) {
    passwordForm.error = error instanceof Error ? error.message : "修改密码失败";
    passwordConfirmOpen.value = false;
  } finally {
    passwordForm.saving = false;
  }
}

function requestVaultPasswordChange() {
  if (vaultPasswordForm.saving) return;
  vaultPasswordForm.error = "";
  if (vaultPasswordForm.newMasterPassword !== vaultPasswordForm.confirmMasterPassword) {
    vaultPasswordForm.error = "两次输入的新保险库主密码不一致";
    return;
  }
  if (vaultPasswordForm.currentMasterPassword === vaultPasswordForm.newMasterPassword) {
    vaultPasswordForm.error = "新保险库主密码不能与原密码相同";
    return;
  }

  vaultPasswordConfirmOpen.value = true;
}

async function changeVaultPassword() {
  if (vaultPasswordForm.saving) return;
  vaultPasswordForm.saving = true;
  vaultPasswordForm.error = "";
  try {
    await vault.rotateVaultPassword(vaultPasswordForm.currentMasterPassword, vaultPasswordForm.newMasterPassword);
    resetVaultPasswordForm();
    emit("notice", "保险库主密码已更新");
  } catch (error) {
    vaultPasswordForm.error = error instanceof Error ? error.message : "修改保险库主密码失败";
    vaultPasswordConfirmOpen.value = false;
  } finally {
    vaultPasswordForm.saving = false;
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
              <Loader2 v-if="profileForm.saving" class="spin" :size="16" />
              <Save v-else :size="16" />
              {{ profileForm.saving ? "保存中" : "保存信息" }}
            </button>
          </footer>
        </form>
      </section>

      <section class="profile-section">
        <div class="profile-section-title">
          <KeyRound :size="18" />
          <h3>修改登录密码</h3>
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
            <button class="secondary" type="button" :disabled="passwordForm.saving" @click="resetPasswordForm">清空</button>
            <button class="primary" type="submit" :disabled="passwordForm.saving">
              <Loader2 v-if="passwordForm.saving" class="spin" :size="16" />
              <KeyRound v-else :size="16" />
              {{ passwordForm.saving ? "更新中" : "更新密码" }}
            </button>
          </footer>
        </form>
      </section>

      <section class="profile-section">
        <div class="profile-section-title">
          <ShieldCheck :size="18" />
          <h3>修改保险库主密码</h3>
        </div>
        <form class="modal-form profile-form" @submit.prevent="requestVaultPasswordChange">
          <p class="form-hint">保险库主密码用于在浏览器中加密账号密码，修改时会重新加密所有账号密文。</p>
          <label>
            原保险库主密码
            <input v-model="vaultPasswordForm.currentMasterPassword" required minlength="8" type="password" autocomplete="current-password" placeholder="输入原保险库主密码" />
          </label>
          <div class="form-grid">
            <label>
              新保险库主密码
              <input v-model="vaultPasswordForm.newMasterPassword" required minlength="8" type="password" autocomplete="new-password" placeholder="至少 8 位" />
            </label>
            <label>
              确认新主密码
              <input v-model="vaultPasswordForm.confirmMasterPassword" required minlength="8" type="password" autocomplete="new-password" placeholder="再次输入新主密码" />
            </label>
          </div>
          <p v-if="vaultPasswordForm.error" class="form-error">{{ vaultPasswordForm.error }}</p>
          <footer class="modal-footer">
            <button class="secondary" type="button" :disabled="vaultPasswordForm.saving" @click="resetVaultPasswordForm">清空</button>
            <button class="primary" type="submit" :disabled="vaultPasswordForm.saving || !auth.user?.vaultVerifier">
              <Loader2 v-if="vaultPasswordForm.saving" class="spin" :size="16" />
              <ShieldCheck v-else :size="16" />
              {{ vaultPasswordForm.saving ? "更新中" : "更新主密码" }}
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
    :loading="passwordForm.saving"
    loading-text="更新中"
    @close="passwordConfirmOpen = false"
    @confirm="changePassword"
  />

  <ConfirmDialog
    :open="vaultPasswordConfirmOpen"
    title="更新保险库主密码"
    message="确认更新保险库主密码？系统会使用新主密码重新加密所有账号密码。"
    confirm-text="确认更新"
    :loading="vaultPasswordForm.saving"
    loading-text="更新中"
    @close="vaultPasswordConfirmOpen = false"
    @confirm="changeVaultPassword"
  />
</template>
