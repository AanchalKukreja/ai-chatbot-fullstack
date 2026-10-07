import { useEffect, useRef, useState } from "react";
import { MAX_INPUT_LENGTH } from "../lib/chat.js";

// The counter turns to the accent colour within 10% of the limit, and to the error colour at the limit.
const COUNT_WARNING_AT = MAX_INPUT_LENGTH * 0.9;

function counterClass(length) {
  if (length >= MAX_INPUT_LENGTH) return "limit";
  return length >= COUNT_WARNING_AT ? "warn" : undefined;
}

export default function ChatInput({ value, onChange, onSubmit, loading }) {
  const [hint, setHint] = useState("");
  const textareaRef = useRef(null);
  const isEmpty = value.trim() === "";

  // Grow with the content (Shift+Enter adds lines), up to a small cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight - padding, 120)}px`;
  }, [value]);

  function submit() {
    if (isEmpty) {
      setHint("Please enter a message.");
      return;
    }
    if (loading) return;
    setHint("");
    onSubmit();
  }

  function handleChange(e) {
    setHint("");
    onChange(e.target.value);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <footer>
      <div className="input-area">
        <span className="emoji" aria-hidden="true">
          😊
        </span>
        <textarea
          id="user-input"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={MAX_INPUT_LENGTH}
          placeholder="Type your message here..."
          aria-label="Message"
          aria-invalid={hint ? "true" : undefined}
          aria-describedby={hint ? "input-hint" : undefined}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <span id="char-count" className={counterClass(value.length)}>
          {value.length}/{MAX_INPUT_LENGTH}
        </span>
        <button
          id="send-btn"
          type="button"
          aria-label="Send message"
          disabled={isEmpty || loading}
          onClick={submit}
        >
          📨
        </button>
      </div>
      {hint && (
        <p id="input-hint" className="field-hint" role="alert">
          {hint}
        </p>
      )}
    </footer>
  );
}
