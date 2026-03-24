import type { OVMessage } from "./messages";

/**
 * Content script injected into AI platform pages.
 * Responsibilities:
 * 1. Detect which platform we're on
 * 2. Watch for voice input activity (mic button clicks)
 * 3. Monitor for errors (DOM changes, network failures)
 * 4. Report events to the background/offscreen pipeline
 */

const PLATFORM_DETECTORS: Record<string, PlatformDetector> = {
  "chatgpt.com": {
    name: "chatgpt.com",
    isVoiceActive: () =>
      document.querySelector('[data-testid="voice-play-turn-action-button"]') !== null ||
      document.querySelector('[aria-label*="Stop"]') !== null,
    hasError: () =>
      document.querySelector('[data-testid="error-message"]') !== null ||
      document.querySelector(".text-red-500") !== null ||
      document.body.textContent?.includes("Something went wrong") === true,
  },
  "chat.openai.com": {
    name: "chatgpt.com",
    isVoiceActive: () =>
      document.querySelector('[data-testid="voice-play-turn-action-button"]') !== null,
    hasError: () =>
      document.querySelector('[data-testid="error-message"]') !== null ||
      document.body.textContent?.includes("Something went wrong") === true,
  },
  "claude.ai": {
    name: "claude.ai",
    isVoiceActive: () =>
      document.querySelector('[aria-label*="microphone"]') !== null ||
      document.querySelector('[aria-label*="Stop recording"]') !== null,
    hasError: () =>
      document.querySelector('[class*="error"]') !== null ||
      document.body.textContent?.includes("Something went wrong") === true ||
      document.body.textContent?.includes("overloaded") === true,
  },
  "gemini.google.com": {
    name: "gemini.google.com",
    isVoiceActive: () =>
      document.querySelector('[aria-label*="microphone"]') !== null,
    hasError: () =>
      document.querySelector('[class*="error-message"]') !== null ||
      document.body.textContent?.includes("Something went wrong") === true,
  },
};

interface PlatformDetector {
  name: string;
  isVoiceActive: () => boolean;
  hasError: () => boolean;
}

function detectPlatform(): PlatformDetector | null {
  const hostname = window.location.hostname;
  return PLATFORM_DETECTORS[hostname] ?? null;
}

function send(msg: OVMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Extension context invalidated, ignore
  });
}

function init(): void {
  const platform = detectPlatform();
  if (!platform) return;

  console.log(`[OV:content] Platform detected: ${platform.name}`);

  // Auto-start capture when on a supported platform
  send({ type: "START_CAPTURE", payload: { platform: platform.name } });

  // Watch for errors using MutationObserver
  let lastErrorState = false;
  const observer = new MutationObserver(() => {
    const hasError = platform.hasError();

    if (hasError && !lastErrorState) {
      console.log("[OV:content] Error detected on platform");
      send({ type: "PROMPT_FAILED", payload: { platform: platform.name, reason: "error" } });
    }

    lastErrorState = hasError;
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-testid"],
  });

  // Listen for keyboard shortcut (Ctrl+Shift+S to manual save)
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "S") {
      e.preventDefault();
      console.log("[OV:content] Manual save triggered");
      send({ type: "MANUAL_SAVE" });
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
