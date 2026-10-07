import { useCallback, useEffect, useRef, useState } from "react";
import { buildContext } from "../lib/chat.js";
import { loadMessages, saveMessages } from "../lib/storage.js";
import { playSound } from "../lib/sounds.js";
import { apiUrl } from "../lib/api.js";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "Couldn't reach the server. Please check your connection and try again.";
// A gateway error with no JSON body comes from the proxy, not from our server: nothing is answering behind it.
const SERVER_DOWN_ERROR =
  "The chat server isn't responding. It may be stopped, or still waking up after being idle. Please try again in a minute.";
const GATEWAY_STATUSES = [502, 503, 504];

class ApiError extends Error {}

export function useChat() {
  const [messages, setMessages] = useState(loadMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const abortRef = useRef(null);

  // Only completed exchanges are saved, never a request that is still in flight.
  useEffect(() => {
    if (!loading) saveMessages(messages);
  }, [messages, loading]);

  // Resolves to true on success. On failure the message is rolled back out of the context
  // (so two user messages never follow each other) and the caller can restore the text.
  // It resolves to null when the call is ignored (empty, busy or cancelled by clearing the chat).
  // `base` is the history the new user message is appended to, and `restoreTo` what to go back to if the
  // request fails. Both default to the current messages; regenerate passes its own.
  const send = useCallback(
    async (rawText, { base = messages, restoreTo = messages, withSound = true } = {}) => {
      const text = rawText.trim();
      if (!text || busyRef.current) return null;

      busyRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      const next = [...base, { role: "user", content: text }];

      setMessages(next);
      setError("");
      setLoading(true);
      if (withSound) playSound("user");

      try {
        const res = await fetch(apiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: buildContext(next) }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok && !data && GATEWAY_STATUSES.includes(res.status)) throw new ApiError(SERVER_DOWN_ERROR);
        if (!res.ok || typeof data?.reply !== "string") throw new ApiError(data?.error || GENERIC_ERROR);

        setMessages([...next, { role: "assistant", content: data.reply }]);
        setTimeout(() => playSound("bot"), 600);
        return true;
      } catch (err) {
        if (err.name === "AbortError") return null;
        setMessages(restoreTo);
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR);
        return false;
      } finally {
        if (abortRef.current === controller) {
          busyRef.current = false;
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [messages],
  );

  // Replaces the latest bot reply: it is dropped from the chat (and so from the saved history) and the same
  // user message is sent again, without adding it a second time. If the request fails, the old reply returns.
  const regenerate = useCallback(() => {
    const last = messages.at(-1);
    const before = messages.at(-2);
    if (last?.role !== "assistant" || before?.role !== "user") return Promise.resolve(null);
    return send(before.content, { base: messages.slice(0, -2), restoreTo: messages, withSound: false });
  }, [messages, send]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setLoading(false);
    setMessages([]);
    setError("");
  }, []);

  return { messages, loading, error, send, regenerate, clear };
}
