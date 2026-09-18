#!/usr/bin/env node
/*
 * Extracts the 33 SND2 sound-effect entries from a real Amiga Dungeon Master
 * Graphics.DAT (decoded via the shared extract_graphics_entry.cjs header/LZW
 * logic) and converts each raw 8-bit signed PCM blob to WAV using ffmpeg.
 *
 * Playback rate derivation: SOUND.C (ReDMCSB Amiga source) computes
 * ioa_Period = 72800 / Period for exec.audio.device, and every sound entry's
 * Period byte (byte3 in the extracted atari_i562_stats.json "sounds" table)
 * is 112 across the board, i.e. a single fixed rate for all effects, not
 * per-sound pitch. Actual Paula output rate = PAL clock / ioa_Period
 *   = 3546895 * 112 / 72800 ~= 5457 Hz.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AMIGA_SAMPLE_RATE_HZ = 5457;

const SOUND_MAP = [
  [671, 'falling_item'],
  [672, 'clic'],
  [673, 'door'],
  [674, 'attack_trolin_golem'],
  [675, 'exploding_fireball'],
  [677, 'falling_and_dying'],
  [678, 'swallowing'],
  [679, 'champion_wounded_1'],
  [680, 'champion_wounded_2'],
  [681, 'champion_wounded_3'],
  [682, 'champion_wounded_4'],
  [683, 'exploding_spell'],
  [684, 'attack_slash'],
  [685, 'teleport'],
  [687, 'wall_bump'],
  [688, 'attack_pain_rat_dragon'],
  [689, 'attack_mummy_ghost'],
  [690, 'attack_screamer_oitu'],
  [691, 'attack_giant_scorpion'],
  [692, 'attack_magenta_worm'],
  [693, 'attack_giggler'],
  [701, 'move_animated_armour'],
  [702, 'move_giant_wasp_couatl'],
  [703, 'move_mummy_group'],
  [704, 'horn_of_fear'],
  [705, 'move_screamer_group'],
  [706, 'move_slime_water'],
  [707, 'war_cry'],
  [708, 'attack_rockpile'],
  [709, 'attack_water_elemental'],
  [710, 'attack_couatl'],
  [711, 'move_red_dragon'],
  [712, 'move_skeleton'],
];

function readU16BE(buf, off) { return buf.readUInt16BE(off); }
function readU32BE(buf, off) { return buf.readUInt32BE(off); }

function detectHeader(buf) {
  const first = readU16BE(buf, 0);
  if (first !== 0x8001) throw new Error('Expected DMCSB2 (0x8001) big-endian header');
  const numItems = readU16BE(buf, 2);
  let cursor = 4;
  const compressedSizes = new Array(numItems).fill(0);
  const expandedSizes = new Array(numItems).fill(0);
  for (let i = 0; i < numItems; i += 1) { compressedSizes[i] = readU16BE(buf, cursor); cursor += 2; }
  for (let i = 0; i < numItems; i += 1) { expandedSizes[i] = readU16BE(buf, cursor); cursor += 2; }
  cursor += numItems * 4; // width/height pairs, unused for sound entries
  return { numItems, headerSize: cursor, compressedSizes, expandedSizes };
}

function lzwDecompress(input) {
  const stringTable = new Array(1024 * 32);
  const lengths = new Uint16Array(1024 * 32);
  for (let i = 0; i < 256; i += 1) { stringTable[i] = Buffer.from([i]); lengths[i] = 1; }
  lengths[256] = 0;
  let stringNum = 257;
  let bits = 9;
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let inputLoc = 0;
  const output = [];
  const getCode = () => {
    while (bitsInBuffer < bits && inputLoc < input.length) {
      bitBuffer += input[inputLoc++] << bitsInBuffer;
      bitsInBuffer += 8;
    }
    if (bitsInBuffer < bits) return -1;
    const next = bitBuffer & ((1 << bits) - 1);
    bitBuffer = Math.floor(bitBuffer / (2 ** bits));
    bitsInBuffer -= bits;
    return next;
  };
  const outputBuffer = (buf) => { for (const byte of buf) output.push(byte); };
  let oldCode = getCode();
  if (oldCode < 0) return Buffer.alloc(0);
  outputBuffer(stringTable[oldCode]);
  let lzwChar = oldCode & 0xff;
  let newCode = getCode();
  while (newCode !== -1) {
    if (newCode === 256) {
      stringNum = 257; lengths[256] = 0; bits = 9;
    } else {
      let cur;
      if (newCode < stringNum) cur = stringTable[newCode];
      else cur = Buffer.concat([stringTable[oldCode], Buffer.from([lzwChar])]);
      outputBuffer(cur);
      lzwChar = cur[0];
      const nextString = Buffer.concat([stringTable[oldCode], Buffer.from([lzwChar])]);
      stringTable[stringNum] = nextString;
      lengths[stringNum] = nextString.length;
      stringNum += 1;
      if (bits < 12 && stringNum === (1 << bits)) bits += 1;
      oldCode = newCode;
    }
    newCode = getCode();
  }
  const fixed = Array.from(output);
  for (let i = 0; i < fixed.length; i += 1) {
    if (fixed[i] !== 0x90) continue;
    const count = fixed[i + 1];
    if (count === 0) { fixed.splice(i, 2, 0x90); continue; }
    if (i === 0) continue;
    const prev = fixed[i - 1];
    fixed.splice(i, 2, ...new Array(count).fill(prev));
    i += count - 1;
  }
  return Buffer.from(fixed);
}

function extractRawEntry(buf, header, entryIndex) {
  let offset = header.headerSize;
  for (let i = 0; i < entryIndex; i += 1) offset += header.compressedSizes[i];
  const compressed = buf.subarray(offset, offset + header.compressedSizes[entryIndex]);
  return header.compressedSizes[entryIndex] === header.expandedSizes[entryIndex]
    ? Buffer.from(compressed)
    : lzwDecompress(compressed);
}

function s8ToWav(raw, sampleRate) {
  // Amiga Paula samples are signed 8-bit PCM; WAV PCM8 is unsigned, so bias by 128.
  const pcm8u = Buffer.from(raw).map((b) => (b + 128) & 0xff);
  const dataSize = pcm8u.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28); // byte rate (1 byte/sample * 1 channel)
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm8u]);
}

function main() {
  const graphicsPath = process.argv[2];
  const outDir = process.argv[3];
  if (!graphicsPath || !outDir) {
    console.error('Usage: node extract_amiga_sounds.cjs <Graphics.DAT> <outDir>');
    process.exit(1);
  }
  const buf = fs.readFileSync(graphicsPath);
  const header = detectHeader(buf);
  fs.mkdirSync(outDir, { recursive: true });

  for (const [entryIndex, baseName] of SOUND_MAP) {
    const raw = extractRawEntry(buf, header, entryIndex);
    const wav = s8ToWav(raw, AMIGA_SAMPLE_RATE_HZ);
    const wavPath = path.join(outDir, `${baseName}.wav`);
    fs.writeFileSync(wavPath, wav);

    const mp3Path = path.join(outDir, `${baseName}.mp3`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '64k', mp3Path]);

    console.log(`${entryIndex} -> ${baseName} (${raw.length} bytes @ ${AMIGA_SAMPLE_RATE_HZ}Hz)`);
  }
}

main();
