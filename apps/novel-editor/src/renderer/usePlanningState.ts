import { useState, type Dispatch, type SetStateAction } from "react";

/** Per-project view memory lives with the controller, even when the dock unmounts. */
export function usePlanningState<T>(store: Map<string, unknown> | undefined, key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => store?.has(key) ? store.get(key) as T : initial);
  return [value, next => setValue(previous => {
    const updated = typeof next === "function" ? (next as (current: T) => T)(previous) : next;
    store?.set(key, updated); return updated;
  })];
}
