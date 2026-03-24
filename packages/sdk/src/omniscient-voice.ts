import { RingBuffer, PromptLifecycle, PromptState } from "@omniscient-voice/core";
import type { PromptRecord, PromptSaveReason, RingBufferOptions } from "@omniscient-voice/core";

export interface OmniscientVoiceSDKOptions {
  /** Rolling buffer duration in seconds. Default: 60 */
  bufferDuration?: number;
  /** Audio sample rate. Default: 16000 */
  sampleRate?: number;
  /** Auto-start capture when init is called. Default: false */
  autoStart?: boolean;
  /** Platform identifier for tagging saved prompts */
  platform?: string;
}

export interface OmniscientVoiceEvents {
  onPromptSaved?: (record: PromptRecord, reason: PromptSaveReason) => void;
  onPromptDiscarded?: () => void;
  onCaptureStarted?: () => void;
  onCaptureStopped?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Omniscient Voice SDK - Drop-in voice prompt recovery for any web application.
 *
 * Usage:
 *   const ov = new OmniscientVoice({ platform: 'my-app' });
 *   await ov.startCapture();
 *
 *   // When user submits a voice prompt:
 *   ov.promptSent();
 *
 *   // If the AI response fails:
 *   const saved = ov.promptFailed();
 *   // saved.audioBlob contains the WAV, saved.metadata has timestamps
 *
 *   // If the AI response succeeds:
 *   ov.promptSucceeded();
 *   // Buffer rolls forward, nothing saved
 *
 *   // Manual save (user pressed hotkey):
 *   const saved = ov.manualSave();
 */
export class OmniscientVoice {
  private ringBuffer: RingBuffer;
  private lifecycle: PromptLifecycle;
  private options: Required<OmniscientVoiceSDKOptions>;
  private events: OmniscientVoiceEvents;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private _isCapturing = false;

  constructor(options?: OmniscientVoiceSDKOptions, events?: OmniscientVoiceEvents) {
    this.options = {
      bufferDuration: options?.bufferDuration ?? 60,
      sampleRate: options?.sampleRate ?? 16000,
      autoStart: options?.autoStart ?? false,
      platform: options?.platform ?? "unknown",
    };

    this.events = events ?? {};

    const bufferOpts: Partial<RingBufferOptions> = {
      durationSeconds: this.options.bufferDuration,
      sampleRate: this.options.sampleRate,
      channels: 1,
    };

    this.ringBuffer = new RingBuffer(bufferOpts);
    this.lifecycle = new PromptLifecycle(this.ringBuffer);

    this.lifecycle.on((event) => {
      switch (event.type) {
        case "promptSaved":
          this.events.onPromptSaved?.(event.record, event.reason);
          break;
        case "promptDiscarded":
          this.events.onPromptDiscarded?.();
          break;
        case "error":
          this.events.onError?.(new Error(event.message));
          break;
      }
    });

    if (this.options.autoStart) {
      this.startCapture().catch((err) => {
        this.events.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  /** Whether the mic is currently being captured */
  get isCapturing(): boolean {
    return this._isCapturing;
  }

  /** Current lifecycle state */
  get state(): PromptState {
    return this.lifecycle.currentState;
  }

  /** Duration of audio currently in the rolling buffer */
  get bufferDurationSeconds(): number {
    return this.ringBuffer.filledDurationSeconds;
  }

  /** All saved prompts from this session */
  get savedPrompts(): ReadonlyArray<PromptRecord> {
    return this.lifecycle.prompts;
  }

  /** Start capturing microphone audio into the rolling buffer */
  async startCapture(): Promise<void> {
    if (this._isCapturing) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.options.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.scriptNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.scriptNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      this.ringBuffer.write(inputData);
    };

    source.connect(this.scriptNode);
    this.scriptNode.connect(this.audioContext.destination);

    this._isCapturing = true;
    this.events.onCaptureStarted?.();
  }

  /** Stop capturing microphone audio */
  stopCapture(): void {
    if (!this._isCapturing) return;

    this.scriptNode?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();

    this.scriptNode = null;
    this.mediaStream = null;
    this.audioContext = null;
    this._isCapturing = false;
    this.events.onCaptureStopped?.();
  }

  /** Notify that the user started speaking a prompt */
  startBuffering(): void {
    this.lifecycle.startBuffering(this.options.platform);
  }

  /** Notify that the prompt was submitted to the AI */
  promptSent(): void {
    this.lifecycle.promptSent();
  }

  /** AI responded successfully - buffer is discarded */
  promptSucceeded(): void {
    this.lifecycle.promptSucceeded();
  }

  /** AI returned an error - prompt is saved and returned */
  promptFailed(): PromptRecord | null {
    return this.lifecycle.promptFailed();
  }

  /** User manually saves whatever is in the buffer right now */
  manualSave(): PromptRecord | null {
    return this.lifecycle.manualSave();
  }

  /** Cancel the current prompt (discard without saving) */
  cancel(): void {
    this.lifecycle.cancel();
  }

  /** Export the current buffer as a WAV blob without affecting state */
  exportBuffer(lastSeconds?: number): Blob {
    return this.ringBuffer.exportWav(lastSeconds);
  }

  /** Clear the rolling buffer */
  clearBuffer(): void {
    this.ringBuffer.clear();
  }

  /** Clean up all resources */
  destroy(): void {
    this.stopCapture();
    this.ringBuffer.clear();
  }
}
