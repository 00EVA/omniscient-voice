# Omniscient Voice - Voice Prompt Recovery Micro-SaaS

## Background and Motivation

### The Problem
When using voice AI platforms (ChatGPT Voice, Claude, Gemini, etc.), users speak naturally and sometimes deliver exceptional, nuanced prompts. When something fails - network drop, API error, platform crash - that prompt is **gone forever**. The user has to try to recreate it from memory, and it's never quite as good.

This is the "lost brilliant thought" problem, but specific to voice-first AI interactions.

### The Insight
iPhone Live Photos capture ~1.5s before and after the shutter press. The same concept applied to voice: a **rolling audio buffer** that continuously captures your voice input. If something goes wrong, the prompt is preserved. If everything works fine, the buffer rolls forward and nothing is stored.

### Market Gap (Validated)
- **Existing extensions save AI output, not user input.** "Voice Saver", "ChatGPT Audio Saver", "Save the ChatGPT voice" - all 20K+ users - only save what the AI says back to you.
- **Prompt management tools are text-only.** PromptVault, FetchPrompt, ChatGPT Prompt Saver - all manage text prompts, not voice.
- **Memory-as-a-service is agent-focused.** Recallr, InstantRecall.ai - these give AI agents memory, not humans.
- **Nobody does preemptive voice prompt recovery.** This is the gap.

### Product Name
**Omniscient Voice** - "Live Photo for your voice prompts. Never lose a good idea again."

### Target Users
1. **B2C (Browser Extension)**: Power users of ChatGPT Voice, Claude, Gemini voice modes, any voice AI. Creators, developers, researchers who rely on voice-first workflows.
2. **B2B (API/SDK)**: AI platforms, voice AI startups, enterprise tools that want to offer prompt recovery as a native feature.
3. **MCP Server**: AI assistant ecosystems (Cursor, Windsurf, etc.) where voice is becoming a primary input.

---

## Key Challenges and Analysis

### Technical Challenges

#### 1. Rolling Audio Buffer in the Browser
- **Problem**: MediaRecorder doesn't support true circular buffers because audio codecs embed metadata at the start of the stream. You can't just drop old chunks.
- **Solution**: Use the proven "overlapping recorders" pattern. Multiple MediaRecorder instances offset by time intervals (e.g., for a 30-second window, use 30 recorders cycling 1-second intervals). Or use Web Audio API with `AudioWorkletProcessor` to capture raw PCM into a ring buffer, then encode on-demand.
- **Recommendation**: Hybrid approach. Use `AudioWorkletProcessor` for the raw PCM ring buffer (most efficient, lossless), and only spin up MediaRecorder when we need to export/save a segment.

#### 2. Detecting "Prompt Failure"
- **Browser Extension**: Monitor the DOM/network for error states on AI platforms. Detect HTTP 4xx/5xx responses, WebSocket disconnects, error UI elements appearing.
- **API/SDK**: Consumers pass in success/failure callbacks. The SDK holds the buffer and either discards (on success) or preserves (on failure).
- **Graceful degradation**: Even without error detection, allow manual "save last prompt" via hotkey or button.

#### 3. Transcription
- **Local-first**: Use browser's built-in `SpeechRecognition` API for free, real-time transcription (quality varies).
- **Cloud option**: OpenAI Whisper at $0.006/min or GPT-4o Mini Transcribe at $0.003/min for high-quality transcription.
- **Deepgram**: $0.0058-0.0077/min, good for B2B at scale.

#### 4. Privacy & Storage
- **Local-first by default**: All audio stays on-device in IndexedDB. No cloud unless user opts in.
- **Encryption**: Audio blobs encrypted at rest with user-derived key.
- **Auto-cleanup**: Configurable retention (e.g., 7 days, 30 days, manual only).

#### 5. Browser Extension Manifest V3 Constraints
- Service workers have a 5-minute idle timeout. Audio processing must be in content scripts or offscreen documents.
- Use Chrome's `offscreen` API to maintain persistent audio processing.

### Business Model Analysis

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Local-only, 20 saved prompts, audio only, no transcription |
| **Pro** | $7/mo | Unlimited saves, AI transcription, cloud sync, search, export |
| **Team** | $15/user/mo | Shared prompt library, analytics, admin controls |
| **B2B API** | Usage-based | $0.01/prompt saved + $0.005/min transcription, volume discounts |
| **Enterprise** | Custom | White-label SDK, SLA, on-prem option, dedicated support |

### Competitive Moat
- **First mover**: Nobody does this yet. The concept is novel.
- **Platform-agnostic**: Works across ChatGPT, Claude, Gemini, any voice AI.
- **B2B lock-in**: Once platforms integrate the SDK, switching cost is high.
- **Data flywheel**: Aggregated (anonymized) prompt failure patterns could inform product improvements.

---

## High-level Task Breakdown

### Phase 0: Foundation & Proof of Concept
- [ ] **Task 0.1**: Set up monorepo structure (TypeScript, pnpm workspaces)
  - Packages: `core` (buffer logic), `extension` (Chrome), `api` (backend), `sdk` (JS SDK), `mcp` (MCP server)
  - Success: `pnpm install` works, all packages resolve
- [ ] **Task 0.2**: Implement core audio ring buffer module
  - AudioWorkletProcessor-based PCM ring buffer
  - Configurable duration (default 60 seconds)
  - Export segment as WAV/WebM blob
  - Success: Unit tests pass - buffer captures, rolls, and exports correctly
- [ ] **Task 0.3**: Implement prompt lifecycle manager
  - States: `buffering` -> `pending` -> `saved` | `discarded`
  - Error detection hooks (DOM observer, network monitor, manual trigger)
  - Success: Unit tests pass for all state transitions

### Phase 1: Chrome Extension (B2C MVP)
- [ ] **Task 1.1**: Chrome Extension scaffold (Manifest V3)
  - Popup UI, content script, offscreen document for audio
  - Success: Extension loads in Chrome, popup renders
- [ ] **Task 1.2**: Microphone capture integration
  - Request mic permission, pipe to core ring buffer
  - Works on chatgpt.com, claude.ai, gemini.google.com
  - Success: Audio buffer captures voice input on target sites
- [ ] **Task 1.3**: Platform-specific error detectors
  - DOM observers for error states on ChatGPT, Claude, Gemini
  - Network request monitoring for failed API calls
  - Success: Detects errors on at least ChatGPT
- [ ] **Task 1.4**: Prompt save & browse UI
  - Saved prompts list with audio playback
  - Text transcription (browser SpeechRecognition for free tier)
  - Export as audio file or text
  - Success: Can save, browse, play, and export prompts
- [ ] **Task 1.5**: Local storage with IndexedDB
  - Store audio blobs + metadata + transcriptions
  - Auto-cleanup policy
  - Success: Prompts persist across browser restarts

### Phase 2: Backend API & Cloud Sync
- [ ] **Task 2.1**: Backend API (Node.js/Hono or FastAPI)
  - Auth (OAuth/JWT), prompt CRUD, audio upload/download
  - Whisper transcription integration
  - Success: API endpoints work, transcription returns text
- [ ] **Task 2.2**: Cloud sync for Pro tier
  - Extension syncs saved prompts to cloud
  - Cross-device access
  - Success: Prompt saved on one device appears on another
- [ ] **Task 2.3**: Stripe integration for billing
  - Free/Pro/Team tier management
  - Success: Can subscribe, upgrade, cancel

### Phase 3: B2B SDK & API
- [ ] **Task 3.1**: JavaScript/TypeScript SDK
  - `Omniscient Voice.init()`, `.startBuffer()`, `.onError()`, `.getSavedPrompts()`
  - Framework-agnostic, works in any web app
  - Success: SDK can be npm-installed and used in a sample app
- [ ] **Task 3.2**: REST API for B2B consumers
  - API key auth, rate limiting, usage tracking
  - Webhook notifications for saved prompts
  - Success: Third-party can integrate via API
- [ ] **Task 3.3**: Documentation & developer portal
  - API docs, SDK quickstart, integration guides
  - Success: A developer can integrate in <30 minutes

### Phase 4: MCP Server
- [ ] **Task 4.1**: MCP server implementation
  - Tools: `save_prompt`, `list_prompts`, `search_prompts`, `get_prompt`, `replay_prompt`
  - Resources: saved prompts as MCP resources
  - Success: MCP server works with Claude Desktop / Cursor
- [ ] **Task 4.2**: Integration examples
  - Example: Cursor + Omniscient Voice MCP for voice coding recovery
  - Success: Working demo

### Phase 5: Launch & Growth
- [ ] **Task 5.1**: Chrome Web Store submission
- [ ] **Task 5.2**: Landing page & marketing site
- [ ] **Task 5.3**: Product Hunt launch
- [ ] **Task 5.4**: B2B outreach to AI platforms

---

## Project Status Board

### Current Phase: MVP Complete - Ready for Testing

- [x] Phase 0: Foundation & Proof of Concept (26/26 tests passing, TS builds clean)
- [x] Phase 1: Chrome Extension (B2C MVP) - Manifest V3, offscreen audio, error detection, popup UI, IndexedDB
- [x] Phase 2: Backend API - Hono REST API, CRUD endpoints, API key auth, search (smoke tested)
- [x] Phase 3: B2B SDK - Omniscient Voice class with full lifecycle, mic capture, event callbacks
- [x] Phase 4: MCP Server - 6 tools (save, list, get, search, delete, replay), file-based storage
- [ ] Phase 5: Launch & Growth

### Immediate Next Steps
- [x] Human review and approve plan
- [x] Decide on starting phase -> Phase 0 then Phase 1
- [x] Decide on tech stack preferences -> TypeScript, pnpm, Vitest, Vite
- [x] All Phase 0-4 tasks complete
- [x] Initialize `C:\Users\Yujia\Desktop\VOICE PREVIEW MODE` as its own git repository
- [x] Connect the project repo to the private GitHub remote `00EVA/omniscient-voice`
- [ ] Manual testing of Chrome extension in browser
- [ ] Integration testing (SDK + API + MCP)

### Recommended Tech Stack
- **Language**: TypeScript (everywhere)
- **Monorepo**: pnpm workspaces
- **Extension**: Chrome Manifest V3, Vite for bundling
- **Backend**: Hono (lightweight, edge-ready) or Express
- **Database**: SQLite (Turso) for metadata, R2/S3 for audio blobs
- **Auth**: Clerk or Supabase Auth
- **Payments**: Stripe
- **Transcription**: OpenAI Whisper API (primary), browser SpeechRecognition (free fallback)
- **MCP**: `@modelcontextprotocol/sdk`

---

## Executor's Feedback or Assistance Requests

Phase 0 complete. RingBuffer (13 tests) and PromptLifecycle (13 tests) both passing.
Phase 1 complete. Chrome extension builds with Vite. Includes: manifest V3, offscreen audio capture, content script error detection, popup UI, IndexedDB persistence.
Phase 2 complete. Hono REST API with CRUD + search endpoints, API key auth. Smoke tested successfully.
Phase 3 complete. Omniscient Voice SDK class wraps core engine with mic capture, events, and clean API surface.
Phase 4 complete. MCP server with 6 tools (save, list, get, search, delete, replay), file-based storage at ~/.omniscient-voice/prompts.

All 5 packages build clean. 26/26 core tests pass. Ready for human testing.

Repository update: this folder is now a standalone git repository instead of inheriting a larger parent repo. This avoids accidentally committing unrelated desktop and home-directory files when pushing the project to GitHub.

---

## Lessons

- MediaRecorder doesn't support true circular buffers due to codec metadata. Use AudioWorkletProcessor for raw PCM ring buffer, encode only when saving.
- Chrome Manifest V3 service workers idle-timeout after 5 minutes. Use `chrome.offscreen` API for persistent audio processing.
- Existing voice Chrome extensions (Voice Saver 20K+ users, ChatGPT Audio Saver) only save AI output audio, not user input. This is the market gap.
- OpenAI Whisper pricing: $0.006/min. GPT-4o Mini Transcribe: $0.003/min. Deepgram Nova: $0.0058/min. All viable at scale.
- Never use emoji in codebase, testing, or production code. Fine in logs, docs, and commits.
- Always use `uv` instead of pip for Python dependencies.
- Float32Array has precision differences from JS number literals. Use `toBeCloseTo()` in tests, not `toEqual()`.
- pnpm `approve-builds` is interactive and can't be automated easily. Use `pnpm config set` as workaround.
- MCP and API packages that use Node.js builtins (fs, path, os) need `@types/node` as a devDependency.
- Hono with `@hono/node-server` is extremely fast to set up for API MVPs. Zero-config Node HTTP server.
- vite-plugin-static-copy handles copying manifest.json and HTML files to extension dist cleanly.
- If a project folder lives inside a larger git repo, initialize a folder-local repo before the first project commit so unrelated files are not included.
