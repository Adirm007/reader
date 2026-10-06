#!/usr/bin/env python3
"""生成 gallery/index.json（相册在 GitHub 目录接口不可用时的备用索引）。由 GitHub Actions 自动运行，也可手动运行。"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GALLERY = os.path.join(ROOT, 'gallery')
IMAGE = re.compile(r'\.(png|jpe?g|webp|gif|avif|bmp)$', re.I)


def natural(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', name)]


def main():
    names = sorted((n for n in os.listdir(GALLERY) if IMAGE.search(n) and os.path.isfile(os.path.join(GALLERY, n))), key=natural)
    out = {'schema': 1, 'images': names, 'links': 'links.txt'}
    path = os.path.join(GALLERY, 'index.json')
    text = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if old != text:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print('updated', len(names))
    else:
        print('unchanged', len(names))


if __name__ == '__main__':
    main()
