/**
 * Generates placeholder PNG icons for the extension.
 * Creates simple colored squares with "VV" text.
 * Replace with real icons before Chrome Web Store submission.
 */
import { writeFileSync } from "fs";

function createPNG(size) {
  // Minimal valid PNG: solid blue square
  // Using a 1x1 pixel PNG and setting dimensions in header
  // For a real app, use a proper icon. This is just to unblock development.

  const width = size;
  const height = size;

  // Create raw pixel data (RGBA)
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Blue-ish gradient
      pixels[i] = 59;     // R
      pixels[i + 1] = 130; // G
      pixels[i + 2] = 246; // B
      pixels[i + 3] = 255; // A
    }
  }

  // We'll just write a minimal BMP and convert to PNG format
  // Actually, for simplicity, let's just create a tiny valid PNG manually

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk("IHDR", ihdrData);

  // IDAT chunk - raw image data with zlib
  // For simplicity, use uncompressed deflate blocks
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = 59;     // R
      rawData[offset + 1] = 130; // G
      rawData[offset + 2] = 246; // B
    }
  }

  // Wrap in zlib format (deflate with no compression)
  const zlibData = deflateUncompressed(rawData);
  const idat = createChunk("IDAT", zlibData);

  // IEND chunk
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function deflateUncompressed(data) {
  // zlib header: CMF=0x78, FLG=0x01
  const header = Buffer.from([0x78, 0x01]);

  // Split into blocks of max 65535 bytes
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockSize = Math.min(remaining, 65535);
    const isLast = offset + blockSize >= data.length;

    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast ? 0x01 : 0x00;
    blockHeader.writeUInt16LE(blockSize, 1);
    blockHeader.writeUInt16LE(blockSize ^ 0xffff, 3);

    blocks.push(blockHeader);
    blocks.push(data.subarray(offset, offset + blockSize));
    offset += blockSize;
  }

  // Adler-32 checksum
  const adler = adler32(data);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler, 0);

  return Buffer.concat([header, ...blocks, checksum]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  writeFileSync(`public/icons/icon-${size}.png`, png);
  console.log(`Created icon-${size}.png (${png.length} bytes)`);
}
