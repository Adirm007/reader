#!/usr/bin/env python3
"""生成 personas/index.json（额外人格库在 GitHub 目录接口不可用时的备用索引）。由 GitHub Actions 自动运行，也可手动运行。

personas/ 里每个 .json 文件就是「人格管理 → 导出」得到的人格 JSON（单个人格，或 {"personas": [...]} / 数组形式的多个人格）。
sha 与 GitHub 目录接口返回的 git blob sha 相同，玩家端据此判断“有更新”。"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'personas')


def natural(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', name)]


def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def summaries(payload):
    items = payload if isinstance(payload, list) else payload.get('personas') if isinstance(payload, dict) and isinstance(payload.get('personas'), list) else [payload]
    author = str(payload.get('author', '')).strip()[:40] if isinstance(payload, dict) else ''
    out = []
    for p in items:
        if not isinstance(p, dict):
            continue
        name = str(p.get('systemName') or p.get('name') or '').strip()
        if not name:
            continue
        summary = re.sub(r'\s+', ' ', str(p.get('coreConcept') or p.get('role') or p.get('definition') or '')).strip()[:90]
        out.append({'name': name[:60], 'summary': summary, 'author': str(p.get('author') or author).strip()[:40]})
    return out


def main():
    os.makedirs(DIR, exist_ok=True)
    files = []
    for name in sorted((n for n in os.listdir(DIR) if n.lower().endswith('.json') and n.lower() != 'index.json'), key=natural):
        data = open(os.path.join(DIR, name), 'rb').read()
        try:
            payload = json.loads(data.decode('utf-8-sig'))
        except Exception as e:  # 坏文件不进索引，但不让整个索引失败
            print('skip', name, e)
            continue
        personas = summaries(payload)
        if personas:
            files.append({'file': name, 'sha': blob_sha(data), 'personas': personas})
    out = {'schema': 1, 'files': files}
    path = os.path.join(DIR, 'index.json')
    text = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if old != text:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print('updated', len(files))
    else:
        print('unchanged', len(files))


if __name__ == '__main__':
    main()
