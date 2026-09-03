import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useModalFocus<T extends HTMLElement>(onClose: () => void): { ref: RefObject<T | null>; onKeyDown: (event: KeyboardEvent<T>) => void } {
  const ref = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      if (ref.current?.contains(document.activeElement)) return;
      ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      restoreRef.current?.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<T>): void => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || ref.current === null) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
    if (items.length === 0) { event.preventDefault(); return; }
    const first = items[0]!;
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return { ref, onKeyDown };
}
