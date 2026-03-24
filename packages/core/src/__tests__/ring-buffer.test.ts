import { describe, it, expect, beforeEach } from "vitest";
import { RingBuffer } from "../ring-buffer";

describe("RingBuffer", () => {
  let buffer: RingBuffer;

  beforeEach(() => {
    buffer = new RingBuffer({ durationSeconds: 2, sampleRate: 100, channels: 1 });
    // capacity = 200 samples (2 seconds * 100 Hz)
  });

  it("should initialize with correct capacity", () => {
    expect(buffer.capacity).toBe(200);
    expect(buffer.filled).toBe(0);
    expect(buffer.filledDurationSeconds).toBe(0);
  });

  it("should write and read samples correctly when not full", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    buffer.write(samples);

    expect(buffer.filled).toBe(5);
    const result = buffer.read();
    expect(result.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(result[i]).toBeCloseTo(samples[i]);
    }
  });

  it("should maintain chronological order after wrapping", () => {
    // Fill the buffer completely
    const first = new Float32Array(150).fill(1.0);
    buffer.write(first);

    // Write more to cause wrap-around
    const second = new Float32Array(100).fill(2.0);
    buffer.write(second);

    // Buffer should contain: 50 samples of 1.0 then 100 samples of 2.0
    const result = buffer.read();
    expect(result.length).toBe(200);

    // First 50 should be from the original fill that wasn't overwritten
    for (let i = 0; i < 50; i++) {
      expect(result[i]).toBeCloseTo(1.0);
    }
    // Last 100 should be the new data
    for (let i = 100; i < 200; i++) {
      expect(result[i]).toBeCloseTo(2.0);
    }
  });

  it("should handle writes larger than capacity", () => {
    const huge = new Float32Array(500);
    for (let i = 0; i < 500; i++) huge[i] = i / 500;
    buffer.write(huge);

    const result = buffer.read();
    expect(result.length).toBe(200);
    // Should contain the last 200 samples of the huge array
    for (let i = 0; i < 200; i++) {
      expect(result[i]).toBeCloseTo(huge[300 + i]);
    }
  });

  it("should read last N seconds correctly", () => {
    // Write 200 samples (fills buffer exactly)
    const data = new Float32Array(200);
    for (let i = 0; i < 200; i++) data[i] = i / 200;
    buffer.write(data);

    // Read last 1 second (100 samples)
    const last1s = buffer.readLast(1);
    expect(last1s.length).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(last1s[i]).toBeCloseTo(data[100 + i]);
    }
  });

  it("should read last N seconds after wrap-around", () => {
    // Write 250 samples (wraps once)
    const data = new Float32Array(250);
    for (let i = 0; i < 250; i++) data[i] = i;
    buffer.write(data);

    // Read last 0.5 seconds (50 samples) - should be samples 200-249
    const last = buffer.readLast(0.5);
    expect(last.length).toBe(50);
    for (let i = 0; i < 50; i++) {
      expect(last[i]).toBeCloseTo(200 + i);
    }
  });

  it("should export valid WAV blob", () => {
    const samples = new Float32Array(100).fill(0.5);
    buffer.write(samples);

    const wav = buffer.exportWav();
    expect(wav).toBeInstanceOf(Blob);
    expect(wav.type).toBe("audio/wav");
    // WAV header (44 bytes) + 100 samples * 2 bytes each = 244
    expect(wav.size).toBe(244);
  });

  it("should export last N seconds as WAV", () => {
    const data = new Float32Array(200).fill(0.3);
    buffer.write(data);

    const wav = buffer.exportWav(1); // last 1 second = 100 samples
    // 44 header + 100 * 2 = 244
    expect(wav.size).toBe(244);
  });

  it("should clear the buffer", () => {
    buffer.write(new Float32Array(100).fill(1.0));
    expect(buffer.filled).toBe(100);

    buffer.clear();
    expect(buffer.filled).toBe(0);
    expect(buffer.filledDurationSeconds).toBe(0);
  });

  it("should report correct filled duration", () => {
    // 100 samples at 100 Hz = 1 second
    buffer.write(new Float32Array(100));
    expect(buffer.filledDurationSeconds).toBe(1);

    // Fill completely
    buffer.write(new Float32Array(100));
    expect(buffer.filledDurationSeconds).toBe(2);

    // Overfill - duration stays at max
    buffer.write(new Float32Array(50));
    expect(buffer.filledDurationSeconds).toBe(2);
  });

  it("should handle readLast when buffer is partially filled", () => {
    buffer.write(new Float32Array(50).fill(0.7));
    // Ask for more than what's available
    const result = buffer.readLast(5);
    expect(result.length).toBe(50);
  });

  it("should handle empty readLast", () => {
    const result = buffer.readLast(1);
    expect(result.length).toBe(0);
  });

  it("should use default options when none provided", () => {
    const defaultBuffer = new RingBuffer();
    // 16000 Hz * 60 seconds * 1 channel = 960000
    expect(defaultBuffer.capacity).toBe(960000);
  });
});
