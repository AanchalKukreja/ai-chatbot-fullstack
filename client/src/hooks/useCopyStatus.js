import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard.js";

export const COPIED_RESET_MS = 2000;

// Shared by the reply Copy button and each code block's Copy button: copy, then show "copied" (or "failed")
// for two seconds before going back to "idle".
export function useCopyStatus(text) {
  const [status, setStatus] = useState("idle");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    const ok = await copyText(text);
    setStatus(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), COPIED_RESET_MS);
  }, [text]);

  return { status, copy };
}
