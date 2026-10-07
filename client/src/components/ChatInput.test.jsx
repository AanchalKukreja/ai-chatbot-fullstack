import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ChatInput from "./ChatInput.jsx";

function Harness({ loading = false, onSubmit = vi.fn(), initial = "" }) {
  const [value, setValue] = useState(initial);
  return <ChatInput value={value} onChange={setValue} onSubmit={onSubmit} loading={loading} />;
}

const sendButton = () => screen.getByRole("button", { name: "Send message" });
const textbox = () => screen.getByRole("textbox", { name: "Message" });

describe("Send button", () => {
  it("is an icon-only button with an accessible name", () => {
    render(<Harness />);
    expect(sendButton()).toHaveTextContent("");
    expect(sendButton().querySelector("svg")).toHaveClass("lucide-arrow-up");
  });

  it("is disabled while the input is empty or only spaces, and enabled once there is text", () => {
    render(<Harness />);
    expect(sendButton()).toBeDisabled();
    fireEvent.change(textbox(), { target: { value: "   " } });
    expect(sendButton()).toBeDisabled();
    fireEvent.change(textbox(), { target: { value: "Hello" } });
    expect(sendButton()).toBeEnabled();
  });

  it("is disabled and shows a spinner while a reply is on its way", () => {
    render(<Harness loading initial="Hello" />);
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveAttribute("aria-busy", "true");
    expect(sendButton().querySelector("svg")).toHaveClass("spin");
  });

  it("submits on click and on Enter, but Shift+Enter only adds a new line", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} initial="Hello" />);

    fireEvent.keyDown(textbox(), { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.click(sendButton());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("shows an inline message instead of sending when Enter is pressed on an empty input", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a message.");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("Character counter", () => {
  const counter = () => document.getElementById("char-count");

  it("is small and plain at first, accent from 900 characters and error at 1000", () => {
    render(<Harness />);
    expect(counter()).toHaveTextContent("0/1000");
    expect(counter()).not.toHaveClass("warn");

    fireEvent.change(textbox(), { target: { value: "a".repeat(899) } });
    expect(counter()).not.toHaveClass("warn");
    fireEvent.change(textbox(), { target: { value: "a".repeat(900) } });
    expect(counter()).toHaveClass("warn");
    fireEvent.change(textbox(), { target: { value: "a".repeat(1000) } });
    expect(counter()).toHaveClass("limit");
    expect(counter()).toHaveTextContent("1000/1000");
  });
});
