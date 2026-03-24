/**
 * Message protocol between extension components.
 * content-script <-> background <-> offscreen <-> popup
 */

export type MessageType =
  | "START_CAPTURE"
  | "STOP_CAPTURE"
  | "CAPTURE_STATUS"
  | "PROMPT_DETECTED"
  | "PROMPT_FAILED"
  | "PROMPT_SUCCEEDED"
  | "MANUAL_SAVE"
  | "GET_SAVED_PROMPTS"
  | "SAVED_PROMPTS_LIST"
  | "DELETE_PROMPT"
  | "EXPORT_PROMPT"
  | "BUFFER_STATUS";

export interface OVMessage {
  type: MessageType;
  payload?: unknown;
}

export interface CaptureStatusPayload {
  isCapturing: boolean;
  platform: string | null;
  bufferDurationSeconds: number;
}

export interface PromptDetectedPayload {
  platform: string;
  reason: "error" | "manual";
}

export interface SavedPromptsPayload {
  prompts: SavedPromptSummary[];
}

export interface SavedPromptSummary {
  id: string;
  timestamp: number;
  durationMs: number;
  platform: string;
  transcription?: string;
  reason: string;
}

export function sendMessage(msg: OVMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}

export function sendToTab(tabId: number, msg: OVMessage): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, msg);
}
