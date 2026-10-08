import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Markdown from "./Markdown.jsx";
import MessageList from "./MessageList.jsx";
import { COPIED_RESET_MS } from "../hooks/useCopyStatus.js";
import { preloadMarkdown } from "../lib/markdownLoader.js";

// The app loads the markdown renderer in the background; the tests wait for it up front.
beforeAll(() => preloadMarkdown());

function setClipboard(writeText) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

async function click(button) {
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("Markdown rendering", () => {
  it("renders headings, bold, italics, lists, blockquotes and horizontal rules", () => {
    const { container } = render(
      <Markdown
        text={
          "## Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n---"
        }
      />,
    );
    expect(container.querySelector("h2")).toHaveTextContent("Title");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelector("blockquote")).toHaveTextContent("quoted");
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders GFM tables inside a horizontally scrolling wrapper, and task lists and strikethrough", () => {
    const { container } = render(
      <Markdown
        text={
          "| Name | Score |\n| --- | --- |\n| Ann | 10 |\n| Bob | 8 |\n\n- [x] done\n- [ ] todo\n\n~~old~~"
        }
      />,
    );
    const wrapper = container.querySelector(".table-scroll");
    expect(wrapper).toBeInTheDocument();
    expect(
      within(wrapper)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Name", "Score"]);
    expect(within(wrapper).getAllByRole("row")).toHaveLength(3);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector("del")).toHaveTextContent("old");
  });

  it("gives inline code its own element, separate from code blocks", () => {
    const { container } = render(<Markdown text={"Use `npm test` to run them."} />);
    expect(container.querySelector("p > code")).toHaveTextContent("npm test");
    expect(container.querySelector(".code-block")).toBeNull();
  });
});

describe("Markdown security", () => {
  beforeEach(() => {
    delete window.__pwned;
  });

  it("never turns raw HTML into elements, and nothing runs", () => {
    const evil = [
      "<script>window.__pwned = 1</script>",
      '<img src="x" onerror="window.__pwned = 2">',
      '<a href="x" onclick="window.__pwned = 3">click</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<svg onload="window.__pwned = 4"></svg>',
      "<style>body { display: none }</style>",
      "<b>bold html</b>",
      "Normal text",
    ].join("\n\n");
    const { container } = render(<Markdown text={evil} />);

    for (const tag of ["script", "img", "iframe", "svg", "style", "b"]) {
      expect(container.querySelector(tag), `<${tag}> must not be rendered`).toBeNull();
    }
    expect(container.querySelectorAll("[onerror], [onclick], [onload]")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/<script/i);
    expect(window.__pwned).toBeUndefined();
    expect(screen.getByText("Normal text")).toBeInTheDocument();
  });

  it("does not load images from markdown", () => {
    const { container } = render(<Markdown text={"![tracking pixel](https://evil.example/p.png)"} />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Markdown links", () => {
  it("opens web links in a new tab with rel noopener noreferrer", () => {
    render(<Markdown text={"[Docs](https://example.com/docs?a=1)"} />);
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs?a=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel").split(" ").sort()).toEqual(["noopener", "noreferrer"]);
  });

  it("allows http and mailto links, and turns bare URLs into links", () => {
    render(
      <Markdown
        text={"[plain](http://example.com) [mail](mailto:hi@example.com)\n\nSee https://example.org/page"}
      />,
    );
    expect(screen.getByRole("link", { name: "plain" })).toHaveAttribute("href", "http://example.com");
    expect(screen.getByRole("link", { name: "mail" })).toHaveAttribute("href", "mailto:hi@example.com");
    const auto = screen.getByRole("link", { name: "https://example.org/page" });
    expect(auto).toHaveAttribute("target", "_blank");
    expect(auto).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it.each([
    ["javascript:", "[x](javascript:alert(1))"],
    ["JAVASCRIPT: in capitals", "[x](JAVASCRIPT:alert(1))"],
    ["javascript: hidden by a tab", "[x](java&#9;script:alert(1))"],
    ["data:", "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["vbscript:", "[x](vbscript:msgbox(1))"],
    ["a relative path", "[x](/admin)"],
    ["an in-page anchor", "[x](#top)"],
    ["a raw HTML link", '<a href="javascript:alert(1)">x</a>'],
  ])("removes %s links (the text stays, the link goes)", (_name, text) => {
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });
});

describe("Code blocks", () => {
  const TWO_BLOCKS =
    "First:\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nSecond:\n\n```python\nprint('hello')\n```";

  beforeEach(() => {
    vi.useFakeTimers();
    document.execCommand = vi.fn(() => false);
  });

  afterEach(() => {
    delete document.execCommand;
    setClipboard(undefined);
  });

  it("shows the language, highlights the code and offers a Copy code button", () => {
    const { container } = render(<Markdown text={TWO_BLOCKS} />);
    const blocks = container.querySelectorAll(".code-block");
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]).getByText("js")).toHaveClass("code-lang");
    expect(within(blocks[1]).getByText("python")).toHaveClass("code-lang");
    expect(blocks[0].querySelector(".hljs-keyword")).toHaveTextContent("const");
    expect(within(blocks[0]).getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    // The code area scrolls on its own and can be reached with the keyboard.
    expect(blocks[0].querySelector("pre")).toHaveAttribute("tabindex", "0");
  });

  it("copies only that block's code", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const { container } = render(<Markdown text={TWO_BLOCKS} />);
    const [first, second] = container.querySelectorAll(".code-block");

    await click(within(second).getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("print('hello')");

    await click(within(first).getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenLastCalledWith("const a = 1;\nconsole.log(a);");
  });

  it("shows a check icon and Copied for 2 seconds, only on the block that was copied", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    const { container } = render(<Markdown text={TWO_BLOCKS} />);
    const [first, second] = container.querySelectorAll(".code-block");
    const button = within(first).getByRole("button", { name: "Copy code" });

    await click(button);
    expect(within(first).getByRole("status")).toHaveTextContent("Copied");
    expect(button.querySelector("svg")).toHaveClass("lucide-check");
    expect(within(second).getByRole("status")).toHaveTextContent("");

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS - 1));
    expect(within(first).getByRole("status")).toHaveTextContent("Copied");
    act(() => vi.advanceTimersByTime(1));
    expect(within(first).getByRole("status")).toHaveTextContent("");
    expect(button.querySelector("svg")).toHaveClass("lucide-copy");
  });

  it("uses the same fallback as the reply copy button, and reports failure", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => true);
    const { container } = render(<Markdown text={"```js\nlet x = 1;\n```"} />);
    const block = container.querySelector(".code-block");

    await click(within(block).getByRole("button", { name: "Copy code" }));
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(within(block).getByRole("status")).toHaveTextContent("Copied");

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS));
    document.execCommand = vi.fn(() => false);
    await click(within(block).getByRole("button", { name: "Copy code" }));
    expect(within(block).getByRole("status")).toHaveTextContent("Couldn't copy");
  });

  it("keeps the status text in place, so the header cannot shift", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    const { container } = render(<Markdown text={"```js\nlet x = 1;\n```"} />);
    const block = container.querySelector(".code-block");
    const before = within(block).getByRole("status");
    await click(within(block).getByRole("button", { name: "Copy code" }));
    expect(within(block).getByRole("status")).toBe(before);
  });

  it("handles unknown and missing languages without breaking", () => {
    const { container } = render(
      <Markdown text={"```nonsenselang\nsome text\n```\n\n```\nno language\n```"} />,
    );
    const blocks = container.querySelectorAll(".code-block");
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]).getByText("nonsenselang")).toHaveClass("code-lang");
    expect(within(blocks[1]).getByText("code")).toHaveClass("code-lang");
    expect(blocks[1].querySelector("code")).toHaveTextContent("no language");
  });

  it("does not give inline code a code block header", () => {
    const { container } = render(<Markdown text={"Run `ls -la` now"} />);
    expect(container.querySelectorAll(".code-block")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });
});

describe("Reply copy button and plain-text messages", () => {
  const RAW =
    "# Title\n\nSome **bold** text with `code` and a [link](https://example.com).\n\n```js\nlet x = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    setClipboard(undefined);
  });

  it("copies the raw markdown source of the reply, not the rendered HTML", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <MessageList
        messages={[
          { role: "user", content: "show me markdown" },
          { role: "assistant", content: RAW },
        ]}
        error=""
      />,
    );
    // The reply is rendered...
    expect(document.querySelector(".md h1")).toHaveTextContent("Title");
    expect(document.querySelector(".md strong")).toHaveTextContent("bold");

    await click(screen.getByRole("button", { name: "Copy reply" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(RAW);
    expect(writeText.mock.calls[0][0]).not.toMatch(/<(h1|strong|p|code|pre|table)/);
  });

  it("copies the whole reply for the reply button but only the code for the code button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <MessageList
        messages={[
          { role: "user", content: "q" },
          { role: "assistant", content: RAW },
        ]}
        error=""
      />,
    );
    await click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenLastCalledWith("let x = 1;");
    await click(screen.getByRole("button", { name: "Copy reply" }));
    expect(writeText).toHaveBeenLastCalledWith(RAW);
  });

  it("keeps user messages as plain text", () => {
    const text = "**not bold** <b>not html</b> # not a heading\n\n- not a list\n\n`not code`";
    const { container } = render(
      <MessageList
        messages={[
          { role: "user", content: text },
          { role: "assistant", content: "ok" },
        ]}
        error=""
      />,
    );
    const user = container.querySelector(".message.user");
    for (const tag of ["strong", "b", "h1", "ul", "li", "code", "a"]) {
      expect(user.querySelector(tag), `<${tag}> in a user message`).toBeNull();
    }
    expect(user).toHaveTextContent("**not bold** <b>not html</b> # not a heading");
    expect(user.querySelector(".md")).toBeNull();
  });

  it("keeps error messages as plain text", () => {
    const { container } = render(<MessageList messages={[]} error="Something **failed** <b>badly</b>" />);
    const bubble = container.querySelector(".bubble.error");
    expect(bubble.querySelector("strong")).toBeNull();
    expect(bubble.querySelector("b")).toBeNull();
    expect(bubble).toHaveTextContent("Something **failed** <b>badly</b>");
  });

  it("renders the bot reply as markdown but never adds actions to user messages", () => {
    render(
      <MessageList
        messages={[
          { role: "user", content: "q" },
          { role: "assistant", content: "# Heading" },
        ]}
        error=""
      />,
    );
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy reply" })).toHaveLength(1);
  });
});
