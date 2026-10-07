import { useEffect, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Welcome from "./components/Welcome.jsx";
import MessageList from "./components/MessageList.jsx";
import ThinkingStatus from "./components/ThinkingStatus.jsx";
import ChatInput from "./components/ChatInput.jsx";
import { useChat } from "./hooks/useChat.js";
import { useTheme } from "./hooks/useTheme.js";
import { exportChat } from "./lib/exportChat.js";

export default function App() {
  const { dark, toggleTheme } = useTheme();
  const { messages, loading, error, send, clear } = useChat();
  const [draft, setDraft] = useState("");
  const mainRef = useRef(null);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    main.scrollTo({ top: main.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, loading, error]);

  // If the request fails, put the text back so nothing the user typed is lost.
  async function submit(text) {
    const ok = await send(text);
    if (ok === false) setDraft((current) => current || text);
  }

  function handleSubmit() {
    const text = draft;
    setDraft("");
    submit(text);
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="chat-app">
      <Header
        dark={dark}
        onToggleTheme={toggleTheme}
        onExport={() => exportChat(messages)}
        onClear={() => {
          clear();
          setDraft("");
        }}
      />

      <main ref={mainRef}>
        {showWelcome && <Welcome onPick={submit} />}
        <MessageList messages={messages} error={error} />
      </main>

      {loading && <ThinkingStatus />}

      <ChatInput value={draft} onChange={setDraft} onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
