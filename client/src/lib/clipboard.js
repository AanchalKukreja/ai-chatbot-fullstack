// Last-resort copy for browsers or contexts where the async Clipboard API is missing or blocked.
function legacyCopy(text) {
  const previouslyFocused = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  field.style.pointerEvents = "none";
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  previouslyFocused?.focus?.();
  return copied;
}

// Resolves to true when the text was copied, false when both methods failed.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: fall through to the fallback.
  }
  return legacyCopy(text);
}
