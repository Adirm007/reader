#!/usr/bin/env python3
"""Package a fixed regex in a distribution commit; publish only with --publish.

The source commit C contains fixed-release-manifest.json. A detached distribution
commit D adds the generated regex; vVERSION points at D, while the regex pins C.
This avoids a commit referring to its own hash and makes tagged CDN mirrors match
the GitHub release attachment byte for byte. The current branch is never moved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
from build_fixed_release import ROOT, build_fixed_regex


def run(*args, cwd=ROOT):
    return subprocess.check_output(args, cwd=cwd, text=True, stderr=subprocess.PIPE).strip()


def github(path, allow_missing=False):
    result = subprocess.run(["gh", "api", path], cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        if allow_missing and "HTTP 404" in result.stderr:
            return None
        raise ValueError(f"GitHub 预检失败：{result.stderr.strip()}")
    return json.loads(result.stdout)


def preflight(repository, tag):
    origin = run("git", "remote", "get-url", "origin")
    allowed = {f"https://github.com/{repository}", f"https://github.com/{repository}.git",
               f"git@github.com:{repository}", f"git@github.com:{repository}.git"}
    if origin not in allowed:
        raise ValueError("origin 地址与固定版仓库不符；请先核对 Git 远端")
    settings = github(f"repos/{repository}/immutable-releases")
    if not settings or settings.get("enabled") is not True:
        raise ValueError("请先在 GitHub 仓库设置中启用不可变 Releases；脚本不会替你更改设置")
    if github(f"repos/{repository}/git/ref/tags/{tag}", allow_missing=True) is not None:
        raise ValueError("该版本 tag 已存在；固定版禁止覆盖旧版本")
    if github(f"repos/{repository}/releases/tags/{tag}", allow_missing=True) is not None:
        raise ValueError("该版本 release 已存在；请使用新的数字版本号")


def package(version, commit, destination):
    regex, metadata = build_fixed_regex(version, commit)
    if destination.exists():
        raise ValueError(f"打包目录已存在，请使用一个新目录：{destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    run("git", "worktree", "add", "--detach", str(destination), commit)
    output = destination / "regex" / "reader-fixed.regex.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(regex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    run("git", "add", "regex/reader-fixed.regex.json", cwd=destination)
    run("git", "-c", "commit.gpgsign=false", "commit", "-m", f"Package reader fixed release v{version}", cwd=destination)
    distribution = run("git", "rev-parse", "HEAD", cwd=destination)
    artifact = output.read_bytes()
    return {"metadata": metadata, "sourceCommit": commit, "distributionCommit": distribution,
            "tag": "v" + version, "asset": str(output), "sha256": hashlib.sha256(artifact).hexdigest(),
            "bytes": len(artifact), "worktree": str(destination)}


def publish(result):
    repository = result["metadata"]["repository"]
    tag, distribution = result["tag"], result["distributionCommit"]
    # No --force, tag deletion, release edits, or overwriting an existing asset.
    run("git", "push", "origin", f"{distribution}:refs/tags/{tag}")
    run("gh", "release", "create", tag, "--repo", repository, "--verify-tag", "--draft",
        "--title", f"读者固定版 {result['metadata']['version']}",
        "--notes", f"固定源代码：{result['sourceCommit']}\n正则 SHA-256：{result['sha256']}")
    run("gh", "release", "upload", tag, result["asset"], "--repo", repository)
    # GitHub's tag lookup only exposes published releases. Newly created drafts
    # must be read from the authenticated release list before digest validation.
    drafts = [release for release in github(f"repos/{repository}/releases?per_page=100")
              if release.get("tag_name") == tag and release.get("draft") is True]
    if len(drafts) != 1:
        raise ValueError("未能唯一识别刚创建的发布草稿；保留现有标签和附件，请检查后继续")
    draft = drafts[0]
    assets = [asset for asset in draft.get("assets", []) if asset.get("name") == "reader-fixed.regex.json"]
    if len(assets) != 1 or assets[0].get("digest") != "sha256:" + result["sha256"]:
        raise ValueError("GitHub 附件 digest 与本地正则不符；草稿保留，请检查后发布新版本")
    run("gh", "release", "edit", tag, "--repo", repository, "--draft=false")
    final = github(f"repos/{repository}/releases/tags/{tag}")
    if final.get("immutable") is not True:
        raise ValueError("发布后未确认 immutable=true；请检查 GitHub 设置，客户端会拒绝该版本")
    # Publication freezes the attachment first; only then can GitHub sign its release proof.
    # A catalog failure never rewrites the release: rerun the catalog command alone.
    from publish_update_catalog import credential, fetch_proof, publish_catalog
    bundle, _ = fetch_proof(repository, result["metadata"]["version"], credential())
    publish_catalog(repository, {result["metadata"]["version"]: bundle})
    return final["html_url"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("source_commit")
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--publish", action="store_true", help="执行 GitHub 预检、push tag、草稿上传及正式发布")
    args = parser.parse_args()
    try:
        # Validate version/SHA and committed assets before constructing filesystem paths.
        _, metadata = build_fixed_regex(args.version, args.source_commit)
        if args.publish:
            preflight(metadata["repository"], "v" + args.version)
        destination = (args.directory or ROOT / ".runtime" / "fixed-release" / ("reader-v" + args.version)).resolve()
        result = package(args.version, args.source_commit, destination)
        if args.publish:
            result["releaseUrl"] = publish(result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, subprocess.CalledProcessError, OSError) as error:
        parser.exit(1, f"固定版打包/发布失败：{error}\n")


if __name__ == "__main__":
    main()
