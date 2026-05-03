import { onBeforeUnmount, onMounted, type Ref } from "vue";

export function useDismissableLayer(
  host: Ref<HTMLElement | null>,
  isOpen: () => boolean,
  close: () => void
) {
  function onPointerDown(event: PointerEvent) {
    if (!isOpen()) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!host.value?.contains(target)) close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen()) close();
  }

  onMounted(() => {
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onKeydown);
  });
}
