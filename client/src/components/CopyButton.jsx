import { Check, Copy, TriangleAlert } from "lucide-react";
import { COPIED_RESET_MS, useCopyStatus } from "../hooks/useCopyStatus.js";

export { COPIED_RESET_MS };

const LABELS = { idle: "", copied: "Copied", failed: "Couldn't copy" };
const ICONS = { idle: Copy, copied: Check, failed: TriangleAlert };

// Copies the whole reply. `text` is the raw markdown source, never the rendered HTML.
// The status text always keeps its space, so nothing shifts.
export default function CopyButton({ text }) {
  const { status, copy } = useCopyStatus(text);
  const Icon = ICONS[status];
  return (
    <>
      <button type="button" className="action-btn" aria-label="Copy reply" data-state={status} onClick={copy}>
        <Icon aria-hidden="true" />
      </button>
      <span className="action-status" role="status" data-state={status}>
        {LABELS[status]}
      </span>
    </>
  );
}
