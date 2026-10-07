#!/usr/bin/env python3
"""生成 worldbook/manifest.json（读者对话渲染的“世界书更新”据此比对版本）。由 GitHub Actions 自动运行，也可手动运行。

- 版本号写在条目正文第一行的 EJS 注释里（渲染后为空，正文 LLM 读不到）：
      <%_ /* DREAM_WORLDBOOK reader-core v2026.10.07.5 */ _%>
  改条目时把这一行的版本号调高即可；玩家端看到更高的版本就会弹窗提示更新。
- worldbook/entries.json 记录每个条目的固定信息：id、条目名、文件、旧版识别规则、插入设置。
- worldbook/notes.txt（可选）是弹窗里显示的更新说明。"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'worldbook')
MARK = re.compile(r'DREAM_WORLDBOOK\s+([A-Za-z0-9_.-]+)\s+v([0-9][0-9A-Za-z_.-]*)')


def vkey(v):
    return [int(x) if x.isdigit() else 0 for x in re.split(r'[.\-_]', v)]


def main():
    specs = json.load(open(os.path.join(DIR, 'entries.json'), encoding='utf-8'))
    entries = []
    for spec in specs['entries']:
        path = os.path.join(ROOT, spec['file'])
        data = open(path, 'rb').read()
        head = data[:800].decode('utf-8', 'replace')
        m = MARK.search(head)
        if not m or m.group(1) != spec['id']:
            raise SystemExit(f"{spec['file']}: 第一行缺少版本标记 DREAM_WORLDBOOK {spec['id']} v<版本号>")
        entries.append({**spec, 'version': m.group(2), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    version = max((e['version'] for e in entries), key=vkey) if entries else '0'
    notes_path = os.path.join(DIR, 'notes.txt')
    notes = open(notes_path, encoding='utf-8').read().strip() if os.path.exists(notes_path) else ''
    out = {'schema': 1, 'name': specs.get('name', 'dream-reader-worldbook'), 'version': version, 'notes': notes, 'entries': entries}
    text = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
    target = os.path.join(DIR, 'manifest.json')
    old = open(target, encoding='utf-8').read() if os.path.exists(target) else ''
    if old != text:
        with open(target, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print('updated', version)
    else:
        print('unchanged', version)


if __name__ == '__main__':
    main()
