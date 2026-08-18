import { fireEvent, render, screen } from "@testing-library/react";

import type { DraftItem, DraftSale, PendingQuestion } from "../src/api/api.types";
import type { Usage } from "../src/api/fetch-usage";
import { AnswerChoices } from "../src/components/AnswerChoices";
import { ConfirmGate } from "../src/components/ConfirmGate";
import { ConfirmationCard } from "../src/components/ConfirmationCard";
import { ErrorBanner } from "../src/components/ErrorBanner";
import { ItemsTable } from "../src/components/ItemsTable";
import { MessageBubble } from "../src/components/MessageBubble";
import { ReceiptLink } from "../src/components/ReceiptLink";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { UsageMeter } from "../src/components/UsageMeter";

const ITEMS: DraftItem[] = [
  { product: "Rice", quantity: 2, unit: "kg", unitPrice: 300, lineTotal: 600 },
  { product: "Sugar", quantity: 2, unit: "kg", unitPrice: 100, lineTotal: 200 },
];

const DRAFT: DraftSale = {
  customer: "Ali",
  status: "awaiting_confirmation",
  items: ITEMS,
  grandTotal: 800,
};

describe("ItemsTable", () => {
  it("renders every line the server sent", () => {
    render(<ItemsTable items={ITEMS} />);

    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.getByText("Sugar")).toBeInTheDocument();
  });

  it("shows the server's figures without recomputing them", () => {
    // A total calculated in the browser could disagree with the one about to
    // be written, and the owner would be approving the wrong number.
    render(<ItemsTable items={[{ ...ITEMS[0], lineTotal: 999 }]} />);

    expect(screen.getByText("999")).toBeInTheDocument();
  });

  it("shows a dash for a figure that is not known yet", () => {
    render(
      <ItemsTable
        items={[
          { product: "ghee", quantity: null, unit: null, unitPrice: null, lineTotal: null },
        ]}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders an empty sale without crashing", () => {
    render(<ItemsTable items={[]} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("ConfirmationCard", () => {
  it("names the customer and shows the total being approved", () => {
    render(
      <ConfirmationCard draft={DRAFT} busy={false} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("calls onConfirm only when Confirm is pressed", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmationCard draft={DRAFT} busy={false} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel only when Cancel is pressed", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmationCard draft={DRAFT} busy={false} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables both buttons while a save is in flight", () => {
    // Double-tapping Confirm must not be able to write twice.
    render(
      <ConfirmationCard draft={DRAFT} busy onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows a dash rather than a wrong total when none was computed", () => {
    render(
      <ConfirmationCard
        draft={{ ...DRAFT, grandTotal: null }}
        busy={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ConfirmGate", () => {
  it("states the total on the pinned bar too", () => {
    // The card can be scrolled away from; this cannot.
    render(<ConfirmGate draft={DRAFT} busy={false} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("routes its two buttons to the two callbacks", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmGate draft={DRAFT} busy={false} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both while busy", () => {
    render(<ConfirmGate draft={DRAFT} busy onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("AnswerChoices", () => {
  const question: PendingQuestion = {
    text: 'I don\'t have "Sakib" on file. Did you mean saqib or Ali?',
    choices: [
      { id: "suggestion:3", label: "saqib", intent: "neutral" },
      { id: "suggestion:4", label: "Ali", intent: "neutral" },
      { id: "new", label: 'Add "Sakib" as new', intent: "affirm" },
    ],
  };

  it("renders nothing for a question that wants typing", () => {
    const { container } = render(
      <AnswerChoices question={{ text: "How much oil?", choices: [] }} busy={false} onChoose={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one button per choice, labelled as the server said", () => {
    render(<AnswerChoices question={question} busy={false} onChoose={jest.fn()} />);

    expect(screen.getByRole("button", { name: "saqib" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ali" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Add "Sakib" as new' })).toBeInTheDocument();
  });

  it("sends back the id of the button pressed, not its position", () => {
    // Pressing the second suggestion must not select the first — the exact
    // regression the per-suggestion buttons exist to prevent.
    const onChoose = jest.fn();
    render(<AnswerChoices question={question} busy={false} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole("button", { name: "Ali" }));

    expect(onChoose).toHaveBeenCalledWith("suggestion:4");
  });

  it("disables every choice while a request is in flight", () => {
    render(<AnswerChoices question={question} busy onChoose={jest.fn()} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("styles by intent without letting the client act on it", () => {
    render(<AnswerChoices question={question} busy={false} onChoose={jest.fn()} />);

    expect(screen.getByRole("button", { name: 'Add "Sakib" as new' })).toHaveClass(
      "choice",
      "affirm",
    );
  });
});

describe("MessageBubble", () => {
  it("marks who said it", () => {
    const { container } = render(
      <MessageBubble message={{ id: 1, from: "owner", text: "2kg rice to Ali" }} />,
    );

    expect(container.firstChild).toHaveClass("bubble", "owner");
    expect(screen.getByText("2kg rice to Ali")).toBeInTheDocument();
  });
});

describe("ReceiptLink", () => {
  const receipt = {
    saleId: 46,
    receiptNo: 3,
    receiptDate: "2026-08-10",
    url: "/api/sales/46/receipt",
  };

  it("is a real anchor with download, not a click handler", () => {
    // A fetch-and-blob download breaks right-click, open-in-new-tab and share.
    // The endpoint already sends Content-Disposition, so a plain link is
    // enough — and keeps all three working.
    render(<ReceiptLink receipt={receipt} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/api/sales/46/receipt");
    expect(link).toHaveAttribute("download");
  });

  it("shows the padded receipt number, so it can be matched to the paper book", () => {
    render(<ReceiptLink receipt={receipt} />);

    expect(screen.getByRole("link")).toHaveTextContent("Download receipt 003");
  });

  it("follows the url the server built rather than assembling one", () => {
    render(
      <ReceiptLink receipt={{ ...receipt, url: "/somewhere/else/9" }} />,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/somewhere/else/9");
  });

  it("does not truncate a number past three digits", () => {
    render(<ReceiptLink receipt={{ ...receipt, receiptNo: 1000 }} />);

    expect(screen.getByRole("link")).toHaveTextContent("Download receipt 1000");
  });
});

describe("ThemeToggle", () => {
  it("offers the light switch while dark is active", () => {
    // The icon shows where a press goes, not where you are — a sun in dark
    // mode, because pressing it turns the lights on.
    render(<ThemeToggle theme="dark" onToggle={jest.fn()} />);

    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("offers the dark switch while light is active", () => {
    render(<ThemeToggle theme="light" onToggle={jest.fn()} />);

    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  it("names itself in words, since the icon alone is ambiguous", () => {
    render(<ThemeToggle theme="light" onToggle={jest.fn()} />);

    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Switch to dark mode",
    );
  });

  it("calls onToggle when pressed", () => {
    const onToggle = jest.fn();
    render(<ThemeToggle theme="light" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorBanner", () => {
  it("announces itself to assistive technology", () => {
    render(<ErrorBanner message="The assistant is unavailable." />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The assistant is unavailable.",
    );
  });
});

describe("UsageMeter", () => {
  function usage(overrides: Partial<Usage["chat"]> = {}): Usage {
    const empty = { limit: null, remaining: null, resetMs: null };
    return {
      chat: {
        tokens: { limit: 12000, remaining: 9500, resetMs: 7660 },
        requests: { limit: 1000, remaining: 994, resetMs: 62000 },
        audioSeconds: empty,
        observedAt: 1000,
        spentTokens: 2500,
        calls: 3,
        ...overrides,
      },
      transcription: {
        tokens: empty,
        requests: empty,
        audioSeconds: empty,
        observedAt: null,
        spentTokens: 0,
        calls: 0,
      },
      serverTime: 2000,
    };
  }

  it("renders nothing before the first reading arrives", () => {
    const { container } = render(<UsageMeter usage={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a placeholder rather than a confident zero when Groq has said nothing", () => {
    const empty = { limit: null, remaining: null, resetMs: null };
    const { container } = render(
      <UsageMeter usage={usage({ tokens: empty, requests: empty })} />,
    );

    expect(container).toHaveTextContent("quota —");
  });

  it("shows both budgets, because one says nothing about the other", () => {
    render(<UsageMeter usage={usage()} />);

    expect(screen.getByText("min")).toBeInTheDocument();
    expect(screen.getByText("day")).toBeInTheDocument();
  });

  it("shows remaining over limit, compacted for the header", () => {
    render(<UsageMeter usage={usage()} />);

    expect(screen.getByText("9.5k/12k")).toBeInTheDocument();
    expect(screen.getByText("994/1.0k")).toBeInTheDocument();
  });

  it("escalates the styling as a budget is spent", () => {
    const { container } = render(
      <UsageMeter usage={usage({ tokens: { limit: 100, remaining: 5, resetMs: null } })} />,
    );

    expect(container.querySelector(".usage-row.critical")).not.toBeNull();
  });
});
