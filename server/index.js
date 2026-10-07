import dotenv from "dotenv";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { createApp, parseOrigins } from "./app.js";

// Load server/.env no matter which folder the server is started from. On a host such as Render there is
// no .env file; the variables come from the platform's environment settings instead.
dotenv.config({ path: fileURLToPath(new URL("./.env", import.meta.url)), quiet: true });

const { GEMINI_API_KEY, GEMINI_MODEL } = process.env;
// Hosts like Render tell the app which port to use through PORT.
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGINS = parseOrigins(process.env.CLIENT_ORIGIN);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 30000;

if (!GEMINI_API_KEY || !GEMINI_MODEL) {
  console.error(
    "Missing GEMINI_API_KEY or GEMINI_MODEL. Locally, copy server/.env.example to server/.env and fill them in; " +
      "on a host, add them as environment variables.",
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });
// Optional: a second model to use when the main one is overloaded or over its quota.
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || undefined;
const app = createApp({
  ai,
  model: GEMINI_MODEL,
  fallbackModel: GEMINI_FALLBACK_MODEL,
  clientOrigin: CLIENT_ORIGINS,
  secrets: [GEMINI_API_KEY],
});

const PORT_IN_USE_HELP =
  `Port ${PORT} is already in use, so this copy cannot start. An older copy of the server is probably still running\n` +
  `and would keep answering requests with its old code and settings. Stop it first (PowerShell):\n` +
  `  Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }\n` +
  `or set a different PORT in server/.env (and the proxy target in client/vite.config.js).`;

// On Windows two copies of a server can bind the same port without an error, so ask the port directly.
function somethingIsListening(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host });
      socket.setTimeout(1000);
      socket.once("connect", () => resolve(true));
      socket.once("timeout", () => resolve(false));
      socket.once("error", () => resolve(false));
      socket.once("close", () => resolve(false));
      socket.once("connect", () => socket.destroy());
    });
  return Promise.all([tryHost("127.0.0.1"), tryHost("::1")]).then((results) => results.some(Boolean));
}

if (await somethingIsListening(PORT)) {
  console.error(PORT_IN_USE_HELP);
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (pid ${process.pid})`);
  console.log(`Using model "${GEMINI_MODEL}" (API key loaded, not shown). Timeout ${GEMINI_TIMEOUT_MS} ms`);
  console.log(`Allowed client origin(s): ${CLIENT_ORIGINS.join(", ")}`);
  console.log(
    GEMINI_FALLBACK_MODEL
      ? `Fallback model: "${GEMINI_FALLBACK_MODEL}"`
      : "No fallback model set (optional: GEMINI_FALLBACK_MODEL)",
  );
});

server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? PORT_IN_USE_HELP : `Server failed to start: ${err.message}`);
  process.exit(1);
});
