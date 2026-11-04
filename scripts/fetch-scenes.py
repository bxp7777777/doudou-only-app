#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把生成的主页实景空景背景下载并轻压缩落盘到 public/art/scenes/。
- 仅下载清单内 URL；PIL 转 RGB、限最长边、quality82 重存，保持 jpg 扩展名。
- 产物由 game.html 的 SCENE_PHOTOS 按 bg id 引用；文件缺失时 CSS 渐变自动兜底，不白图。
用法：python -X utf8 scripts/fetch-scenes.py
"""
import os
import urllib.request
from io import BytesIO
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "art", "scenes")
os.makedirs(OUT_DIR, exist_ok=True)

# (bg_id 对应 game.html state.cosmetics.background, 下载URL, 落盘文件名)
JOBS = [
    ("bg_cream",   "https://aka.doubaocdn.com/s/0lfRT8Jsf8", "scene_cream.jpg"),
    ("bg_sakura",  "https://aka.doubaocdn.com/s/0N0RakUKkU", "scene_sakura.jpg"),
    ("bg_starry",  "https://aka.doubaocdn.com/s/XYuAMxuOfC", "scene_starry.jpg"),
    ("bg_forest",  "https://aka.doubaocdn.com/s/WaGALPWvOT", "scene_forest.jpg"),
]

MAX_EDGE = 1600
QUALITY = 82


def main():
    summary = []
    for bg_id, url, fn in JOBS:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=40).read()
        im = Image.open(BytesIO(raw)).convert("RGB")
        if max(im.size) > MAX_EDGE:
            s = MAX_EDGE / max(im.size)
            im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
        dst = os.path.join(OUT_DIR, fn)
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        size_kb = round(os.path.getsize(dst) / 1024, 1)
        summary.append(f"{bg_id:10s} -> art/scenes/{fn}  {im.size[0]}x{im.size[1]}  {size_kb} KB")
    print("\n".join(summary))


if __name__ == "__main__":
    main()
