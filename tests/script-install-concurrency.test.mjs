import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedReaderFixture,SCRIPT_ID} from './helpers/fixed-script-migration-host.mjs';

function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
function holdChecksum(f){
 const entered=deferred(),release=deferred(),checksum=f.root.DreamFixedReleaseClient.sha256;
 f.root.DreamFixedReleaseClient.sha256=async bytes=>{const digest=await checksum(bytes);entered.resolve();await release.promise;return digest;};
 return {entered:entered.promise,release:release.resolve};
}
async function installation(f){
 const artifact=await f.root.DreamFixedReleaseClient.resource({repository:'Adirm007/reader',version:'2.0'},'reader-runtime.js');
 const options={scope:'character',snapshot:f.root.ReaderScriptInstaller.inspect({scope:'character'}).snapshot};
 return {artifact,options};
}

test('a same-key installation keeps the second caller guard while the shared checksum is pending',async t=>{
 const f=fixedReaderFixture(),{artifact,options}=await installation(f),gate=holdChecksum(f);t.after(gate.release);
 const first=f.root.ReaderScriptInstaller.install(artifact,()=>{},options);await gate.entered;
 let current=true;
 const second=f.root.ReaderScriptInstaller.install(artifact,()=>{if(!current)throw Error('second request expired');},options);
 assert.equal(first,second);current=false;gate.release();
 const outcomes=await Promise.allSettled([first,second]);
 assert.ok(outcomes.every(result=>result.status==='rejected'&&/second request expired/.test(result.reason.message)));
 assert.equal(f.calls.includes('script-write'),false);assert.equal(f.calls.includes('regex-write'),false);
 assert.equal(f.scripts.filter(script=>script.id===SCRIPT_ID).length,0);
});

test('current same-key callers share one verified installation and one script-library write',async t=>{
 const f=fixedReaderFixture(),{artifact,options}=await installation(f),gate=holdChecksum(f);t.after(gate.release);
 const first=f.root.ReaderScriptInstaller.install(artifact,()=>{},options);await gate.entered;
 const second=f.root.ReaderScriptInstaller.install(artifact,()=>{},options);assert.equal(first,second);gate.release();
 const results=await Promise.all([first,second]);assert.ok(results.every(result=>result.persisted&&result.version==='2.0'));
 assert.equal(f.calls.filter(call=>call==='script-write').length,1);assert.equal(f.scripts.filter(script=>script.id===SCRIPT_ID).length,1);
 assert.deepEqual(f.regexes,f.originalRegexes,'installing a script never rewrites the fixed renderer');
});
