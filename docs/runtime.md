# 读者常驻运行时

脚本版由命定之诗的自动正则按「系统核心」载入，与消息显示分开。ES 模块导出 `start()` 和 `stop()`；启动就会出现右侧「读者」入口，不需要夜梦先发言。停止或切换聊天会清理旧控制器、音频、浮层、观察器及事件订阅。同一聊天的消息更新、候选切换和正则重绘保留控制器与播放器。

```powershell
node tools/build_core.mjs
node --test tests/runtime.browser.test.mjs
```

构建产物：

- `dist/reader-runtime.js`：自包含 ES 模块，一次装载原有菜单、人格、唱片机、书架、模板等功能。
- `regex/读者对话渲染-脚本版.json`：轻量信件，仅含外观、正文和常驻应用的调用桥，没有音频元素、完整应用或网络加载器。
- `dist/core-build.json`：运行时和信件的字节数及 SHA-256。

`tools/build_core.mjs` 也导出 `build({write:false})`，返回 `{rules,runtime,sizes}`，只使用 Node 标准库。集成仓可受控复制 `source/` 中的文本源码和构建器，不依赖相邻开发目录。

## 源码

- `legacy-reader.js/css`、`legacy-body.html`：从既有发布版提取的可维护功能源码。
- `core-runtime.mjs`：单实例入口、宿主 API 桥、聊天生命周期与轻信登记。
- `controller-prelude.js`：观察器、Worker、宿主监听及节点资源的清理。
- `controller-adapter.js`：复用原有功能，将消息所属逻辑改为控制器所属；音频焦点及书海窗口接入。
- `letter.js`、`letter-body.html`：轻信展示和点击桥。
- `reader-transactions.js`：固定聊天、楼层、候选的状态提交及去重。
- `booksea-host.js`：按需装载并保留书海窗口，收起时保留游玩现场。
- `template-system.js`：原内嵌压缩模块的可维护源码。

旧完整版和外链版保留兼容用途；两种渲染不要同时启用。兼容构建读取上述 legacy 源码，并注入共用事务模块，未指定版本号时保留原版本：

```powershell
python tools/build_release.py source/读者对话渲染.json
```

## 宿主接口

`window.ReaderCore` 提供 `open('lobby')`、`close()`、`openBooksea(action)`、`setAudioFocus('reader'|'booksea')`、`ready` 和 `stop()`。轻信通过 `registerLetter()` 登记展示，不写 MVU。`openBooksea` 支持 `maze/narrative/descend/leave`，供书海标签打开同一游玩实例。开发联调可用 `window.ReaderCoreConfig.bookseaBase` 指定书海资源根。

浏览器回归在本机存在 Chrome 和工作区 `playwright-core` 时运行；其他环境显式标记跳过。它检查无来信菜单、六信共用应用、同一音频跨消息重绘继续播放、真实聊天切换、停止清理、初始化中停止、部分初始化失败后重试、旧异步调用隔离，以及停止后重启时现存轻信的重新登记。不会发起付费模型请求。

## 统一更新

菜单只保留「检查更新」。正则、常驻脚本和世界书分别比较已安装版本与签名发布版本，仅更新过旧项目；世界书先执行，脚本最后替换。签名固定正则只作为数据读取，以其源提交和清单摘要验证 `reader-runtime.js`、`reader-letter.json` 及世界书资源，下载的完整版加载器不会装入脚本版。

集成宿主可通过 `start({base,updates:{installRegex,installRuntime}})` 提供两个安装回调。回调收到 `{version,metadata,release,regex}` 或 `{version,metadata,release,source}`；资源已经过签名链与 SHA-256 验证，宿主仍须复验聊天/核心身份，并维护自己的规则目录和运行模块指针。未提供回调时使用独立安全替换路径。已同意版本在旧宿主包重载后重新验证并恢复；离线失败保留原运行时，并在检查页显示原因。

构建可显式指定版本：`node tools/build_core.mjs 2026.10.29.1`；其后兼容发布构建会把轻量正则和常驻脚本加入发布清单，固定版构建验证全部清单文件。
