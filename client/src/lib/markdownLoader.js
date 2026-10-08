import { useEffect, useState } from "react";

// The markdown renderer (react-markdown, syntax highlighting) is large, so it is a separate chunk that is
// only downloaded once there is a conversation. Until it has loaded, replies are shown as plain text.
let loaded = null;
let pending = null;

export function preloadMarkdown() {
  pending ??= import("../components/Markdown.jsx")
    .then((module) => {
      loaded = { Component: module.default };
      return loaded;
    })
    .catch((error) => {
      pending = null; // allow a retry later (for example after the network comes back)
      throw error;
    });
  return pending;
}

// Returns `{ Component }` once the renderer is available, or null while it is still loading.
export function useMarkdown() {
  const [renderer, setRenderer] = useState(() => loaded);

  useEffect(() => {
    if (renderer) return undefined;
    let active = true;
    preloadMarkdown()
      .then((result) => active && setRenderer(result))
      .catch(() => {
        // Offline or blocked: keep showing plain text.
      });
    return () => {
      active = false;
    };
  }, [renderer]);

  return renderer;
}
