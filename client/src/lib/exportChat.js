import { formatTranscript } from "./chat.js";

export function exportChat(messages) {
  if (messages.length === 0) return;
  const url = URL.createObjectURL(new Blob([formatTranscript(messages)], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "chat-history.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
