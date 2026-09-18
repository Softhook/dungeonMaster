#!/usr/bin/env node
/*
 * Big-endian counterpart of parse_dungeon.js's map-geometry reader, run
 * against a decompressed Amiga/Atari Dungeon.dat (see decode_amiga_dungeon.cjs).
 * Produces the same tile-grid/ASCII output as the PC parser for a direct
 * map-layout comparison, without yet porting the full object-placement
 * logic in parse_full.cjs.
 */
const fs = require('fs');

const TILE_TYPES = ['Wall', 'Floor', 'Pit', 'Stairs', 'Door', 'Teleporter', 'TrickWall', 'Empty'];

function parseDungeonBE(data) {
  const dungeonId = data.readUInt16BE(0x00);
  const mapDataSize = data.readUInt16BE(0x02);
  const numMaps = data.readUInt8(0x04);
  const textDataWords = data.readUInt16BE(0x06);
  const startingPos = data.readUInt16BE(0x08);
  const objListWords = data.readUInt16BE(0x0A);

  const startX = startingPos & 0x1f;
  const startY = (startingPos >> 5) & 0x1f;
  const startDir = (startingPos >> 10) & 0x03;
  const DIRS = ['North', 'East', 'South', 'West'];

  const counts = {
    doors: data.readUInt16BE(0x0c),
    teleporters: data.readUInt16BE(0x0e),
    texts: data.readUInt16BE(0x10),
    sensors: data.readUInt16BE(0x12),
    creatures: data.readUInt16BE(0x14),
    weapons: data.readUInt16BE(0x16),
    clothes: data.readUInt16BE(0x18),
    scrolls: data.readUInt16BE(0x1a),
    potions: data.readUInt16BE(0x1c),
    containers: data.readUInt16BE(0x1e),
    misc: data.readUInt16BE(0x20),
  };

  const MAP_DEFS_OFFSET = 0x002c;
  const MAP_DATA_OFFSET = data.length - mapDataSize - 2;

  const maps = [];
  for (let i = 0; i < numMaps; i += 1) {
    const defBase = MAP_DEFS_OFFSET + i * 16;
    const mapDataRelOffset = data.readUInt16BE(defBase + 0x00);
    const mapOffsetX = data.readUInt8(defBase + 0x06);
    const mapOffsetY = data.readUInt8(defBase + 0x07);

    const sizeWord = data.readUInt16BE(defBase + 0x08);
    const height = ((sizeWord >> 11) & 0x1f) + 1;
    const width = ((sizeWord >> 6) & 0x1f) + 1;
    const level = sizeWord & 0x3f;

    const graphicsWord = data.readUInt16BE(defBase + 0x0a);
    const numFloorRand = (graphicsWord >> 12) & 0xf;
    const numFloor = (graphicsWord >> 8) & 0xf;
    const numWallRand = (graphicsWord >> 4) & 0xf;
    const numWall = graphicsWord & 0xf;

    const doorWord = data.readUInt16BE(defBase + 0x0e);
    const numDoorDeco = doorWord & 0xf;

    const tileBase = MAP_DATA_OFFSET + mapDataRelOffset;
    const grid = [];
    for (let x = 0; x < width; x += 1) {
      const col = [];
      for (let y = 0; y < height; y += 1) {
        const byte = data.readUInt8(tileBase + x * height + y);
        col.push({ type: TILE_TYPES[(byte >> 5) & 0x07], hasObjects: ((byte >> 4) & 0x01) === 1, attrs: byte & 0x0f });
      }
      grid.push(col);
    }

    maps.push({ mapIndex: i, level, width, height, mapOffsetX, mapOffsetY, numWall, numFloor, numDoorDeco, grid });
  }

  return {
    dungeonId, mapDataSize, numMaps, textDataWords, objListWords,
    startingPosition: { x: startX, y: startY, direction: DIRS[startDir] },
    objectCounts: counts,
    maps,
  };
}

function buildAscii(m) {
  const TYPE_CHAR = { Wall: '#', Floor: '.', Pit: 'P', Stairs: 'S', Door: 'D', Teleporter: 'T', TrickWall: 'W', Empty: ' ' };
  const rows = [];
  for (let y = 0; y < m.height; y += 1) {
    let row = '';
    for (let x = 0; x < m.width; x += 1) {
      const t = m.grid[x][y];
      let c = TYPE_CHAR[t.type] || '?';
      if (t.hasObjects && c !== '#') c = c.toLowerCase();
      row += c;
    }
    rows.push(row);
  }
  return rows;
}

function main() {
  const inputPath = process.argv[2];
  const mapIndexArg = process.argv[3];
  if (!inputPath) {
    console.error('Usage: node decode_amiga_dungeon_maps.cjs <decompressed Dungeon.dat> [mapIndex]');
    process.exit(1);
  }
  const data = fs.readFileSync(inputPath);
  const parsed = parseDungeonBE(data);
  console.log(JSON.stringify({
    dungeonId: parsed.dungeonId,
    numMaps: parsed.numMaps,
    mapDataSize: parsed.mapDataSize,
    textDataWords: parsed.textDataWords,
    objListWords: parsed.objListWords,
    startingPosition: parsed.startingPosition,
    objectCounts: parsed.objectCounts,
  }, null, 2));

  if (mapIndexArg !== undefined) {
    const m = parsed.maps[Number(mapIndexArg)];
    console.log(`\nMap ${m.mapIndex} - ${m.width}x${m.height}, level ${m.level}`);
    for (const row of buildAscii(m)) console.log(' ' + row);
  }
}

main();
