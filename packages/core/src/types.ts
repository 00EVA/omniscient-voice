export interface RingBufferOptions {
  /** Duration of the rolling buffer in seconds. Default: 60 */
  durationSeconds: number;
  /** Audio sample rate in Hz. Default: 16000 (optimal for speech) */
  sampleRate: number;
  /** Number of audio channels. Default: 1 (mono) */
  channels: number;
}

export const DEFAULT_RING_BUFFER_OPTIONS: RingBufferOptions = {
  durationSeconds: 60,
  sampleRate: 16000,
  channels: 1,
};

export interface PromptMetadata {
  id: string;
  timestamp: number;
  durationMs: number;
  platform: string;
  transcription?: string;
  tags?: string[];
}

export interface PromptRecord {
  metadata: PromptMetadata;
  audioBlob: Blob;
}

export type PromptSaveReason = "error" | "manual" | "auto";

export interface OmniscientVoiceConfig {
  bufferOptions?: Partial<RingBufferOptions>;
  /** Platforms to monitor for errors. Default: all supported */
  platforms?: string[];
  /** Enable browser SpeechRecognition for free-tier transcription */
  localTranscription?: boolean;
  /** Max number of saved prompts (free tier limit) */
  maxSavedPrompts?: number;
}

export const DEFAULT_CONFIG: OmniscientVoiceConfig = {
  bufferOptions: DEFAULT_RING_BUFFER_OPTIONS,
  platforms: ["chatgpt.com", "claude.ai", "gemini.google.com"],
  localTranscription: true,
  maxSavedPrompts: 20,
};
