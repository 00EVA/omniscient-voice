import { RingBuffer } from "./ring-buffer";
import type { PromptMetadata, PromptRecord, PromptSaveReason } from "./types";

export enum PromptState {
  /** Mic is active, buffer is rolling, no prompt in progress */
  Idle = "idle",
  /** User is actively speaking a prompt */
  Buffering = "buffering",
  /** Prompt was sent, waiting for AI response (success or failure) */
  Pending = "pending",
  /** Prompt succeeded, buffer can be discarded */
  Succeeded = "succeeded",
  /** Prompt failed, audio preserved for recovery */
  Failed = "failed",
  /** Prompt was manually saved by user */
  Saved = "saved",
}

type StateTransition = {
  from: PromptState[];
  to: PromptState;
};

const VALID_TRANSITIONS: StateTransition[] = [
  { from: [PromptState.Idle], to: PromptState.Buffering },
  { from: [PromptState.Buffering], to: PromptState.Pending },
  { from: [PromptState.Buffering], to: PromptState.Idle },
  { from: [PromptState.Pending], to: PromptState.Succeeded },
  { from: [PromptState.Pending], to: PromptState.Failed },
  { from: [PromptState.Failed], to: PromptState.Saved },
  { from: [PromptState.Failed], to: PromptState.Idle },
  { from: [PromptState.Succeeded], to: PromptState.Idle },
  { from: [PromptState.Saved], to: PromptState.Idle },
  // Manual save from any active state
  { from: [PromptState.Buffering, PromptState.Pending], to: PromptState.Saved },
];

export type PromptLifecycleEvent =
  | { type: "stateChange"; from: PromptState; to: PromptState }
  | { type: "promptSaved"; record: PromptRecord; reason: PromptSaveReason }
  | { type: "promptDiscarded" }
  | { type: "error"; message: string };

type EventListener = (event: PromptLifecycleEvent) => void;

export class PromptLifecycle {
  private state: PromptState = PromptState.Idle;
  private ringBuffer: RingBuffer;
  private promptStartTime: number = 0;
  private currentPlatform: string = "unknown";
  private listeners: Set<EventListener> = new Set();
  private savedPrompts: PromptRecord[] = [];

  constructor(ringBuffer: RingBuffer) {
    this.ringBuffer = ringBuffer;
  }

  get currentState(): PromptState {
    return this.state;
  }

  get prompts(): ReadonlyArray<PromptRecord> {
    return this.savedPrompts;
  }

  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: PromptLifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the lifecycle
      }
    }
  }

  private transition(to: PromptState): void {
    const valid = VALID_TRANSITIONS.some(
      (t) => t.from.includes(this.state) && t.to === to,
    );
    if (!valid) {
      this.emit({
        type: "error",
        message: `Invalid transition: ${this.state} -> ${to}`,
      });
      return;
    }
    const from = this.state;
    this.state = to;
    this.emit({ type: "stateChange", from, to });
  }

  /** User started speaking */
  startBuffering(platform?: string): void {
    this.currentPlatform = platform ?? "unknown";
    this.promptStartTime = Date.now();
    this.transition(PromptState.Buffering);
  }

  /** Prompt was submitted to the AI platform */
  promptSent(): void {
    this.transition(PromptState.Pending);
  }

  /** AI platform responded successfully - discard buffer */
  promptSucceeded(): void {
    this.transition(PromptState.Succeeded);
    this.emit({ type: "promptDiscarded" });
    this.transition(PromptState.Idle);
  }

  /** AI platform returned an error - preserve the prompt */
  promptFailed(): PromptRecord | null {
    this.transition(PromptState.Failed);
    const record = this.capturePrompt("error");
    if (record) {
      this.transition(PromptState.Saved);
    }
    this.transition(PromptState.Idle);
    return record;
  }

  /** User manually saves the current/last prompt */
  manualSave(): PromptRecord | null {
    if (this.state === PromptState.Idle) {
      // Save whatever is in the buffer right now
      const record = this.capturePrompt("manual");
      return record;
    }
    const record = this.capturePrompt("manual");
    this.transition(PromptState.Saved);
    this.transition(PromptState.Idle);
    return record;
  }

  /** User cancelled the current prompt */
  cancel(): void {
    if (this.state !== PromptState.Idle) {
      this.state = PromptState.Idle;
      this.emit({ type: "promptDiscarded" });
    }
  }

  private capturePrompt(reason: PromptSaveReason): PromptRecord | null {
    const durationMs = Date.now() - this.promptStartTime;
    const durationSeconds = Math.max(durationMs / 1000, 1);

    // Capture at most the duration since prompt started, but cap at buffer size
    const secondsToCapture = Math.min(
      durationSeconds + 2, // add 2s padding
      this.ringBuffer.options.durationSeconds,
    );

    const audioBlob = this.ringBuffer.exportWav(secondsToCapture);

    if (audioBlob.size <= 44) {
      // WAV header only, no actual audio
      return null;
    }

    const metadata: PromptMetadata = {
      id: generateId(),
      timestamp: Date.now(),
      durationMs,
      platform: this.currentPlatform,
    };

    const record: PromptRecord = { metadata, audioBlob };
    this.savedPrompts.push(record);

    this.emit({ type: "promptSaved", record, reason });
    return record;
  }
}

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ov_${timestamp}_${random}`;
}
