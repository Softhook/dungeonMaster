# Amiga Remake Progress

State reviewed on `2026-09-18`.

This document tracks the project's shift toward matching the **Amiga** version of *Dungeon Master* specifically (as opposed to the Atari ST/PC-derived data the core extraction pipeline was originally built from). It's a working log: what's been sourced and shipped, what's confirmed vs. still assumed, and what's open.

For the rest of the project's state, see [PROJECT_STATE_INDEX.md](./PROJECT_STATE_INDEX.md).

## Why Amiga

The project's original data pipeline (`assets/OriginalDataExtraction/`) was built from Atari ST source (ReDMCSB Release 2) and PC data (`EUDATA/`). Christian wants the remake to move toward matching the Amiga release instead. Scope so far has been agreed as **visual & audio fidelity**, not a full data pipeline switch, because:

- Amiga and Atari ST share the same `Dungeon.dat`/`Graphics.dat` file format and naming (confirmed by reading `FILENAME.C` in the Amiga ReDMCSB source — only the AmigaDOS volume paths differ, e.g. `DungeonMaster:Dungeon.dat`). No evidence so far that gameplay/stat tables differ between platforms.
- The renderer is a modern 3D remake (React Three Fiber) with custom 512–640px textures and React-built UI, not a sprite port — so the original Amiga `IMG1` bitmaps (UI panels, item icons, wall tiles) have no direct drop-in slot the way sound effects do.

## Sources

- **ReDMCSB** (`dmweb.free.fr/community/redmcsb/`, WIP 2021-02-06 release) — reconstructed 68k engine source for all DM/CSB platforms including Amiga. Gives us engine *logic* (how graphics/palettes/sound are read and rendered), not game assets. Key Amiga-specific files: `AMIGAVID.C`, `AMIGALIB.C`, `AMIGINIT.C`, `PALETTE.C`, `SOUND.C`, `SWSHSND.C`, `AMIGA.H`.
- **Real Amiga disk dump**, supplied by Christian: `assets/OriginalDataExtraction/OriginalAmigaGame/Floppy Disks ADF/Dungeon Master for Amiga v3.6 (English, French, German).adf`. This is the only Amiga disk kept locally — other versions (2.0–2.2), IPF flux images, and a fan Atari-ST-ported-to-Amiga hack (Meynaf) were deleted after confirming they weren't needed. Not git-tracked (`.gitignore`'d, same convention as `OriginalAtariGame/`/`EUDATA/`).

## Confirmed findings

- Amiga DM v3.6 / CSB use a **32-color palette**, not the Atari ST's 16 colors (`PALETTE.C`, `MEDIA746_A36M_A31E_A31M_A33M_A35E_A35M` branches). Earlier Amiga versions (2.0–2.2) stay at 16 colors.
- Amiga sound is Paula 4-channel 8-bit PCM sample playback, not the Atari ST's YM2149 tone generator — genuinely different in kind, not just quality.
- The real `Graphics.DAT` on the v3.6 disk is big-endian `DMCSB2` format with LZW-compressed entries, and the existing `extract_graphics_entry.cjs` (originally written for Atari/PC) decodes it correctly with **zero changes** — auto-detects endianness and header type.
- All 33 `SND2` sound-effect entries in `Graphics.DAT` play at a single fixed rate, not per-sound pitch: derived from `SOUND.C`'s `ioa_Period = 72800 / Period` formula with `Period = 112` (confirmed against the `byte3` field, uniformly `112`, in the already-extracted `output/atari_i562_stats.json` sound table) → **~5457 Hz** at the Amiga's PAL clock (3546895 Hz). Cross-checked against the Atari ST's independently-derived ~5486 Hz (same source file, different platform branch) — close enough to confirm both platforms target the same real-world pitch/duration.

## Shipped (`0.9.5`)

- Extracted and converted all 33 Amiga `SND2` sound-effect entries to WAV/MP3 at the derived ~5457 Hz rate.
- Matched by name to 32 of the 37 files in `public/game/sounds/` (e.g. "Falling item" → `falling_item.wav`, "Switch" → `clic.wav`) and replaced them in place. Verified by checksum that the replaced files exactly match the new extraction and differ from the prior git-tracked versions.
- 4 existing sound files have no Amiga `SND2` counterpart and were left untouched: `attack_whoosh.wav`, `cry.mp3`, `footstep.mp3`, `step.mp3`.
- Added `assets/OriginalDataExtraction/extract_amiga_sounds.cjs` so the extraction is reproducible from the kept ADF.
- Christian did an in-browser listening pass and confirmed the new sounds play correctly in-game.

## Combat/spell timing tables (`i559`/`i560`/`i561`/`i562`) — checked, essentially identical

Re-supplied `Dungeon Master for Amiga v2.0 (English).adf` specifically because its 5 stat-table blobs (indices `558`–`562`, labeled "Various Data, Structure described in CSBwin source code") sit at the *exact same indices* as Atari ST v1.1, unlike v3.6 where they've been merged into one unlabeled 9,176-byte blob at index `696`. Ran the existing `decode_i559/560/561/562_blob.cjs` scripts (written for Atari) against the real Amiga blobs with **zero code changes**:

- `i559` (creature stats): all **27 creatures** identical to Atari on every combat field — `movementTicks`, `attackTicks`, `defense`, `baseHealth`, `attack`, `poisonAttack`, `dexterity`.
- `i560` (attacks & spells): all **25 spells** identical, including `recoveryTicks`. Of **44 attacks**, 43 identical; **one real difference found**: "War Cry"'s `skillNumber` is `14` on Atari ST vs. `7` on Amiga v2.0.
- `i562` (drop order, sound table, palette/color maps): every field identical.
- `i561` (UI button/key tables): byte-count differs (2004 vs. 2052), most likely because the Atari reference build (v1.1) and Amiga build (v2.0) are different-enough versions, not a platform difference — unconfirmed either way.

## `Dungeon.dat` (map/item/monster placement) — checked, essentially identical

Found that `docs/EXTERNAL_REFERENCE_IMPORT_AUDIT.md` already documented the compressed dungeon format (`0x8104` signature, 4 most-common + 16 less-common byte dictionary, `0xx`/`10xxxx`/`11xxxxxxxx` MSB-first bitstream), and `parse_full.cjs` already implements the decompressor (`decodeCompressedDungeon`) — but hardcoded little-endian for PC. The bitstream itself is byte-oriented and endian-agnostic; only the 3 multi-byte header fields need big-endian reads for Atari ST/Amiga.

- Added `decode_amiga_dungeon.cjs` — a big-endian header variant of the same decompressor. Ran it against the real Amiga v2.0 `Dungeon.dat`: consumed the entire 25,006-byte compressed file exactly and produced exactly the declared 33,444-byte output with no errors.
- The decompressed buffer's header reads correctly as big-endian: `dungeonId = 99` (the documented "99 = Dungeon Master" signature), `numMaps = 14` — confirms the decompression is correct and the underlying struct layout matches the PC format exactly, just byte-swapped.
- **Object counts** (from the decompressed header) vs. the existing PC-derived `output/dungeon.json`: doors, teleporters, texts, creatures, weapons, armor, scrolls, potions, containers, and misc items are **exactly identical** (170/179/125/182/107/121/35/56/12/280). Only `sensors` differs by one (683 Amiga vs. 684 PC) — unconfirmed whether that's a real difference or a parsing/reserved-slot quirk.
- Added `decode_amiga_dungeon_maps.cjs` — a big-endian port of `parse_dungeon.js`'s tile-grid reader. Compared all 14 maps' tile-by-tile layout (wall/floor/pit/stairs/door/teleporter/trick-wall) against the PC `output/dungeon.json`: **12,004 tiles compared, only 4 differ** (all in map 5), and those 4 sit in maps where my quick width/height decode is off by one tile — likely a parsing edge case on my side, not a real map difference, since the other 13 maps (including the full 32×32 ones) are **byte-for-byte identical**, tile type and object-presence flag included.
- **Not yet done:** per-object field decoding (the actual creature-type/item-type and exact tile position of each of the ~1,850 placed objects) — only counts and the tile grid have been checked so far, not individual placement records. That would mean porting more of `parse_full.cjs`'s object-list traversal to big-endian.

**Bottom line so far: map layout, item counts, and monster counts appear to be effectively identical between the Amiga and PC/Atari versions of Dungeon Master.** No evidence yet of a real placement difference anywhere.

## Open / not done

- **No pixel-level Amiga image decoder yet.** `extract_graphics_entry.cjs` pulls the raw decompressed blob per `IMG1`/`RAW1`/etc. entry, but nothing converts Amiga planar bitplane data + a 16/32-color palette into actual pixels. Needed before any real use of the original graphics (reference art, a possible classic-mode toggle, or texture re-grading).
- **No decision yet on what "visual fidelity" means given the 3D renderer.** Options raised but not chosen: (a) treat original Amiga art as reference/inspiration only for re-texturing, (b) build a real toggleable classic 2D/retro mode (large effort, would need the bitplane decoder above plus a parallel 2D rendering path), (c) skip visuals entirely and stay audio-only.
- **Only v2.0 and v3.6 have been examined.** v2.1/v2.2 ADFs are present but marked "Original (Not working)" (likely copy-protected/needs cracking) and haven't been tried; if per-version differences ever matter (e.g. bug fixes — see ReDMCSB's `BugsAndChanges.htm`, which documents real behavior differences between Amiga 2.x and 3.x), those are the versions to check.
- **The "War Cry" `skillNumber` difference (14 vs. 7) hasn't been chased down** — don't yet know which skill index that maps to or what it actually changes in play.
- **Per-object placement records not yet decoded.** Map tile grids and object *counts* match almost exactly, but the actual creature-type/item-type and exact position of each individual placed object hasn't been verified — would need porting more of `parse_full.cjs`'s object-list traversal to big-endian.
- **The 4-tile / off-by-one-width discrepancy in 3 of 14 maps hasn't been root-caused** — likely a bug in the quick comparison script's width/height bit decoding, not a real map difference, but unconfirmed.
- **The one-off `sensors` count difference (683 vs. 684) hasn't been root-caused.**
- **No audio balance/QA pass.** Sounds are confirmed playing, but nobody has checked relative volume/loudness against the old sound set, or listened to all 33 in context.
- `DungeonF.DAT` / `DungeonG.DAT` (French/German dungeon files also present on the disk) haven't been looked at — likely irrelevant unless multi-language support becomes a goal.

## Suggested next steps (roughly ordered)

1. Do a fuller audio playtest pass — all 33 replaced sounds, in context, checking for volume/gain mismatches against the sounds they replaced.
2. Decide the visual-fidelity scope (see options above) before investing in a bitplane/palette decoder — that's a real chunk of reverse-engineering work and shouldn't start without a clear target.
3. If proceeding with visuals: write the Amiga `IMG1` planar-to-chunky + palette decoder referencing `AMIGAVID.C`/`PALETTE.C`, output to a reference folder first (not wired into the game) so the art can inform re-texturing decisions.
4. Look up what skill index 7 vs. 14 actually means (`ORIGINAL_SKILLS_AND_EXPERIENCE.md`) to understand the War Cry discrepancy.
5. If placement-level fidelity ever matters beyond counts/tiles, port `parse_full.cjs`'s object-list traversal to big-endian and diff actual creature/item positions.
6. Keep this document updated as new Amiga-sourced work lands, the same way `REMAKE_STATUS.md` tracks the main project.
