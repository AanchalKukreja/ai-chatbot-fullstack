import { Check, Copy, TriangleAlert } from "lucide-react";
import { useCopyStatus } from "../hooks/useCopyStatus.js";

const LABELS = { idle: "", copied: "Copied", failed: "Couldn't copy" };
const ICONS = { idle: Copy, copied: Check, failed: TriangleAlert };

// The plain text of a (highlighted) syntax tree node: highlighting only wraps text in <span>s.
function textOf(node) {
  if (!node) return "";
  if (node.type === "text") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

function CodeCopyButton({ code }) {
  const { status, copy } = useCopyStatus(code);
  const Icon = ICONS[status];
  return (
    <span className="code-actions">
      <span className="code-status" role="status" data-state={status}>
        {LABELS[status]}
      </span>
      <button type="button" className="code-copy" aria-label="Copy code" data-state={status} onClick={copy}>
        <Icon aria-hidden="true" />
      </button>
    </span>
  );
}

// Replaces <pre> for fenced code: a small header (language and Copy), and a scrollable code area.
export default function CodeBlock({ node, children }) {
  const codeNode = node?.children?.find((child) => child.type === "element" && child.tagName === "code");
  const classes = codeNode?.properties?.className ?? [];
  const language = classes.find((name) => String(name).startsWith("language-"))?.slice("language-".length);
  const code = textOf(codeNode ?? node).replace(/\n$/, "");

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{language || "code"}</span>
        <CodeCopyButton code={code} />
      </div>
      <pre tabIndex={0}>{children}</pre>
    </div>
  );
}
