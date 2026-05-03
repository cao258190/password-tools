<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const mode = ref<"login" | "register">("login");
const email = ref("demo@example.com");
const password = ref("demo123456");
const name = ref("U");
const error = ref("");

const title = computed(() => (mode.value === "login" ? "欢迎回来" : "创建保险库"));

async function submit() {
  error.value = "";
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
  email.value = "demo@example.com";
  password.value = "demo123456";
  await submit();
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
        <p>登录后进入本地加密密码库，示例账号已内置 Google、GitHub、支付宝等数据。</p>
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
          {{ mode === "login" ? "登录保险库" : "创建账号" }}
        </button>
      </form>

      <div class="auth-actions">
        <button class="ghost" type="button" @click="useDemo">使用演示账号</button>
        <button class="link-button" type="button" @click="mode = mode === 'login' ? 'register' : 'login'">
          {{ mode === "login" ? "注册新账号" : "返回登录" }}
        </button>
      </div>
    </section>
  </main>
</template>
