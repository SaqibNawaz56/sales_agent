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
});
