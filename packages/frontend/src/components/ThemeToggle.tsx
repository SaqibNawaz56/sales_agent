import type { Theme } from "../hooks/use-theme";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2" />
        <path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.7 14.6A8.6 8.6 0 0 1 9.4 3.3a1 1 0 0 0-1.3-1.2 10.6 10.6 0 1 0 13.8 13.8 1 1 0 0 0-1.2-1.3Z"
      />
    </svg>
  );
}

/**
 * Light/dark switch.
 *
 * Shows where a press would take you, not where you are — a sun while dark is
 * active, because pressing it turns the lights on. The accessible name says the
 * same thing in words, since the icon alone is ambiguous either way round.
 */
export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
