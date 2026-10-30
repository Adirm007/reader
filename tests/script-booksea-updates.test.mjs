import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fixedReaderFixture,LIGHT_ID} from './helpers/fixed-script-migration-host.mjs';
const releaseSource=await readFile(new URL('../source/release-updates.js',import.meta.url),'utf8');

const BOOKSEA='Adirm007/Protelysion',BOOKSEA_ID='cfc0375e-3c5c-4ea1-8b7b-2093c7df0a12';
const clone=value=>JSON.parse(JSON.stringify(value));
function fixedBooksea(version='1.0'){
 const pin={schema:1,repository:BOOKSEA,version,sourceCommit:'1'.repeat(40),manifestSha256:'2'.repeat(64)};
 return {id:BOOKSEA_ID,scriptName:'书海固定版 v'+version,disabled:false,runOnEdit:false,findRegex:'/<booksea>(.*?)<\\/booksea>/g',replaceString:'<!-- FIXED_RELEASE:'+JSON.stringify(pin)+' -->\nconst VERSION="'+version+'";\nbooksea '+version,trimStrings:[],placement:[2],substituteRegex:0,minDepth:1,maxDepth:4,markdownOnly:true,promptOnly:false};
}
function fixture(options={}){
 const f=fixedReaderFixture(),calls=f.calls,raw=f.regexes[0];
 const light={...raw,id:LIGHT_ID,scriptName:'读者对话渲染-脚本版',replaceString:'<!-- READER_LIGHT_VERSION:'+(options.readerOld?'1.0':'2.0')+' --> ReaderLetter ReaderCore'};
 const mine={...raw,id:'mine',scriptName:'玩家前置',replaceString:'mine'};
 const after={...mine,id:'after',scriptName:'玩家后置',replaceString:'after'};
 f.regexes.splice(0,Infinity,mine,light,after);
 if(options.booksea!==false){const scope=options.otherScope?f.context.extensionSettings.regex:f.regexes;scope.splice(1,0,fixedBooksea());}
 const original=clone({character:f.regexes,global:f.context.extensionSettings.regex});
 const actual=f.root.DreamFixedReleaseClient;
 f.root.DreamFixedReleaseClient={...actual,latest:async repository=>{calls.push('latest:'+repository);return {repository,version:'2.0'};},
  download:async selected=>{
   assert.equal(selected.repository,BOOKSEA);calls.push('download:booksea');
   await options.onDownload?.(f);
   if(options.failBooksea)throw Error('booksea proof failed');
   const regex=fixedBooksea('2.0');return {regex,metadata:{repository:BOOKSEA,version:'2.0'}};
  },resource:async(selected,name)=>{if(options.failReader&&name==='reader-letter.json')throw Error('reader proof failed');return actual.resource(selected,name);},
 };
 vm.runInContext(releaseSource,f.root,{filename:'release-updates.js'});
 const hostOptions=options.hooks||{};
 f.root.__readerHostApi={runtimeVersion:'2.0',getUpdateOptions:()=>hostOptions};
 const replace=f.helper.replaceTavernRegexes;
 f.helper.replaceTavernRegexes=(rules,scope)=>{calls.push('write:'+scope.type);return replace(rules,scope);};
 const component=f.root.ReaderUpdates.components().find(item=>item.id==='regex');
 const center=f.root.ReaderUpdates.createCoordinator([component]);
 return {...f,center,original,read:()=>clone({character:f.regexes,global:f.context.extensionSettings.regex})};
}

test('the modern update check keeps an installed booksea fixed renderer visible without requiring a reader fixed rule',async()=>{
 const f=fixture({hooks:{installRegex:async()=>{throw Error('booksea-only must not rewrite Reader');}}}),results=await f.center.check();
 assert.equal(results[0].status,'outdated');assert.match(results[0].detail,/书海.*1\.0.*2\.0/);
 assert.deepEqual(f.calls.filter(call=>call.startsWith('latest:')),['latest:Adirm007/reader','latest:'+BOOKSEA]);
 assert.equal(f.calls.some(call=>call.startsWith('write:')),false);
 await f.center.apply();
 assert.equal(f.calls.includes('download:booksea'),true);
 assert.equal(f.calls.some(call=>call==='verified:reader-letter.json'),false,'booksea-only updates never download or reinstall Reader light');
 assert.equal(f.calls.filter(call=>call==='write:character').length,1);
 const saved=f.read();assert.deepEqual(saved.character.filter(rule=>rule.id!==BOOKSEA_ID),f.original.character.filter(rule=>rule.id!==BOOKSEA_ID));
 assert.equal(saved.character.find(rule=>rule.id===BOOKSEA_ID).replaceString,fixedBooksea('2.0').replaceString);
});

test('Reader light and Booksea fixed updates in one scope share one guarded write after all verified downloads',async()=>{
 const f=fixture({readerOld:true}),checked=await f.center.check();assert.equal(checked[0].status,'outdated');
 const results=await f.center.apply();assert.equal(results[0].status,'updated');
 assert.equal(f.calls.filter(call=>call==='write:character').length,1);
 assert.ok(f.calls.indexOf('verified:reader-letter.json')<f.calls.indexOf('write:character'));
 assert.ok(f.calls.indexOf('download:booksea')<f.calls.indexOf('write:character'));
 const saved=f.read();assert.deepEqual(saved.character.map(rule=>rule.id),f.original.character.map(rule=>rule.id));
 for(const old of f.original.character){const fresh=saved.character.find(rule=>rule.id===old.id);for(const key of Object.keys(old).filter(key=>!['replaceString','scriptName'].includes(key)))assert.deepEqual(fresh[key],old[key],old.id+':'+key);}
 assert.match(saved.character.find(rule=>rule.id===LIGHT_ID).replaceString,/READER_LIGHT_VERSION:2\.0/);
 assert.equal(saved.character.find(rule=>rule.id===BOOKSEA_ID).replaceString,fixedBooksea('2.0').replaceString);
});

test('cross-scope updates preserve every original setting and relative position',async()=>{
 const f=fixture({readerOld:true,otherScope:true});await f.center.check();await f.center.apply();
 assert.equal(f.calls.filter(call=>call==='write:character').length,1);assert.equal(f.calls.filter(call=>call==='write:global').length,1);
 const saved=f.read();
 assert.deepEqual(saved.character.map(rule=>rule.id),f.original.character.map(rule=>rule.id));
 assert.deepEqual(saved.global.map(rule=>rule.id),f.original.global.map(rule=>rule.id));
 for(const scope of ['character','global'])for(const old of f.original[scope]){
  const fresh=saved[scope].find(rule=>rule.id===old.id);
  for(const key of Object.keys(old).filter(key=>!['replaceString','scriptName'].includes(key)))assert.deepEqual(fresh[key],old[key]);
 }
});

test('a failed Reader or Booksea verified download leaves the entire regex graph unchanged',async()=>{
 for(const failure of [{failReader:true},{failBooksea:true}]){
  const f=fixture({readerOld:true,...failure});await f.center.check();const results=await f.center.apply();
  assert.equal(results[0].status,'failed');assert.deepEqual(f.read(),f.original);assert.equal(f.calls.some(call=>call.startsWith('write:')),false);
 }
});

test('a chat switch during Booksea download prevents both scoped writes',async()=>{
 const f=fixture({readerOld:true,otherScope:true,onDownload:f=>f.switchChat()});await f.center.check();const results=await f.center.apply();
 assert.equal(results[0].status,'failed');assert.deepEqual(f.read(),f.original);assert.equal(f.calls.some(call=>call.startsWith('write:')),false);
});

test('a player edit during Booksea download is preserved and cancels the whole batch',async()=>{
 const f=fixture({readerOld:true,onDownload:f=>{f.regexes.find(rule=>rule.id==='mine').maxDepth=1;}});await f.center.check();const results=await f.center.apply();
 assert.equal(results[0].status,'failed');assert.equal(f.read().character.find(rule=>rule.id==='mine').maxDepth,1);
 assert.equal(f.calls.some(call=>call.startsWith('write:')),false);assert.equal(f.read().character.find(rule=>rule.id===BOOKSEA_ID).replaceString,fixedBooksea().replaceString);
});

test('no installed Booksea fixed renderer means no Booksea network check',async()=>{
 const f=fixture({booksea:false}),checked=await f.center.check();assert.equal(checked[0].status,'current');
 assert.equal(f.calls.includes('latest:'+BOOKSEA),false);await f.center.apply();assert.equal(f.calls.some(call=>call.startsWith('write:')),false);
});

test('an older host hook cannot silently skip a joint Booksea update',async()=>{
 let hookCalls=0;const f=fixture({readerOld:true,hooks:{installRegex:async()=>{hookCalls++;}}});await f.center.check();const results=await f.center.apply();
 assert.equal(results[0].status,'failed');assert.match(results[0].detail,/宿主不支持.*联合更新/);assert.equal(hookCalls,0);assert.deepEqual(f.read(),f.original);
});

test('the explicit batch hook adopts the new light rule around the same guarded commit',async()=>{
 let hookCalls=0;const f=fixture({readerOld:true,hooks:{installRegexBatch:async update=>{hookCalls++;await update.commit();}}});await f.center.check();const results=await f.center.apply();
 assert.equal(results[0].status,'updated');assert.equal(hookCalls,1);assert.equal(f.calls.filter(call=>call==='write:character').length,1);
});
