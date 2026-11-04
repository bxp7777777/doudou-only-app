#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载 5 只关键宠的二阶进化图 s2，PIL 限边 quality82 落盘到 public/art/pets-evo/<id>_s2.jpg。
- 文件名固定为 game.html evoArtUrl 期望的 *_s2.jpg；落盘后在 PET_EVO_STAGE2 登记对应键即接入。
- 下载/编码失败时不写文件，保持 s1 与 emoji 回退链不变，绝不产生白图。
用法：python -X utf8 scripts/fetch-evo-s2.py
"""
import os
import urllib.request
from io import BytesIO
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "art", "pets-evo")

# templateId: 下载URL；落盘名 = <id>_s2.jpg
JOBS = {
    "pig":      "https://aka.doubaocdn.com/s/WVJzDbGqj3",
    "golden":   "https://aka.doubaocdn.com/s/nDN4tyKrR7",
    "dragon":   "https://aka.doubaocdn.com/s/JwmF2hX3CO",
    "lion":     "https://aka.doubaocdn.com/s/paq04Mu2l6",
    "unicorn":  "https://aka.doubaocdn.com/s/TY6TDFcrwk",
}

MAX_EDGE = 1024
QUALITY = 82


def main():
    lines = []
    for pid, url in JOBS.items():
        dst = os.path.join(OUT_DIR, f"{pid}_s2.jpg")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            raw = urllib.request.urlopen(req, timeout=40).read()
            im = Image.open(BytesIO(raw)).convert("RGB")
            if max(im.size) > MAX_EDGE:
                s = MAX_EDGE / max(im.size)
                im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
            im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            kb = round(os.path.getsize(dst) / 1024, 1)
            lines.append(f"{pid:8s} pets-evo/{pid}_s2.jpg  {im.size[0]}x{im.size[1]}  {kb} KB")
        except Exception as exc:
            lines.append(f"{pid:8s} FAILED: {exc} (未写盘，保留回退)")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
