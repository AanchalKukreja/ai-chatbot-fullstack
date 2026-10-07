import { sanitizeMessages } from "./chat.js";

const STORAGE_KEY = "ai-chatbot:messages:v1";
export const MAX_STORED_MESSAGES = 50;
const MAX_STORED_CHARS = 200_000;

export function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeMessages(JSON.parse(raw)).slice(-MAX_STORED_MESSAGES) : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages) {
  try {
    if (messages.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    let kept = messages.slice(-MAX_STORED_MESSAGES);
    while (kept.length > 2 && JSON.stringify(kept).length > MAX_STORED_CHARS) kept = kept.slice(2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Storage can be unavailable or full (private mode, quota); the chat still works without it.
  }
}
