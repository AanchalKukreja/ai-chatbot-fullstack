export const MAX_CONTEXT_MESSAGES = 10;
export const MAX_INPUT_LENGTH = 1000;
// Mirrors the server limits in server/app.js.
export const MAX_ASSISTANT_LENGTH = 8000;
export const MAX_CONTEXT_CHARS = 40000;

const isValidMessage = (m) =>
  m &&
  (m.role === "user" || m.role === "assistant") &&
  typeof m.content === "string" &&
  m.content.trim() !== "";

// Keeps only well-formed messages that strictly alternate user/assistant, start with a user turn
// and end with an assistant reply (a trailing user message means its request never completed).
export function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const clean = [];
  for (const m of raw) {
    if (!isValidMessage(m)) continue;
    const expected = clean.length % 2 === 0 ? "user" : "assistant";
    if (m.role !== expected) continue;
    clean.push({ role: m.role, content: m.content });
  }
  if (clean.length > 0 && clean[clean.length - 1].role === "user") clean.pop();
  return clean;
}

// The last N messages that fit the server's limits, always beginning with a user turn.
// Whole oldest messages are dropped to fit; message text is never cut, with one exception:
// an assistant reply over the server's per-message cap is clamped in this request only (what is
// shown and saved stays complete), so one unusually long answer cannot make every follow-up fail.
export function buildContext(messages, limit = MAX_CONTEXT_MESSAGES, maxChars = MAX_CONTEXT_CHARS) {
  const context = messages
    .slice(-limit)
    .map((m) =>
      m.role === "assistant" && m.content.length > MAX_ASSISTANT_LENGTH
        ? { ...m, content: m.content.slice(0, MAX_ASSISTANT_LENGTH) }
        : m,
    );
  const size = () => context.reduce((sum, m) => sum + m.content.length, 0);
  while (context.length > 1 && (context[0].role !== "user" || size() > maxChars)) context.shift();
  return context;
}

export function formatTranscript(messages) {
  return messages.map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}\n`).join("");
}
