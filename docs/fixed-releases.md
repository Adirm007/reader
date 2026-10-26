# 读者固定版

现有「读者对话渲染-外链版」继续跟随作者更新。新增「读者对话渲染-固定版」使用独立的稳定正则 ID，安装时停用自动更新版，避免同时渲染同一条信件。

固定版正则内置数字版本、完整源提交 SHA，以及 `fixed-release-manifest.json` 的 SHA-256。根清单固定 CSS、正文模板、主脚本与 `gallery/`、`personas/`、`worldbook/`、`vendor/` 的资源哈希。运行时镜像始终使用相同的完整提交 SHA，下载和缓存均重新校验 SHA-256；离线时仅使用该版本且校验成功的缓存。资源缺失、校验失败或版本不存在时保留信件原文，点击重试；不会转用 `main` 或最新版。局域网 HTTP 没有 Web Crypto 时使用内置 SHA-256，仍验证完整内容。

## 玩家如何升级

保留当前版本时不需要操作。在「彩蛋服务台 → 检查正则更新」中对比读者、书海两份已安装固定正则与 GitHub 上已正式发布、标记 `immutable=true` 的数字版本。没有新版本时明确显示没有可用更新；限流、断网或校验失败时显示检查失败，不能据此判断已是最新。

只有点击「一键更新」才下载并验证附件、备份现有正则并写入。任意附件下载或校验失败时不开始写入。更新需要酒馆助手 4.9.3 或更新版；写入前核对完整范围，若助手无法保留其他正则的字段或设置，就拒绝一键更新，改用「下载固定版」手动导入。保留原启用状态、匹配规则、深度和顺序；只替换受管理的加载器及名称。跨全局／角色／预设的写入不是事务，部分失败时保留备份并提示重新核对。酒馆保存与重绘完成前不宣称持久化完成。重新打开面板可核对上次更新结果、导出备份。更新为新版本也意味着重新选择信任该版本的代码。

锁定范围是作者管理的程序及仓库内的配套内容。按作者选择，字体与棋引擎继续使用原先可信第三方来源；第三方图片、音乐、字体文件和外部 CG 的目标内容仍由原站提供，固定的是本版的链接列表。用户聊天、存档与自行配置的 API 也不会被版本锁定。

检查更新完全由玩家点击触发，正常刷新不查询最新版，不额外预加载相册、字体或棋引擎。固定运行资源只按需读取；书海的大资源按当前清单的内容哈希验证和复用，避免仅改数字版本就重下相同整包。

也可手动编辑正则替换内容中的 `const VERSION="2026.10.27.1"`，只修改引号内的数字。与内置版本相同时直接使用本地固定信息；改成其他数字时通过 GitHub 官方发布信息查到对应的不可变 Release，并验证固定版附件的 SHA-256，取得新版本的源提交与根清单哈希。该过程仅读取新版附件中的固定信息，不执行下载到的加载器。未发布、可变发布、预发布、附件损坏或 GitHub 限流都会报错，不会悄悄换成其他版本。

## 作者构建

保留现有 `tools/build_release.py` 的自动更新版流程。完整源正则构建时幂等装入四个本地模块：

- `source/fixed-release-client.js`：不可变发布解析、附件校验与软件 SHA-256。
- `source/fixed-runtime.js`：固定版的二级资源钩子。
- `source/regex-update-guard.js`：检查助手能否完整保留其他正则的设置。
- `source/release-updates.js`：检查与用户确认后的正则更新。

以 `2026.10.27.2` 为例：

```powershell
python tools/build_release.py source/读者对话渲染.json 2026.10.27.2
python tools/build_fixed_release.py 2026.10.27.2 --prepare-manifest
npm test
git add source tools tests docs dist regex release-manifest.json fixed-release-manifest.json
git commit -m "Prepare reader fixed release 2026.10.27.2"
git rev-parse HEAD
```

最后输出的完整 SHA 为源提交 **C**。发布正则必须从 C 内的清单与资产生成，构建器逐一检查字节数和 SHA-256；不会采用未提交工作区里的同名文件。准备清单后若修改任何脚本或资源，需要重新构建、准备清单并重新提交。

```powershell
python tools/build_fixed_release.py 2026.10.27.2 <完整C提交SHA>
```

生成的稳定附件名为 `regex/reader-fixed.regex.json`。HTML 中保留机器可读的 `FIXED_RELEASE` 标记；正则宿主即使移除 JSON 顶层的额外属性，更新检查仍可识别已安装版本。

## 打包与发布

GitHub 仓库须先启用不可变 Releases。普通分支、普通 tag 或版本目录都可被作者覆盖，无法单独提供同样保证。脚本通过官方 `GET /repos/Adirm007/reader/immutable-releases` 预检；该接口需要相应仓库管理读取权限，权限不足时明确失败，不会自动修改设置。

先在本地打包供检查：

```powershell
python tools/publish_fixed_release.py 2026.10.27.2 <完整C提交SHA>
```

默认只在 `.runtime/fixed-release/reader-v2026.10.27.2/` 创建 detached worktree 和分发提交 **D**，输出附件路径、哈希、C/D SHA；不会推送或发布，也不会移动当前分支。D 以 C 为父提交，只增加生成的固定正则。随后 `v2026.10.27.2` 指向 D，正则内部仍锁定 C，解决「提交不能包含自己的 SHA」问题。Release 附件与 tag 下的正则字节完全相同，使浏览器可在附件跨域下载失败时使用 tag 的 raw/jsDelivr 镜像，并对照 GitHub 官方附件 digest 校验。

准备正式发布时使用一个新的本地打包目录并显式传入 `--publish`：

```powershell
python tools/publish_fixed_release.py 2026.10.27.2 <完整C提交SHA> --directory .runtime/fixed-release/reader-v2026.10.27.2-publish --publish
```

脚本预检不可变设置、远端仓库和版本不存在后，推送指向 D 的 tag，创建草稿、上传固定附件并核对 GitHub 返回的 SHA-256，最后发布并确认 `immutable=true`。禁止覆盖已有 tag、Release 或附件。任何一步失败都会保留可检查的本地结果/草稿；排查后请根据实际状态选择新的数字版本，避免复用已发布版本。若要让自动更新版同步此次代码，正常推送源码分支 C；发布脚本只推送版本 tag。

## 验证

`node --test tests/fixed-release.test.mjs` 覆盖可变清单替换、等长脚本篡改、缓存损坏、离线加载、跨版本缓存隔离、无 Web Crypto 的完整校验、同源提交镜像、手动数字版本切换，以及从源提交 C 生成分发提交 D 的字节一致性。
