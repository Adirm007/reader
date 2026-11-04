# 命运抽卡（源码）

读者大厅「命运抽卡」的 TypeScript 源码，打包成 `../source/reader-gacha.js`（`window.ReaderGacha`）。玩法、定价与存档位置见 [常驻运行时 · 命运抽卡](../docs/runtime.md#命运抽卡)。

- `src/gacha/`：星级与大小保底（`rarity.ts`）、主题、资料库、小池编纂（`pool.ts`：54～99 张、角色池、分次编纂与资料直出）、背包与回收（`bag.ts`）、服务层与大保底兑换（`session.ts`）。
- `src/ui/`：面板、按大厅主题换色的样式、矢量美术。
- `src/reader/`：读者端口（`ReaderTransactions`、聊天变量、独立 API）与入口。

```powershell
npm install
npm test
npm run typecheck
npm run build
```

`npm run build` 只写 `../source/reader-gacha.js`。之后回到仓库根目录运行 `node tools/build_core.mjs` 与 `python tools/build_release.py source/读者对话渲染.json`，脚本版、完整版与外链版都会带上新的抽卡。打包结果不能含酒馆宏、`</script`，也不能含正则替换记号（`$` 加数字、`$<名字>`、`{{match}}`）：完整版的整段 HTML 是酒馆正则的替换文本。
