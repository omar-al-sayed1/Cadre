import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

/**
 * A ref that always holds the latest value, updated after render (never during
 * render) so callbacks registered once can read fresh props/state.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

const noopSubscribe = () => () => {};

/** Read a browser-only value without a hydration mismatch (server renders `serverValue`). */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

/** True once rendering on the client. */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}
