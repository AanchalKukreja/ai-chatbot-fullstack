import { Bot } from "lucide-react";

function Bubble({ role, content, error = false }) {
  return (
    <div
      className={`bubble ${role === "user" ? "user" : "bot"}${error ? " error" : ""}`}
      role={error ? "alert" : undefined}
    >
      <span className="icon">{role === "user" ? "😊" : <Bot aria-hidden="true" />}</span>
      <span className="text">{content}</span>
    </div>
  );
}

export default function MessageList({ messages, error }) {
  return (
    <div id="chat-container" aria-live="polite">
      {messages.map((m, i) => (
        <Bubble key={i} role={m.role} content={m.content} />
      ))}
      {error && <Bubble role="assistant" content={error} error />}
    </div>
  );
}
