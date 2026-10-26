import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const sources=await Promise.all(['fixed-release-client','regex-update-guard','release-updates'].map(n=>readFile(new URL('../source/'+n+'.js',import.meta.url),'utf8')));
const repositories=['Adirm007/reader','Adirm007/Protelysion'];
const ids=['cfc0375e-3c5c-4ea1-8b7b-2093c7df0a11','cfc0375e-3c5c-4ea1-8b7b-2093c7df0a12'];
const clone=x=>JSON.parse(JSON.stringify(x));
function loader(repository,version){return '<!-- FIXED_RELEASE:'+JSON.stringify({schema:1,repository,version,sourceCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64)})+' -->\nconst VERSION="'+version+'";\nwindow.mustNeverRun=true;';}
function raw(index,version='1.0.0'){
  return {id:ids[index],scriptName:'fixed '+index,disabled:index===1,runOnEdit:true,findRegex:'<placeholder-'+index+'>',trimStrings:[],replaceString:loader(repositories[index],version),placement:[2],substituteRegex:0,minDepth:null,maxDepth:10,markdownOnly:true,promptOnly:false};
}
function normalize(r){return {id:r.id,script_name:r.scriptName,enabled:!r.disabled,run_on_edit:r.runOnEdit,find_regex:r.findRegex,trim_strings:r.trimStrings||[],replace_string:r.replaceString,source:{user_input:r.placement.includes(1),ai_output:r.placement.includes(2),slash_command:r.placement.includes(3),world_info:r.placement.includes(5),reasoning:r.placement.includes(6)},destination:{display:r.markdownOnly,prompt:r.promptOnly},min_depth:typeof r.minDepth==='number'?r.minDepth:null,max_depth:typeof r.maxDepth==='number'?r.maxDepth:null};}
function denormalize(r){return {id:r.id,scriptName:r.script_name,disabled:!r.enabled,runOnEdit:r.run_on_edit,findRegex:r.find_regex,trimStrings:r.trim_strings,replaceString:r.replace_string,placement:[['user_input',1],['ai_output',2],['slash_command',3],['world_info',5],['reasoning',6]].filter(([name])=>r.source[name]).map(([,n])=>n),substituteRegex:0,minDepth:r.min_depth,maxDepth:r.max_depth,markdownOnly:r.destination.display,promptOnly:r.destination.prompt};}
function fixture({separate=false,installed=true}={}){
  const ctx={characterId:0,characters:[{avatar:'test.png',data:{extensions:{regex_scripts:[]}}}],extensionSettings:{regex:[]},chatCompletionSettings:{extensions:{regex_scripts:[]}},getPresetManager:()=>({getSelectedPresetName:()=>ctx.preset}),preset:'test preset',mainApi:'openai'};
  if(installed){ctx.extensionSettings.regex.push(raw(0));(separate?ctx.characters[0].data.extensions.regex_scripts:ctx.extensionSettings.regex).push(raw(1));}
  const state={writes:[],downloads:[],store:new Map(),ctx};
  function list(option){return option.type==='global'?ctx.extensionSettings.regex:option.type==='character'?ctx.characters[ctx.characterId].data.extensions.regex_scripts:ctx.chatCompletionSettings.extensions.regex_scripts;}
  const helper={getTavernHelperVersion:()=> '4.9.3',getTavernRegexes:option=>clone(list(option)).map(normalize),replaceTavernRegexes:(array,option)=>{state.writes.push({array:clone(array),option:clone(option)});list(option).splice(0,Infinity,...array.map(denormalize));return Promise.resolve();}};
  const sandbox={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,AbortController,setTimeout,clearTimeout,URL,Blob,Response,crypto:webcrypto,TavernHelper:helper,SillyTavern:{getContext:()=>ctx},localStorage:{getItem:key=>state.store.get(key)||null,setItem:(key,value)=>state.store.set(key,value)}};
  sandbox.window=sandbox;sandbox.parent=sandbox;sandbox.top=sandbox;
  vm.createContext(sandbox);vm.runInContext(sources[0],sandbox);const real=sandbox.DreamFixedReleaseClient;
  state.latest=async repository=>({repository,version:'1.1.0',release:{}});
  state.download=async selected=>{state.downloads.push(selected.repository);const index=repositories.indexOf(selected.repository),newRaw=raw(index,selected.version);newRaw.scriptName='new '+index;newRaw.findRegex='MUST NOT REPLACE MATCHER';return {metadata:real.metadata(newRaw,selected.repository,selected.version),regex:newRaw};};
  sandbox.DreamFixedReleaseClient={...real,latest:repository=>state.latest(repository),download:selected=>state.download(selected)};
  vm.runInContext(sources[1],sandbox);vm.runInContext(sources[2],sandbox);
  Object.assign(state,{sandbox,helper,updates:sandbox.DreamReleaseUpdates,guard:sandbox.DreamRegexUpdateGuard,client:real});return state;
}

test('checking two versions reads metadata only and never runs or installs downloaded code',async()=>{
  const f=fixture(),result=await f.updates.check();assert.equal(result.projects.filter(p=>p.updatable).length,2);assert.equal(f.writes.length,0);assert.equal(f.downloads.length,0);assert.equal(f.sandbox.mustNeverRun,undefined);
});
test('equal or older versions are not updates; missing fixed installations are not silently installed',async()=>{
  const f=fixture();f.latest=async repository=>({repository,version:repository===repositories[0]?'1.0.0':'0.9.9',release:{}});assert.ok((await f.updates.check()).projects.every(p=>!p.updatable));
  assert.ok((await fixture({installed:false}).updates.check()).projects.every(p=>!p.updatable));
});
test('a rate-limited repository fails independently instead of reporting no update',async()=>{
  const f=fixture();f.latest=async repository=>{if(repository===repositories[1])throw Error('GitHub 暂时限流');return {repository,version:'1.1.0',release:{}};};const result=await f.updates.check();assert.equal(result.projects[0].updatable,true);assert.match(result.projects[1].error,/限流/);assert.equal(f.writes.length,0);
});
test('duplicate and malformed fixed installations cannot be automatically selected',async()=>{
  const f=fixture();f.ctx.characters[0].data.extensions.regex_scripts.push(raw(0));let result=await f.updates.check();assert.equal(result.projects[0].installed.length,2);assert.equal(result.projects[0].updatable,false);
  const g=fixture();g.ctx.extensionSettings.regex[0].replaceString='broken';result=await g.updates.check();assert.equal(result.projects[0].invalid.length,1);assert.equal(result.projects[0].updatable,false);
});
test('one edited VERSION number is the installed selection used for comparisons',async()=>{
  const f=fixture();f.ctx.extensionSettings.regex[0].replaceString=f.ctx.extensionSettings.regex[0].replaceString.replace('const VERSION="1.0.0"','const VERSION="1.2.0"');const result=await f.updates.check();assert.equal(result.projects[0].installed[0].metadata.version,'1.2.0');assert.equal(result.projects[0].updatable,false);
});
test('all artifacts are verified before one grouped write, preserving enabled state and unrelated settings',async()=>{
  const f=fixture(),extra={...raw(0),id:'unrelated',scriptName:'my own',replaceString:'unchanged',findRegex:'custom',maxDepth:3};f.ctx.extensionSettings.regex.push(extra);
  const before=clone(f.ctx.extensionSettings.regex),checked=await f.updates.check();await f.updates.apply(checked);
  assert.equal(f.downloads.length,2);assert.equal(f.writes.length,1);assert.ok(f.store.size>0);assert.equal(f.ctx.extensionSettings.regex[1].disabled,true);
  for(let i=0;i<2;i++){assert.equal(f.ctx.extensionSettings.regex[i].id,before[i].id);assert.equal(f.ctx.extensionSettings.regex[i].findRegex,before[i].findRegex);assert.equal(f.ctx.extensionSettings.regex[i].maxDepth,10);}
  assert.deepEqual(f.ctx.extensionSettings.regex[2],extra);assert.equal(f.sandbox.mustNeverRun,undefined);
  const receipt=await f.updates.receiptStatus();assert.ok(receipt.verified.every(v=>v.matches));assert.equal(receipt.contextMatches,true);
});
test('one failed download, backup failure or old helper makes zero host mutations',async()=>{
  for(const reason of ['download','backup','helper']){
    const f=fixture();if(reason==='download'){const original=f.download;f.download=async s=>{if(s.repository===repositories[1])throw Error('bad digest');return original(s);};}
    if(reason==='backup')f.sandbox.localStorage.setItem=()=>{throw Error('quota');};if(reason==='helper')f.helper.getTavernHelperVersion=()=> '4.8.9';
    const checked=await f.updates.check();await assert.rejects(f.updates.apply(checked));assert.equal(f.writes.length,0,reason);
  }
});
test('the settings roundtrip guard rejects advanced or unexposed fields across the whole affected scope',async()=>{
  for(const mutate of [r=>r.substituteRegex=1,r=>r.extraField=true,r=>delete r.minDepth,r=>r.scriptName='',r=>r.placement=[2,1]]){
    const f=fixture();mutate(f.ctx.extensionSettings.regex[1]);const checked=await f.updates.check();await assert.rejects(f.updates.apply(checked));assert.equal(f.writes.length,0);
  }
});
test('changing a regex or selected preset during download aborts before writing',async()=>{
  for(const change of [f=>f.ctx.extensionSettings.regex[0].maxDepth=2,f=>f.ctx.preset='other preset']){
    const f=fixture(),checked=await f.updates.check(),original=f.download;let done=false;f.download=async s=>{const result=await original(s);if(!done){done=true;change(f);}return result;};await assert.rejects(f.updates.apply(checked),/变化/);assert.equal(f.writes.length,0);
  }
});
test('writes to separate scopes start together even while the first host promise remains pending',async()=>{
  const f=fixture({separate:true}),checked=await f.updates.check();let release;const calls=[];
  f.helper.replaceTavernRegexes=(list,option)=>{calls.push(option.type);return option.type==='global'?new Promise(resolve=>release=resolve):Promise.resolve();};
  const applying=f.updates.apply(checked);for(let i=0;i<30&&calls.length<2;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.deepEqual(calls,['global','character']);release();await applying;
});
test('partial host failure keeps the pre-update backup and never claims transaction success',async()=>{
  const f=fixture({separate:true}),checked=await f.updates.check();f.helper.replaceTavernRegexes=(_,option)=>option.type==='character'?Promise.reject(Error('save failed')):Promise.resolve();
  await assert.rejects(f.updates.apply(checked),/部分/);const receipt=JSON.parse([...f.store.values()][0]);assert.equal(receipt.phase,'partial');assert.equal(receipt.backup.length,3);
});
