import { useEffect, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Welcome from "./components/Welcome.jsx";
import MessageList from "./components/MessageList.jsx";
import ThinkingStatus from "./components/ThinkingStatus.jsx";
import ChatInput from "./components/ChatInput.jsx";
import { useChat } from "./hooks/useChat.js";
import { useTheme } from "./hooks/useTheme.js";
import { exportChat } from "./lib/exportChat.js";

// Within this many pixels of the bottom counts as "reading the latest message".
const NEAR_BOTTOM_PX = 80;

export default function App() {
  const { dark, toggleTheme } = useTheme();
  const { messages, loading, error, send, regenerate, clear } = useChat();
  const [draft, setDraft] = useState("");
  const mainRef = useRef(null);
  // True while the view should follow new content; false once the user scrolls up to read.
  const followRef = useRef(true);

  function handleScroll() {
    const main = mainRef.current;
    followRef.current = main.scrollHeight - main.scrollTop - main.clientHeight < NEAR_BOTTOM_PX;
  }

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !followRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    main.scrollTo({ top: main.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, loading, error]);

  // If the request fails, put the text back so nothing the user typed is lost.
  async function submit(text) {
    followRef.current = true; // sending always jumps to the newest message
    const ok = await send(text);
    if (ok === false) setDraft((current) => current || text);
  }

  function handleSubmit() {
    const text = draft;
    setDraft("");
    submit(text);
  }

  function handleRegenerate() {
    followRef.current = true;
    regenerate();
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

      <main ref={mainRef} onScroll={handleScroll}>
        {showWelcome && <Welcome onPick={submit} />}
        <MessageList messages={messages} error={error} busy={loading} onRegenerate={handleRegenerate} />
        {loading && <ThinkingStatus />}
      </main>

      <ChatInput value={draft} onChange={setDraft} onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
