import { describe, it, expect, beforeEach, vi } from "vitest";
import { PromptLifecycle, PromptState } from "../prompt-lifecycle";
import { RingBuffer } from "../ring-buffer";
import type { PromptLifecycleEvent } from "../prompt-lifecycle";

describe("PromptLifecycle", () => {
  let ringBuffer: RingBuffer;
  let lifecycle: PromptLifecycle;
  let events: PromptLifecycleEvent[];

  beforeEach(() => {
    ringBuffer = new RingBuffer({ durationSeconds: 5, sampleRate: 100, channels: 1 });
    lifecycle = new PromptLifecycle(ringBuffer);
    events = [];
    lifecycle.on((event) => events.push(event));
  });

  function fillBufferWithAudio() {
    const samples = new Float32Array(300);
    for (let i = 0; i < 300; i++) samples[i] = Math.sin(i * 0.1) * 0.5;
    ringBuffer.write(samples);
  }

  it("should start in idle state", () => {
    expect(lifecycle.currentState).toBe(PromptState.Idle);
  });

  it("should transition through happy path: idle -> buffering -> pending -> succeeded -> idle", () => {
    fillBufferWithAudio();

    lifecycle.startBuffering("chatgpt.com");
    expect(lifecycle.currentState).toBe(PromptState.Buffering);

    lifecycle.promptSent();
    expect(lifecycle.currentState).toBe(PromptState.Pending);

    lifecycle.promptSucceeded();
    expect(lifecycle.currentState).toBe(PromptState.Idle);

    // Should have emitted a promptDiscarded event
    const discarded = events.find((e) => e.type === "promptDiscarded");
    expect(discarded).toBeDefined();

    // No prompts saved
    expect(lifecycle.prompts.length).toBe(0);
  });

  it("should save prompt on failure: idle -> buffering -> pending -> failed -> saved -> idle", () => {
    fillBufferWithAudio();

    lifecycle.startBuffering("claude.ai");
    lifecycle.promptSent();

    const record = lifecycle.promptFailed();
    expect(record).not.toBeNull();
    expect(record!.metadata.platform).toBe("claude.ai");
    expect(record!.audioBlob.size).toBeGreaterThan(44);

    expect(lifecycle.currentState).toBe(PromptState.Idle);
    expect(lifecycle.prompts.length).toBe(1);

    const savedEvent = events.find(
      (e) => e.type === "promptSaved" && e.reason === "error",
    );
    expect(savedEvent).toBeDefined();
  });

  it("should allow manual save during buffering", () => {
    fillBufferWithAudio();

    lifecycle.startBuffering("gemini.google.com");
    const record = lifecycle.manualSave();

    expect(record).not.toBeNull();
    expect(record!.metadata.platform).toBe("gemini.google.com");
    expect(lifecycle.currentState).toBe(PromptState.Idle);
    expect(lifecycle.prompts.length).toBe(1);
  });

  it("should allow manual save during pending", () => {
    fillBufferWithAudio();

    lifecycle.startBuffering();
    lifecycle.promptSent();
    const record = lifecycle.manualSave();

    expect(record).not.toBeNull();
    expect(lifecycle.currentState).toBe(PromptState.Idle);
  });

  it("should allow manual save from idle (saves whatever is in buffer)", () => {
    fillBufferWithAudio();
    const record = lifecycle.manualSave();

    expect(record).not.toBeNull();
    expect(lifecycle.currentState).toBe(PromptState.Idle);
  });

  it("should reject invalid state transitions", () => {
    // Can't go from idle to pending directly
    lifecycle.promptSent();
    expect(lifecycle.currentState).toBe(PromptState.Idle);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
  });

  it("should allow cancel from any active state", () => {
    fillBufferWithAudio();

    lifecycle.startBuffering();
    lifecycle.cancel();

    expect(lifecycle.currentState).toBe(PromptState.Idle);
    expect(lifecycle.prompts.length).toBe(0);
  });

  it("should generate unique IDs for each saved prompt", () => {
    fillBufferWithAudio();

    lifecycle.startBuffering();
    lifecycle.promptSent();
    lifecycle.promptFailed();

    lifecycle.startBuffering();
    lifecycle.promptSent();
    lifecycle.promptFailed();

    expect(lifecycle.prompts.length).toBe(2);
    expect(lifecycle.prompts[0].metadata.id).not.toBe(lifecycle.prompts[1].metadata.id);
  });

  it("should return null when buffer is empty", () => {
    // Don't fill buffer - it's empty
    lifecycle.startBuffering();
    lifecycle.promptSent();
    const record = lifecycle.promptFailed();

    expect(record).toBeNull();
  });

  it("should emit stateChange events for each transition", () => {
    fillBufferWithAudio();
    events = [];

    lifecycle.startBuffering();
    lifecycle.promptSent();
    lifecycle.promptSucceeded();

    const stateChanges = events.filter((e) => e.type === "stateChange");
    expect(stateChanges.length).toBeGreaterThanOrEqual(3);
  });

  it("should allow removing event listeners", () => {
    const listener = vi.fn();
    const unsubscribe = lifecycle.on(listener);

    lifecycle.startBuffering();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    lifecycle.promptSent();
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it("should not crash if listener throws", () => {
    lifecycle.on(() => {
      throw new Error("bad listener");
    });

    // This should not throw
    expect(() => lifecycle.startBuffering()).not.toThrow();
    expect(lifecycle.currentState).toBe(PromptState.Buffering);
  });
});
