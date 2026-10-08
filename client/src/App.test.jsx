import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App.jsx";
import { preloadMarkdown } from "./lib/markdownLoader.js";

vi.mock("./lib/sounds.js", () => ({ playSound: vi.fn() }));

// The app loads the markdown renderer in the background; the tests wait for it up front.
beforeAll(() => preloadMarkdown());

const STORAGE_KEY = "ai-chatbot:messages:v1";
const CONVO = [
  { role: "user", content: "First question" },
  { role: "assistant", content: "First answer" },
  { role: "user", content: "Second question" },
  { role: "assistant", content: "Second answer" },
];

const ok = (text) => ({ ok: true, status: 200, json: async () => ({ reply: text }) });
const failure = (status, error) => ({ ok: false, status, json: async () => ({ error }) });
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const sentMessages = (call = 0) => JSON.parse(fetch.mock.calls[call][1].body).messages;
const regenerateButton = () => screen.queryByRole("button", { name: "Regenerate reply" });

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(CONVO));
  globalThis.fetch = vi.fn();
});

describe("Regenerate", () => {
  it("replaces the latest reply without duplicating any message", async () => {
    fetch.mockResolvedValue(ok("Fresh reply"));
    render(<App />);
    fireEvent.click(regenerateButton());

    expect(await screen.findByText("Fresh reply")).toBeInTheDocument();
    expect(screen.getAllByText("Second question")).toHaveLength(1);
    expect(screen.queryByText("Second answer")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".bubble")).toHaveLength(4);

    // The same last user message was re-sent, and the old reply was not part of the request.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentMessages().map((m) => m.content)).toEqual([
      "First question",
      "First answer",
      "Second question",
    ]);

    // The saved history has the new reply instead of the old one, with no extra user message.
    await waitFor(() => expect(stored().at(-1).content).toBe("Fresh reply"));
    expect(stored().map((m) => m.content)).toEqual([
      "First question",
      "First answer",
      "Second question",
      "Fresh reply",
    ]);
  });

  it("can be used repeatedly and never grows the chat", async () => {
    fetch.mockResolvedValueOnce(ok("Reply two")).mockResolvedValueOnce(ok("Reply three"));
    render(<App />);

    fireEvent.click(regenerateButton());
    await screen.findByText("Reply two");
    fireEvent.click(regenerateButton());
    await screen.findByText("Reply three");

    expect(document.querySelectorAll(".bubble")).toHaveLength(4);
    expect(screen.getAllByText("Second question")).toHaveLength(1);
    expect(sentMessages(1).map((m) => m.content)).toEqual([
      "First question",
      "First answer",
      "Second question",
    ]);
  });

  it("is unavailable while the request is in progress", async () => {
    const pending = deferred();
    fetch.mockReturnValue(pending.promise);
    render(<App />);
    fireEvent.click(regenerateButton());

    await screen.findByText("AI is thinking...");
    expect(regenerateButton()).not.toBeInTheDocument();
    expect(screen.queryByText("Second answer")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second question")).toHaveLength(1);
    const send = screen.getByRole("button", { name: "Send message" });
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute("aria-busy", "true");

    await act(async () => pending.resolve(ok("Done")));
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(regenerateButton()).toBeInTheDocument();
  });

  it("keeps the old reply, and the saved history, when the new request fails", async () => {
    fetch.mockResolvedValue(failure(503, "The AI service is very busy right now."));
    render(<App />);
    fireEvent.click(regenerateButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is very busy right now.");
    expect(screen.getByText("Second answer")).toBeInTheDocument();
    expect(screen.getAllByText("Second question")).toHaveLength(1);
    expect(stored().map((m) => m.content)).toEqual(CONVO.map((m) => m.content));
  });

  it("does nothing when the chat does not end with a bot reply", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    render(<App />);
    expect(regenerateButton()).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Scrolling", () => {
  function mockScrollPosition(scrollTop) {
    const main = document.querySelector("main");
    Object.defineProperty(main, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(main, "clientHeight", { configurable: true, value: 400 });
    main.scrollTop = scrollTop;
    fireEvent.scroll(main);
  }

  async function sendMessage(text) {
    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: text } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
  }

  it("scrolls to the newest message after sending, even from far up", async () => {
    const pending = deferred();
    fetch.mockReturnValue(pending.promise);
    render(<App />);
    mockScrollPosition(100); // reading old messages

    await sendMessage("A new question");
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    await act(async () => pending.resolve(ok("An answer")));
  });

  it("does not jump when a reply arrives while the user has scrolled up", async () => {
    const pending = deferred();
    fetch.mockReturnValue(pending.promise);
    render(<App />);

    await sendMessage("A new question");
    mockScrollPosition(100); // the user scrolls up to read while waiting
    Element.prototype.scrollTo.mockClear();

    await act(async () => pending.resolve(ok("A long answer")));
    expect(await screen.findByText("A long answer")).toBeInTheDocument();
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
  });

  it("keeps following the conversation when the user is already at the bottom", async () => {
    const pending = deferred();
    fetch.mockReturnValue(pending.promise);
    render(<App />);

    await sendMessage("A new question");
    mockScrollPosition(580); // within 80px of the bottom
    Element.prototype.scrollTo.mockClear();

    await act(async () => pending.resolve(ok("An answer")));
    await screen.findByText("An answer");
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });
});
