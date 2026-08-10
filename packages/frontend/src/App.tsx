import { Composer, ConfirmGate, Header, Transcript } from "./components";
import {
  useConversation,
  useScrollToLatest,
  useSessionId,
  useUsage,
} from "./hooks";

/**
 * Composition only.
 *
 * Every piece of state and every call to the server lives in useConversation;
 * every piece of markup lives in components/. What remains here is the one
 * decision that belongs at the top: while a sale is awaiting confirmation the
 * composer is replaced by the gate, so there is no way to type past a sale that
 * has not been accepted or rejected.
 */
export function App() {
  const sessionId = useSessionId();
  const {
    messages,
    draft,
    question,
    awaiting,
    busy,
    error,
    receipt,
    send,
    choose,
    resolve,
  } = useConversation(sessionId);

  const usage = useUsage();

  const { endRef, cardRef } = useScrollToLatest(awaiting, [
    messages,
    draft,
    question,
    busy,
  ]);

  const confirm = () => void resolve(true);
  const cancel = () => void resolve(false);

  return (
    <div className="app">
      <Header sessionId={sessionId} usage={usage} />

      <Transcript
        messages={messages}
        draft={draft}
        question={question}
        awaiting={awaiting}
        busy={busy}
        error={error}
        receipt={receipt}
        onChoose={(choiceId) => void choose(choiceId)}
        onConfirm={confirm}
        onCancel={cancel}
        cardRef={cardRef}
        endRef={endRef}
      />

      {awaiting && draft ? (
        <ConfirmGate
          draft={draft}
          busy={busy}
          onConfirm={confirm}
          onCancel={cancel}
        />
      ) : (
        <Composer busy={busy} onSend={(text) => void send(text)} />
      )}
    </div>
  );
}
