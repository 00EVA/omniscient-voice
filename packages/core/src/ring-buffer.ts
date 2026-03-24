import {
  RingBufferOptions,
  DEFAULT_RING_BUFFER_OPTIONS,
} from "./types";

/**
 * Pure-data ring buffer for PCM audio samples.
 * Works in any JS environment (browser main thread, AudioWorklet, Node for testing).
 *
 * The buffer is a fixed-size Float32Array that overwrites oldest samples
 * as new ones arrive, giving us the "Live Photos" rolling window effect.
 */
export class RingBuffer {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private totalWritten: number = 0;
  readonly capacity: number;
  readonly options: RingBufferOptions;

  constructor(options?: Partial<RingBufferOptions>) {
    this.options = { ...DEFAULT_RING_BUFFER_OPTIONS, ...options };
    this.capacity = this.options.sampleRate * this.options.durationSeconds * this.options.channels;
    this.buffer = new Float32Array(this.capacity);
  }

  /** Push new audio samples into the ring buffer. Oldest samples are overwritten. */
  write(samples: Float32Array): void {
    const len = samples.length;

    if (len >= this.capacity) {
      // If incoming data is larger than buffer, keep only the tail
      this.buffer.set(samples.subarray(len - this.capacity));
      this.writeIndex = 0;
      this.totalWritten += len;
      return;
    }

    const spaceToEnd = this.capacity - this.writeIndex;

    if (len <= spaceToEnd) {
      this.buffer.set(samples, this.writeIndex);
    } else {
      this.buffer.set(samples.subarray(0, spaceToEnd), this.writeIndex);
      this.buffer.set(samples.subarray(spaceToEnd), 0);
    }

    this.writeIndex = (this.writeIndex + len) % this.capacity;
    this.totalWritten += len;
  }

  /**
   * Read the contents of the ring buffer in chronological order.
   * If the buffer hasn't been fully filled yet, returns only the written portion.
   */
  read(): Float32Array {
    const filled = Math.min(this.totalWritten, this.capacity);

    if (filled < this.capacity) {
      return this.buffer.slice(0, filled);
    }

    const result = new Float32Array(this.capacity);
    const readStart = this.writeIndex;
    const tailLen = this.capacity - readStart;

    result.set(this.buffer.subarray(readStart, readStart + tailLen), 0);
    result.set(this.buffer.subarray(0, readStart), tailLen);

    return result;
  }

  /**
   * Read the last N seconds from the buffer.
   * Useful for saving just the recent prompt, not the full 60s window.
   */
  readLast(seconds: number): Float32Array {
    const samplesToRead = Math.min(
      seconds * this.options.sampleRate * this.options.channels,
      Math.min(this.totalWritten, this.capacity),
    );

    if (samplesToRead === 0) return new Float32Array(0);

    const filled = Math.min(this.totalWritten, this.capacity);

    if (filled < this.capacity) {
      const start = Math.max(0, filled - samplesToRead);
      return this.buffer.slice(start, filled);
    }

    const result = new Float32Array(samplesToRead);
    let readPos = (this.writeIndex - samplesToRead + this.capacity) % this.capacity;

    if (readPos + samplesToRead <= this.capacity) {
      result.set(this.buffer.subarray(readPos, readPos + samplesToRead));
    } else {
      const tailLen = this.capacity - readPos;
      result.set(this.buffer.subarray(readPos, this.capacity), 0);
      result.set(this.buffer.subarray(0, samplesToRead - tailLen), tailLen);
    }

    return result;
  }

  /** Export the buffer contents (or last N seconds) as a WAV Blob. */
  exportWav(lastSeconds?: number): Blob {
    const samples = lastSeconds ? this.readLast(lastSeconds) : this.read();
    return encodeWav(samples, this.options.sampleRate, this.options.channels);
  }

  /** Number of samples currently stored */
  get filled(): number {
    return Math.min(this.totalWritten, this.capacity);
  }

  /** Duration of audio currently in the buffer, in seconds */
  get filledDurationSeconds(): number {
    return this.filled / (this.options.sampleRate * this.options.channels);
  }

  /** Reset the buffer to empty state */
  clear(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.totalWritten = 0;
  }
}

/** Encode raw PCM Float32 samples into a WAV Blob */
function encodeWav(samples: Float32Array, sampleRate: number, channels: number): Blob {
  const bytesPerSample = 2; // 16-bit PCM
  const dataLength = samples.length * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Convert Float32 [-1, 1] to Int16
  let offset = headerLength;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += bytesPerSample;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
