#!/usr/bin/env python3
"""Build a fixed reader regex from a committed source snapshot.

Prepare: python tools/build_fixed_release.py VERSION --prepare-manifest
Build:   python tools/build_fixed_release.py VERSION FULL_COMMIT_SHA [--output PATH]
The generated regex embeds the manifest's SHA-256. Nothing is read from main
at runtime, and no version-to-commit mapping is fetched from a mutable server.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
NUMERIC_VERSION = re.compile(r"[0-9]+(?:\.[0-9]+){1,3}\Z")
COMMIT_SHA = re.compile(r"[a-f0-9]{40}\Z")
FIXED_ID = "cfc0375e-3c5c-4ea1-8b7b-2093c7df0a11"
FIXED_MANIFEST = "fixed-release-manifest.json"


def committed_bytes(commit, path):
    return subprocess.check_output(
        ["git", "show", f"{commit}:{path}"], cwd=ROOT, stderr=subprocess.PIPE
    )


def prepare_manifest(version):
    if not NUMERIC_VERSION.fullmatch(version):
        raise ValueError("版本号须为 2–4 段数字，例如 1.0.0 或 2026.10.27.1")
    manifest = json.loads((ROOT / "release-manifest.json").read_bytes())
    if manifest.get("version") != version:
        raise ValueError("请先构建对应数字版本的 release-manifest.json")
    manifest["name"] = "dream-reader-render-fixed"
    manifest["resources"] = {}
    for folder in ("gallery", "personas", "worldbook", "vendor"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_symlink():
                raise ValueError(f"固定版资源不能使用符号链接：{path}")
            if not path.is_file():
                continue
            relative = path.relative_to(ROOT).as_posix()
            data = path.read_bytes()
            manifest["resources"][relative] = {
                "path": relative, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()
            }
    (ROOT / FIXED_MANIFEST).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def build_fixed_regex(version, commit):
    if not NUMERIC_VERSION.fullmatch(version):
        raise ValueError("版本号须为 2–4 段数字，例如 1.0.0 或 2026.10.27.1")
    if not COMMIT_SHA.fullmatch(commit):
        raise ValueError("请提供完整的 40 位小写源代码提交 SHA")
    resolved = subprocess.check_output(
        ["git", "rev-parse", f"{commit}^{{commit}}"], cwd=ROOT, text=True
    ).strip()
    if resolved != commit:
        raise ValueError("源代码提交 SHA 不是指定的完整提交")

    data = committed_bytes(commit, FIXED_MANIFEST)
    manifest = json.loads(data)
    if manifest.get("schema") != 1 or manifest.get("name") != "dream-reader-render-fixed":
        raise ValueError("不支持的读者发布清单")
    if manifest.get("version") != version:
        raise ValueError("数字版本号必须与源提交内 fixed-release-manifest.json 的版本一致")
    specs = [(name, manifest["files"][name]) for name in ("reader.css", "reader-body.html", "reader.js")]
    if not isinstance(manifest.get("resources"), dict):
        raise ValueError("固定版清单缺少 resources 哈希目录")
    specs.extend(manifest["resources"].items())
    for name, spec in specs:
        path = spec["path"]
        parts = path.split("/")
        if (parts[0] not in ("dist", "gallery", "personas", "worldbook", "vendor")
                or len(parts) < 2 or any(part in ("", ".", "..") for part in parts)
                or any(char in path for char in "\\?#\x00\r\n")):
            raise ValueError(f"无效资源路径：{path}")
        if name in manifest["resources"] and name != path:
            raise ValueError(f"资源目录键与路径不符：{name}")
        content = committed_bytes(commit, path)
        if spec["bytes"] != len(content) or spec["sha256"] != hashlib.sha256(content).hexdigest():
            raise ValueError(f"源提交的资源与清单不符：{name}")

    config = {
        "schema": 1,
        "repository": "Adirm007/reader",
        "version": version,
        "sourceCommit": commit,
        "manifestSha256": hashlib.sha256(data).hexdigest(),
    }
    loader = (ROOT / "tools" / "fixed-loader.html").read_text(encoding="utf-8")
    loader = loader.replace("__FIXED_CONFIG__", json.dumps(config, ensure_ascii=False, separators=(",", ":")))
    loader = loader.replace("__FIXED_VERSION__", json.dumps(version))
    client = committed_bytes(commit, "source/fixed-release-client.js").decode("utf-8")
    if "</script" in client.lower():
        raise ValueError("固定版更新客户端包含不安全的 HTML 脚本结束标签")
    loader = loader.replace("__FIXED_RELEASE_CLIENT__", client)
    regex = json.loads(committed_bytes(commit, "regex/读者对话渲染-外链版.json"))
    regex["id"] = FIXED_ID
    regex["scriptName"] = f"读者对话渲染-固定版 v{version}"
    marker = "<!-- FIXED_RELEASE:" + json.dumps(config, separators=(",", ":")) + " -->"
    regex["replaceString"] = "```html\n" + marker + "\n" + loader.rstrip("\n") + "\n```"
    return regex, config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("source_commit", nargs="?")
    parser.add_argument("--prepare-manifest", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "regex" / "reader-fixed.regex.json")
    args = parser.parse_args()
    try:
        if args.prepare_manifest:
            if args.source_commit:
                raise ValueError("准备清单时不要传入提交 SHA；请在准备完成并提交后构建正则")
            manifest = prepare_manifest(args.version)
            print(json.dumps({"version": args.version, "manifest": FIXED_MANIFEST,
                              "resources": len(manifest["resources"])}, ensure_ascii=False))
            return
        if not args.source_commit:
            raise ValueError("请提供完整源代码提交 SHA，或用 --prepare-manifest 准备固定版清单")
        regex, config = build_fixed_regex(args.version, args.source_commit)
    except (ValueError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"固定版构建失败：{error}\n")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(regex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(dict(config, regexAsset=args.output.name), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
