#!/usr/bin/env python3
"""把完整版「读者对话渲染」正则拆成外链发布文件。

用法（在仓库根目录）：
    python tools/build_release.py <完整版读者对话渲染.json> [版本号] [更新说明]

会生成/更新：
    dist/reader.<hash>.css、dist/reader-body.<hash>.html、dist/reader.<hash>.js（内容寻址，旧文件保留）
    release-manifest.json（外链加载器读取的清单，含字节数与 SHA-256；content 计数沿用）
    tools/regex-template.json（外链版正则除替换内容以外的字段）
然后 git add -A、commit、push。推送后 GitHub Actions 会自动：
    把 latest.json 与 regex/读者对话渲染-外链版.json 固定到刚推送的完整 Commit SHA（tools/pin_latest.py）。
外链只允许完整 Commit SHA 的 GitHub raw 地址，用户需要改版本号（或在提醒弹窗一键替换）才会更新。
"""
import hashlib, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLACEHOLDER = '<!--DREAM_LETTER-->'


def split_render(html):
    if html.startswith('```html\n'):
        html = html[len('```html\n'):]
    html = html.rstrip()
    if html.endswith('```'):
        html = html[:-3].rstrip()
    m = re.fullmatch(r'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
                     r'<style>(?P<css>.*?)</style></head><body>(?P<body>.*?)<script>(?P<js>.*)</script></body></html>', html, re.S)
    if not m:
        raise SystemExit('完整版结构与预期不符：需要 head 内唯一 <style> 与 body 末尾唯一 <script>')
    css, body, js = m.group('css'), m.group('body'), m.group('js')
    if body.count('$1') != 1:
        raise SystemExit('正文中应恰好有一个 $1 占位')
    if '</script' in js or '<script' in body:
        raise SystemExit('出现额外 <script>，无法安全拆分')
    return css, body.replace('$1', PLACEHOLDER), js


def write_asset(name, ext, text):
    data = text.encode('utf-8')
    sha = hashlib.sha256(data).hexdigest()
    rel = f'dist/{name}.{sha[:12]}.{ext}'
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, 'wb') as f:
            f.write(data)
    return {'path': rel, 'bytes': len(data), 'sha256': sha}


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = json.load(open(sys.argv[1], encoding='utf-8'))
    version = sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().strftime('%Y.%m.%d')
    # 完整版里固定的 SHA 信息不带进外链版：外链版的版本信息由 loader 提供（DREAM_READER_RELEASE）。
    src['replaceString'] = re.sub(r'var DREAM_FULL_PIN=\{[^\n]*?\};(?=if\(!window\.DREAM_READER_RELEASE&&DREAM_FULL_PIN\))', 'var DREAM_FULL_PIN=null;', src['replaceString'])
    css, body, js = split_render(src['replaceString'])
    files = {'reader.css': write_asset('reader', 'css', css), 'reader-body.html': write_asset('reader-body', 'html', body),
             'reader.js': write_asset('reader', 'js', js)}
    prev = {}
    try:
        prev = json.load(open(os.path.join(ROOT, 'release-manifest.json'), encoding='utf-8'))
    except FileNotFoundError:
        pass
    manifest = {'schema': 1, 'name': 'dream-reader-render', 'version': version, 'content': int(prev.get('content') or 0),
                'license': 'LICENSE', 'files': files}
    if len(sys.argv) > 3 and sys.argv[3].strip():
        manifest['notes'] = sys.argv[3].strip()
    with open(os.path.join(ROOT, 'release-manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    template = {k: v for k, v in src.items() if k != 'replaceString'}
    template['id'] = 'b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007'
    template['scriptName'] = '读者对话渲染-外链版'
    with open(os.path.join(ROOT, 'tools', 'regex-template.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(template, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
