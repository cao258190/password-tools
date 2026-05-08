<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const name = ref("");
const error = ref("");
const demoLoading = ref(false);

const title = computed(() => (mode.value === "login" ? "欢迎回来" : "创建保险库"));

watch(
  () => auth.publicSettings.registrationEnabled,
  (enabled) => {
    if (!enabled && mode.value === "register") mode.value = "login";
  }
);

onMounted(() => {
  void auth.loadPublicSettings().catch(() => undefined);
});

async function submit() {
  if (auth.loading) return;
  error.value = "";
  if (mode.value === "register" && !auth.publicSettings.registrationEnabled) {
    error.value = "管理员已关闭新用户注册";
    return;
  }
  try {
    if (mode.value === "login") {
      await auth.login(email.value, password.value);
    } else {
      await auth.register(email.value, password.value, name.value);
    }
    await router.push("/");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "操作失败";
  }
}

async function useDemo() {
  if (auth.loading) return;
  demoLoading.value = true;
  email.value = "demo@example.com";
  password.value = "demo123456";
  try {
    await submit();
  } finally {
    demoLoading.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <div class="auth-brand">
        <span class="brand-shield"><ShieldCheck :size="22" /></span>
        <div>
          <strong>安全密钥管家</strong>
          <span>Encrypted vault</span>
        </div>
      </div>

      <div class="auth-copy">
        <LockKeyhole :size="30" />
        <h1>{{ title }}</h1>
        <p>登录后进入本地加密密码库，管理员可控制是否开放新用户注册。</p>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label v-if="mode === 'register'">
          昵称
          <input v-model="name" autocomplete="name" placeholder="U" />
        </label>
        <label>
          邮箱
          <input v-model="email" type="email" autocomplete="email" required />
        </label>
        <label>
          密码
          <input v-model="password" type="password" autocomplete="current-password" required minlength="8" />
        </label>
        <p v-if="error || auth.error" class="form-error">{{ error || auth.error }}</p>
        <button class="primary wide" type="submit" :disabled="auth.loading">
          <Loader2 v-if="auth.loading" class="spin" :size="18" />
          <KeyRound v-else :size="18" />
          {{ auth.loading ? (mode === "login" ? "登录中" : "创建中") : mode === "login" ? "登录保险库" : "创建账号" }}
        </button>
      </form>

      <div class="auth-actions">
        <button class="ghost" type="button" :disabled="auth.loading" @click="useDemo">
          <Loader2 v-if="demoLoading" class="spin" :size="16" />
          {{ demoLoading ? "演示登录中" : "使用演示账号" }}
        </button>
        <button
          v-if="mode === 'login' && auth.publicSettings.registrationEnabled"
          class="link-button"
          type="button"
          :disabled="auth.loading"
          @click="mode = 'register'"
        >
          注册新账号
        </button>
        <button v-else-if="mode === 'register'" class="link-button" type="button" :disabled="auth.loading" @click="mode = 'login'">
          返回登录
        </button>
      </div>
      <p v-if="mode === 'login' && !auth.publicSettings.registrationEnabled" class="auth-note">
        新用户注册已关闭，请使用管理员分配的账号登录。
      </p>
    </section>
  </main>
</template>
