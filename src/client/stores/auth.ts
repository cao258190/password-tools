import { defineStore } from "pinia";
import { api, ApiError } from "../api";
import type { User } from "../types";

type AuthState = {
  user: User | null;
  loading: boolean;
  bootstrapped: boolean;
  error: string;
};

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    user: null,
    loading: false,
    bootstrapped: false,
    error: ""
  }),
  actions: {
    async bootstrap() {
      if (this.bootstrapped) return;
      this.loading = true;
      try {
        const { user } = await api.me();
        this.user = user;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          this.error = error instanceof Error ? error.message : "加载登录状态失败";
        }
        this.user = null;
      } finally {
        this.loading = false;
        this.bootstrapped = true;
      }
    },
    async login(email: string, password: string) {
      this.loading = true;
      this.error = "";
      try {
        const { user } = await api.login({ email, password });
        this.user = user;
        this.bootstrapped = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "登录失败";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async register(email: string, password: string, name?: string) {
      this.loading = true;
      this.error = "";
      try {
        const { user } = await api.register({ email, password, name });
        this.user = user;
        this.bootstrapped = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "注册失败";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async updateProfile(input: { email: string; name?: string }) {
      const { user } = await api.updateProfile(input);
      this.user = user;
      return user;
    },
    async changePassword(input: { currentPassword: string; newPassword: string }) {
      await api.changePassword(input);
    },
    async logout() {
      await api.logout();
      this.user = null;
      this.bootstrapped = true;
    }
  }
});
