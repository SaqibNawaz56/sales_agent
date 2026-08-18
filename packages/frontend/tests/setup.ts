import "@testing-library/jest-dom";

/**
 * What jsdom does not provide.
 *
 * scrollIntoView is missing outright, and use-scroll-to-latest calls it after
 * every turn — without this stub the transcript tests fail on the scroll rather
 * than on anything they are about.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

/**
 * matchMedia, which jsdom also omits.
 *
 * Defaults to "light" — `matches: false` for the dark query — so a suite that
 * says nothing about the theme gets the light one. `setSystemTheme` below lets
 * a test state the other case explicitly.
 */
function installMatchMedia(prefersDark: boolean): void {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-color-scheme: dark") ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Declares what the operating system prefers, for one test. */
export function setSystemTheme(theme: "light" | "dark"): void {
  installMatchMedia(theme === "dark");
}

/**
 * Every suite starts with no network.
 *
 * A test that needs fetch stubs it explicitly. A test that does not should fail
 * loudly if something reaches for it, rather than hanging or silently passing
 * against a half-real global.
 */
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.reject(new Error("fetch was not stubbed in this test")),
  ) as unknown as typeof fetch;

  window.localStorage.clear();
  installMatchMedia(false);

  // useTheme writes this to <html>. jsdom keeps one document across a file, so
  // without clearing it a stored choice would leak into the next test.
  document.documentElement.removeAttribute("data-theme");
});
