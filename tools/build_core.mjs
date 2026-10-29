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
  const [runtimeSource, prelude, adapter, legacySource, css, body, letterSource, letterBody, cache, profile, transactions, booksea, templates] = await Promise.all([
    read('source/core-runtime.mjs'), read('source/controller-prelude.js'), read('source/controller-adapter.js'),
    read('source/legacy-reader.js'), read('source/legacy-reader.css'), read('source/legacy-body.html'),
    read('source/letter.js'), read('source/letter-body.html'), read('source/black-author-cache.js'), read('source/black-author.prompt.json'),
    optional('source/reader-transactions.js'), optional('source/booksea-host.js'), optional('source/template-system.js'),
  ]);
  // Replace only the old top-level bootstrap. All feature implementations remain normal editable source.
  const bootstrap = /\ninitDreamSys\(\);\s*setTimeout\(function\(\)\{try\{dreamWbAutoCheck\(\);\}catch\(e\)\{\}\},5000\);/;
  if ((legacySource.match(/\ninitDreamSys\(\);/g) || []).length !== 1 || !bootstrap.test(legacySource)) throw new Error('Expected one complete legacy bootstrap');
  const legacy = legacySource.replace(bootstrap, '\n');
  const initialization = cache.replace('__DREAM_AUTHOR_PROFILE__', JSON.stringify(JSON.parse(profile)).replace(/</g, '\\u003c'));
  const releaseTools = await Promise.all(['fixed-release-client.js','fixed-runtime.js','regex-update-guard.js','release-updates.js','update-center.js'].map(name => read('source/' + name)));
  const controller = [prelude, transactions, booksea, initialization, legacy, templates, ...releaseTools, adapter].join('\n;\n');
  new Script(controller, { filename: 'reader-controller.js' });
  const assets = { version, css, body: body.replace('<!--DREAM_LETTER-->', ''), controller };
  const runtime = runtimeSource.replace("import { ASSETS } from 'reader:assets';", 'const ASSETS = ' + JSON.stringify(assets) + ';');
  const letterCss = css + '\n.menu-board{display:none!important}.reader-letter-compact .cafe-v20-responsive{display:none!important}.reader-letter-compact .outer-collapse:not([open]){display:block}.reader-letter-compact .flower-btn{display:block}';
  const replaceString = '```html\n<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + letterCss + '</style></head><body>' + letterBody.replace('<!--DREAM_LETTER-->', '$1') + '<script>' + letterSource + '</script></body></html>\n```';
  if (/<\/script/i.test(letterSource)) throw new Error('Letter source contains a script terminator');
  const rules = [{ id: 'b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007', scriptName: '读者对话渲染-脚本版', readerRuntime: {schema: 1, version, kind: 'light-letter'},
    disabled: false, runOnEdit: true, findRegex: '/<dream>「?((?:[^<]|<(?!dream\\b|\\/dream>))*?)」?<\\/dream>/g',
    replaceString, trimStrings: [], placement: [2], substituteRegex: 0, minDepth: null, maxDepth: 10, markdownOnly: true, promptOnly: false }];
  rules[0].replaceString = replaceString.replace('<!doctype html>', '<!-- READER_LIGHT_VERSION:' + version + ' --><!-- READER_RUNTIME:' + JSON.stringify({schema:1,version,kind:'light-letter'}) + ' --><!doctype html>');
  const sizes = { runtime: Buffer.byteLength(runtime), letter: Buffer.byteLength(rules[0].replaceString), controller: Buffer.byteLength(controller) };
  if (write) {
    await mkdir(new URL('dist/', root), { recursive: true });
    await writeFile(new URL('dist/reader-runtime.js', root), runtime);
    await writeFile(new URL('regex/读者对话渲染-脚本版.json', root), JSON.stringify(rules[0], null, 2) + '\n');
    await writeFile(new URL('dist/core-build.json', root), JSON.stringify({ runtime: { sha256: hash(runtime), bytes: sizes.runtime }, letter: { sha256: hash(rules[0].replaceString), bytes: sizes.letter } }, null, 2) + '\n');
  }
  return { rules, runtime, sizes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log((await build({ write: true, version: process.argv[2] })).sizes);
