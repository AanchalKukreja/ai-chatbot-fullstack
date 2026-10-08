import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { aliases, languages } from "../lib/highlight.js";
import CodeBlock from "./CodeBlock.jsx";

// Links may only point to web pages and email addresses. Anything else (javascript:, data:, relative paths)
// is dropped, and so are images (no remote content gets loaded by a reply).
const LINK_PROTOCOLS = ["http", "https", "mailto"];

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== "img"),
  protocols: { ...defaultSchema.protocols, href: LINK_PROTOCOLS },
};

const allowUrl = (url) => (/^(https?:|mailto:)/i.test(url.trim()) ? url : "");

const components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Wide tables scroll inside the bubble instead of widening it.
  table: ({ children }) => (
    <div className="table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  pre: CodeBlock,
};

// Raw HTML is never rendered (no rehype-raw), and the result is sanitized before highlighting is added.
export default function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, sanitizeSchema],
          [rehypeHighlight, { languages, aliases, ignoreMissing: true }],
        ]}
        urlTransform={allowUrl}
        disallowedElements={["img"]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
