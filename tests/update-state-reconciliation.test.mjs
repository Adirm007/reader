import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedReaderFixture,LIGHT_ID,SCRIPT_ID} from './helpers/fixed-script-migration-host.mjs';

const selected={repository:'Adirm007/reader',version:'2.0'};
function components(f){return f.root.ReaderUpdates.createCoordinator(f.root.ReaderUpdates.components());}

for(const id of [LIGHT_ID,'reimported-reader-fixed-id']){
 test('a valid fixed renderer with its retained import ID migrates successfully: '+id,async()=>{
  const f=fixedReaderFixture();f.regexes[0].id=id;
  const original=structuredClone(f.regexes[0]),updates=components(f);
  const checked=await updates.check();assert.equal(checked.find(item=>item.id==='script').status,'outdated');
  const results=await updates.apply();
  assert.equal(f.root.ReaderCore?.runtimeVersion,'2.0','the verified script really starts before reconciliation');
  assert.equal(f.scripts.filter(item=>item.id===SCRIPT_ID).length,1);
  assert.equal(results.find(item=>item.id==='script').status,'updated','a retained import UUID is not an installation failure');
  assert.equal(f.regexes.length,1);assert.equal(f.regexes[0].id,LIGHT_ID);
  assert.match(f.regexes[0].replaceString,/READER_LIGHT_VERSION:2\.0/);
  assert.doesNotMatch(f.regexes[0].replaceString,/FIXED_RELEASE:/);
  for(const key of ['disabled','runOnEdit','findRegex','minDepth','maxDepth','placement','trimStrings','substituteRegex','markdownOnly','promptOnly'])assert.deepEqual(f.regexes[0][key],original[key],key);
 });
 test('an older fixed renderer with retained ID updates its full loader before completing script migration: '+id,async()=>{
  const f=fixedReaderFixture({fixedVersion:'1.0'});f.regexes[0].id=id;
  const original=structuredClone(f.regexes[0]),regexWrites=[],replace=f.helper.replaceTavernRegexes;
  f.helper.replaceTavernRegexes=(list,scope)=>{regexWrites.push({list:structuredClone(list),callIndex:f.calls.length});return replace(list,scope);};
  const checked=await f.root.ReaderUpdates.check();
  assert.equal(checked.find(item=>item.id==='regex').status,'outdated');
  assert.equal(checked.find(item=>item.id==='script').status,'outdated');
  const results=await f.root.ReaderUpdates.apply();
  assert.ok(results.filter(item=>item.id==='regex'||item.id==='script').every(item=>item.status==='updated'));
  assert.equal(regexWrites.length,2);
  assert.equal(regexWrites[0].list[0].id,id,'the loader update preserves the imported rule identity');
  assert.match(regexWrites[0].list[0].replace_string,/FIXED_RELEASE:/);
  assert.match(regexWrites[1].list[0].replace_string,/READER_LIGHT_VERSION:2\.0/);
  assert.ok(regexWrites[0].callIndex<f.calls.indexOf('script-write'));
  assert.ok(f.calls.indexOf('script-start')<regexWrites[1].callIndex);
  assert.equal(f.regexes[0].id,LIGHT_ID);
  assert.match(f.regexes[0].replaceString,/READER_LIGHT_VERSION:2\.0/);
  for(const key of ['disabled','runOnEdit','findRegex','minDepth','maxDepth','placement','trimStrings','substituteRegex','markdownOnly','promptOnly'])assert.deepEqual(f.regexes[0][key],original[key],key);
  const writes=f.calls.filter(call=>call==='script-write'||call==='regex-write').length;
  assert.ok((await f.root.ReaderUpdates.check()).every(item=>item.status==='current'));
  await f.root.ReaderUpdates.apply();
  assert.equal(f.calls.filter(call=>call==='script-write'||call==='regex-write').length,writes);
 });
}

test('rechecking the same update page after a successful migration uses the current installed components',async()=>{
 const f=fixedReaderFixture();
 await f.root.ReaderScriptInstaller.install(await f.root.DreamFixedReleaseClient.resource(selected,'reader-runtime.js'),()=>{});
 assert.equal(f.root.__readerHostApi,undefined,'the old fixed frame has no private runtime bridge');
 const first=await f.root.ReaderUpdates.check();assert.equal(first.find(item=>item.id==='script').status,'outdated','a still-complete renderer can finish its migration');
 const applied=await f.root.ReaderUpdates.apply();assert.equal(applied.find(item=>item.id==='script').status,'updated');
 const writes=f.calls.filter(call=>call==='script-write'||call==='regex-write').length;
 const checked=await f.root.ReaderUpdates.check();
 assert.ok(checked.every(item=>item.status==='current'),JSON.stringify(checked.map(item=>({id:item.id,status:item.status,detail:item.detail}))));
 await f.root.ReaderUpdates.apply();
 assert.equal(f.calls.filter(call=>call==='script-write'||call==='regex-write').length,writes,'a successful recheck never installs the same version again');
});

const resultKey='dream_reader_update_result_v1';
function pendingReceipt(f,status='failed'){
 const receipt={context:JSON.stringify([f.context.characterId,f.context.chatId]),items:[{id:'script',label:'脚本',status,detail:'原固定版发生变化，请重新检查',version:'2.0'}]};
 f.values.set(resultKey,JSON.stringify(receipt));return receipt;
}
function recordedScript(f){return JSON.parse(f.values.get(resultKey)).items.find(item=>item.id==='script');}
async function migrate(f){const plan=await f.root.ReaderFixedMigration.check(selected);await f.root.ReaderFixedMigration.install(plan,()=>{});}

for(const status of ['submitted','failed']){
 test('a fresh public check reconciles a '+status+' script receipt using its saved ready owner',async()=>{
  const f=fixedReaderFixture();await migrate(f);pendingReceipt(f,status);
  const before=f.calls.filter(call=>call==='script-write'||call==='regex-write').length;
  const checked=await f.root.ReaderUpdates.check();
  assert.equal(checked.find(item=>item.id==='script').status,'current');
  assert.equal(recordedScript(f).status,'updated');
  assert.equal(f.calls.filter(call=>call==='script-write'||call==='regex-write').length,before,'reconciliation is read-only');
 });
}

test('a visible same-version light renderer and live API cannot turn an unsaved script receipt into success',async()=>{
 const f=fixedReaderFixture();await migrate(f);pendingReceipt(f);
 f.root.fetch=async()=>Response.json({json_data:JSON.stringify({data:{extensions:{tavern_helper:{scripts:f.originalScripts}}}})});
 const checked=await f.root.ReaderUpdates.check();
 assert.equal(checked.find(item=>item.id==='script').status,'failed');
 assert.match(checked.find(item=>item.id==='script').detail,/保存|脚本库|一致/);
 assert.equal(recordedScript(f).status,'failed');
});

test('a same-version runtime whose readiness fails remains failed when a light renderer is present',async()=>{
 const f=fixedReaderFixture();await migrate(f);pendingReceipt(f,'submitted');
 f.root.ReaderCore.ready=Promise.resolve(null);
 const checked=await f.root.ReaderUpdates.check();
 assert.equal(checked.find(item=>item.id==='script').status,'failed');
 assert.match(checked.find(item=>item.id==='script').detail,/启动/);
 assert.equal(recordedScript(f).status,'submitted');
});

test('a character switch during script verification cannot reconcile the preceding chat receipt',async()=>{
 const f=fixedReaderFixture();await migrate(f);const previous=pendingReceipt(f),fetch=f.root.fetch;
 f.root.fetch=async(...args)=>{const response=await fetch(...args);f.switchChat();return response;};
 await assert.rejects(f.root.ReaderUpdates.check(),/聊天|角色/);
 assert.deepEqual(JSON.parse(f.values.get(resultKey)),previous);
});

test('a second completed migration path is recognized without overwriting the verified current light renderer',async()=>{
 const f=fixedReaderFixture(),plan=await f.root.ReaderFixedMigration.check(selected);
 await f.root.ReaderFixedMigration.install(plan,()=>{});
 const before=structuredClone(f.regexes),writes=f.calls.filter(call=>call==='script-write'||call==='regex-write').length;
 const result=await f.root.ReaderFixedMigration.install(plan,()=>{});
 assert.equal(result.version,'2.0');assert.deepEqual(f.regexes,before);
 assert.equal(f.calls.filter(call=>call==='script-write'||call==='regex-write').length,writes);
});

test('the same version in a script row does not hide an actual startup failure',async()=>{
 const f=fixedReaderFixture({readyFails:true}),updates=components(f);
 await updates.check();const failed=await updates.apply();
 assert.equal(failed.find(item=>item.id==='script').status,'failed');
 assert.ok(f.scripts.some(item=>item.id===SCRIPT_ID),'an unsuccessful installation may still have a visible saved row');
 const checked=await updates.check();assert.notEqual(checked.find(item=>item.id==='script').status,'current');
 assert.deepEqual(f.regexes,f.originalRegexes);
});

test('a later player edit cannot be mistaken for an already completed same-version migration',async()=>{
 const f=fixedReaderFixture(),plan=await f.root.ReaderFixedMigration.check(selected);
 await f.root.ReaderFixedMigration.install(plan,()=>{});
 f.regexes[0].replaceString+='\nplayer edited this renderer';
 const before=structuredClone(f.regexes),writes=f.calls.filter(call=>call==='regex-write').length;
 await assert.rejects(f.root.ReaderFixedMigration.install(plan,()=>{}));
 assert.deepEqual(f.regexes,before);assert.equal(f.calls.filter(call=>call==='regex-write').length,writes);
});
