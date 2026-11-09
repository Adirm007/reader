import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from '../tools/build_core.mjs';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const oldVersion = '2026.11.09.1', version = '2026.11.10.2';
const key = 'dream_reader_core_selected_v1';
const oldUpdater = await readFile(new URL('./fixtures/update-center-2026.11.09.1.js', import.meta.url), 'utf8');

function withHistoricalUpdater(runtime) {
  const lines = runtime.split('\n'), index = lines.findIndex(line => line.startsWith('const ASSETS = '));
  assert.notEqual(index, -1);
  const assets = JSON.parse(lines[index].slice('const ASSETS = '.length, -1));
  const updater = /\/\* DREAM_UPDATE_CENTER_BEGIN \*\/[\s\S]*?\/\* DREAM_UPDATE_CENTER_END \*\//;
  assert.match(assets.controller, updater);
  assets.controller = assets.controller.replace(updater, () => oldUpdater);
  lines[index] = 'const ASSETS = ' + JSON.stringify(assets) + ';';
  return lines.join('\n');
}

async function fixture(options, run) {
  const [oldBuild, candidate] = await Promise.all([build({ version: oldVersion }), build({ version })]);
  const runtime = withHistoricalUpdater(oldBuild.runtime), raw = { ...oldBuild.rules[0] };
  delete raw.readerRuntime;
  const metadata = { schema: 1, repository: 'Adirm007/reader', version, sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64) };
  const runtimeArtifact = { metadata, release: { repository: metadata.repository, version, distributionCommit: 'c'.repeat(40), digest: 'd'.repeat(64) },
    spec: { path: 'dist/reader-runtime.js', bytes: Buffer.byteLength(candidate.runtime), sha256: createHash('sha256').update(candidate.runtime).digest('hex') } };
  const html = `<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__calls=[];window.__options=${JSON.stringify(options)};
window.__raw=${JSON.stringify(raw).replace(/</g, '\\u003c')};window.__artifact=${JSON.stringify(runtimeArtifact)};
window.__ctx={characterId:0,chatId:'a',name1:'测试作家',name2:'夜梦',characters:[{avatar:'reader.png',data:{extensions:{regex_scripts:[__raw]}}}],extensionSettings:{regex:[]},chatCompletionSettings:{extensions:{regex_scripts:[]}},getPresetManager:()=>({getSelectedPresetName:()=> 'test preset'}),mainApi:'openai',chatMetadata:{variables:{系统核心:'九十九夜梦'}},chat:[{mes:'<dream>已确认更新的来信</dream>',swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>__ctx};window.__data={stat_data:{命运点数:10000,主角:{状态效果:{}}}};
const clone=value=>JSON.parse(JSON.stringify(value));
const rawRules=option=>option.type==='character'?__ctx.characters[0].data.extensions.regex_scripts:option.type==='global'?__ctx.extensionSettings.regex:__ctx.chatCompletionSettings.extensions.regex_scripts;
const normalize=rule=>({id:rule.id,script_name:rule.scriptName,enabled:!rule.disabled,run_on_edit:rule.runOnEdit,find_regex:rule.findRegex,trim_strings:rule.trimStrings||[],replace_string:rule.replaceString,source:{user_input:rule.placement.includes(1),ai_output:rule.placement.includes(2),slash_command:rule.placement.includes(3),world_info:rule.placement.includes(5),reasoning:rule.placement.includes(6)},destination:{display:rule.markdownOnly,prompt:rule.promptOnly},min_depth:rule.minDepth,max_depth:rule.maxDepth});
const denormalize=rule=>({id:rule.id,scriptName:rule.script_name,disabled:!rule.enabled,runOnEdit:rule.run_on_edit,findRegex:rule.find_regex,trimStrings:rule.trim_strings,replaceString:rule.replace_string,placement:[['user_input',1],['ai_output',2],['slash_command',3],['world_info',5],['reasoning',6]].filter(([name])=>rule.source[name]).map(([,value])=>value),substituteRegex:0,minDepth:rule.min_depth,maxDepth:rule.max_depth,markdownOnly:rule.destination.display,promptOnly:rule.destination.prompt});
const forbidden=name=>()=>{__calls.push({kind:name});throw Error('unexpected '+name);};
window.mountLight=rule=>new Promise(resolve=>{
  const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid','0');
  const frame=document.createElement('iframe');frame.addEventListener('load',()=>resolve(),{once:true});
  frame.srcdoc=rule.replace_string.replace(/^\x60\x60\x60html\\n/,'').replace(/\\n\x60\x60\x60$/,'').replace('$1','已确认更新的来信');mes.append(frame);document.getElementById('chat').append(mes);
});
window.TavernHelper={getTavernHelperVersion:()=> '4.11.3',getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async fn=>{__data=fn(__data);},insertOrAssignVariables:async()=>{},getLastMessageId:()=>0,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[],getTavernRegexes:option=>clone(rawRules(option)).map(normalize),replaceTavernRegexes:async(rules,option)=>{__calls.push({kind:'regex-write'});rawRules(option).splice(0,Infinity,...rules.map(denormalize));await Promise.all([mountLight(rules[0]),mountLight(rules[0])]);},getScriptTrees:forbidden('script-read'),updateScriptTreesWith:forbidden('script-write'),updateWorldbookWith:forbidden('worldbook-write'),createWorldbookEntries:forbidden('worldbook-create')};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(key=>[key,key]));
window.__events=new Map();window.eventOn=(name,fn)=>{const set=__events.get(name)||new Set();set.add(fn);__events.set(name,set);return{stop:()=>set.delete(fn)}};
__ctx.eventTypes=tavern_events;__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);}};
window.ReaderCoreConfig={bookseaBase:location.origin+'/'};
document.addEventListener('reader:ready',()=>{
  const controller=document.getElementById('reader-core-controller').contentWindow;
  controller.DreamFixedReleaseClient={...controller.DreamFixedReleaseClient,latest:async repository=>{__calls.push({kind:'latest',repository});return {repository,version:'${version}'};},resource:async(selected,name)=>{
    __calls.push({kind:'resource',name,selected:clone(selected)});
    if(name==='reader-runtime.js'&&__options.failRuntime)throw Error('runtime proof unavailable');
    const text=await fetch(name==='reader-runtime.js'?'/candidate.js':'/candidate-letter.json').then(response=>response.text());
    if(name==='reader-runtime.js'&&window.__runtimeGate)await window.__runtimeGate;
    return {...__artifact,bytes:new TextEncoder().encode(text)};
  }};
  controller.dreamWbAutoCheck=()=>{};
});
</script></body></html>`;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://reader.test').pathname;
    response.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(pathname === '/old.js' ? runtime : pathname === '/candidate.js' ? candidate.runtime : pathname === '/candidate-letter.json' ? JSON.stringify(candidate.rules[0]) : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') || /^(?:blob:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await page.evaluate(async () => { window.entry = await import('/old.js');entry.start({updates:__options.modern?{hostMode:'auto-regex',getHostedRuntimeState:()=>({pendingVersion:null})}:{}});await ReaderCore.ready; });
    await run({ page, metadata, errors });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

async function checkOldUpdater(page) {
  return page.evaluate(async () => {
    const updates = document.getElementById('reader-core-controller').contentWindow.ReaderUpdates;
    window.__center = updates.createCoordinator(updates.components().filter(item => item.id !== 'worldbook'));
    return (await __center.check()).map(item => ({ id: item.id, status: item.status }));
  });
}

test('a historically disabled updater completes its accepted runtime through the new light letter in the same update', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  await fixture({}, async ({ page, metadata, errors }) => {
    assert.deepEqual(await checkOldUpdater(page), [{ id: 'regex', status: 'outdated' }, { id: 'script', status: 'unavailable' }]);
    await page.evaluate(() => { window.__oldApplied = __center.apply(); });
    await page.waitForFunction(() => !!window.__readerAcceptedLetterUpgrade, null, { timeout: 3000 });
    await page.evaluate(() => __readerAcceptedLetterUpgrade.promise);
    assert.deepEqual(await page.evaluate(key => ({ version: ReaderCore.runtimeVersion, selected: JSON.parse(localStorage.getItem(key)), controllers: document.querySelectorAll('#reader-core-controller').length, phase: __readerAcceptedLetterUpgrade.phase }), key),
      { version, selected: metadata, controllers: 1, phase: 'complete' });
    const calls = await page.evaluate(() => __calls);
    assert.equal(calls.filter(call => call.kind === 'regex-write').length, 1);
    assert.deepEqual(calls.filter(call => call.kind === 'resource').map(call => ({ name: call.name, version: call.selected.version })), [{ name: 'reader-letter.json', version }, { name: 'reader-runtime.js', version }]);
    assert.equal(calls.filter(call => call.kind === 'latest').length, 1, 'completion stays on the accepted release, without another latest check');
    assert.equal(calls.some(call => /script-|worldbook-/.test(call.kind)), false);
    assert.deepEqual(errors, []);
  });
});

test('a failed accepted-runtime proof preserves the old runtime and its selection after the light letter update', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  await fixture({ failRuntime: true }, async ({ page, errors }) => {
    await checkOldUpdater(page);
    await page.evaluate(() => { window.__oldApplied = __center.apply(); });
    await page.waitForFunction(() => !!window.__readerAcceptedLetterUpgrade, null, { timeout: 3000 });
    await page.evaluate(() => __readerAcceptedLetterUpgrade.promise);
    const state = await page.evaluate(key => ({ version: ReaderCore.runtimeVersion, selected: localStorage.getItem(key), phase: __readerAcceptedLetterUpgrade.phase, error: __readerAcceptedLetterUpgrade.error, controllers: document.querySelectorAll('#reader-core-controller').length }), key);
    assert.equal(state.version, oldVersion);assert.equal(state.selected, null);assert.equal(state.controllers, 1);
    assert.equal(state.phase, 'failed');assert.match(state.error, /runtime proof unavailable/);
    assert.deepEqual(errors, []);
  });
});

test('a new light letter leaves modern auto-regex hosting on its existing update path', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  await fixture({ modern: true }, async ({ page, errors }) => {
    await checkOldUpdater(page);
    await page.evaluate(async () => {
      const updates = document.getElementById('reader-core-controller').contentWindow.ReaderUpdates;
      const component = updates.components().find(item => item.id === 'regex');
      await component.apply(await component.check(), () => {});
    });
    assert.deepEqual(await page.evaluate(key => ({ version: ReaderCore.runtimeVersion, selected: localStorage.getItem(key), bootstrap: !!window.__readerAcceptedLetterUpgrade, runtimeDownloads: __calls.filter(call => call.name === 'reader-runtime.js').length }), key),
      { version: oldVersion, selected: null, bootstrap: false, runtimeDownloads: 0 });
    assert.deepEqual(errors, []);
  });
});

test('stopping the old host during accepted-letter runtime verification cancels the late bootstrap', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  await fixture({}, async ({ page, errors }) => {
    await checkOldUpdater(page);
    await page.evaluate(() => {
      window.__runtimeGate = new Promise(resolve => { window.__releaseRuntime = resolve; });
      window.__oldApplied = __center.apply();
    });
    await page.waitForFunction(() => __calls.some(call => call.name === 'reader-runtime.js'));
    await page.evaluate(() => { entry.stop(); __releaseRuntime(); });
    await page.evaluate(() => __readerAcceptedLetterUpgrade.promise);
    const state = await page.evaluate(key => ({ selected: localStorage.getItem(key), phase: __readerAcceptedLetterUpgrade.phase, error: __readerAcceptedLetterUpgrade.error,
      core: !!window.ReaderCore, controllers: document.querySelectorAll('#reader-core-controller').length }), key);
    assert.equal(state.selected, null);assert.equal(state.phase, 'failed');assert.equal(state.core, false);assert.equal(state.controllers, 0);
    assert.match(state.error, /变化|取消/);
    assert.deepEqual(errors, []);
  });
});
