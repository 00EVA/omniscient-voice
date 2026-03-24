import type { OVMessage, SavedPromptSummary, CaptureStatusPayload } from "./messages";

const app = document.getElementById("app")!;

interface State {
  isCapturing: boolean;
  platform: string | null;
  bufferDuration: number;
  prompts: SavedPromptSummary[];
  view: "main" | "prompts";
}

const state: State = {
  isCapturing: false,
  platform: null,
  bufferDuration: 0,
  prompts: [],
  view: "main",
};

async function send(msg: OVMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}

async function refreshStatus(): Promise<void> {
  try {
    const res = (await send({ type: "BUFFER_STATUS" })) as CaptureStatusPayload | null;
    if (res) {
      state.isCapturing = res.isCapturing;
      state.platform = res.platform;
      state.bufferDuration = res.bufferDurationSeconds;
    }
  } catch {
    // offscreen not ready yet
  }
}

async function refreshPrompts(): Promise<void> {
  try {
    const res = (await send({ type: "GET_SAVED_PROMPTS" })) as {
      prompts: SavedPromptSummary[];
    } | null;
    if (res?.prompts) {
      state.prompts = res.prompts;
    }
  } catch {
    // offscreen not ready
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function render(): void {
  if (state.view === "prompts") {
    renderPromptsList();
  } else {
    renderMain();
  }
}

function renderMain(): void {
  const statusColor = state.isCapturing ? "#22c55e" : "#6b7280";
  const statusText = state.isCapturing
    ? `Recording on ${state.platform}`
    : "Not recording";
  const bufferText = state.isCapturing
    ? `Buffer: ${state.bufferDuration.toFixed(1)}s`
    : "";

  app.innerHTML = `
    <div class="vv-container">
      <div class="vv-header">
        <div class="vv-logo">
          <div class="vv-icon" style="background: ${statusColor}"></div>
          <span class="vv-title">Omniscient Voice</span>
        </div>
        <span class="vv-tagline">Never lose a prompt</span>
      </div>

      <div class="vv-status">
        <div class="vv-status-indicator" style="color: ${statusColor}">
          ${statusText}
        </div>
        ${bufferText ? `<div class="vv-buffer-info">${bufferText}</div>` : ""}
      </div>

      <div class="vv-actions">
        <button id="btn-save" class="vv-btn vv-btn-primary" ${!state.isCapturing ? "disabled" : ""}>
          Save Current Prompt
        </button>
        <button id="btn-toggle" class="vv-btn vv-btn-secondary">
          ${state.isCapturing ? "Stop Recording" : "Start Recording"}
        </button>
      </div>

      <div class="vv-divider"></div>

      <button id="btn-prompts" class="vv-btn vv-btn-ghost">
        Saved Prompts (${state.prompts.length})
      </button>

      <div class="vv-footer">
        <span class="vv-shortcut">Ctrl+Shift+S to quick-save</span>
      </div>
    </div>
  `;

  document.getElementById("btn-save")?.addEventListener("click", async () => {
    await send({ type: "MANUAL_SAVE" });
    await refreshPrompts();
    render();
  });

  document.getElementById("btn-toggle")?.addEventListener("click", async () => {
    if (state.isCapturing) {
      await send({ type: "STOP_CAPTURE" });
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? "";
      const hostname = new URL(url).hostname;
      await send({ type: "START_CAPTURE", payload: { platform: hostname } });
    }
    await refreshStatus();
    render();
  });

  document.getElementById("btn-prompts")?.addEventListener("click", () => {
    state.view = "prompts";
    render();
  });
}

function renderPromptsList(): void {
  const promptsHtml = state.prompts.length === 0
    ? '<div class="vv-empty">No saved prompts yet</div>'
    : state.prompts
        .slice()
        .reverse()
        .map(
          (p) => `
        <div class="vv-prompt-card" data-id="${p.id}">
          <div class="vv-prompt-header">
            <span class="vv-prompt-platform">${p.platform}</span>
            <span class="vv-prompt-reason vv-reason-${p.reason}">${p.reason}</span>
          </div>
          <div class="vv-prompt-time">${formatTimestamp(p.timestamp)}</div>
          <div class="vv-prompt-duration">${formatDuration(p.durationMs)}</div>
          ${p.transcription ? `<div class="vv-prompt-text">${p.transcription}</div>` : ""}
          <div class="vv-prompt-actions">
            <button class="vv-btn-sm vv-btn-delete" data-delete="${p.id}">Delete</button>
          </div>
        </div>
      `,
        )
        .join("");

  app.innerHTML = `
    <div class="vv-container">
      <div class="vv-header">
        <button id="btn-back" class="vv-btn-back">&larr; Back</button>
        <span class="vv-title">Saved Prompts</span>
      </div>
      <div class="vv-prompts-list">
        ${promptsHtml}
      </div>
    </div>
  `;

  document.getElementById("btn-back")?.addEventListener("click", () => {
    state.view = "main";
    render();
  });

  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = (e.target as HTMLElement).getAttribute("data-delete");
      if (id) {
        await send({ type: "DELETE_PROMPT", payload: { id } });
        await refreshPrompts();
        render();
      }
    });
  });
}

async function init(): Promise<void> {
  await refreshStatus();
  await refreshPrompts();
  render();

  // Refresh status every 2 seconds while popup is open
  setInterval(async () => {
    await refreshStatus();
    if (state.view === "main") renderMain();
  }, 2000);
}

init();
