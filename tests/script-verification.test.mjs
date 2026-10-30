import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedReaderFixture,SCRIPT_ID} from './helpers/fixed-script-migration-host.mjs';

const selected={repository:'Adirm007/reader',version:'2.0'};
async function installed(options={}){
 const f=fixedReaderFixture(options);
 await f.root.ReaderScriptInstaller.install(await f.root.DreamFixedReleaseClient.resource(selected,'reader-runtime.js'),()=>{},{scope:options.scope||'character'});
 return f;
}
function writes(f){return f.calls.filter(call=>call==='script-write'||call==='regex-write').length;}

for(const scope of ['character','global'])test('read-only verification confirms a saved, enabled and ready '+scope+' script',async()=>{
 const f=await installed({scope}),before=writes(f);
 const result=await f.root.ReaderScriptInstaller.verify({scope},()=>{});
 assert.equal(result.version,'2.0');assert.equal(result.id,SCRIPT_ID);assert.equal(result.persisted,true);
 assert.equal(result.api,f.root.ReaderCore);assert.equal(result.ownerToken,f.root.ReaderCore.scriptOwner.token);
 assert.equal(result.metadata.sourceCommit,f.metadata.sourceCommit);assert.ok(result.snapshot.fingerprint);
 assert.equal(writes(f),before,'checking never writes a script or regex');
});

test('a same-version running API alone does not prove a saved script',async()=>{
 const f=fixedReaderFixture();
 f.root.ReaderCore={runtimeVersion:'2.0',scriptOwner:{id:SCRIPT_ID,token:'not-saved',scope:'character'},isAlive:true,ready:Promise.resolve({running:true})};
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/未找到/);
 assert.equal(writes(f),0);
});

test('a row changed only in memory is not reported as persisted',async()=>{
 const f=await installed(),before=writes(f);
 f.scripts.find(item=>item.id===SCRIPT_ID).info='changed in memory';
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/保存/);
 assert.equal(writes(f),before);
});

test('a disabled managed script or script container is not current',async()=>{
 const f=await installed(),managed=f.scripts.find(item=>item.id===SCRIPT_ID),before=writes(f);
 managed.enabled=false;
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/未启用/);
 managed.enabled=true;f.context.extensionSettings.tavern_helper.script.enabled.characters=[];
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/未启用/);
 assert.equal(writes(f),before);
});

test('the saved version cannot cover a failed readiness result',async()=>{
 const f=await installed(),before=writes(f);
 f.root.ReaderCore.ready=Promise.resolve(null);
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/未能启动/);
 assert.equal(writes(f),before);
});

test('a rejected controller readiness promise is reported as failure',async()=>{
 const f=await installed(),before=writes(f),ready=Promise.reject(Error('ready failed'));
 ready.catch(()=>{});f.root.ReaderCore.ready=ready;
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/ready failed/);
 assert.equal(writes(f),before);
});

test('a different running owner is rejected immediately without waiting or writing',async()=>{
 const f=await installed(),before=writes(f);
 f.root.ReaderCore.scriptOwner.token='another-owner';
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/未接管/);
 assert.equal(writes(f),before);
});

test('a context switch during persisted verification aborts the result',async()=>{
 const f=await installed(),fetch=f.root.fetch,before=writes(f);
 f.root.fetch=async(...args)=>{const response=await fetch(...args);f.switchChat();return response;};
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/变化/);
 assert.equal(writes(f),before);
});

test('script tree changes during verification cannot be reported as current',async()=>{
 const f=await installed(),fetch=f.root.fetch,before=writes(f);
 f.root.fetch=async(...args)=>{const response=await fetch(...args);f.scripts[0].info='concurrent edit';return response;};
 await assert.rejects(f.root.ReaderScriptInstaller.verify({scope:'character'}),/脚本库.*变化/);
 assert.equal(writes(f),before);
});
