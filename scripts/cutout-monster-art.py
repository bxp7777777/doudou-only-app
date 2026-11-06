#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""白底抠图：边缘洪泛识别背景（只吃与画布边缘连通的纯白），羽化后居中裁切，输出透明 PNG。

用法：python -X utf8 scripts/cutout-monster-art.py [--preview 4]
- 输入 art-src/monsters/*.png（模型出的白底图）
- 输出 public/art/mobs/<id>.png（640 边长）与 public/art/bosses/<id>_pN.png（1024 边长）
"""
import os, sys, glob
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'monsters')
OUT_MOB = os.path.join(ROOT, 'public', 'art', 'mobs')
OUT_BOSS = os.path.join(ROOT, 'public', 'art', 'bosses')

def keep_big_blobs(mask, min_frac=0.0025):
    """丢掉面积很小的孤立碎点（边缘灰尘 / 远处小火星），只留主体与主要特效块。"""
    h, w = mask.shape
    total = float(mask.sum())
    keep = np.zeros((h, w), dtype=bool)
    seen = np.zeros((h, w), dtype=bool)
    # 逐连通块行洪泛，只保留面积够大的块
    for y in range(h):
        row = mask[y] & ~seen[y]
        for x0 in np.flatnonzero(row):
            seed = np.zeros((h, w), dtype=bool)
            seed[y, x0] = True
            stack = [(int(x0), y)]
            comp = np.zeros((h, w), dtype=bool)
            while stack:
                x, cy = stack.pop()
                if comp[cy, x] or not mask[cy, x]:
                    continue
                xl = x
                while xl > 0 and mask[cy, xl - 1] and not comp[cy, xl - 1]:
                    xl -= 1
                xr = x
                while xr < w - 1 and mask[cy, xr + 1] and not comp[cy, xr + 1]:
                    xr += 1
                comp[cy, xl:xr + 1] = True
                for ny in (cy - 1, cy + 1):
                    if 0 <= ny < h:
                        seg = mask[ny, xl:xr + 1] & ~comp[ny, xl:xr + 1]
                        for i in np.flatnonzero(seg):
                            stack.append((xl + int(i), ny))
            seen |= comp
            if comp.sum() >= max(64, total * min_frac):
                keep |= comp
    return keep

def border_fill(cand):
    """只把“与画布边缘连通”的白色当成背景，主体内部的白色高光不会被吃掉。"""
    h, w = cand.shape
    filled = np.zeros((h, w), dtype=bool)
    stack = []
    edge_x = np.flatnonzero(cand[0, :])
    for x in edge_x: stack.append((int(x), 0))
    edge_x = np.flatnonzero(cand[h - 1, :])
    for x in edge_x: stack.append((int(x), h - 1))
    edge_y = np.flatnonzero(cand[:, 0])
    for y in edge_y: stack.append((0, int(y)))
    edge_y = np.flatnonzero(cand[:, w - 1])
    for y in edge_y: stack.append((w - 1, int(y)))
    while stack:
        x, y = stack.pop()
        if filled[y, x] or not cand[y, x]:
            continue
        xl = x
        while xl > 0 and cand[y, xl - 1] and not filled[y, xl - 1]:
            xl -= 1
        xr = x
        while xr < w - 1 and cand[y, xr + 1] and not filled[y, xr + 1]:
            xr += 1
        filled[y, xl:xr + 1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < h:
                seg = cand[ny, xl:xr + 1] & ~filled[ny, xl:xr + 1]
                for i in np.flatnonzero(seg):
                    stack.append((xl + int(i), ny))
    return filled

def cut(path, size, margin=0.055, bg_min=232, bg_delta=14):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    arr = np.asarray(im).astype(np.int16)
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    cand = (mn >= bg_min) & ((mx - mn) <= bg_delta)
    filled = border_fill(cand)
    subject_mask = keep_big_blobs(~filled)
    alpha = np.where(subject_mask, 255, 0).astype(np.uint8)
    a = Image.fromarray(alpha, 'L')
    a = a.filter(ImageFilter.MinFilter(3))      # 先啃掉 1px 白边
    a = a.filter(ImageFilter.GaussianBlur(0.9)) # 再羽化
    im.putalpha(a)
    bbox = a.point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return None
    subject = im.crop(bbox)
    sw, sh = subject.size
    inner = int(round(size * (1 - margin * 2)))
    scale = min(inner / sw, inner / sh)
    nw, nh = max(1, round(sw * scale)), max(1, round(sh * scale))
    subject = subject.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(subject, ((size - nw) // 2, (size - nh) // 2), subject)
    cover = (nw * nh) / float(size * size)
    return canvas, (nw, nh), cover

def preview(path, cols=40, rows=20):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    w, h = im.size
    lines = []
    for r in range(rows):
        line = ''
        for c in range(cols):
            y0, y1 = int(r * h / rows), int((r + 1) * h / rows)
            x0, x1 = int(c * w / cols), int((c + 1) * w / cols)
            block = a[y0:y1, x0:x1]
            m = float(block.mean()) if block.size else 0
            line += '#' if m > 200 else '+' if m > 120 else '-' if m > 50 else '.' if m > 12 else ' '
        lines.append(line)
    return '\n'.join(lines)

def main():
    os.makedirs(OUT_MOB, exist_ok=True)
    os.makedirs(OUT_BOSS, exist_ok=True)
    args = sys.argv[1:]
    do_preview = 0
    if '--preview' in args:
        i = args.index('--preview')
        do_preview = int(args[i + 1]) if i + 1 < len(args) else 3
    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    bad = 0
    rows = []
    for p in files:
        name = os.path.splitext(os.path.basename(p))[0]
        is_boss = name.startswith(tuple(['slime_king', 'caramel_fox', 'tide_lord', 'honey_bear', 'moon_demon', 'cloud_whale', 'magma_drake', 'star_beast', 'prism_queen', 'peak_titan']))
        size = 640 if is_boss else 512
        out_dir = OUT_BOSS if is_boss else OUT_MOB
        dst = os.path.join(out_dir, name + '.png')
        try:
            res = cut(p, size)
            if not res:
                rows.append('%-18s EMPTY (抠图后没有主体)' % name); bad += 1; continue
            canvas, wh, cover = res
            # 256 色量化：PSNR≈38dB（显示尺寸下无感），体积只有真彩的 1/4
            canvas = canvas.quantize(colors=256, method=Image.FASTOCTREE)
            canvas.save(dst, 'PNG', optimize=True)
            kb = os.path.getsize(dst) / 1024
            flag = '' if 0.06 <= cover <= 0.85 else ' CHECK-COVER'
            rows.append('%-18s %4dx%4d fill=%4.1f%% %6.0fKB%s' % (name, wh[0], wh[1], cover * 100, kb, flag))
            if cover < 0.03 or cover > 0.95: bad += 1
            if do_preview > 0:
                do_preview -= 1
                rows.append(preview(dst))
        except Exception as exc:
            rows.append('%-18s FAILED %s' % (name, exc)); bad += 1
    print('\n'.join(rows))
    print('done files=%d bad=%d' % (len(files), bad))
    if bad: sys.exitCode = 1

if __name__ == '__main__':
    main()