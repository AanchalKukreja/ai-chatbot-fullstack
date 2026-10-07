import { RefreshCw } from "lucide-react";
import CopyButton from "./CopyButton.jsx";

// The row under a bot reply. Regenerate is only offered on the latest reply.
export default function MessageActions({ text, canRegenerate, busy, onRegenerate }) {
  return (
    <div className="msg-actions">
      <CopyButton text={text} />
      {canRegenerate && (
        <button
          type="button"
          className="action-btn regenerate"
          aria-label="Regenerate reply"
          disabled={busy}
          onClick={onRegenerate}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
