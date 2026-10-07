# reader

神秘咖啡女（九十九夜梦 · 读者）外链仓库。

酒馆里只需导入一个很小的「外链版」正则，渲染界面的完整代码从本仓库在线加载（与《书海》普罗泰利西翁相同的外链方式）。

外链**只使用完整 Commit SHA 的 GitHub raw 地址**（`https://raw.githubusercontent.com/Adirm007/reader/<40位SHA>/`），导入后内容固定不变；作者发布新版本或更新相册 / 人格库 / 世界书后，打开读者界面时会弹出「外链更新提醒」，可复制新版本号、一键替换（替换后刷新酒馆页面）或本版本不再提醒。最新版本号见 [`latest.json`](latest.json)。

## 安装

1. 在 SillyTavern 的「正则」中导入 [`regex/读者对话渲染-外链版.json`](regex/读者对话渲染-外链版.json)。
2. 禁用或删除旧的「读者对话渲染」完整版正则，避免同一段 `<dream>` 被渲染两次。
3. 世界书中的「读者核心本体」保持启用（发言限制、称呼设置等功能需要配套的核心版本）。

需要启用「酒馆助手（JS-Slash-Runner）」。

## 外链如何工作

- 外链版正则只包含一个加载器：读取 `release-manifest.json`，再按清单下载 `dist/` 中的样式、正文模板和脚本。
- 只从正则里写死的那个 Commit SHA 读取（raw.githubusercontent.com），不使用 GitHub Pages、jsDelivr 或 main 分支；同一个 SHA 的内容永远不变。
- 唯一读取 main 的是 `latest.json`：它只用来判断有没有新版本，读取失败时不弹窗。
- 2026.10.08.1 之前导入的旧版外链正则（自动跟随最新版）也会弹出提醒，可一键改成固定版本。
- 安全上下文（HTTPS 或 localhost）下会校验 SHA-256 并缓存到浏览器，离线时使用上次成功加载的版本；局域网 HTTP 访问时仅校验字节数。
- 全部失败时会显示信件原文和「再试一次」按钮。

## 作者更新流程

```bash
git pull --ff-only
python tools/build_release.py "<完整版读者对话渲染.json>" 2026.10.08.2 "更新说明（会显示在提醒弹窗里）"
git add -A && git commit -m "Release reader 2026.10.08.2" && git push
```

推送后 GitHub Actions「Update content indexes and pin latest」会运行 `tools/pin_latest.py`，把 `latest.json` 和 `regex/读者对话渲染-外链版.json` 固定到这次提交的完整 SHA（`latest.json` 和外链版正则不要手动改）。完成后把完整版也固定到同一个 SHA，供不用外链的玩家导入：

```bash
git pull --ff-only
python tools/pin_full.py "<完整版读者对话渲染.json>" <latest.json 里的 sha>
```

`dist/` 中的文件以内容哈希命名，旧文件可以保留，避免 CDN 缓存期间清单与文件不一致。

## 相册（CG 鉴赏）

在 `gallery/` 中上传图片，或在 `gallery/links.txt` 中逐行写入图片外链，GitHub Actions 会重建 `gallery/index.json` 并发布一次「内容更新」；玩家按提醒换成新版本号（或一键替换）后，酒馆内「相册 · CG鉴赏」即显示新图，支持翻页、大图浏览与下载原图。详见 [`gallery/README.md`](gallery/README.md)。

## 额外人格库（DLC）

与相册同一原理：把「人格管理」导出的人格 JSON 放进 `personas/`，酒馆内「彩蛋服务 → 额外人格库」就会列出；玩家选中一位并启用，她会作为自定义人格进入玩家自己的人格库并立即启用。修改文件后同样会发布「内容更新」，玩家换成新版本号后显示「有更新」，删除文件即下架（已启用的副本不受影响）。详见 [`personas/README.md`](personas/README.md)。

## 世界书更新

读者核心条目第一行写有版本标记（EJS 注释，正文模型读不到）。读者正则打开时（每 6 小时最多一次）对照 `worldbook/manifest.json` 检查当前角色绑定的世界书；有新版时弹窗提示，确认后把旧条目改名为「备份·v旧版本号」并关闭，再写入并启用新条目（同一世界书只保留最近一次备份）。也可在「彩蛋服务 → 世界书更新」手动检查。发布新版只需修改 `worldbook/读者核心本体.txt` 并调高第一行的版本号，GitHub Actions 会自动重算清单并发布「内容更新」。详见 [`worldbook/README.md`](worldbook/README.md)。

## 独立API

「彩蛋服务 → 独立API」可保存多套方案（地址、密钥、模型）一键切换，拉取模型列表后可直接下拉选择，也可手动填写模型名；人格创作、缘加强、书架定调、条目模仿，以及《书海》的技能整备、补给员对话可以分别指定方案。密钥只保存在本浏览器，正文回复仍走酒馆当前插头。

## 许可

禁止商用；非商业的修改、二次创作与模仿须事先取得作者授权。详见 [LICENSE](LICENSE)。
