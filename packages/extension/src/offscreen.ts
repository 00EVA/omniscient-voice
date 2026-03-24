import { RingBuffer, PromptStore } from "@omniscient-voice/core";
import type { PromptSaveReason } from "@omniscient-voice/core";
import type { OVMessage, SavedPromptSummary } from "./messages";

let ringBuffer: RingBuffer | null = null;
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let isCapturing = false;
let currentPlatform = "unknown";
let captureStartTime = 0;

const store = new PromptStore();

function initBuffer(): void {
  if (!ringBuffer) {
    ringBuffer = new RingBuffer({
      durationSeconds: 60,
      sampleRate: 16000,
      channels: 1,
    });
  }
}

async function startCapture(platform: string): Promise<{ success: boolean }> {
  if (isCapturing) return { success: true };

  initBuffer();
  currentPlatform = platform;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // ScriptProcessorNode is deprecated but widely supported and works in offscreen docs.
    // AudioWorklet would be better but adds complexity for the MVP.
    scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    scriptNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      ringBuffer?.write(inputData);
    };

    source.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    isCapturing = true;
    captureStartTime = Date.now();

    // Auto-cleanup prompts older than 30 days on start
    store.cleanup(30).then((removed) => {
      if (removed > 0) console.log(`[OV:offscreen] Cleaned up ${removed} old prompts`);
    });

    console.log(`[OV:offscreen] Capture started for ${platform}`);
    return { success: true };
  } catch (err) {
    console.error("[OV:offscreen] Capture failed:", err);
    return { success: false };
  }
}

function stopCapture(): { success: boolean } {
  if (!isCapturing) return { success: true };

  scriptNode?.disconnect();
  mediaStream?.getTracks().forEach((t) => t.stop());
  audioContext?.close();

  scriptNode = null;
  mediaStream = null;
  audioContext = null;
  isCapturing = false;

  console.log("[OV:offscreen] Capture stopped");
  return { success: true };
}

async function saveCurrentBuffer(reason: PromptSaveReason): Promise<SavedPromptSummary | null> {
  if (!ringBuffer || ringBuffer.filled === 0) return null;

  const durationMs = Date.now() - captureStartTime;
  const secondsToCapture = Math.min(durationMs / 1000 + 2, 60);
  const audioBlob = ringBuffer.exportWav(secondsToCapture);

  if (audioBlob.size <= 44) return null;

  const id = `ov_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  const metadata = {
    id,
    timestamp: Date.now(),
    durationMs,
    platform: currentPlatform,
  };

  await store.save({ metadata, audioBlob, reason });

  console.log(`[OV:offscreen] Prompt saved: ${id} (${reason})`);

  return {
    id: metadata.id,
    timestamp: metadata.timestamp,
    durationMs: metadata.durationMs,
    platform: metadata.platform,
    reason,
  };
}

async function getSavedPrompts(): Promise<SavedPromptSummary[]> {
  const all = await store.getAll();
  return all.map((p) => ({
    id: p.metadata.id,
    timestamp: p.metadata.timestamp,
    durationMs: p.metadata.durationMs,
    platform: p.metadata.platform,
    reason: p.reason,
    transcription: p.metadata.transcription,
  }));
}

async function deletePrompt(id: string): Promise<boolean> {
  return store.delete(id);
}

chrome.runtime.onMessage.addListener(
  (message: OVMessage, _sender, sendResponse) => {
    handleOffscreenMessage(message).then(sendResponse).catch((err) => {
      console.error("[OV:offscreen] Error:", err);
      sendResponse({ error: String(err) });
    });
    return true;
  },
);

async function handleOffscreenMessage(message: OVMessage): Promise<unknown> {
  switch (message.type) {
    case "START_CAPTURE": {
      const platform = (message.payload as { platform?: string })?.platform ?? "unknown";
      return startCapture(platform);
    }
    case "STOP_CAPTURE":
      return stopCapture();
    case "MANUAL_SAVE":
      return { prompt: await saveCurrentBuffer("manual") };
    case "PROMPT_FAILED":
      return { prompt: await saveCurrentBuffer("error") };
    case "PROMPT_SUCCEEDED":
      return { discarded: true };
    case "GET_SAVED_PROMPTS":
      return { prompts: await getSavedPrompts() };
    case "DELETE_PROMPT": {
      const id = (message.payload as { id: string })?.id;
      return { deleted: await deletePrompt(id) };
    }
    case "BUFFER_STATUS":
      return {
        isCapturing,
        platform: currentPlatform,
        bufferDurationSeconds: ringBuffer?.filledDurationSeconds ?? 0,
      };
    default:
      return null;
  }
}
