#!/usr/bin/env python3
"""把完整版正则（代码全写在正则里的「读者对话渲染1007.json」）固定到指定的完整 Commit SHA。

用法：python tools/pin_full.py <完整版.json> <40位commit SHA> [输出.json，默认覆盖输入]
- 相册 / 人格 / 世界书从 https://raw.githubusercontent.com/Adirm007/reader/<SHA>/ 读取；
- 旧版本提醒以写入的 version / content 为准（version 取自本仓库 release-manifest.json）。
推送到 main 并等 GitHub Actions「Update content indexes and pin latest」完成后，用 latest.json 里的 sha 运行。
可重复运行：已固定过的完整版会被改写成新的 SHA。
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = 'Adirm007/reader'
PIN_RE = re.compile(r'var DREAM_FULL_PIN=(?:null|\{[^\n]*?\});(?=if\(!window\.DREAM_READER_RELEASE&&DREAM_FULL_PIN\))')


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, sha = sys.argv[1], sys.argv[2].strip().lower()
    dst = sys.argv[3] if len(sys.argv) > 3 else src
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise SystemExit('需要完整的 40 位 commit SHA')
    m = json.load(open(os.path.join(ROOT, 'release-manifest.json'), encoding='utf-8'))
    d = json.load(open(src, encoding='utf-8'))
    s = d['replaceString']
    if len(PIN_RE.findall(s)) != 1:
        raise SystemExit('完整版里找不到 DREAM_FULL_PIN（需要 2026.10.08.1 及以后的版本）')
    pin = {'version': m['version'], 'content': int(m.get('content') or 0), 'rev': sha,
           'base': f'https://raw.githubusercontent.com/{REPO}/{sha}/', 'mode': 'full', 'loader': 0}
    d['replaceString'] = PIN_RE.sub(lambda _: 'var DREAM_FULL_PIN=' + json.dumps(pin, ensure_ascii=False, separators=(',', ':')) + ';', s)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('full pinned', m['version'], pin['content'], sha[:7])


if __name__ == '__main__':
    main()
