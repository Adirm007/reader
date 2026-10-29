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
test('context changes during download prohibit all remaining writes',async()=>{
 let current=true,release,writes=0;const api=fixture().createCoordinator([{id:'regex',label:'regex',check:async()=>({status:'outdated'}),apply:async(_,guard)=>{await new Promise(r=>release=r);guard();writes++;}},component('script','outdated',[])],()=>()=>{if(!current)throw Error('context changed');});
 await api.check();const applying=api.apply();current=false;release();const result=await applying;assert.equal(writes,0);assert.ok(result.every(item=>item.status==='failed'));
});
test('compatible regex refresh cannot prevent a previously accepted worldbook update',async()=>{
 const calls=[];let alive=true;const api=fixture().createCoordinator([{...component('regex','outdated',calls),apply:async()=>{calls.push('regex');alive=false;}},component('worldbook','outdated',calls),component('script','current',calls)],()=>()=>{if(!alive)throw Error('owner destroyed');});
 await api.check();await api.apply();assert.deepEqual(calls,['worldbook','regex']);
});

function runtimeFixture({offline=false}={}){
 const values=new Map(),calls=[],root={TextDecoder,TextEncoder};root.window=root;root.parent=root;root.SillyTavern={getContext:()=>({characterId:1,chatId:'a'})};
 let version='1.0';const marker=v=>'<!-- READER_LIGHT_VERSION:'+v+' --> ReaderLetter';let regex={id:'b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007',script_name:'读者对话渲染-脚本版',replace_string:marker(version)};
 root.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 root.TavernHelper={getTavernRegexes:option=>option.type==='character'?[regex]:[]};
 const metadata={schema:1,repository:'Adirm007/reader',version:'2.0',sourceCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64)};
 root.__readerHostApi={get runtimeVersion(){return version;},getUpdateOptions:()=>({installRegex:async request=>{calls.push('regex');regex={...regex,replace_string:request.regex.replaceString};},installRuntime:async()=>{calls.push('script');version='2.0';}})};
 root.DreamFixedReleaseClient={compare:(a,b)=>Math.sign(parseFloat(a)-parseFloat(b)),latest:async()=>({repository:metadata.repository,version:'2.0'}),resource:async(selected,name)=>{calls.push('verify:'+name);if(offline)throw Error('offline proof');return {metadata,release:{},bytes:new TextEncoder().encode(name==='reader-runtime.js'?'source':JSON.stringify({id:regex.id,scriptName:regex.script_name,readerRuntime:{kind:'light-letter',version:'2.0'},replaceString:marker('2.0')}))};}};
 vm.createContext(root);vm.runInContext(source,root);return {root,calls,values,metadata,get version(){return version;}};
}
test('a previously consented version restores through the signed-resource boundary before host hooks',async()=>{
 const f=runtimeFixture();f.values.set('dream_reader_core_selected_v1',JSON.stringify(f.metadata));await f.root.ReaderUpdates.restore();assert.deepEqual(f.calls,['verify:reader-letter.json','regex','verify:reader-runtime.js','script']);assert.equal(f.version,'2.0');
});
test('offline restore retains the installed runtime and records a visible retry failure',async()=>{
 const f=runtimeFixture({offline:true});f.values.set('dream_reader_core_selected_v1',JSON.stringify(f.metadata));await f.root.ReaderUpdates.restore();assert.equal(f.version,'1.0');assert.ok(f.calls.every(c=>c.startsWith('verify:')));assert.match(f.root.__readerHostApi.updateRestoreError,/尚未恢复.*offline proof/);
});
test('the update receipt survives owner destruction and retains earlier component failures',async()=>{
 const snapshots=[],calls=[];
 const api=fixture().createCoordinator([component('worldbook','outdated',calls,true),component('regex','outdated',calls),component('script','outdated',calls)],()=>()=>{},(items,pending)=>snapshots.push(items.map(item=>({id:item.id,status:item.id===pending?'submitted':item.status,detail:item.detail}))));
 await api.check();await api.apply();const beforeScript=snapshots.find(items=>items.find(item=>item.id==='script').status==='submitted');assert.equal(beforeScript.find(item=>item.id==='worldbook').status,'failed');assert.match(beforeScript.find(item=>item.id==='worldbook').detail,/failed/);assert.equal(beforeScript.find(item=>item.id==='regex').status,'updated');
});
