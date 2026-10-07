#!/usr/bin/env python3
"""把 latest.json 与外链版正则固定到指定的完整 Commit SHA。

用法：python tools/pin_latest.py <40位commit SHA>
推送到 main 后由 GitHub Actions 自动运行；本地也可手动运行。
    latest.json                      读者渲染里的“旧版本提醒”读取它判断是否有新版本
    regex/读者对话渲染-外链版.json    导入酒馆用的外链版正则（只含完整 SHA 的 raw 地址）
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = 'Adirm007/reader'
MIN_LOADER = 2


def write(path, text):
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    if old != text:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        return True
    return False


def main():
    sha = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise SystemExit('需要完整的 40 位 commit SHA')
    m = json.load(open(os.path.join(ROOT, 'release-manifest.json'), encoding='utf-8'))
    base = f'https://raw.githubusercontent.com/{REPO}/{sha}/'
    latest = {'schema': 1, 'name': 'dream-reader-render', 'version': m['version'], 'content': int(m.get('content') or 0),
              'sha': sha, 'base': base, 'minLoader': MIN_LOADER}
    if m.get('notes'):
        latest['notes'] = m['notes']
    loader = open(os.path.join(ROOT, 'tools', 'loader.html'), encoding='utf-8').read().rstrip('\n')
    assert loader.count('__BASE__') == 1
    regex = json.load(open(os.path.join(ROOT, 'tools', 'regex-template.json'), encoding='utf-8'))
    regex['replaceString'] = '```html\n' + loader.replace('__BASE__', base) + '\n```'
    changed = write(os.path.join(ROOT, 'latest.json'), json.dumps(latest, ensure_ascii=False, indent=2) + '\n')
    changed |= write(os.path.join(ROOT, 'regex', '读者对话渲染-外链版.json'), json.dumps(regex, ensure_ascii=False, indent=2) + '\n')
    print(('pinned ' if changed else 'unchanged ') + sha)


if __name__ == '__main__':
    main()
