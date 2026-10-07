import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  createApp,
  validateMessages,
  toFriendlyError,
  describeForLog,
  parseOrigins,
  DEFAULT_CLIENT_ORIGIN,
} from "./app.js";

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

// A valid 11-message history (6 user turns of 1000 chars, 5 assistant turns) whose total length is exact.
function historyOfTotalLength(total) {
  const userLen = 1000;
  const assistantTotal = total - 6 * userLen; // spread over 5 assistant messages, each <= 8000
  const base = Math.floor(assistantTotal / 5);
  const extra = assistantTotal - base * 5;
  const messages = [];
  for (let i = 0; i < 5; i += 1) {
    messages.push(user("u".repeat(userLen)));
    messages.push(assistant("a".repeat(base + (i < extra ? 1 : 0))));
  }
  messages.push(user("u".repeat(userLen)));
  return messages;
}

function makeApp(options = {}) {
  const generateContent = vi.fn().mockResolvedValue({ text: "Hello from the mock" });
  const ai = { models: { generateContent } };
  // No waiting between retries in tests.
  const app = createApp({
    ai,
    model: "test-model",
    clientOrigin: "http://localhost:5173",
    retryDelaysMs: [0, 0],
    ...options,
  });
  return { app, generateContent };
}

// An error shaped like the ones @google/genai throws: Google's JSON body in message, HTTP status on the error.
function googleError(status, code, message, reason) {
  const body = { error: { code: status, status: code, message } };
  if (reason) body.error.details = [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }];
  return Object.assign(new Error(JSON.stringify(body)), { name: "ApiError", status });
}

describe("validateMessages", () => {
  it("accepts an alternating conversation that ends with a user message", () => {
    expect(validateMessages([user("a"), assistant("b"), user("c")])).toBeNull();
  });

  it.each([
    ["not an array", "hi"],
    ["empty array", []],
    [
      "more than 20 messages",
      Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? user("x") : assistant("x"))),
    ],
    ["a non-object item", ["hi"]],
    ["an unknown role", [{ role: "system", content: "x" }]],
    ["non-string content", [{ role: "user", content: 5 }]],
    ["blank content", [user("   ")]],
    ["a user message over 1000 characters", [user("a".repeat(1001))]],
    [
      "a user message over 1000 characters later in the history",
      [user("a"), assistant("b"), user("c".repeat(1001))],
    ],
    ["an assistant message over 8000 characters", [user("a"), assistant("b".repeat(8001)), user("c")]],
    ["a history over 40000 characters in total", historyOfTotalLength(40001)],
    ["starting with an assistant message", [assistant("x"), user("y")]],
    ["two consecutive user messages", [user("a"), user("b")]],
    ["two consecutive assistant messages", [user("a"), assistant("b"), assistant("c"), user("d")]],
    ["ending with an assistant message", [user("a"), assistant("b")]],
  ])("rejects %s", (_name, body) => {
    expect(validateMessages(body)).toEqual(expect.any(String));
  });

  it("accepts 19 messages", () => {
    // A valid history starts and ends with a user turn, so its length is always odd (max 19 of the 20 allowed).
    const nineteen = Array.from({ length: 19 }, (_, i) => (i % 2 === 0 ? user("x") : assistant("x")));
    expect(validateMessages(nineteen)).toBeNull();
  });

  it("accepts a user message of exactly 1000 characters", () => {
    expect(validateMessages([user("a".repeat(1000))])).toBeNull();
  });

  it("rejects a user message over 1000 characters and says it is a user message", () => {
    expect(validateMessages([user("a".repeat(1001))])).toMatch(/user message.*1000/);
  });

  it("accepts an assistant message of 3000 characters", () => {
    expect(validateMessages([user("hi"), assistant("b".repeat(3000)), user("thanks")])).toBeNull();
  });

  it("accepts an assistant message of exactly 8000 characters and rejects 8001", () => {
    expect(validateMessages([user("hi"), assistant("b".repeat(8000)), user("thanks")])).toBeNull();
    expect(validateMessages([user("hi"), assistant("b".repeat(8001)), user("thanks")])).toMatch(
      /assistant message.*8000/,
    );
  });

  it("accepts a long assistant reply followed by a short user message", () => {
    const history = [user("Write something long"), assistant("c".repeat(5000)), user("ok")];
    expect(validateMessages(history)).toBeNull();
  });

  it("accepts a history of exactly 40000 characters and rejects 40001", () => {
    expect(validateMessages(historyOfTotalLength(40000))).toBeNull();
    expect(validateMessages(historyOfTotalLength(40001))).toMatch(/too long.*40000/);
  });
});

describe("POST /api/chat", () => {
  let app;
  let generateContent;

  beforeEach(() => {
    ({ app, generateContent } = makeApp());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the model reply and maps roles to Gemini roles", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi"), assistant("hello"), user("how are you?")] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "Hello from the mock" });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const arg = generateContent.mock.calls[0][0];
    expect(arg.model).toBe("test-model");
    expect(arg.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("returns 400 and never calls Gemini for invalid input", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("a"), user("b")] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/alternate/);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("accepts a follow-up after a long assistant reply and passes the whole history to Gemini", async () => {
    // The reported bug: the first reply is longer than 1000 characters, then the user asks a follow-up.
    const longReply = "R".repeat(1500);
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("First message"), assistant(longReply), user("Follow-up question")] });

    expect(res.status).toBe(200);
    const { contents } = generateContent.mock.calls[0][0];
    expect(contents).toHaveLength(3);
    expect(contents[1].parts[0].text).toBe(longReply); // the reply is passed through untouched
  });

  it("rejects a user message over 1000 characters with a 400 and never calls Gemini", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("a".repeat(1001))] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user message/);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("accepts a large valid history (over the old 20kb body limit)", async () => {
    const history = historyOfTotalLength(40000);
    expect(JSON.stringify({ messages: history }).length).toBeGreaterThan(20 * 1024);
    const res = await request(app).post("/api/chat").send({ messages: history });
    expect(res.status).toBe(200);
  });

  it("returns 400 for malformed JSON and 413 for a body over the size limit", async () => {
    const bad = await request(app).post("/api/chat").set("Content-Type", "application/json").send("{bad");
    expect(bad.status).toBe(400);

    const big = await request(app)
      .post("/api/chat")
      .send({ messages: [user("a".repeat(300000))] });
    expect(big.status).toBe(413);
  });

  it("returns a friendly 502 when Gemini returns no text", async () => {
    generateContent.mockResolvedValue({ text: undefined });
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(502);
  });

  it.each([
    ["bad key (401)", googleError(401, "UNAUTHENTICATED", "bad credentials"), 401],
    ["forbidden (403)", googleError(403, "PERMISSION_DENIED", "denied"), 403],
    [
      "bad key as Google really reports it (400 API_KEY_INVALID)",
      googleError(
        400,
        "INVALID_ARGUMENT",
        "API key not valid. Please pass a valid API key.",
        "API_KEY_INVALID",
      ),
      401,
    ],
    ["unknown model (404)", googleError(404, "NOT_FOUND", "models/x is not found"), 404],
    ["quota (429)", googleError(429, "RESOURCE_EXHAUSTED", "quota exceeded"), 429],
    [
      "overloaded (503)",
      googleError(503, "UNAVAILABLE", "This model is currently experiencing high demand."),
      503,
    ],
    ["gateway timeout (504)", googleError(504, "DEADLINE_EXCEEDED", "deadline"), 503],
    ["internal error (500)", googleError(500, "INTERNAL", "internal"), 503],
    ["any other status (418)", googleError(418, "TEAPOT", "teapot"), 502],
  ])("maps upstream %s to a friendly %i without leaking internals", async (_name, err, expected) => {
    generateContent.mockRejectedValue(err);
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(expected);
    expect(res.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/secret|AIza|internal|UNAVAILABLE|high demand|models\//i);
  });

  it("retries a temporary overload and succeeds without the user noticing", async () => {
    generateContent
      .mockRejectedValueOnce(googleError(503, "UNAVAILABLE", "high demand"))
      .mockResolvedValueOnce({ text: "Second try worked" });
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Second try worked");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after 2 retries and returns 503", async () => {
    generateContent.mockRejectedValue(googleError(503, "UNAVAILABLE", "high demand"));
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(503);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it.each([
    [401, "UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
    [429, "RESOURCE_EXHAUSTED"],
    [504, "DEADLINE_EXCEEDED"],
  ])("does not retry a %i, since retrying cannot help", async (status, code) => {
    generateContent.mockRejectedValue(googleError(status, code, "nope"));
    await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  describe("fallback model", () => {
    const post = (a) =>
      request(a)
        .post("/api/chat")
        .send({ messages: [user("hi")] });
    const modelsCalled = (gc) => gc.mock.calls.map(([params]) => params.model);

    it("switches to the fallback model when the main one stays overloaded", async () => {
      const { app: fbApp, generateContent: gc } = makeApp({ fallbackModel: "fallback-model" });
      gc.mockImplementation(async ({ model }) => {
        if (model === "test-model") throw googleError(503, "UNAVAILABLE", "high demand");
        return { text: "Answered by the fallback" };
      });
      const res = await post(fbApp);
      expect(res.status).toBe(200);
      expect(res.body.reply).toBe("Answered by the fallback");
      // main model: first try + 1 retry, then the fallback
      expect(modelsCalled(gc)).toEqual(["test-model", "test-model", "fallback-model"]);
    });

    it("switches to the fallback model at once when the main one is over its quota", async () => {
      const { app: fbApp, generateContent: gc } = makeApp({ fallbackModel: "fallback-model" });
      gc.mockImplementation(async ({ model }) => {
        if (model === "test-model") throw googleError(429, "RESOURCE_EXHAUSTED", "quota");
        return { text: "Answered by the fallback" };
      });
      const res = await post(fbApp);
      expect(res.status).toBe(200);
      expect(modelsCalled(gc)).toEqual(["test-model", "fallback-model"]);
    });

    it("goes straight to the fallback on a 504 without retrying the slow model", async () => {
      const { app: fbApp, generateContent: gc } = makeApp({ fallbackModel: "fallback-model" });
      gc.mockImplementation(async ({ model }) => {
        if (model === "test-model") throw googleError(504, "DEADLINE_EXCEEDED", "deadline");
        return { text: "Answered by the fallback" };
      });
      const res = await post(fbApp);
      expect(res.status).toBe(200);
      expect(modelsCalled(gc)).toEqual(["test-model", "fallback-model"]);
    });

    it("does not use the fallback for configuration errors (bad key, unknown model)", async () => {
      for (const [status, code, expected] of [
        [401, "UNAUTHENTICATED", 401],
        [404, "NOT_FOUND", 404],
      ]) {
        const { app: fbApp, generateContent: gc } = makeApp({ fallbackModel: "fallback-model" });
        gc.mockRejectedValue(googleError(status, code, "config problem"));
        const res = await post(fbApp);
        expect(res.status).toBe(expected);
        expect(modelsCalled(gc)).toEqual(["test-model"]);
      }
    });

    it("returns a friendly 503 when the fallback is overloaded too", async () => {
      const { app: fbApp, generateContent: gc } = makeApp({ fallbackModel: "fallback-model" });
      gc.mockRejectedValue(googleError(503, "UNAVAILABLE", "high demand"));
      const res = await post(fbApp);
      expect(res.status).toBe(503);
      expect(modelsCalled(gc)).toEqual(["test-model", "test-model", "fallback-model", "fallback-model"]);
    });

    it("ignores a fallback that is the same as the main model", async () => {
      const { app: fbApp, generateContent: gc } = makeApp({ fallbackModel: "test-model" });
      gc.mockRejectedValue(googleError(503, "UNAVAILABLE", "high demand"));
      const res = await post(fbApp);
      expect(res.status).toBe(503);
      expect(modelsCalled(gc)).toEqual(["test-model", "test-model", "test-model"]);
    });
  });

  it("logs the real upstream reason but never the API key", async () => {
    const secretKey = "AIzaSyDUMMY-not-a-real-key-1234567890abcd";
    const { app: keyedApp, generateContent: gc } = makeApp({ secrets: [secretKey] });
    gc.mockRejectedValue(
      Object.assign(
        new Error(
          JSON.stringify({
            error: {
              code: 503,
              status: "UNAVAILABLE",
              message: `high demand for key=${secretKey} (${secretKey})`,
            },
          }),
        ),
        { status: 503 },
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await request(keyedApp)
      .post("/api/chat")
      .send({ messages: [user("hi")] });

    const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().join("\n");
    expect(logged).toContain("503 UNAVAILABLE");
    expect(logged).toContain("high demand");
    expect(logged).toContain("[REDACTED]");
    expect(logged).not.toContain(secretKey);
    expect(logged).not.toMatch(/AIza/);
  });

  it("maps a network failure (no status) to 503", async () => {
    generateContent.mockRejectedValue(new TypeError("fetch failed"));
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/reach/i);
  });
});

describe("rate limit", () => {
  it("allows 20 requests per IP and blocks the 21st with 429", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, generateContent } = makeApp();
    const send = () =>
      request(app)
        .post("/api/chat")
        .send({ messages: [user("hi")] });

    for (let i = 0; i < 20; i += 1) {
      const res = await send();
      expect(res.status).toBe(200);
    }
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many requests/i);
    expect(generateContent).toHaveBeenCalledTimes(20);
  });

  it("counts invalid requests too, so they cannot be used to probe freely", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 20; i += 1) {
      await request(app).post("/api/chat").send({ messages: "nope" });
    }
    const res = await request(app).post("/api/chat").send({ messages: "nope" });
    expect(res.status).toBe(429);
  });
});

describe("parseOrigins", () => {
  it("falls back to the local dev origin when nothing is configured", () => {
    for (const empty of [undefined, null, "", "  ", " , ,"]) {
      expect(parseOrigins(empty)).toEqual([DEFAULT_CLIENT_ORIGIN]);
    }
  });

  it("splits comma-separated origins, trims them and drops trailing slashes", () => {
    expect(parseOrigins(" https://a.vercel.app/ , https://b.example.com,")).toEqual([
      "https://a.vercel.app",
      "https://b.example.com",
    ]);
  });

  it("accepts an array", () => {
    expect(parseOrigins(["https://a.example.com/", "https://b.example.com"])).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });
});

describe("CORS", () => {
  const allowed = ["https://a.vercel.app", "https://b.vercel.app"];
  const preflight = (app, origin) =>
    request(app)
      .options("/api/chat")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

  it.each(allowed)("allows the configured origin %s (preflight and request)", async (origin) => {
    const { app } = makeApp({ clientOrigin: "https://a.vercel.app/, https://b.vercel.app" });
    const pre = await preflight(app, origin);
    expect(pre.headers["access-control-allow-origin"]).toBe(origin);
    const res = await request(app)
      .post("/api/chat")
      .set("Origin", origin)
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("does not allow any other origin", async () => {
    const { app } = makeApp({ clientOrigin: "https://a.vercel.app" });
    const pre = await preflight(app, "https://evil.example");
    expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
    const res = await request(app)
      .post("/api/chat")
      .set("Origin", "https://evil.example")
      .send({ messages: [user("hi")] });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("defaults to http://localhost:5173 for development", async () => {
    const { app } = makeApp({ clientOrigin: undefined });
    const pre = await preflight(app, "http://localhost:5173");
    expect(pre.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("GET /api/health", () => {
  it("returns ok without calling Gemini or exposing anything else", async () => {
    const { app, generateContent } = makeApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("is not counted by the chat rate limit", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 25; i += 1) await request(app).get("/api/health");
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [user("hi")] });
    expect(res.status).toBe(200);
  });
});

describe("behind a proxy (trust proxy)", () => {
  it("rate-limits each real client address separately", async () => {
    const { app } = makeApp();
    const send = (ip) =>
      request(app)
        .post("/api/chat")
        .set("X-Forwarded-For", ip)
        .send({ messages: [user("hi")] });

    for (let i = 0; i < 20; i += 1) expect((await send("203.0.113.10")).status).toBe(200);
    expect((await send("203.0.113.10")).status).toBe(429);
    // A different visitor behind the same proxy is unaffected.
    expect((await send("203.0.113.11")).status).toBe(200);
  });

  it("trusts exactly one proxy hop", () => {
    const { app } = makeApp();
    expect(app.get("trust proxy")).toBe(1);
  });
});

describe("toFriendlyError", () => {
  it("never includes the original message", () => {
    const out = toFriendlyError(Object.assign(new Error("leak me"), { status: 500 }));
    expect(JSON.stringify(out)).not.toContain("leak me");
  });
});

describe("describeForLog", () => {
  it("shows status, Google status and reason", () => {
    const line = describeForLog(
      googleError(400, "INVALID_ARGUMENT", "API key not valid.", "API_KEY_INVALID"),
    );
    expect(line).toBe("400 INVALID_ARGUMENT API_KEY_INVALID: API key not valid.");
  });

  it("redacts configured secrets and key-shaped strings, and copes with non-JSON messages", () => {
    const line = describeForLog(
      Object.assign(new Error("boom AIzaSyABCDEFGHIJKLMNOPQRSTUV and SECRET123"), { status: 500 }),
      ["SECRET123"],
    );
    expect(line).not.toMatch(/AIza|SECRET123/);
    expect(line).toContain("[REDACTED]");
  });
});
