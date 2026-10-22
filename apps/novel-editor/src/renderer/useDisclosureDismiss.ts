import { useEffect, useRef, type RefObject } from "react";

/** Native details menus keep their keyboard behavior and close like other menus. */
export function useDisclosureDismiss(): RefObject<HTMLDetailsElement | null> {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      const menu = ref.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      const menu = ref.current;
      if (event.key !== "Escape" || !menu?.open) return;
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, []);
  return ref;
}
