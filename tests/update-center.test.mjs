import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../source/update-center.js',import.meta.url),'utf8');
function fixture(){const root={};root.window=root;vm.createContext(root);vm.runInContext(source,root);return root.ReaderUpdates;}
function component(id,status,calls,fail=false){return {id,label:id,check:async()=>({status,detail:'checked'}),apply:async()=>{calls.push(id);if(fail)throw Error(id+' failed');return {detail:'installed'};}};}
test('only stale components update, with script replacement last',async()=>{
 const calls=[],api=fixture().createCoordinator([component('script','outdated',calls),component('regex','current',calls),component('worldbook','outdated',calls)],()=>()=>{});
 await api.check();const result=await api.apply();assert.deepEqual(calls,['worldbook','script']);assert.deepEqual(Array.from(result,x=>x.status),['updated','current','updated']);
});
test('a no-update check performs no writes',async()=>{const calls=[],api=fixture().createCoordinator(['regex','script','worldbook'].map(id=>component(id,'current',calls)),()=>()=>{});await api.check();await api.apply();assert.deepEqual(calls,[]);});
test('a failed check does not mask independent stale components',async()=>{
 const calls=[],broken={id:'regex',label:'regex',check:async()=>{throw Error('invalid signed proof');}},api=fixture().createCoordinator([broken,component('script','outdated',calls),component('worldbook','current',calls)],()=>()=>{});
 assert.equal((await api.check())[0].status,'failed');const result=await api.apply();assert.deepEqual(calls,['script']);assert.equal(result[0].status,'failed');assert.match(result[0].detail,/signed proof/);
});
test('partial update failures retain successful item results and retries require a new check',async()=>{
 const calls=[],api=fixture().createCoordinator([component('regex','outdated',calls,true),component('worldbook','outdated',calls),component('script','outdated',calls)],()=>()=>{});
 await api.check();const result=await api.apply();assert.deepEqual(calls,['worldbook','regex','script']);assert.deepEqual(Array.from(result,x=>x.status),['failed','updated','updated']);await api.apply();assert.equal(calls.length,3);
});
test('repeated checks and updates share one in-flight operation',async()=>{
 let release,checks=0,writes=0;const api=fixture().createCoordinator([{id:'regex',label:'regex',check:()=>{checks++;return new Promise(r=>release=r);},apply:()=>{writes++;return new Promise(r=>release=r);}}],()=>()=>{});
 const first=api.check(),second=api.check();assert.equal(first,second);release({status:'outdated'});await first;assert.equal(checks,1);
 const update=api.apply(),duplicate=api.apply();assert.equal(update,duplicate);assert.equal(writes,1);release({});await update;assert.equal(api.busy,false);
});

test('component factories refresh on each check and apply the exact components that produced the plans',async()=>{
 const calls=[];let generation=0;
 const api=fixture().createCoordinator(()=>{const current=++generation;return [{id:'script',label:'script',check:async()=>({status:'outdated',generation:current}),apply:async plan=>{assert.equal(plan.generation,current);calls.push(current);return {};}}];},()=>()=>{});
 await api.check();await api.apply();await api.check();await api.apply();
 assert.deepEqual(calls,[1,2]);
});

test('a failed dynamic recheck invalidates plans from the previous check',async()=>{
 const calls=[];let fail=false;
 const api=fixture().createCoordinator(()=>{if(fail)throw Error('component discovery failed');return [component('script','outdated',calls)];},()=>()=>{});
 await api.check();fail=true;
 await assert.rejects(async()=>api.check(),/component discovery failed/);
 await assert.rejects(api.apply(),/请先检查更新/);
 assert.deepEqual(calls,[]);
});
test('context changes during download prohibit all remaining writes',async()=>{
 let current=true,release,writes=0;const api=fixture().createCoordinator([{id:'regex',label:'regex',check:async()=>({status:'outdated'}),apply:async(_,guard)=>{await new Promise(r=>release=r);guard();writes++;}},component('script','outdated',[])],()=>()=>{if(!current)throw Error('context changed');});
 await api.check();const applying=api.apply();current=false;release();const result=await applying;assert.equal(writes,0);assert.ok(result.every(item=>item.status==='failed'));
});
test('compatible regex refresh cannot prevent a previously accepted worldbook update',async()=>{
 const calls=[];let alive=true;const api=fixture().createCoordinator([{...component('regex','outdated',calls),apply:async()=>{calls.push('regex');alive=false;}},component('worldbook','outdated',calls),component('script','current',calls)],()=>()=>{if(!alive)throw Error('owner destroyed');});
 await api.check();await api.apply();assert.deepEqual(calls,['worldbook','regex']);
});

function runtimeFixture({offline=false,hosted=false}={}){
 const values=new Map(),calls=[],root={TextDecoder,TextEncoder};root.window=root;root.parent=root;root.SillyTavern={getContext:()=>({characterId:1,chatId:'a'})};
 let version='1.0';const marker=v=>'<!-- READER_LIGHT_VERSION:'+v+' --> ReaderLetter';let regex={id:'b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007',script_name:'读者对话渲染-脚本版',replace_string:marker(version)};
 root.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 root.TavernHelper={getTavernRegexes:option=>option.type==='character'?[regex]:[]};
 const metadata={schema:1,repository:'Adirm007/reader',version:'2.0',sourceCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64)};
 let pendingVersion=null;
 root.__readerHostApi={get runtimeVersion(){return version;},scriptOwner:null,getUpdateOptions:()=>({hostMode:hosted?'auto-regex':undefined,getHostedRuntimeState:()=>({pendingVersion}),installRuntime:async(artifact,guard)=>{guard();calls.push('hosted-cache');pendingVersion=artifact.metadata.version;},installRegex:async request=>{calls.push('regex');regex={...regex,replace_string:request.regex.replaceString};}})};
 root.ReaderScriptInstaller={inspect:()=>{calls.push('inspect-library');throw Error('not part of hosted startup');}};
 root.DreamFixedReleaseClient={compare:(a,b)=>Math.sign(parseFloat(a)-parseFloat(b)),latest:async()=>({repository:metadata.repository,version:'2.0'}),resource:async(selected,name)=>{calls.push('verify:'+name);if(offline)throw Error('offline proof');return {metadata,release:{},bytes:new TextEncoder().encode(name==='reader-runtime.js'?'source':JSON.stringify({id:regex.id,scriptName:regex.script_name,readerRuntime:{kind:'light-letter',version:'2.0'},replaceString:marker('2.0')}))};}};
 vm.createContext(root);vm.runInContext(source,root);return {root,calls,values,metadata,get version(){return version;}};
}
test('an older host without persistent runtime support cannot silently install a library script',async()=>{
 const f=runtimeFixture(),api=f.root.ReaderUpdates.createCoordinator(f.root.ReaderUpdates.components(),()=>()=>{});
 const script=(await api.check()).find(item=>item.id==='script');assert.equal(script.status,'unavailable');assert.match(script.detail,/旧版角色卡.*不会自动创建独立脚本/);
 await api.apply();assert.equal(f.calls.includes('inspect-library'),false);assert.equal(f.calls.includes('verify:reader-runtime.js'),false);assert.equal(f.version,'1.0');
});
test('compatibility restoration never downloads code, checks releases or writes the script library',async()=>{
 const f=runtimeFixture();f.values.set('dream_reader_core_selected_v1',JSON.stringify(f.metadata));await f.root.ReaderUpdates.restore();
 assert.deepEqual(f.calls,[]);assert.equal(f.values.has('dream_reader_core_selected_v1'),true);
 const offline=runtimeFixture({offline:true});await offline.root.ReaderUpdates.restore();assert.deepEqual(offline.calls,[]);assert.equal(offline.root.__readerHostApi.updateRestoreError,undefined);
 const owned=runtimeFixture();owned.root.__readerHostApi.scriptOwner={id:'reader'};await owned.root.ReaderUpdates.restore();assert.deepEqual(owned.calls,[]);
});
test('auto-regex hosting only acquires a runtime after manual confirmation and reports the saved next-start version',async()=>{
 const f=runtimeFixture({hosted:true});await f.root.ReaderUpdates.restore();assert.deepEqual(f.calls,[]);
 const component=f.root.ReaderUpdates.components().find(item=>item.id==='script');assert.equal(component.label,'读者运行脚本');
 const plan=await component.check();assert.equal(plan.status,'outdated');assert.deepEqual(f.calls,[]);
 const done=await component.apply(plan,()=>{});assert.deepEqual(f.calls,['verify:reader-runtime.js','hosted-cache']);
 assert.match(done.detail,/下次启动/);assert.match(done.detail,/播放保持不变/);assert.equal(f.version,'1.0');
 const again=await component.check();assert.equal(again.status,'current');assert.equal(again.version,'2.0');assert.match(again.detail,/当前 v1\.0.*已保存 v2\.0.*下次启动/);
 assert.equal(f.calls.includes('ensure'),false);
});
test('the update receipt survives owner destruction and retains earlier component failures',async()=>{
 const snapshots=[],calls=[];
 const api=fixture().createCoordinator([component('worldbook','outdated',calls,true),component('regex','outdated',calls),component('script','outdated',calls)],()=>()=>{},(items,pending)=>snapshots.push(items.map(item=>({id:item.id,status:item.id===pending?'submitted':item.status,detail:item.detail}))));
 await api.check();await api.apply();const beforeScript=snapshots.find(items=>items.find(item=>item.id==='script').status==='submitted');assert.equal(beforeScript.find(item=>item.id==='worldbook').status,'failed');assert.match(beforeScript.find(item=>item.id==='worldbook').detail,/failed/);assert.equal(beforeScript.find(item=>item.id==='regex').status,'updated');
});
