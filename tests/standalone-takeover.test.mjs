import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../source/standalone-bootstrap.js',import.meta.url),'utf8');

// Runs the real bootstrap with a fake tavern page; start() stands in for the bundled runtime.
function page(core='九十九夜梦'){
 const context={characterId:0,chatId:'chat',characters:[{avatar:'reader.png'}],chatMetadata:{variables:{'系统核心':core}},chat:[],getCurrentChatId:()=> 'chat'};
 const timers=new Set(),sandbox={console,Promise,Date,Math,JSON,String,Error,SillyTavern:{getContext:()=>context},addEventListener(){},removeEventListener(){},
  setInterval:(fn,ms)=>{const id=setInterval(fn,ms);timers.add(id);return id;},clearInterval:id=>{clearInterval(id);timers.delete(id);},
  start:async options=>{const api={scriptOwner:options.scriptOwner,runtimeVersion:'3.0',isAlive:true,ready:Promise.resolve(true),stop(){api.isAlive=false;if(sandbox.ReaderCore===api)delete sandbox.ReaderCore;}};sandbox.ReaderCore=api;return api;}};
 sandbox.window=sandbox;sandbox.parent=sandbox;
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {sandbox,boot:()=>sandbox.ReaderStandaloneBootstrap({id:'reader-script',token:'owner',version:'3.0',initialAvatar:'reader.png',scope:'character'}),cleanup:()=>timers.forEach(id=>clearInterval(id))};
}
async function until(check){for(let i=0;i<200;i++){if(check())return;await new Promise(done=>setTimeout(done,5));}throw Error('condition never reached');}

test('an installed reader script replaces the runtime the card auto-regex started',async()=>{
 const p=page(),external={isAlive:true,scriptOwner:null,stop(){external.isAlive=false;if(p.sandbox.ReaderCore===external)delete p.sandbox.ReaderCore;}};
 p.sandbox.ReaderCore=external;const handle=p.boot();
 try{
  await until(()=>p.sandbox.__readerStandaloneStatus?.phase==='ready');
  assert.equal(external.isAlive,false);assert.equal(p.sandbox.ReaderCore.scriptOwner.id,'reader-script');
 }finally{handle.dispose();p.cleanup();}
});

test('another reader script that owns the page is left alone',async()=>{
 const p=page(),other={isAlive:true,scriptOwner:{id:'someone-else',token:'x'},stop(){throw Error('must not stop another owner');}};
 p.sandbox.ReaderCore=other;const handle=p.boot();
 try{await until(()=>p.sandbox.__readerStandaloneStatus?.phase==='delegated');assert.equal(p.sandbox.ReaderCore,other);}
 finally{handle.dispose();p.cleanup();}
});
