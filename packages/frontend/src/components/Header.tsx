import type { Usage } from "../api/fetch-usage";
import { UsageMeter } from "./UsageMeter";

export function Header({
  sessionId,
  usage,
}: {
  sessionId: string;
  usage: Usage | null;
}) {
  return (
    <header className="header">
      <h1>Hisaab</h1>
      <div className="header-right">
        <UsageMeter usage={usage} />
        {/* Visible on purpose: the session is the key to a server-side draft,
            and seeing it makes "why did my sale come back after a refresh?"
            answerable during a demo. */}
        <span className="session">{sessionId}</span>
      </div>
    </header>
  );
}
