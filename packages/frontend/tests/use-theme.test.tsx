import { act, renderHook } from "@testing-library/react";

import { useTheme } from "../src/hooks/use-theme";
import { setSystemTheme } from "./setup";

const STORAGE_KEY = "hisaab-theme";
const root = () => document.documentElement;

/**
 * Light or dark, and how the two are decided.
 *
 * The property worth protecting is the difference between "no choice yet" and
 * "chose light": the first must follow the operating system, and the second
 * must override it. They look identical on a light machine and diverge on a
 * dark one, which is exactly the case a test has to state.
 */

describe("before the owner has chosen", () => {
  it("follows a light operating system", () => {
    setSystemTheme("light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
  });

  it("follows a dark operating system", () => {
    setSystemTheme("dark");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
  });

  it("sets no data-theme attribute at all", () => {
    // The absence is what leaves the CSS media query in charge, so the app
    // keeps following a system that flips at sunset.
    setSystemTheme("dark");

    renderHook(() => useTheme());

    expect(root().hasAttribute("data-theme")).toBe(false);
  });

  it("stores nothing until asked", () => {
    renderHook(() => useTheme());

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("toggle", () => {
  it("turns a light system dark", () => {
    setSystemTheme("light");
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("dark");
    expect(root().getAttribute("data-theme")).toBe("dark");
  });

  it("turns a dark system light", () => {
    setSystemTheme("dark");
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("light");
    // Explicitly "light", not the attribute removed — that is what overrides a
    // dark operating system rather than falling back to it.
    expect(root().getAttribute("data-theme")).toBe("light");
  });

  it("persists the choice", () => {
    setSystemTheme("light");
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("goes back and forth", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
  });
});

describe("a stored choice", () => {
  it("wins over a dark operating system", () => {
    window.localStorage.setItem(STORAGE_KEY, "light");
    setSystemTheme("dark");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
    expect(root().getAttribute("data-theme")).toBe("light");
  });

  it("wins over a light operating system", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");
    setSystemTheme("light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
  });

  it("survives a remount, which is what a page refresh is", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");

    const first = renderHook(() => useTheme());
    expect(first.result.current.theme).toBe("dark");
    first.unmount();

    const second = renderHook(() => useTheme());
    expect(second.result.current.theme).toBe("dark");
  });

  it("ignores a value that is neither light nor dark", () => {
    // Someone editing localStorage by hand must not be able to put the app
    // into a theme that has no stylesheet.
    window.localStorage.setItem(STORAGE_KEY, "midnight");
    setSystemTheme("light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
    expect(root().hasAttribute("data-theme")).toBe(false);
  });
});
