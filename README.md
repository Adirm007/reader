# reader

神秘咖啡女（九十九夜梦 · 读者）外链仓库。

酒馆里只需导入一个很小的「外链版」正则，渲染界面的完整代码从本仓库在线加载；作者更新本仓库后，玩家无需重新导入正则即可获得新版本（与《书海》普罗泰利西翁相同的外链方式）。

## 安装

1. 在 SillyTavern 的「正则」中导入 [`regex/读者对话渲染-外链版.json`](regex/读者对话渲染-外链版.json)。
2. 禁用或删除旧的「读者对话渲染」完整版正则，避免同一段 `<dream>` 被渲染两次。
3. 世界书中的「读者核心本体」保持启用（发言限制、称呼设置等功能需要配套的核心版本）。

需要启用「酒馆助手（JS-Slash-Runner）」。

## 外链如何工作

- 外链版正则只包含一个加载器：读取 `release-manifest.json`，再按清单下载 `dist/` 中的样式、正文模板和脚本。
- 依次尝试 GitHub Pages（`adirm007.github.io/reader`）、`raw.githubusercontent.com` 与 jsDelivr；任一可用即可。
- 安全上下文（HTTPS 或 localhost）下会校验 SHA-256 并缓存到浏览器，离线时使用上次成功加载的版本；局域网 HTTP 访问时仅校验字节数。
- 全部失败时会显示信件原文和「再试一次」按钮。

## 作者更新流程

```bash
python tools/build_release.py "<完整版读者对话渲染.json>" 2026.10.07
git add -A && git commit -m "Release reader 2026.10.07" && git push
```

`dist/` 中的文件以内容哈希命名，旧文件可以保留，避免 CDN 缓存期间清单与文件不一致。

## 相册（CG 鉴赏）

在 `gallery/` 中上传图片，或在 `gallery/links.txt` 中逐行写入图片外链，酒馆内「相册 · CG鉴赏」即会同步显示，支持翻页、大图浏览与下载原图。详见 [`gallery/README.md`](gallery/README.md)。

## 许可

禁止商用；非商业的修改、二次创作与模仿须事先取得作者授权。详见 [LICENSE](LICENSE)。
