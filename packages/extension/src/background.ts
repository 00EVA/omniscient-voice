import type { OVMessage } from "./messages";

let offscreenCreated = false;

async function ensureOffscreen(): Promise<void> {
  if (offscreenCreated) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Audio capture for voice prompt buffering",
  });
  offscreenCreated = true;
}

chrome.runtime.onMessage.addListener(
  (message: OVMessage, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((err) => {
      console.error("[OV:bg] Error handling message:", err);
      sendResponse({ error: String(err) });
    });
    return true; // async response
  },
);

async function handleMessage(
  message: OVMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case "START_CAPTURE": {
      await ensureOffscreen();
      return chrome.runtime.sendMessage(message);
    }
    case "STOP_CAPTURE":
    case "MANUAL_SAVE":
    case "GET_SAVED_PROMPTS":
    case "DELETE_PROMPT":
    case "EXPORT_PROMPT":
    case "BUFFER_STATUS": {
      await ensureOffscreen();
      return chrome.runtime.sendMessage(message);
    }
    case "PROMPT_FAILED":
    case "PROMPT_SUCCEEDED":
    case "PROMPT_DETECTED": {
      await ensureOffscreen();
      return chrome.runtime.sendMessage(message);
    }
    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[OmniscientVoice] Extension installed");
});
