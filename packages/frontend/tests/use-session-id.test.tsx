import { renderHook } from "@testing-library/react";

import { useSessionId } from "../src/hooks/use-session-id";

const STORAGE_KEY = "hisaab-session";

/**
 * The key to a server-side draft.
 *
 * The draft itself lives on the server; losing this id on a refresh would
 * abandon a sale being assembled, which is why it is persisted rather than
 * regenerated per mount.
 */

describe("useSessionId", () => {
  it("generates and stores an id on first visit", () => {
    const { result } = renderHook(() => useSessionId());

    expect(result.current).toMatch(/^shop-[a-z0-9]+$/);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(result.current);
  });

  it("reuses the stored id, so a refresh keeps the sale", () => {
    window.localStorage.setItem(STORAGE_KEY, "shop-existing");

    const { result } = renderHook(() => useSessionId());

    expect(result.current).toBe("shop-existing");
  });

  it("keeps the same id across re-renders", () => {
    const { result, rerender } = renderHook(() => useSessionId());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("gives two fresh browsers different ids", () => {
    const { result: a } = renderHook(() => useSessionId());
    window.localStorage.clear();
    const { result: b } = renderHook(() => useSessionId());

    expect(a.current).not.toBe(b.current);
  });
});
