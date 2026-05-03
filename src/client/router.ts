import { createRouter, createWebHistory } from "vue-router";
import AuthView from "./views/AuthView.vue";
import VaultView from "./views/VaultView.vue";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: AuthView },
    { path: "/", name: "vault", component: VaultView },
    { path: "/:pathMatch(.*)*", redirect: "/" }
  ]
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.bootstrap();
  if (!auth.user && to.name !== "login") return { name: "login" };
  if (auth.user && to.name === "login") return { name: "vault" };
  return true;
});
