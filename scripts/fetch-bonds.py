#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载双宠羁绊同框图到 public/art/bonds/<bondId>.jpg，PIL 限边 quality82。
- BOND_ART 只登记已就绪双宠组；三宠组不生成位图，图鉴卡用成员立绘并排覆盖。
- 未登记组回响横幅仅显示 emoji 与彩蛋台词；下载失败不写文件，钩子保持为空，绝不白图。
用法：python -X utf8 scripts/fetch-bonds.py
"""
import os
import urllib.request
from io import BytesIO
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "art", "bonds")
os.makedirs(OUT_DIR, exist_ok=True)

JOBS = {
    "cuteDuo":       "https://aka.doubaocdn.com/s/VHfs9cVNNU",
    "cleverDuo":     "https://aka.doubaocdn.com/s/yghpmb01gN",
    "dragonPhoenix": "https://aka.doubaocdn.com/s/opXeVVu7Fq",
    "furryDuo":      "https://aka.doubaocdn.com/s/AUHo2ZDdlM",
    "waterLand":     "https://aka.doubaocdn.com/s/OxJNOmTK6k",
    "slowTide":      "https://aka.doubaocdn.com/s/kjBAXUlQ7f",
    "nightForest":   "https://aka.doubaocdn.com/s/iUUFGMYOoU",
    "royalDuo":      "https://aka.doubaocdn.com/s/5iqbtRouKy",
    "honeyHill":     "https://aka.doubaocdn.com/s/1RDOOu4MAH",
    "sunDance":      "https://aka.doubaocdn.com/s/9PUc78DNFI",
}

MAX_EDGE = 1280
QUALITY = 82


def main():
    lines = []
    for bid, url in JOBS.items():
        dst = os.path.join(OUT_DIR, f"{bid}.jpg")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            raw = urllib.request.urlopen(req, timeout=40).read()
            im = Image.open(BytesIO(raw)).convert("RGB")
            if max(im.size) > MAX_EDGE:
                s = MAX_EDGE / max(im.size)
                im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
            im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            kb = round(os.path.getsize(dst) / 1024, 1)
            lines.append(f"{bid:14s} art/bonds/{bid}.jpg  {im.size[0]}x{im.size[1]}  {kb} KB")
        except Exception as exc:
            lines.append(f"{bid:14s} FAILED: {exc} (未写盘)")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
