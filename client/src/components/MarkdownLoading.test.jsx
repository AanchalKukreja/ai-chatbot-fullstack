import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageList from "./MessageList.jsx";

// This file deliberately does NOT preload the renderer, so the first render happens before it has loaded.
const convo = [
  { role: "user", content: "Say something **not bold**" },
  { role: "assistant", content: "A **bold** reply with a [link](https://example.com)" },
];

describe("Markdown renderer loading", () => {
  it("shows the reply as plain text first, then upgrades it to markdown once the renderer has loaded", async () => {
    const { container } = render(<MessageList messages={convo} error="" />);

    // Nothing is blank or broken while the chunk is on its way.
    expect(container.querySelector(".message.bot .text")).toHaveTextContent(
      "A **bold** reply with a [link](https://example.com)",
    );
    expect(container.querySelector(".message.bot strong")).toBeNull();

    // Then it becomes real markdown. The very first import in a fresh test worker can take a few seconds.
    const bold = await screen.findByText("bold", { selector: "strong" }, { timeout: 20000 });
    expect(bold).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  }, 30000);

  it("renders markdown immediately for replies shown after the renderer has loaded", () => {
    const { container } = render(<MessageList messages={convo} error="" />);
    expect(container.querySelector(".message.bot strong")).toHaveTextContent("bold");
  });

  it("never turns user messages into markdown, before or after loading", () => {
    const { container } = render(<MessageList messages={convo} error="" />);
    expect(container.querySelector(".message.user strong")).toBeNull();
    expect(container.querySelector(".message.user")).toHaveTextContent("Say something **not bold**");
  });
});
