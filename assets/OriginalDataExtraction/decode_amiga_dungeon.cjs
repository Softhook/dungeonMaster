#!/usr/bin/env node
/*
 * Decompresses a big-endian (Atari ST / Amiga) compressed Dungeon.dat using
 * the same 0x8104 header + bitstream scheme documented for PC DOS in
 * docs/EXTERNAL_REFERENCE_IMPORT_AUDIT.md and already implemented for
 * little-endian PC data in parse_full.cjs (decodeCompressedDungeon). The
 * bitstream itself (0xx / 10xxxx / 11xxxxxxxx, MSB-first per byte) is
 * byte-oriented and endian-agnostic; only the 3 multi-byte header fields
 * (signature, uncompressedSize, dungeonId) need big-endian reads here.
 */
const fs = require('fs');

const COMPRESSED_DUNGEON_SIGNATURE = 0x8104;

function decodeCompressedDungeonBE(buffer) {
  if (buffer.length < 28) throw new Error('Compressed dungeon header is too small.');

  const signature = buffer.readUInt16BE(0);
  if (signature !== COMPRESSED_DUNGEON_SIGNATURE) {
    throw new Error(`Unexpected compressed dungeon signature 0x${signature.toString(16)}.`);
  }

  const uncompressedSize = buffer.readUInt32BE(2);
  const dungeonId = buffer.readUInt16BE(6);
  const mostCommon = Array.from(buffer.subarray(8, 12));
  const lessCommon = Array.from(buffer.subarray(12, 28));

  const out = Buffer.alloc(uncompressedSize);
  let outPos = 0;
  let srcPos = 28;
  let bitMask = 0;
  let currentByte = 0;

  function readBit() {
    if (bitMask === 0) {
      if (srcPos >= buffer.length) throw new Error('Unexpected end of compressed dungeon bitstream.');
      currentByte = buffer[srcPos++];
      bitMask = 0x80;
    }
    const bit = (currentByte & bitMask) ? 1 : 0;
    bitMask >>= 1;
    return bit;
  }

  function readBits(count) {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | readBit();
    return value;
  }

  while (outPos < uncompressedSize) {
    const first = readBit();
    let byteValue;
    if (first === 0) {
      byteValue = mostCommon[readBits(2)];
    } else {
      const second = readBit();
      byteValue = second === 0 ? lessCommon[readBits(4)] : readBits(8);
    }
    out[outPos++] = byteValue;
  }

  return {
    buffer: out,
    compression: {
      compressed: true,
      signature: COMPRESSED_DUNGEON_SIGNATURE,
      uncompressedSize,
      dungeonId,
      mostCommonBytes: mostCommon,
      lessCommonBytes: lessCommon,
      compressedSize: buffer.length,
      bytesConsumed: srcPos,
    },
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    console.error('Usage: node decode_amiga_dungeon.cjs <Dungeon.dat> [outputPath]');
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath);
  const decoded = decodeCompressedDungeonBE(raw);
  if (outputPath) fs.writeFileSync(outputPath, decoded.buffer);
  console.log(JSON.stringify({
    inputPath,
    outputPath: outputPath || null,
    rawSize: raw.length,
    ...decoded.compression,
  }, null, 2));
}

main();
