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

## Open / not done

- **No pixel-level Amiga image decoder yet.** `extract_graphics_entry.cjs` pulls the raw decompressed blob per `IMG1`/`RAW1`/etc. entry, but nothing converts Amiga planar bitplane data + a 16/32-color palette into actual pixels. Needed before any real use of the original graphics (reference art, a possible classic-mode toggle, or texture re-grading).
- **No decision yet on what "visual fidelity" means given the 3D renderer.** Options raised but not chosen: (a) treat original Amiga art as reference/inspiration only for re-texturing, (b) build a real toggleable classic 2D/retro mode (large effort, would need the bitplane decoder above plus a parallel 2D rendering path), (c) skip visuals entirely and stay audio-only.
- **Only v3.6 (EN/FR/DE) has been examined.** Earlier 16-color Amiga versions (2.0–2.2) were available but deleted before any comparison; if per-version differences ever matter (e.g. bug fixes — see ReDMCSB's `BugsAndChanges.htm`, which documents real behavior differences between Amiga 2.x and 3.x), they're gone and would need re-sourcing.
- **No byte-level diff done between Amiga and Atari/PC `Dungeon.dat`/`Graphics.dat` data tables.** The "shared format, so shared data" conclusion is based on reading the engine source's file-handling code, not on actually comparing extracted item/creature/spell tables entry-by-entry. Worth doing before fully trusting it.
- **No audio balance/QA pass.** Sounds are confirmed playing, but nobody has checked relative volume/loudness against the old sound set, or listened to all 33 in context.
- `DungeonF.DAT` / `DungeonG.DAT` (French/German dungeon files also present on the disk) haven't been looked at — likely irrelevant unless multi-language support becomes a goal.

## Suggested next steps (roughly ordered)

1. Do a fuller audio playtest pass — all 33 replaced sounds, in context, checking for volume/gain mismatches against the sounds they replaced.
2. Decide the visual-fidelity scope (see options above) before investing in a bitplane/palette decoder — that's a real chunk of reverse-engineering work and shouldn't start without a clear target.
3. If proceeding with visuals: write the Amiga `IMG1` planar-to-chunky + palette decoder referencing `AMIGAVID.C`/`PALETTE.C`, output to a reference folder first (not wired into the game) so the art can inform re-texturing decisions.
4. Spot-check a handful of Amiga `Dungeon.dat`/`Graphics.dat` stat entries against the existing Atari-derived `output/atari_i55x_stats.json` files to confirm the "shared data" assumption before leaning on it further.
5. Keep this document updated as new Amiga-sourced work lands, the same way `REMAKE_STATUS.md` tracks the main project.
