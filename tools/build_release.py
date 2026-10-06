#!/usr/bin/env python3
"""把完整版「读者对话渲染」正则拆成外链发布文件。

用法（在仓库根目录）：
    python tools/build_release.py <完整版读者对话渲染.json> [版本号]

会生成/更新：
    dist/reader.<hash>.css、dist/reader-body.<hash>.html、dist/reader.<hash>.js（内容寻址，旧文件可保留以兼容缓存）
    release-manifest.json（外链加载器读取的清单，含字节数与 SHA-256）
    regex/读者对话渲染-外链版.json（导入酒馆用的外链版正则）
然后 git add -A、commit、push 即可完成更新。
"""
import hashlib, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASES = ['https://adirm007.github.io/reader/', 'https://raw.githubusercontent.com/Adirm007/reader/main/',
         'https://cdn.jsdelivr.net/gh/Adirm007/reader@main/']
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
    css, body, js = split_render(src['replaceString'])
    files = {'reader.css': write_asset('reader', 'css', css), 'reader-body.html': write_asset('reader-body', 'html', body),
             'reader.js': write_asset('reader', 'js', js)}
    manifest = {'schema': 1, 'name': 'dream-reader-render', 'version': version, 'license': 'LICENSE', 'files': files}
    with open(os.path.join(ROOT, 'release-manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    loader = open(os.path.join(ROOT, 'tools', 'loader.html'), encoding='utf-8').read().rstrip('\n')
    loader = loader.replace('__BASES__', json.dumps(BASES))
    regex = dict(src)
    regex['id'] = 'b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007'
    regex['scriptName'] = '读者对话渲染-外链版'
    regex['replaceString'] = '```html\n' + loader + '\n```'
    os.makedirs(os.path.join(ROOT, 'regex'), exist_ok=True)
    with open(os.path.join(ROOT, 'regex', '读者对话渲染-外链版.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(regex, f, ensure_ascii=False, indent=2)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
