import type { Theme } from "../hooks/use-theme";
import { ThemeToggle } from "./ThemeToggle";

export function Header({
  sessionId,
  theme,
  onToggleTheme,
}: {
  sessionId: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <header className="header">
      <h1>Hisaab</h1>
      <div className="header-right">
        {/* Visible on purpose: the session is the key to a server-side draft,
            and seeing it makes "why did my sale come back after a refresh?"
            answerable during a demo. */}
        <span className="session">{sessionId}</span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}
