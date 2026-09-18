#!/usr/bin/env python3
"""
Auto-rotates diagonally-posed weapon/wand/staff/key item icons so their
major axis is vertical, matching the upright billboard convention used
for creature sprites. Detects orientation via PCA on the alpha channel,
rotates, tightly recrops, and re-pastes onto a transparent canvas of the
SAME size as the original (so on-screen scale in the 3D billboard stays
consistent with untouched items).

Applied once on 2026-09-18 to the CANDIDATES list below (all items with
PCA elongation ratio >= 15, hand-picked after visual review of a contact
sheet). Re-run with --apply to redo, or edit CANDIDATES for new items
that turn out to have the same diagonal "product shot" pose problem.
Usage: python3 scripts/rotate_upright_items.py --apply [--out=<dir>]
(omit --apply for a dry run; omit --out to overwrite in place).
"""
import sys
import numpy as np
from PIL import Image

ITEMS_DIR = "/Users/softhook/Documents/GitHub/dungeonMaster/public/game/images/items"

CANDIDATES = [
    "staff", "stick", "arrow", "samurai_sword", "slayer", "wand_empty",
    "flamitt_empty", "wand", "wand_full", "sword", "torch_used_2",
    "torch_used_1", "yew_staff_empty", "yew_staff", "yew_staff_full",
    "torch_lit", "falchion", "torch_unlit", "sabre", "bolt_blade_empty",
    "flamitt_full", "bolt_blade_full", "long_bow", "club", "the_inquisitor",
    "staff_of_claws_empty", "rapier", "morningstar", "bow", "dragon_spit",
    "mace", "skeleton_key", "ruby_key", "mace_of_order", "tourquoise_key",
    "dagger", "key_of_b", "teowand_empty", "teowand", "teowand_full",
    "sapphire_key", "diamond_edge", "delta", "the_firestaff_complete",
    "sceptre_of_lyf", "sceptre_of_lyf_full", "sceptre_of_lyf_empty",
    "poison_dart", "iron_key", "stone_club", "the_firestaff", "onyx_key",
]


def alpha_bbox(arr, pad_frac=0.04):
    alpha = arr[:, :, 3]
    ys, xs = np.nonzero(alpha > 10)
    if len(xs) == 0:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0, y1 - y0
    pad = int(max(w, h) * pad_frac)
    return (max(0, x0 - pad), max(0, y0 - pad), x1 + pad + 1, y1 + pad + 1)


def pca_angle(arr):
    alpha = arr[:, :, 3]
    ys, xs = np.nonzero(alpha > 10)
    xs_c = xs - xs.mean()
    ys_c = ys - ys.mean()
    cov = np.cov(xs_c, ys_c)
    evals, evecs = np.linalg.eigh(cov)
    major = evecs[:, np.argmax(evals)]
    angle = np.degrees(np.arctan2(major[1], major[0]))
    if angle < -90:
        angle += 180
    if angle > 90:
        angle -= 180
    return angle


def process(name, out_dir=None, dry_run=True):
    path = f"{ITEMS_DIR}/{name}.png"
    im = Image.open(path).convert("RGBA")
    orig_size = im.size
    arr = np.array(im)
    angle = pca_angle(arr)

    rotated = im.rotate(angle + 90, expand=True, resample=Image.BICUBIC)
    rarr = np.array(rotated)
    bbox = alpha_bbox(rarr)
    if bbox is None:
        print(f"SKIP {name}: no content after rotation")
        return
    cropped = rotated.crop(bbox)

    # Fit cropped content into a canvas of the ORIGINAL size, preserving aspect,
    # centered, so on-screen scale stays consistent with untouched items.
    canvas = Image.new("RGBA", orig_size, (0, 0, 0, 0))
    cw, ch = cropped.size
    scale = min(orig_size[0] / cw, orig_size[1] / ch)
    new_size = (max(1, round(cw * scale)), max(1, round(ch * scale)))
    resized = cropped.resize(new_size, Image.LANCZOS)
    offset = ((orig_size[0] - new_size[0]) // 2, (orig_size[1] - new_size[1]) // 2)
    canvas.paste(resized, offset, resized)

    target = f"{out_dir}/{name}.png" if out_dir else path
    if not dry_run:
        canvas.save(target)
    print(f"{'[dry] ' if dry_run else ''}{name}: angle={angle:.1f} orig={orig_size} -> {target}")


if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv
    out_dir = None
    for arg in sys.argv:
        if arg.startswith("--out="):
            out_dir = arg.split("=", 1)[1]
    for name in CANDIDATES:
        try:
            process(name, out_dir=out_dir, dry_run=dry_run)
        except FileNotFoundError:
            print(f"MISSING: {name}")
