jest.mock("../src/hooks/use-dictation", () => ({ useDictation: jest.fn() }));

import { act, fireEvent, render, screen } from "@testing-library/react";

import { Composer } from "../src/components/Composer";
import { PLACEHOLDER } from "../src/constants/copy";
import { MIC_RECORDING, MIC_TRANSCRIBING } from "../src/constants/speech";
import { useDictation, type Dictation } from "../src/hooks/use-dictation";

const dictation = useDictation as jest.MockedFunction<typeof useDictation>;

/** jsdom has no MediaRecorder, so the recorder is stubbed at the hook. */
function stubDictation(overrides: Partial<Dictation> = {}): {
  start: jest.Mock;
  stop: jest.Mock;
  emit: (text: string) => void;
} {
  const start = jest.fn();
  const stop = jest.fn();
  let onText: (text: string) => void = () => {};

  dictation.mockImplementation((callback) => {
    onText = callback;
    return { status: "idle", error: null, start, stop, ...overrides };
  });

  // Wrapped in act: this is the transcript arriving from the server, which
  // sets state on a component that is already mounted.
  return { start, stop, emit: (text) => act(() => onText(text)) };
}

describe("Composer", () => {
  it("sends the trimmed text and clears the box", () => {
    stubDictation();
    const onSend = jest.fn();
    render(<Composer busy={false} onSend={onSend} />);

    const input = screen.getByLabelText("Message");
    fireEvent.change(input, { target: { value: "  2kg rice to Ali  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("2kg rice to Ali");
    expect(input).toHaveValue("");
  });

  it("keeps Send disabled until something is typed", () => {
    stubDictation();
    render(<Composer busy={false} onSend={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "rice" },
    });

    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("does not send whitespace", () => {
    stubDictation();
    const onSend = jest.fn();
    render(<Composer busy={false} onSend={onSend} />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "   " },
    });
    fireEvent.submit(screen.getByLabelText("Message").closest("form")!);

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the input while a turn is in flight", () => {
    stubDictation();
    render(<Composer busy onSend={jest.fn()} />);

    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  describe("dictation", () => {
    it("writes a transcript into the box rather than sending it", () => {
      // A misheard sentence is cheaper to correct in the box than to unpick
      // from a draft. Nothing reaches the agent until Send is pressed.
      const stub = stubDictation();
      const onSend = jest.fn();
      render(<Composer busy={false} onSend={onSend} />);

      fireEvent.click(screen.getByRole("button", { name: /Speak the sale/i }));
      stub.emit("2kg rice to Ali");

      expect(screen.getByLabelText("Message")).toHaveValue("2kg rice to Ali");
      expect(onSend).not.toHaveBeenCalled();
    });

    it("appends a second phrase instead of wiping the first", () => {
      const stub = stubDictation();
      render(<Composer busy={false} onSend={jest.fn()} />);

      fireEvent.change(screen.getByLabelText("Message"), {
        target: { value: "2kg rice" },
      });
      stub.emit("and 1 oil to Ali");

      expect(screen.getByLabelText("Message")).toHaveValue(
        "2kg rice and 1 oil to Ali",
      );
    });

    it("stops the recorder when the message is sent", () => {
      const stub = stubDictation();
      render(<Composer busy={false} onSend={jest.fn()} />);

      fireEvent.change(screen.getByLabelText("Message"), {
        target: { value: "rice" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));

      expect(stub.stop).toHaveBeenCalled();
    });

    it("says it is listening in the placeholder while recording", () => {
      stubDictation({ status: "recording" });
      render(<Composer busy={false} onSend={jest.fn()} />);

      expect(screen.getByLabelText("Message")).toHaveAttribute(
        "placeholder",
        MIC_RECORDING,
      );
    });

    it("says it is transcribing once recording has stopped", () => {
      stubDictation({ status: "transcribing" });
      render(<Composer busy={false} onSend={jest.fn()} />);

      expect(screen.getByLabelText("Message")).toHaveAttribute(
        "placeholder",
        MIC_TRANSCRIBING,
      );
    });

    it("returns to the normal prompt when idle", () => {
      stubDictation();
      render(<Composer busy={false} onSend={jest.fn()} />);

      expect(screen.getByLabelText("Message")).toHaveAttribute(
        "placeholder",
        PLACEHOLDER,
      );
    });

    it("shows a dictation error without blocking typing", () => {
      stubDictation({ error: "Microphone blocked." });
      render(<Composer busy={false} onSend={jest.fn()} />);

      expect(screen.getByRole("status")).toHaveTextContent("Microphone blocked.");
      expect(screen.getByLabelText("Message")).toBeEnabled();
    });

    it("hides the mic entirely when the browser cannot record", () => {
      // A button that can never work is worse than no button.
      stubDictation({ status: "unsupported" });
      render(<Composer busy={false} onSend={jest.fn()} />);

      expect(screen.queryByRole("button", { name: /speak|record/i })).toBeNull();
    });

    it("shows the mic disabled when the page is not a secure context", () => {
      // This one the owner can fix, by using localhost or https.
      stubDictation({ status: "insecure" });
      render(<Composer busy={false} onSend={jest.fn()} />);

      expect(screen.getByRole("button", { name: /https/i })).toBeDisabled();
    });
  });
});
