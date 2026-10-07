import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CopyButton, { COPIED_RESET_MS } from "./CopyButton.jsx";

const REPLY = "First line\n\n  - an item with  spaces  \nÜñíçødé and a link https://example.com/a?b=c";

function setClipboard(writeText) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

async function clickCopy() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy reply" }));
  });
}

describe("CopyButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.execCommand = vi.fn(() => false);
  });

  afterEach(() => {
    delete document.execCommand;
    setClipboard(undefined);
  });

  it("has an accessible name and shows no status text at first", () => {
    setClipboard(vi.fn());
    render(<CopyButton text={REPLY} />);
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("writes the exact reply text to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<CopyButton text={REPLY} />);
    await clickCopy();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(REPLY);
  });

  it("shows a check icon and Copied, then resets after 2 seconds", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyButton text={REPLY} />);
    const button = screen.getByRole("button", { name: "Copy reply" });
    expect(button).toHaveAttribute("data-state", "idle");

    await clickCopy();
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(button).toHaveAttribute("data-state", "copied");
    expect(button.querySelector("svg")).toHaveClass("lucide-check");

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS - 1));
    expect(screen.getByRole("status")).toHaveTextContent("Copied");

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(button).toHaveAttribute("data-state", "idle");
    expect(button.querySelector("svg")).toHaveClass("lucide-copy");
  });

  it("keeps the status element in place, so the label cannot shift the layout", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyButton text={REPLY} />);
    const before = screen.getByRole("status");
    await clickCopy();
    expect(screen.getByRole("status")).toBe(before);
  });

  it("restarts the 2 seconds when clicked again", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyButton text={REPLY} />);
    await clickCopy();
    act(() => vi.advanceTimersByTime(1500));
    await clickCopy();
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("falls back to a temporary textarea and execCommand when the Clipboard API is missing", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => true);
    render(<CopyButton text={REPLY} />);
    await clickCopy();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    // The temporary textarea is removed again.
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("falls back when the Clipboard API rejects (blocked or insecure context)", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    document.execCommand = vi.fn(() => true);
    render(<CopyButton text={REPLY} />);
    await clickCopy();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("shows Couldn't copy when both methods fail, then resets", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    document.execCommand = vi.fn(() => false);
    render(<CopyButton text={REPLY} />);
    await clickCopy();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy");
    expect(screen.getByRole("button", { name: "Copy reply" })).toHaveAttribute("data-state", "failed");

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS));
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
