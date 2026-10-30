import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedReaderFixture,FIXED_ID,LIGHT_ID,SCRIPT_ID} from './helpers/fixed-script-migration-host.mjs';

function center(f){return f.root.ReaderUpdates.createCoordinator(f.root.ReaderUpdates.components());}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(done=>setTimeout(done,2));}throw Error('Expected migration stage was never reached');}
function selectUpgrade(f){f.root.__readerHostApi=f.root.ReaderCore;f.root.DreamFixedReleaseClient={...f.root.DreamFixedReleaseClient,latest:async repository=>repository==='Adirm007/reader'?{repository,version:'3.0'}:null};return center(f);}

test('a fixed reader without a host runtime offers the first standalone-script installation',async()=>{
 const f=fixedReaderFixture(),checked=await center(f).check();
 assert.equal(checked.find(item=>item.id==='script').status,'outdated','missing script must be installable, not reported as current');
 assert.equal(f.calls.includes('script-write'),false,'checking never installs a script');
});

test('accepting fixed-to-script migration creates one visible script before switching to the light renderer',async()=>{
 const f=fixedReaderFixture(),updates=center(f);await updates.check();const results=await updates.apply();
 assert.ok(f.calls.includes('script-write'),'first migration must call the script-library write API');
 assert.equal(f.scripts.length,2,'exactly one reader script is added');
 assert.equal(f.scripts.find(script=>script.id===SCRIPT_ID).enabled,true);
 assert.deepEqual(f.scripts.find(script=>script.id==='unrelated-script'),f.originalScripts[0]);
 assert.equal(f.regexes.length,1);assert.equal(f.regexes[0].id,LIGHT_ID);assert.equal(f.regexes[0].scriptName,'读者对话渲染-脚本版');
 assert.ok(f.calls.indexOf('script-start')<f.calls.indexOf('regex-write'));
 assert.ok(f.calls.indexOf('persisted-script-read')<f.calls.indexOf('regex-write'));
 for(const key of ['disabled','runOnEdit','findRegex','minDepth','maxDepth','placement','trimStrings','substituteRegex','markdownOnly','promptOnly'])assert.deepEqual(f.regexes[0][key],f.originalRegexes[0][key],key);
 assert.equal(results.find(item=>item.id==='script').status,'updated');
 assert.equal(results.find(item=>item.id==='regex').status,'current');
});

test('the original fixed renderer stays installed while the new script is still starting',async()=>{
 const ready=deferred(),f=fixedReaderFixture({ready:ready.promise}),updates=center(f);await updates.check();const applying=updates.apply();
 await until(()=>f.calls.includes('script-write'));
 assert.equal(f.calls.includes('regex-write'),false);assert.equal(f.regexes[0].id,FIXED_ID);
 ready.resolve({running:true});await applying;assert.equal(f.regexes[0].id,LIGHT_ID);
});

test('script startup failure keeps the original complete fixed renderer usable',async()=>{
 const f=fixedReaderFixture({readyFails:true}),updates=center(f);await updates.check();const results=await updates.apply();
 assert.deepEqual(f.regexes,f.originalRegexes);assert.equal(f.calls.includes('regex-write'),false);
 assert.ok(results.some(item=>item.status==='failed'));
});

test('a failed verified download performs no script or regex mutations',async()=>{
 for(const failDownload of ['reader-runtime.js','reader-letter.json']){
  const f=fixedReaderFixture({failDownload}),updates=center(f);await updates.check();const results=await updates.apply();
  assert.equal(f.calls.includes('script-write'),false,failDownload);assert.equal(f.calls.includes('regex-write'),false,failDownload);
  assert.deepEqual(f.scripts,f.originalScripts);assert.deepEqual(f.regexes,f.originalRegexes);assert.ok(results.some(item=>item.status==='failed'));
 }
});

test('missing script-library APIs are reported explicitly instead of claiming the standalone script is current',async()=>{
 const f=fixedReaderFixture({missingScriptApi:true}),updates=center(f),checked=await updates.check();
 assert.notEqual(checked.find(item=>item.id==='script').status,'current');await updates.apply();
 assert.equal(f.calls.includes('script-write'),false);assert.equal(f.regexes.some(rule=>rule.id===LIGHT_ID),false);
});

test('a duplicate migration click cannot create duplicate scripts',async()=>{
 const ready=deferred(),f=fixedReaderFixture({ready:ready.promise}),updates=center(f);await updates.check();
 const first=updates.apply(),second=updates.apply();assert.equal(first,second);await until(()=>f.calls.includes('script-write'));ready.resolve({running:true});await first;await updates.apply();
 assert.equal(f.scripts.filter(script=>script.id===SCRIPT_ID).length,1);assert.equal(f.calls.filter(call=>call==='script-write').length,1);
});

test('a chat switch during installation cannot write the light renderer into the new character',async()=>{
 const f=fixedReaderFixture({switchDuringScriptWrite:true}),updates=center(f);await updates.check();await updates.apply();
 assert.equal(f.calls.includes('regex-write'),false);assert.deepEqual(f.regexes,f.originalRegexes);
 assert.deepEqual(f.context.characters[1].data.extensions.regex_scripts,[]);
 assert.deepEqual(f.context.characters[1].data.extensions.tavern_helper.scripts,f.originalScripts);
});

test('a disabled canonical old external rule is consolidated without disturbing unrelated rule order',async()=>{
 const f=fixedReaderFixture(),base=f.originalRegexes[0];
 const before={...base,id:'player-before',scriptName:'玩家前置',replaceString:'before'};
 const after={...base,id:'player-after',scriptName:'玩家后置',replaceString:'after'};
 f.regexes.splice(0,Infinity,before,base,{...base,id:LIGHT_ID,scriptName:'读者对话渲染-外链版',replaceString:'<script>window.oldExternalReader=true;</script>',disabled:true},after);
 const updates=center(f);await updates.check();await updates.apply();
 assert.deepEqual(f.regexes.map(rule=>rule.id),['player-before',LIGHT_ID,'player-after']);
 assert.deepEqual(f.regexes[0],before);assert.deepEqual(f.regexes[2],after);
});

test('an enabled reader renderer in another scope blocks migration rather than creating two readers',async()=>{
 const f=fixedReaderFixture({scope:'global'});f.context.characters[0].data.extensions.regex_scripts.push({...f.originalRegexes[0],id:LIGHT_ID,scriptName:'读者对话渲染-外链版'});
 const updates=center(f);await updates.check();await updates.apply();
 assert.equal(f.calls.includes('script-write'),false);assert.equal(f.calls.includes('regex-write'),false);
 assert.deepEqual(f.regexes,f.originalRegexes);
});

test('a global fixed reader installs a global standalone script with the same safety checks',async()=>{
 const f=fixedReaderFixture({scope:'global'}),updates=center(f);await updates.check();await updates.apply();
 assert.equal(f.scripts.filter(script=>script.id===SCRIPT_ID).length,1);
 assert.equal(f.regexes[0].id,LIGHT_ID);
 assert.deepEqual(f.context.characters[0].data.extensions.tavern_helper.scripts,f.originalScripts);
});

test('a prior fixed release may update its full loader but cannot switch to light before the script is ready',async()=>{
 const ready=deferred(),f=fixedReaderFixture({fixedVersion:'1.0',ready:ready.promise}),updates=center(f);await updates.check();const applying=updates.apply();
 await until(()=>f.calls.includes('script-write'));
 assert.equal(f.regexes[0].id,FIXED_ID);assert.match(f.regexes[0].scriptName,/v2\.0/);assert.ok(f.calls.includes('fixed-regex-write'));assert.equal(f.calls.includes('light-regex-write'),false);
 ready.resolve({running:true});const results=await applying;
 assert.equal(f.regexes[0].id,LIGHT_ID);assert.ok(results.filter(item=>['regex','script'].includes(item.id)).every(item=>item.status==='updated'));
});

test('a script library edit after checking is preserved and prevents migration',async()=>{
 const f=fixedReaderFixture(),updates=center(f);await updates.check();f.scripts.push({type:'folder',id:'player-folder',name:'玩家分组',enabled:true,icon:'mug',color:'#123',scripts:[]});
 const before=structuredClone(f.scripts),results=await updates.apply();
 assert.deepEqual(f.scripts,before);assert.equal(f.calls.includes('script-write'),false);assert.deepEqual(f.regexes,f.originalRegexes);assert.ok(results.some(item=>item.status==='failed'));
});

test('a disabled script container can receive a visible script but keeps the complete fixed renderer',async()=>{
 const f=fixedReaderFixture({containerDisabled:true}),updates=center(f);await updates.check();const results=await updates.apply();
 assert.equal(f.scripts.filter(script=>script.id===SCRIPT_ID).length,1);assert.deepEqual(f.regexes,f.originalRegexes);
 assert.match(results.find(item=>item.id==='script').detail,/开启.*角色脚本/);
});

test('a script-library memory update without backend persistence never switches to light',{timeout:15000},async()=>{
 const f=fixedReaderFixture({neverPersist:true}),updates=center(f);await updates.check();const results=await updates.apply();
 assert.ok(f.calls.includes('script-write'));assert.ok(f.calls.includes('persisted-script-read'));assert.equal(f.calls.includes('light-regex-write'),false);assert.deepEqual(f.regexes,f.originalRegexes);
 assert.match(results.find(item=>item.id==='script').detail,/保存/);
});

test('the accepted new fixed loader completes migration automatically, without selecting a moving latest version',async()=>{
 const f=fixedReaderFixture();f.root.DREAM_READER_FIXED={version:'2.0',manifest:{installMode:'script'}};
 f.root.DreamFixedReleaseClient.latest=()=>{throw Error('automatic migration must stay on the accepted fixed version');};
 await f.root.ReaderFixedMigration.autoStart();
 assert.equal(f.scripts.filter(script=>script.id===SCRIPT_ID).length,1);assert.equal(f.regexes[0].id,LIGHT_ID);
});

test('retained legacy fixed versions do not install scripts merely by being opened',async()=>{
 const f=fixedReaderFixture();f.root.DREAM_READER_FIXED={version:'2.0',manifest:{}};
 await f.root.ReaderFixedMigration.autoStart();assert.equal(f.calls.includes('script-write'),false);assert.deepEqual(f.regexes,f.originalRegexes);
});

test('an existing running API does not hide an unfinished fixed-to-light migration',async()=>{
 const f=fixedReaderFixture();f.root.__readerHostApi={runtimeVersion:'2.0'};
 const updates=center(f),checked=await updates.check();assert.equal(checked.find(item=>item.id==='script').status,'outdated');
 await updates.apply();assert.equal(f.regexes[0].id,LIGHT_ID);
});

test('unrelated folders and their script settings survive first registration exactly',async()=>{
 const f=fixedReaderFixture(),folder={type:'folder',id:'player-folder',enabled:false,name:'玩家分组',icon:'mug',color:'#123',scripts:[structuredClone(f.originalScripts[0])]};
 f.scripts.splice(0,Infinity,folder);const original=structuredClone(folder),updates=center(f);await updates.check();await updates.apply();
 assert.deepEqual(f.scripts[0],original);assert.equal(f.scripts[1].id,SCRIPT_ID);assert.equal(f.regexes[0].id,LIGHT_ID);
});

test('a later owned standalone upgrade persists the new module even when the old controller is disposed',async()=>{
 let writes=0;const f=fixedReaderFixture({onScriptWrite(){if(++writes===2)f.root.__readerControllerAlive=false;}});
 const initial=center(f);await initial.check();await initial.apply();f.root.__readerHostApi=f.root.ReaderCore;
 f.root.__readerHostApi.replaceRuntime=()=>{throw Error('owned script upgrades must persist into the script library');};
 f.root.DreamFixedReleaseClient={...f.root.DreamFixedReleaseClient,latest:async repository=>repository==='Adirm007/reader'?{repository,version:'3.0'}:null};
 const updates=center(f),checked=await updates.check();assert.equal(checked.find(item=>item.id==='script').status,'outdated');
 const results=await updates.apply(),saved=f.scripts.find(script=>script.id===SCRIPT_ID);
 assert.equal(results.find(item=>item.id==='script').status,'updated');assert.equal(saved.data.reader_runtime.version,'3.0');assert.match(saved.content,/runtimeVersion:"3\.0"/);
 assert.equal(f.root.ReaderCore.runtimeVersion,'3.0');assert.equal(writes,2);assert.equal(f.root.__readerControllerAlive,false);
});

test('a healthy runtime owned by auto-regex remains untouched and leaves a clear migration error',{timeout:12000},async()=>{
 const f=fixedReaderFixture({delegated:true}),external={runtimeVersion:'2.0',isAlive:true,scriptOwner:null,stop(){throw Error('an external core must not be stopped');}};f.root.ReaderCore=external;
 const updates=center(f);await updates.check();const results=await updates.apply();
 assert.equal(f.root.ReaderCore,external);assert.deepEqual(f.regexes,f.originalRegexes);assert.equal(f.calls.includes('light-regex-write'),false);
 assert.match(results.find(item=>item.id==='script').detail,/外部|其他.*宿主|集成.*宿主/);
});

test('an owned script upgrade that fails startup restores the previous saved module and ready runtime',async()=>{
 const f=fixedReaderFixture({readyForVersion:version=>Promise.resolve(version==='3.0'?null:{running:true})}),initial=center(f);await initial.check();await initial.apply();
 const before=structuredClone(f.scripts),updates=selectUpgrade(f);await updates.check();const results=await updates.apply();
 assert.equal(results.find(item=>item.id==='script').status,'failed');assert.match(results.find(item=>item.id==='script').detail,/恢复/);
 assert.deepEqual(f.scripts,before);assert.equal(f.root.ReaderCore.runtimeVersion,'2.0');assert.equal(f.root.ReaderCore.isAlive,true);
});

test('a concurrent player edit prevents failed-upgrade rollback from overwriting the script library',async()=>{
 let f;f=fixedReaderFixture({readyForVersion:version=>Promise.resolve(version==='3.0'?null:{running:true}),onScriptWrite({trees}){if(trees.some(script=>script.data?.reader_runtime?.version==='3.0'))f.scripts.find(script=>script.id===SCRIPT_ID).info='玩家在更新中编辑';}});
 const initial=center(f);await initial.check();await initial.apply();const updates=selectUpgrade(f);await updates.check();await updates.apply();
 const saved=f.scripts.find(script=>script.id===SCRIPT_ID);assert.equal(saved.data.reader_runtime.version,'3.0');assert.equal(saved.info,'玩家在更新中编辑');assert.equal(f.calls.filter(call=>call==='script-write').length,2);
});

test('a character switch during a failed owned upgrade does not roll back through the new character',async()=>{
 let f;f=fixedReaderFixture({readyForVersion:version=>Promise.resolve(version==='3.0'?null:{running:true}),onScriptWrite({trees}){if(trees.some(script=>script.data?.reader_runtime?.version==='3.0'))f.switchChat();}});
 const initial=center(f);await initial.check();await initial.apply();const updates=selectUpgrade(f);await updates.check();await updates.apply();
 assert.equal(f.calls.filter(call=>call==='script-write').length,2);assert.deepEqual(f.context.characters[1].data.extensions.tavern_helper.scripts,f.originalScripts);assert.equal(f.scripts.find(script=>script.id===SCRIPT_ID).data.reader_runtime.version,'3.0');
});

test('a late old fixed frame cannot migrate or downgrade a newer installed full renderer',async()=>{
 const f=fixedReaderFixture({fixedVersion:'3.0'});f.root.DREAM_READER_FIXED={version:'2.0',manifest:{installMode:'script'}};
 await f.root.ReaderFixedMigration.autoStart();
 assert.equal(f.calls.includes('script-write'),false);assert.equal(f.calls.includes('light-regex-write'),false);assert.deepEqual(f.regexes,f.originalRegexes);assert.equal(f.root.__readerFixedMigrationPending,undefined);
});

test('automatic migration with no remaining fixed renderer clears its pending job and skips cleanly',async()=>{
 const f=fixedReaderFixture();f.regexes.splice(0);f.root.DREAM_READER_FIXED={version:'2.0',manifest:{installMode:'script'}};
 await f.root.ReaderFixedMigration.autoStart();assert.equal(f.root.__readerFixedMigrationPending,undefined);
 await f.root.ReaderFixedMigration.autoStart();assert.equal(f.root.__readerFixedMigrationPending,undefined);assert.equal(f.calls.includes('script-write'),false);assert.equal(f.root.__readerMigrationError,undefined);
});

test('concurrent migration paths converge on the same verified script and light renderer',async()=>{
 const ready=deferred(),f=fixedReaderFixture({ready:ready.promise}),plan=await f.root.ReaderFixedMigration.check({repository:'Adirm007/reader',version:'2.0'});
 const first=f.root.ReaderFixedMigration.install(plan),second=f.root.ReaderFixedMigration.install(plan);await until(()=>f.calls.includes('script-write'));ready.resolve({running:true});
 const results=await Promise.all([first,second]);assert.equal(results.length,2);assert.ok(results.every(result=>result.version==='2.0'));
 assert.equal(f.calls.filter(call=>call==='script-write').length,1);assert.equal(f.calls.filter(call=>call==='light-regex-write').length,1);assert.equal(f.regexes[0].id,LIGHT_ID);
});

test('a newer fixed frame waits for an older automatic migration and then migrates its own version',async()=>{
 const ready=deferred(),f=fixedReaderFixture({ready:ready.promise});f.root.DREAM_READER_FIXED={version:'2.0',manifest:{installMode:'script'}};
 const older=f.root.ReaderFixedMigration.autoStart();await until(()=>f.calls.includes('script-write'));
 f.regexes[0].scriptName=f.regexes[0].scriptName.replace('2.0','3.0');f.regexes[0].replaceString=f.regexes[0].replaceString.replaceAll('2.0','3.0');
 f.root.DREAM_READER_FIXED={version:'3.0',manifest:{installMode:'script'}};const newer=f.root.ReaderFixedMigration.autoStart();ready.resolve({running:true});
 const results=await Promise.allSettled([older,newer]);assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');assert.equal(results[1].value.version,'3.0');
 assert.equal(f.scripts.find(script=>script.id===SCRIPT_ID).data.reader_runtime.version,'3.0');assert.equal(f.regexes[0].id,LIGHT_ID);assert.match(f.regexes[0].replaceString,/READER_LIGHT_VERSION:3\.0/);assert.equal(f.root.__readerFixedMigrationPending,undefined);
});
