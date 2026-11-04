#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
public/art 素材轻量压缩脚本（只重编码 / 等比缩限，不改文件名与扩展名，HTML 的 onerror 回退链不受影响）。
默认 dry-run 仅统计收益；加 --apply 才真正覆盖写盘。
用法：
  python scripts/compress-art.py            # 只看节省预估，不写文件
  python scripts/compress-art.py --apply    # 实际压缩覆盖
说明：
- 仅处理 .jpg/.jpeg；.png/.svg 跳过（避免破坏透明通道/矢量）。
- 只有重编码后体积下降到旧文件 92% 以下才覆盖，否则保留原图，避免越压越糟。
- 原图在 git 版本库中可随时 checkout 回退。
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public", "art")

# 各目录最长边上限（像素）；展示位较小，避免超大原图浪费流量
MAX_EDGE = {
    "bosses": 1024,
    "pets": 800,
    "pets-evo": 1024,
    "mobs": 640,
    "gear": 448,
    "icons": 448,
}
DEFAULT_MAX_EDGE = 1024
QUALITY = 82
BENEFIT_RATIO = 0.92  # 新体积须 <= 旧体积 * 0.92 才采用


def human(n):
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.2f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def target_edge(rel_dir):
    return MAX_EDGE.get(rel_dir, DEFAULT_MAX_EDGE)


def compress_one(path, apply):
    old = os.path.getsize(path)
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        return ("error", old, 0, str(e)[:60])
    rel_dir = os.path.relpath(os.path.dirname(path), ART).replace("\\", "/").split("/")[0]
    max_edge = target_edge(rel_dir)
    if max(im.size) > max_edge:
        scale = max_edge / max(im.size)
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    tmp = path + ".tmp.jpg"
    try:
        im.save(tmp, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    except Exception as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        return ("error", old, 0, str(e)[:60])
    new = os.path.getsize(tmp)
    if new <= old * BENEFIT_RATIO:
        if apply:
            os.replace(tmp, path)
        else:
            os.remove(tmp)
        return ("compressed", old, new, "")
    os.remove(tmp)
    return ("kept", old, old, "")


def main():
    apply = "--apply" in sys.argv
    totals = {"old": 0, "new": 0}
    by_dir = {}
    counts = {"compressed": 0, "kept": 0, "error": 0, "skipped": 0}
    for dirpath, _dirs, files in os.walk(ART):
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            rel_dir = os.path.relpath(dirpath, ART).replace("\\", "/").split("/")[0]
            if ext not in (".jpg", ".jpeg"):
                counts["skipped"] += 1
                continue
            p = os.path.join(dirpath, fn)
            status, old, new, msg = compress_one(p, apply)
            counts[status] = counts.get(status, 0) + 1
            totals["old"] += old
            totals["new"] += new
            d = by_dir.setdefault(rel_dir, {"old": 0, "new": 0})
            d["old"] += old
            d["new"] += new
            if status == "error":
                print(f"  [错误] {os.path.relpath(p, ROOT)}: {msg}")
    print("=" * 56)
    print("模式:", "实际写盘" if apply else "dry-run（未写盘，加 --apply 生效）")
    for name, d in sorted(by_dir.items()):
        saved = d["old"] - d["new"]
        print(f"  {name:10s} {human(d['old']):>10s} -> {human(d['new']):>10s}  省 {human(saved)}")
    saved = totals["old"] - totals["new"]
    pct = (saved / totals["old"] * 100) if totals["old"] else 0
    print("-" * 56)
    print(f"  合计       {human(totals['old']):>10s} -> {human(totals['new']):>10s}  省 {human(saved)} ({pct:.1f}%)")
    print(f"  文件统计 压缩 {counts.get('compressed',0)} · 保留 {counts.get('kept',0)} · 错误 {counts.get('error',0)} · 跳过非JPG {counts.get('skipped',0)}")


if __name__ == "__main__":
    main()
