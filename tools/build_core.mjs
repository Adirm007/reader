// Self-contained role-card runtime. Works after this source folder is vendored into cores/tsukumo.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = async name => (await readFile(new URL(name, root), 'utf8')).replace(/\r\n/g, '\n');
const optional = async name => { try { return await read(name); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; } };
const hash = text => createHash('sha256').update(text).digest('hex');

export async function build({ write = false, version } = {}) {
  version ||= JSON.parse(await read('release-manifest.json')).version;
  const [runtimeSource, prelude, adapter, legacySource, css, body, letterSource, letterBody, cache, profile, transactions, booksea, templates, bookseaAlbum, gacha, ui, uiSwitch, letterStyle] = await Promise.all([
    read('source/core-runtime.mjs'), read('source/controller-prelude.js'), read('source/controller-adapter.js'),
    read('source/legacy-reader.js'), read('source/legacy-reader.css'), read('source/legacy-body.html'),
    read('source/letter.js'), read('source/letter-body.html'), read('source/black-author-cache.js'), read('source/black-author.prompt.json'),
    optional('source/reader-transactions.js'), optional('source/booksea-host.js'), optional('source/template-system.js'),
    read('source/booksea-album.js'),
    // 大厅「命运抽卡」（window.ReaderGacha）：在 gacha/ 里 npm run build 生成，大厅入口离不开它。
    read('source/reader-gacha.js'),
    // 新表现层（window.ReaderUI）：在 ui/ 里 npm run build 生成；切换点 reader-ui-switch.js 必须在适配层之后。
    read('source/reader-ui.js'), read('source/reader-ui-switch.js'),
    // 轻信样式（ui/src/letter 生成）；没有时退回旧信件样式。
    optional('source/reader-letter.css'),
  ]);
  // Replace only the old top-level bootstrap. All feature implementations remain normal editable source.
  const bootstrap = /\ninitDreamSys\(\);\s*setTimeout\(function\(\)\{try\{dreamWbAutoCheck\(\);\}catch\(e\)\{\}\},5000\);/;
  if ((legacySource.match(/\ninitDreamSys\(\);/g) || []).length !== 1 || !bootstrap.test(legacySource)) throw new Error('Expected one complete legacy bootstrap');
  const legacy = legacySource.replace(bootstrap, '\n');
  const initialization = cache.replace('__DREAM_AUTHOR_PROFILE__', JSON.stringify(JSON.parse(profile)).replace(/</g, '\\u003c'));
  const releaseTools = await Promise.all(['fixed-release-client.js','fixed-runtime.js','regex-update-guard.js','release-updates.js','standalone-bootstrap.js','script-installer.js','fixed-migration.js','update-center.js'].map(name => read('source/' + name)));
  const controller = [prelude, transactions, gacha, ui, booksea, bookseaAlbum, initialization, legacy, templates, ...releaseTools, adapter, uiSwitch].join('\n;\n');
  new Script(controller, { filename: 'reader-controller.js' });
  const assets = { version, css, body: body.replace('<!--DREAM_LETTER-->', ''), controller };
  // Function replacement: minified code may contain `$&` / `$'` (e.g. a variable named `$`), which a string replacement would expand.
  const runtime = runtimeSource.replace("import { ASSETS } from 'reader:assets';", () => 'const ASSETS = ' + JSON.stringify(assets) + ';');
  const letterCss = letterStyle ? letterStyle.trim() : css + '\n.menu-board{display:none!important}.reader-letter-compact .cafe-v20-responsive{display:none!important}.reader-letter-compact .outer-collapse:not([open]){display:block}.reader-letter-compact .flower-btn{display:block}';
  if (/\$(?:\d|<)|\{\{|<\/style/i.test(letterCss)) throw new Error('Letter style contains a replacement token, a macro or a style terminator');
  // The old updater accepts new light rules even when its script branch is blocked. Carry
  // the replacement updater as data, escaping '<' so the old light validator still accepts it.
  const updaterData = JSON.stringify(await read('source/update-center.js')).replace(/</g, '\\u003c');
  const letterBridge = (await read('source/letter-updater-bridge.js'))
    .replace('__READER_LETTER_VERSION__', () => JSON.stringify(version))
    .replace('__READER_LEGACY_UPDATER_SOURCE__', () => updaterData);
  const completeLetterSource = letterBridge + '\n;' + letterSource;
  const replaceString = '```html\n<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + letterCss + '</style></head><body>' + letterBody.replace('<!--DREAM_LETTER-->', '$1') + '<script>' + completeLetterSource + '</script></body></html>\n```';
  if (/<\/script/i.test(completeLetterSource)) throw new Error('Letter source contains a script terminator');
  if (replaceString.length > 200000 || /<audio\b|function\s+openDreamLobby\(/i.test(replaceString)) throw new Error('Letter is incompatible with the old updater');
  const rules = [{ id: 'b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007', scriptName: '读者对话渲染-脚本版', readerRuntime: {schema: 1, version, kind: 'light-letter'},
    disabled: false, runOnEdit: true, findRegex: '/<dream>「?((?:[^<]|<(?!dream\\b|\\/dream>))*?)」?<\\/dream>/g',
    replaceString, trimStrings: [], placement: [2], substituteRegex: 0, minDepth: null, maxDepth: 10, markdownOnly: true, promptOnly: false }];
  rules[0].replaceString = replaceString.replace('<!doctype html>', '<!-- READER_LIGHT_VERSION:' + version + ' --><!-- READER_RUNTIME:' + JSON.stringify({schema:1,version,kind:'light-letter'}) + ' --><!doctype html>');
  // The auto-regex owns this module just like the other core runtimes. Default code is bundled;
  // only a manually confirmed selection is restored from local storage, never from the network.
  // Allocate the default controller only if it is actually selected. A cached newer module must
  // not create a second controller/asset object just to leave the bundled copy idle.
  const bundled = 'const BUNDLED = (() => {\nlet module;\nfunction load() { return module ||= (() => {\n' + runtime.replace(/^export /gm, '') + '\nreturn {start, stop};\n})(); }\nreturn {version: ' + JSON.stringify(version) + ', start: options => load().start(options), stop: () => module?.stop()};\n})();';
  const cardHost = (await read('source/card-host.mjs')).replace("import { BUNDLED } from 'reader:bundled';", () => bundled);
  // Reuse only the pure digest fallback; loading the complete release verifier at startup is
  // unnecessary. Normal starts must not instantiate a verifier, worker or update client.
  const hashFallbacks = releaseTools[0].match(/  function softwareSHA256\(input\) \{[\s\S]*?\n  \}/g) || [];
  if (hashFallbacks.length !== 1) throw new Error('Expected one software SHA-256 fallback');
  const cardRuntime = hashFallbacks[0] + '\n;\n' + await read('source/hosted-runtime-store.js') + '\n;\n' + cardHost;
  const sizes = { cardRuntime: Buffer.byteLength(cardRuntime), runtime: Buffer.byteLength(runtime), letter: Buffer.byteLength(rules[0].replaceString), controller: Buffer.byteLength(controller) };
  if (write) {
    await mkdir(new URL('dist/', root), { recursive: true });
    await writeFile(new URL('dist/reader-runtime.js', root), runtime);
    await writeFile(new URL('dist/reader-card-runtime.js', root), cardRuntime);
    await writeFile(new URL('regex/读者对话渲染-脚本版.json', root), JSON.stringify(rules[0], null, 2) + '\n');
    await writeFile(new URL('dist/core-build.json', root), JSON.stringify({ runtime: { sha256: hash(runtime), bytes: sizes.runtime }, cardRuntime: { sha256: hash(cardRuntime), bytes: sizes.cardRuntime }, letter: { sha256: hash(rules[0].replaceString), bytes: sizes.letter } }, null, 2) + '\n');
  }
  return { rules, runtime, cardRuntime, sizes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log((await build({ write: true, version: process.argv[2] })).sizes);
