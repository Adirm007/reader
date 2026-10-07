#!/usr/bin/env python3
"""相册 / 人格 / 世界书索引有变化时，把 release-manifest.json 的 content 计数加一（由 GitHub Actions 调用）。
外链固定在完整 Commit SHA 后，这些内容也随版本号一起固定；计数变大会让用户收到“内容更新”提醒。"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'release-manifest.json')
m = json.load(open(p, encoding='utf-8'))
m['content'] = int(m.get('content') or 0) + 1
keys = ['schema', 'name', 'version', 'content']
out = {k: m[k] for k in keys if k in m}
out.update({k: v for k, v in m.items() if k not in out})
with open(p, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('content', m['content'])
