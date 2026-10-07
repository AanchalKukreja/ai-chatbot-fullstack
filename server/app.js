import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

export const MAX_MESSAGES = 20;
// What a person types is capped tightly; the model's own replies in the history are much longer.
export const MAX_USER_LENGTH = 1000;
export const MAX_ASSISTANT_LENGTH = 8000;
// Total characters across all messages in one request. Keep in sync with client/src/lib/chat.js.
export const MAX_TOTAL_LENGTH = 40000;
// Headroom over MAX_TOTAL_LENGTH for JSON escaping and multi-byte characters.
export const JSON_BODY_LIMIT = "256kb";
const ROLES = new Set(["user", "assistant"]);
const MAX_LENGTH_BY_ROLE = { user: MAX_USER_LENGTH, assistant: MAX_ASSISTANT_LENGTH };

// Returns an error string, or null if the body is valid.
export function validateMessages(messages) {
  if (!Array.isArray(messages)) return "messages must be an array.";
  if (messages.length === 0) return "messages must not be empty.";
  if (messages.length > MAX_MESSAGES) return `messages must have at most ${MAX_MESSAGES} items.`;

  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") return "Each message must be an object.";
    if (!ROLES.has(m.role)) return 'Each message role must be "user" or "assistant".';
    if (typeof m.content !== "string") return "Each message content must be a string.";
    const len = m.content.trim().length;
    if (len === 0) return "Message content must not be empty.";
    const max = MAX_LENGTH_BY_ROLE[m.role];
    if (len > max) return `A ${m.role} message must be at most ${max} characters.`;
    total += len;
  }
  if (total > MAX_TOTAL_LENGTH)
    return `The conversation is too long (at most ${MAX_TOTAL_LENGTH} characters in total).`;

  // Gemini expects turns to alternate user/model, starting with the user.
  if (messages[0].role !== "user") return "The first message must be from the user.";
  for (let i = 1; i < messages.length; i += 1) {
    if (messages[i].role === messages[i - 1].role)
      return "Messages must alternate between user and assistant.";
  }
  if (messages[messages.length - 1].role !== "user") return "The last message must be from the user.";
  return null;
}

// The SDK puts Google's JSON error body in err.message, e.g.
// {"error":{"code":503,"message":"...","status":"UNAVAILABLE","details":[{"reason":"API_KEY_INVALID"}]}}
export function parseUpstream(err) {
  let body;
  try {
    body = JSON.parse(err?.message)?.error;
  } catch {
    body = undefined;
  }
  return {
    status: typeof err?.status === "number" ? err.status : body?.code,
    code: body?.status,
    reason: body?.details?.find((d) => d?.reason)?.reason,
    message: body?.message ?? err?.message,
  };
}

// Maps an upstream failure to a friendly response. Internals are never exposed.
// Note: Google reports an invalid API key as HTTP 400 with reason API_KEY_INVALID, not 401.
export function toFriendlyError(err) {
  const { status, reason } = parseUpstream(err);
  if (status === 401 || status === 403 || reason === "API_KEY_INVALID") {
    return {
      status: status === 403 ? 403 : 401,
      error: "The assistant's API key was rejected. Please let the site owner know.",
    };
  }
  if (status === 404) {
    return {
      status: 404,
      error: "The AI model this app is set to use wasn't found. Please let the site owner know.",
    };
  }
  if (status === 429) {
    return {
      status: 429,
      error: "The AI service has reached its usage limit. Please wait a bit and try again.",
    };
  }
  if (BUSY_STATUSES.has(status)) {
    return { status: 503, error: "The AI service is very busy right now. Please try again in a moment." };
  }
  if (typeof status === "number") {
    return { status: 502, error: "The AI service returned an unexpected error. Please try again." };
  }
  // No HTTP status: the request never completed (DNS, connection reset, timeout).
  return { status: 503, error: "Couldn't reach the AI service. Please try again in a moment." };
}

// The real reason for the server log, with the API key (and anything shaped like one) removed.
export function describeForLog(err, secrets = []) {
  const { status, code, reason, message } = parseUpstream(err);
  let line = `${[status ?? "no-status", code, reason].filter(Boolean).join(" ")}: ${String(
    message ?? "unknown error",
  )
    .replace(/\s+/g, " ")
    .slice(0, 300)}`;
  for (const secret of secrets) if (secret) line = line.split(secret).join("[REDACTED]");
  return line
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s"]+/gi, "$1[REDACTED]");
}

// Temporary overloads are common on new models, so a couple of quick retries hide most of them.
// A 504 is not retried: Google only reports it after the whole deadline has already been spent.
const BUSY_STATUSES = new Set([500, 503, 504]);
const RETRYABLE_STATUSES = new Set([500, 503]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(ai, params, retryDelaysMs, onRetry) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const { status } = parseUpstream(err);
      if (!RETRYABLE_STATUSES.has(status) || attempt >= retryDelaysMs.length) throw err;
      onRetry(attempt + 1, retryDelaysMs.length, err);
      await sleep(retryDelaysMs[attempt]);
    }
  }
}

// With a fallback model configured, switch to it when the main one is overloaded or over its quota.
// Quota is tracked per model, so the fallback usually still has room.
const FALLBACK_STATUSES = new Set([...BUSY_STATUSES, 429]);

export const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173";

// CLIENT_ORIGIN can hold one origin or several separated by commas. Browsers send the Origin header
// without a trailing slash, so one pasted with a "/" at the end is normalised instead of silently failing.
export function parseOrigins(value) {
  const list = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return list.length > 0 ? list : [DEFAULT_CLIENT_ORIGIN];
}

export function createApp({
  ai,
  model,
  fallbackModel,
  clientOrigin,
  secrets = [],
  retryDelaysMs = [1000, 2500],
}) {
  const app = express();
  const useFallback = Boolean(fallbackModel) && fallbackModel !== model;
  // Do not spend long retrying the main model when there is somewhere else to go.
  const primaryDelays = useFallback ? retryDelaysMs.slice(0, 1) : retryDelaysMs;
  const fallbackDelays = retryDelaysMs.slice(0, 1);
  const logRetry = (attempt, max, err) =>
    console.warn(`Gemini temporarily failed (${describeForLog(err, secrets)}); retry ${attempt}/${max}`);

  async function generate(contents) {
    try {
      return await generateWithRetry(ai, { model, contents }, primaryDelays, logRetry);
    } catch (err) {
      if (!useFallback || !FALLBACK_STATUSES.has(parseUpstream(err).status)) throw err;
      console.warn(
        `Model "${model}" is unavailable (${describeForLog(err, secrets)}); trying "${fallbackModel}" instead`,
      );
      return generateWithRetry(ai, { model: fallbackModel, contents }, fallbackDelays, logRetry);
    }
  }

  // Behind Render's proxy every request comes from the proxy's address. Trusting one hop makes
  // req.ip the real client address, so the rate limit counts each visitor separately.
  app.set("trust proxy", 1);

  app.use(cors({ origin: parseOrigins(clientOrigin), methods: ["GET", "POST"] }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // For uptime checks (Render health check path). No secrets, no Gemini call, not rate limited.
  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok" });
  });

  const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a few minutes and try again." },
  });

  app.post("/api/chat", chatLimiter, async (req, res) => {
    const error = validateMessages(req.body?.messages);
    if (error) return res.status(400).json({ error });

    try {
      const response = await generate(
        req.body.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content.trim() }],
        })),
      );
      const reply = response.text?.trim();
      if (!reply) {
        return res
          .status(502)
          .json({ error: "The AI couldn't produce a response to that. Please try rephrasing." });
      }
      return res.json({ reply });
    } catch (err) {
      console.error(`Gemini request failed: ${describeForLog(err, secrets)}`);
      const { status, error: message } = toFriendlyError(err);
      return res.status(status).json({ error: message });
    }
  });

  // Malformed JSON or oversized body from express.json, and anything unexpected.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large." });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    console.error("Unexpected error:", err.message);
    return res.status(500).json({ error: "Internal server error." });
  });

  return app;
}
