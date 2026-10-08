import { Bot } from "lucide-react";
import MessageActions from "./MessageActions.jsx";
import { useMarkdown } from "../lib/markdownLoader.js";

// Plain text (user messages and errors): blank lines become paragraph gaps and single line breaks are kept
// (pre-wrap in the CSS).
function Paragraphs({ text }) {
  const blocks = text
    .trim()
    .split(/\n[ \t]*\n+/)
    .filter((block) => block.trim() !== "");
  return blocks.map((block, i) => <p key={i}>{block}</p>);
}

function Message({ role, content, error = false, actions = null }) {
  const side = role === "user" ? "user" : "bot";
  // Only real bot replies are markdown. User messages and error messages stay plain text, and so does a
  // reply while the markdown renderer is still loading.
  const markdown = useMarkdown();
  const isMarkdown = role === "assistant" && !error && markdown !== null;
  return (
    <div className={`message ${side}`}>
      <div className={`bubble ${side}${error ? " error" : ""}`} role={error ? "alert" : undefined}>
        <span className="icon">{role === "user" ? "😊" : <Bot aria-hidden="true" />}</span>
        <div className="text">
          {isMarkdown ? <markdown.Component text={content} /> : <Paragraphs text={content} />}
        </div>
      </div>
      {actions}
    </div>
  );
}

export default function MessageList({ messages, error, busy = false, onRegenerate }) {
  const lastIndex = messages.length - 1;
  return (
    <div id="chat-container" aria-live="polite">
      {messages.map((m, i) => (
        <Message
          key={i}
          role={m.role}
          content={m.content}
          actions={
            m.role === "assistant" ? (
              <MessageActions
                text={m.content}
                canRegenerate={i === lastIndex}
                busy={busy}
                onRegenerate={onRegenerate}
              />
            ) : null
          }
        />
      ))}
      {error && <Message role="assistant" content={error} error />}
    </div>
  );
}
