#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const STORAGE_DIR = join(homedir(), ".omniscient-voice", "prompts");

function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

interface PromptEntry {
  id: string;
  timestamp: number;
  durationMs: number;
  platform: string;
  reason: string;
  transcription?: string;
  audioFile?: string;
}

function loadIndex(): PromptEntry[] {
  ensureStorageDir();
  const indexPath = join(STORAGE_DIR, "index.json");
  if (!existsSync(indexPath)) return [];
  try {
    return JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    return [];
  }
}

function saveIndex(entries: PromptEntry[]): void {
  ensureStorageDir();
  writeFileSync(join(STORAGE_DIR, "index.json"), JSON.stringify(entries, null, 2));
}

const server = new McpServer({
  name: "omniscient-voice",
  version: "0.1.0",
});

server.tool(
  "save_prompt",
  "Save a voice prompt with metadata. Use when a voice prompt needs to be preserved.",
  {
    platform: z.string().describe("Platform the prompt was given on (e.g. chatgpt.com, claude.ai)"),
    transcription: z.string().describe("Text transcription of the voice prompt"),
    reason: z.enum(["error", "manual", "auto"]).describe("Why the prompt is being saved"),
    durationMs: z.number().optional().describe("Duration of the prompt in milliseconds"),
  },
  async ({ platform, transcription, reason, durationMs }) => {
    const entries = loadIndex();
    const id = `ov_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const entry: PromptEntry = {
      id,
      timestamp: Date.now(),
      durationMs: durationMs ?? 0,
      platform,
      reason,
      transcription,
    };
    entries.push(entry);
    saveIndex(entries);

    return {
      content: [
        {
          type: "text" as const,
          text: `Prompt saved with ID: ${id}\nPlatform: ${platform}\nReason: ${reason}\nTranscription: ${transcription}`,
        },
      ],
    };
  },
);

server.tool(
  "list_prompts",
  "List all saved voice prompts. Returns metadata for each saved prompt.",
  {
    platform: z.string().optional().describe("Filter by platform"),
    limit: z.number().optional().describe("Max number of prompts to return. Default: 20"),
  },
  async ({ platform, limit }) => {
    let entries = loadIndex();

    if (platform) {
      entries = entries.filter((e) => e.platform === platform);
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);
    entries = entries.slice(0, limit ?? 20);

    if (entries.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No saved prompts found." }],
      };
    }

    const text = entries
      .map((e) => {
        const date = new Date(e.timestamp).toLocaleString();
        return `[${e.id}] ${date} | ${e.platform} | ${e.reason}\n  ${e.transcription ?? "(no transcription)"}`;
      })
      .join("\n\n");

    return {
      content: [{ type: "text" as const, text: `Saved prompts (${entries.length}):\n\n${text}` }],
    };
  },
);

server.tool(
  "get_prompt",
  "Get full details of a specific saved prompt by ID.",
  {
    id: z.string().describe("The prompt ID to retrieve"),
  },
  async ({ id }) => {
    const entries = loadIndex();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      return {
        content: [{ type: "text" as const, text: `Prompt not found: ${id}` }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(entry, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "search_prompts",
  "Search saved prompts by keyword in their transcription text.",
  {
    query: z.string().describe("Search query to match against transcription text"),
    limit: z.number().optional().describe("Max results. Default: 10"),
  },
  async ({ query, limit }) => {
    const entries = loadIndex();
    const queryLower = query.toLowerCase();

    const matches = entries
      .filter((e) => e.transcription?.toLowerCase().includes(queryLower))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit ?? 10);

    if (matches.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No prompts found matching: "${query}"` }],
      };
    }

    const text = matches
      .map((e) => {
        const date = new Date(e.timestamp).toLocaleString();
        return `[${e.id}] ${date} | ${e.platform}\n  ${e.transcription}`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${matches.length} prompts matching "${query}":\n\n${text}`,
        },
      ],
    };
  },
);

server.tool(
  "delete_prompt",
  "Delete a saved prompt by ID.",
  {
    id: z.string().describe("The prompt ID to delete"),
  },
  async ({ id }) => {
    const entries = loadIndex();
    const idx = entries.findIndex((e) => e.id === id);

    if (idx === -1) {
      return {
        content: [{ type: "text" as const, text: `Prompt not found: ${id}` }],
      };
    }

    // Remove audio file if it exists
    if (entries[idx].audioFile) {
      const audioPath = join(STORAGE_DIR, entries[idx].audioFile!);
      if (existsSync(audioPath)) unlinkSync(audioPath);
    }

    entries.splice(idx, 1);
    saveIndex(entries);

    return {
      content: [{ type: "text" as const, text: `Prompt deleted: ${id}` }],
    };
  },
);

server.tool(
  "replay_prompt",
  "Get the transcription of a saved prompt, ready to be resubmitted to an AI.",
  {
    id: z.string().describe("The prompt ID to replay"),
  },
  async ({ id }) => {
    const entries = loadIndex();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      return {
        content: [{ type: "text" as const, text: `Prompt not found: ${id}` }],
      };
    }

    if (!entry.transcription) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Prompt ${id} has no transcription. Audio-only prompt from ${entry.platform} at ${new Date(entry.timestamp).toLocaleString()}.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Replaying prompt from ${entry.platform} (${new Date(entry.timestamp).toLocaleString()}):\n\n${entry.transcription}`,
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  ensureStorageDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[OmniscientVoice MCP] Server started");
}

main().catch((err) => {
  console.error("[OmniscientVoice MCP] Fatal error:", err);
  process.exit(1);
});
