import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

// Health check
app.get("/", (c) => {
  return c.json({
    service: "omniscient-voice-api",
    version: "0.1.0",
    status: "ok",
    docs: "/docs",
  });
});

// API v1 routes
const v1 = new Hono();

// In-memory store for MVP (will be replaced with proper DB)
interface StoredPrompt {
  id: string;
  apiKey: string;
  timestamp: number;
  durationMs: number;
  platform: string;
  reason: string;
  transcription?: string;
}

const prompts: StoredPrompt[] = [];
const API_KEYS = new Set(["demo-key-001"]); // Hardcoded for MVP

function validateApiKey(key: string | undefined): boolean {
  return key !== undefined && API_KEYS.has(key);
}

// Save a prompt
v1.post("/prompts", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!validateApiKey(apiKey)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  const body = await c.req.json<{
    platform: string;
    reason: string;
    transcription?: string;
    durationMs?: number;
  }>();

  if (!body.platform || !body.reason) {
    return c.json({ error: "Missing required fields: platform, reason" }, 400);
  }

  const id = `ov_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  const prompt: StoredPrompt = {
    id,
    apiKey: apiKey!,
    timestamp: Date.now(),
    durationMs: body.durationMs ?? 0,
    platform: body.platform,
    reason: body.reason,
    transcription: body.transcription,
  };

  prompts.push(prompt);

  return c.json({ id, timestamp: prompt.timestamp, status: "saved" }, 201);
});

// List prompts
v1.get("/prompts", (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!validateApiKey(apiKey)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  const platform = c.req.query("platform");
  const limit = parseInt(c.req.query("limit") ?? "20");

  let results = prompts.filter((p) => p.apiKey === apiKey);
  if (platform) {
    results = results.filter((p) => p.platform === platform);
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  results = results.slice(0, limit);

  return c.json({
    prompts: results.map(({ apiKey: _, ...rest }) => rest),
    total: results.length,
  });
});

// Get single prompt
v1.get("/prompts/:id", (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!validateApiKey(apiKey)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  const prompt = prompts.find((p) => p.id === c.req.param("id") && p.apiKey === apiKey);
  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  const { apiKey: _, ...rest } = prompt;
  return c.json(rest);
});

// Delete prompt
v1.delete("/prompts/:id", (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!validateApiKey(apiKey)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  const idx = prompts.findIndex((p) => p.id === c.req.param("id") && p.apiKey === apiKey);
  if (idx === -1) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  prompts.splice(idx, 1);
  return c.json({ deleted: true });
});

// Search prompts
v1.get("/prompts/search/:query", (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!validateApiKey(apiKey)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  const query = c.req.param("query").toLowerCase();
  const results = prompts
    .filter(
      (p) =>
        p.apiKey === apiKey &&
        p.transcription?.toLowerCase().includes(query),
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
    .map(({ apiKey: _, ...rest }) => rest);

  return c.json({ results, total: results.length });
});

// API docs
v1.get("/docs", (c) => {
  return c.json({
    name: "Omniscient Voice API",
    version: "v1",
    baseUrl: "/api/v1",
    authentication: "X-API-Key header",
    endpoints: [
      { method: "POST", path: "/prompts", description: "Save a voice prompt" },
      { method: "GET", path: "/prompts", description: "List saved prompts" },
      { method: "GET", path: "/prompts/:id", description: "Get a specific prompt" },
      { method: "DELETE", path: "/prompts/:id", description: "Delete a prompt" },
      { method: "GET", path: "/prompts/search/:query", description: "Search prompts by transcription" },
    ],
  });
});

app.route("/api/v1", v1);
app.get("/docs", (c) => c.redirect("/api/v1/docs"));

const port = parseInt(process.env.PORT ?? "3456");

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[OmniscientVoice API] Running on http://localhost:${info.port}`);
});
