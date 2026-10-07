import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MessageList from "./MessageList.jsx";
import Welcome from "./Welcome.jsx";

const convo = [
  { role: "user", content: "First question" },
  { role: "assistant", content: "First answer" },
  { role: "user", content: "Second question" },
  { role: "assistant", content: "Second answer" },
];

const messageOf = (text) => screen.getByText(text).closest(".message");

describe("MessageList: copy buttons", () => {
  it("puts a Copy button under every bot reply", () => {
    render(<MessageList messages={convo} error="" onRegenerate={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Copy reply" })).toHaveLength(2);
    expect(within(messageOf("First answer")).getByRole("button", { name: "Copy reply" })).toBeInTheDocument();
    expect(
      within(messageOf("Second answer")).getByRole("button", { name: "Copy reply" }),
    ).toBeInTheDocument();
  });

  it("has no buttons under user messages", () => {
    render(<MessageList messages={convo} error="" onRegenerate={vi.fn()} />);
    for (const text of ["First question", "Second question"]) {
      expect(within(messageOf(text)).queryAllByRole("button")).toHaveLength(0);
    }
  });

  it("has no buttons on an error bubble", () => {
    render(
      <MessageList messages={convo} error="The AI service is very busy right now." onRegenerate={vi.fn()} />,
    );
    const errorBubble = screen.getByRole("alert");
    expect(errorBubble).toHaveTextContent("The AI service is very busy right now.");
    expect(within(errorBubble.closest(".message")).queryAllByRole("button")).toHaveLength(0);
    // ...and the real replies still have theirs.
    expect(screen.getAllByRole("button", { name: "Copy reply" })).toHaveLength(2);
  });

  it("has no copy button on the welcome message", () => {
    render(<Welcome onPick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Copy reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate reply" })).not.toBeInTheDocument();
  });
});

describe("MessageList: regenerate button", () => {
  it("appears only on the latest bot reply", () => {
    render(<MessageList messages={convo} error="" onRegenerate={vi.fn()} />);
    const regenerate = screen.getAllByRole("button", { name: "Regenerate reply" });
    expect(regenerate).toHaveLength(1);
    expect(within(messageOf("Second answer")).getByRole("button", { name: "Regenerate reply" })).toBe(
      regenerate[0],
    );
    expect(within(messageOf("First answer")).queryByRole("button", { name: "Regenerate reply" })).toBeNull();
  });

  it("is not shown while a reply is pending (the last message is the user's)", () => {
    render(<MessageList messages={convo.slice(0, 3)} error="" busy onRegenerate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Regenerate reply" })).not.toBeInTheDocument();
  });

  it("is disabled while a request is in progress", () => {
    render(<MessageList messages={convo} error="" busy onRegenerate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Regenerate reply" })).toBeDisabled();
  });

  it("calls onRegenerate when clicked", async () => {
    const onRegenerate = vi.fn();
    render(<MessageList messages={convo} error="" onRegenerate={onRegenerate} />);
    screen.getByRole("button", { name: "Regenerate reply" }).click();
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});

describe("MessageList: text layout", () => {
  it("keeps blank lines as paragraph gaps and single line breaks inside a paragraph", () => {
    const text = "Intro line\n\n1. one\n2. two\n3. three\n\n\n\nLast paragraph";
    render(
      <MessageList
        messages={[
          { role: "user", content: "q" },
          { role: "assistant", content: text },
        ]}
        error=""
      />,
    );
    const paragraphs = messageOf("Intro line").querySelectorAll(".text p");
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[1].textContent).toBe("1. one\n2. two\n3. three");
    expect(paragraphs[2].textContent).toBe("Last paragraph");
  });
});
