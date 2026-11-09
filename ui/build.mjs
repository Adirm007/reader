// 读者新表现层（v4）：
//   src/entry.ts         → ../source/reader-ui.js     （window.ReaderUI；常驻控制器里放在 legacy-reader.js 之前）
//   src/letter/letter.css → ../source/reader-letter.css（轻信样式；tools/build_core.mjs 读）
// 用法：在 ui/ 里 npm install 一次（依赖与 gacha/ 相同），之后 npm run build；再回到读者仓库根目录运行
// node tools/build_core.mjs 与 python tools/build_release.py source/读者对话渲染.json。
// 切换点 source/reader-ui-switch.js 是手写的，不由这里生成。
import {build, transform} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {resolve, relative} from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
// Nesting is written for readability and flattened here; the oldest engines we support decide the target.
const cssTarget = ['chrome105', 'safari16', 'firefox110'];
const cssMin = async text => (await transform(text, {loader: 'css', minify: true, target: cssTarget, charset: 'utf8'})).code.trim();
const textFiles = {name: 'reader-ui-text', setup(b) {
  // The bundle needs only id -> sha8 (paths are derived); bytes, sizes and full digests stay in ui/assets.json.
  b.onLoad({filter: /assets\.json$/}, async a => {
    const m = JSON.parse(await readFile(a.path, 'utf8'));
    const files = Object.fromEntries(Object.entries(m.files || {}).map(([id, e]) => {
      if (!e.path.endsWith('.' + e.sha256.slice(0, 8) + (id.startsWith('font/') ? '.woff2' : '.webp'))) throw Error('ui/assets.json 里 ' + id + ' 的路径和哈希对不上');
      return [id, e.sha256.slice(0, 8)];
    }));
    return {contents: JSON.stringify({repository: m.repository, commit: m.commit, files}), loader: 'json'};
  });
  b.onLoad({filter: /\.css$/}, async a => ({contents: await cssMin(await readFile(a.path, 'utf8')), loader: 'text'}));
  b.onLoad({filter: /\.svg$/}, async a => ({contents: (await readFile(a.path, 'utf8')).replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim(), loader: 'text'}));
}};

// The controller passes through tavern macro replacement (<user>, {{char}} …), and the complete version is the
// replacement text of a tavern regex ("$" + digit, $<name>, {{match}} would become capture groups).
function guard(name, text) {
  const macro = /<user>|\{\{user\}\}|<(?:bot|char)>|\{\{char\}\}|\{\{match\}\}/i.exec(text);
  if (macro) throw Error(`${name} 里有酒馆宏 ${macro[0]}，请改写源码里的这段文字`);
  const group = /\$(?:\d|<)/.exec(text);
  if (group) throw Error(`${name} 里有正则替换记号 ${group[0]}（…${text.slice(Math.max(0, group.index - 40), group.index + 10)}…）`);
  if (/<\/script/i.test(text)) throw Error(`${name} 里有 </script`);
}

const result = await build({entryPoints: [resolve(here, 'src/entry.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  charset: 'utf8', minify: true, legalComments: 'none', write: false, metafile: true, absWorkingDir: here, plugins: [textFiles]});
const js = result.outputFiles[0].text.trim();
guard('reader-ui.js', js);
const inputs = Object.keys(result.metafile.inputs).sort();
const digest = createHash('sha256');
for (const file of inputs) digest.update(file.replace(/\\/g, '/') + '\n').update((await readFile(resolve(here, file), 'utf8')).replace(/\r\n/g, '\n'));
const version = /READER_UI_VERSION = '([^']+)'/.exec(await readFile(resolve(here, 'src/reader-ui.ts'), 'utf8'))?.[1] ?? '0';
const source = `/* DREAM_READER_UI_BEGIN */\n/* 读者新表现层 ${version}：由 ui/src/entry.ts 打包生成，改源码后在 ui/ 里运行 npm run build，不要手改。\n * 源码 ${inputs.length} 个文件，SHA-256 ${digest.digest('hex')}。 */\n${js}\n/* DREAM_READER_UI_END */\n`;
new Script(source, {filename: 'reader-ui.js'});
await writeFile(resolve(here, '../source/reader-ui.js'), source);

let letter = '';
try { letter = await cssMin((await readFile(resolve(here, 'src/letter/art.css'), 'utf8')) + '\n' + (await readFile(resolve(here, 'src/letter/letter.css'), 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (letter) {
  guard('reader-letter.css', letter);
  if (/\{\{|<\/style/i.test(letter)) throw Error('reader-letter.css 里有 {{ 或 </style');
  await writeFile(resolve(here, '../source/reader-letter.css'), letter + '\n');
}

console.log(JSON.stringify({version, ui: Buffer.byteLength(source), letter: Buffer.byteLength(letter), inputs: inputs.length, out: relative(process.cwd(), resolve(here, '../source/reader-ui.js'))}));
