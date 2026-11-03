// 命运抽卡 → ../source/reader-gacha.js（读者控制器里的 window.ReaderGacha）。
// 用法：在 gacha/ 里 npm install 一次，之后 npm run build；再回到读者仓库根目录运行 node tools/build_core.mjs（脚本版）
// 与 python tools/build_release.py source/读者对话渲染.json（完整版 / 外链版），两者都会带上它。
import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {resolve, relative} from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(here, '../source/reader-gacha.js');
const result = await build({entryPoints: [resolve(here, 'src/reader/gacha-entry.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', charset: 'utf8', minify: true, legalComments: 'none', write: false, metafile: true, absWorkingDir: here});
const js = result.outputFiles[0].text.trim();
// 控制器脚本会经过酒馆宏替换（<user>、{{char}} 等）；旧完整版把它塞进 <script>，整段又是酒馆正则的替换文本
// （"$" 加数字、$<名字>、{{match}} 会被换成捕获组）。这些都不能出现。
const macro = /<user>|\{\{user\}\}|<(?:bot|char)>|\{\{char\}\}|\{\{match\}\}/i.exec(js);
if (macro) throw Error('打包结果里有酒馆宏 ' + macro[0] + '，请改写源码里的这段文字');
const group = /\$(?:\d|<)/.exec(js);
if (group) throw Error('打包结果里有正则替换记号 ' + group[0] + '（…' + js.slice(Math.max(0, group.index - 40), group.index + 10) + '…），请改用替换函数');
if (/<\/script/i.test(js)) throw Error('打包结果里有 </script');
const inputs = Object.keys(result.metafile.inputs).sort();
const digest = createHash('sha256');
for (const file of inputs) digest.update(file.replace(/\\/g, '/') + '\n').update((await readFile(resolve(here, file), 'utf8')).replace(/\r\n/g, '\n'));
const version = /READER_GACHA_VERSION = '([^']+)'/.exec(await readFile(resolve(here, 'src/reader/gacha-reader.ts'), 'utf8'))?.[1] ?? '0';
const source = `/* DREAM_READER_GACHA_BEGIN */\n/* 命运抽卡 ${version}（读者大厅）：由 gacha/src/reader/gacha-entry.ts 打包生成，改源码后在 gacha/ 里运行 npm run build，不要手改。\n * 源码 ${inputs.length} 个文件，SHA-256 ${digest.digest('hex')}。 */\n${js}\n/* DREAM_READER_GACHA_END */\n`;
new Script(source, {filename: 'reader-gacha.js'});
await writeFile(out, source);
console.log(JSON.stringify({out: relative(process.cwd(), out), version, bytes: Buffer.byteLength(source), inputs: inputs.length}));
