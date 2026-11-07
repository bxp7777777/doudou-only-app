#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按「某一张图」水平翻转立绘。

用法（参数就是检查页复制的清单）：
  python -X utf8 scripts/flip-art.py qilin_s1,wolf_s2,squid_s1
  python -X utf8 scripts/flip-art.py goodnight_p2,watcher_p1
  python -X utf8 scripts/flip-art.py --stage s1        # 所有成长体
  python -X utf8 scripts/flip-art.py --stage s2        # 所有究极体

规则：
  - 纯 id（qilin）           -> public/art/pets/qilin.png/.jpg
  - id_s1 / id_s2            -> public/art/pets-evo/id_s1.png/.jpg
  - id_p1/p2/p3              -> public/art/bosses/id_pN.png/.jpg，p1 顺带翻 id.jpg 底图
原图都在 git 里，翻错了 git checkout 就能回退。
"""
import os, sys, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'public', 'art')

def flip(path):
    im = Image.open(path)
    mode = im.mode
    rgb = im.convert('RGBA')
    out = rgb.transpose(Image.FLIP_LEFT_RIGHT)
    if mode == 'P':
        out = out.convert('RGB').quantize(colors=256, method=Image.FASTOCTREE)
    elif mode != 'RGBA':
        out = out.convert(mode)
    out.save(path, 'PNG', optimize=True) if path.lower().endswith('.png') else out.convert('RGB').save(path, quality=90)
    return os.path.getsize(path) // 1024

def targets(key):
    if key.endswith('_s1') or key.endswith('_s2'):
        base = os.path.join(ART, 'pets-evo', key)
        return [base + '.png', base + '.jpg']
    if key.endswith('_p1') or key.endswith('_p2') or key.endswith('_p3'):
        bid = key[:-3]
        base = os.path.join(ART, 'bosses', key)
        out = [base + '.png', base + '.jpg']
        if key.endswith('_p1'):
            out.append(os.path.join(ART, 'bosses', bid + '.jpg'))
        return out
    base = os.path.join(ART, 'pets', key)
    return [base + '.png', base + '.jpg']

def main():
    args = sys.argv[1:]
    stage = None
    if '--stage' in args:
        i = args.index('--stage')
        stage = args[i + 1] if i + 1 < len(args) else 's1'
        del args[i:i + 2]
    keys = [k.strip() for k in ','.join(args).split(',') if k.strip()]
    if stage:
        keys = sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(ART, 'pets-evo', '*_' + stage + '.png')))
    if not keys:
        print(__doc__); return
    done = 0
    for key in keys:
        for p in targets(key):
            if os.path.exists(p):
                try:
                    kb = flip(p)
                    print('flip %-28s %4dKB' % (os.path.basename(p), kb))
                    done += 1
                except Exception as e:
                    print('FAIL %-28s %s' % (os.path.basename(p), e))
        if not any(os.path.exists(p) for p in targets(key)):
            print('skip %-28s 没有这个文件' % key)
    print('done', done)

if __name__ == '__main__':
    main()
