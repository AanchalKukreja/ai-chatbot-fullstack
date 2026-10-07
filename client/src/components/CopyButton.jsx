import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { copyText } from "../lib/clipboard.js";

export const COPIED_RESET_MS = 2000;

const LABELS = { idle: "", copied: "Copied", failed: "Couldn't copy" };
const ICONS = { idle: Copy, copied: Check, failed: TriangleAlert };

// Copies the whole reply as plain text. The status text always keeps its space, so nothing shifts.
export default function CopyButton({ text }) {
  const [status, setStatus] = useState("idle");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick() {
    const ok = await copyText(text);
    setStatus(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), COPIED_RESET_MS);
  }

  const Icon = ICONS[status];
  return (
    <>
      <button
        type="button"
        className="action-btn"
        aria-label="Copy reply"
        data-state={status}
        onClick={handleClick}
      >
        <Icon aria-hidden="true" />
      </button>
      <span className="action-status" role="status" data-state={status}>
        {LABELS[status]}
      </span>
    </>
  );
}
