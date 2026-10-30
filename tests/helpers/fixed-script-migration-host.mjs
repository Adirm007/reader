import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';
import vm from 'node:vm';

export const FIXED_ID='cfc0375e-3c5c-4ea1-8b7b-2093c7df0a11';
export const LIGHT_ID='b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007';
export const SCRIPT_ID='cfc0375e-3c5c-4ea1-8b7b-2093c7df0a13';
const repository='Adirm007/reader';
const clone=value=>JSON.parse(JSON.stringify(value));
const sources=[];
for(const name of ['fixed-release-client','regex-update-guard','release-updates','standalone-bootstrap','script-installer','fixed-migration','update-center']){
 try{sources.push([name,await readFile(new URL('../../source/'+name+'.js',import.meta.url),'utf8')]);}
 catch(error){if(error.code!=='ENOENT')throw error;}
}

function fixed(version='2.0'){
 const metadata={schema:1,repository,version,sourceCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64)};
 return {id:FIXED_ID,scriptName:'读者对话渲染-固定版 v'+version,disabled:false,runOnEdit:true,findRegex:'/<dream>([\\s\\S]*?)<\\/dream>/g',trimStrings:[],replaceString:'<!-- FIXED_RELEASE:'+JSON.stringify(metadata)+' -->\nconst VERSION="'+version+'";\nwindow.fixedReaderStillWorks=true;',placement:[2],substituteRegex:0,minDepth:2,maxDepth:7,markdownOnly:true,promptOnly:false};
}
function normalized(raw){return {id:raw.id,script_name:raw.scriptName,enabled:!raw.disabled,run_on_edit:raw.runOnEdit,find_regex:raw.findRegex,trim_strings:raw.trimStrings||[],replace_string:raw.replaceString,source:{user_input:raw.placement.includes(1),ai_output:raw.placement.includes(2),slash_command:raw.placement.includes(3),world_info:raw.placement.includes(5),reasoning:raw.placement.includes(6)},destination:{display:raw.markdownOnly,prompt:raw.promptOnly},min_depth:raw.minDepth,max_depth:raw.maxDepth};}
function rawFromNormalized(rule){return {id:rule.id,scriptName:rule.script_name,disabled:!rule.enabled,runOnEdit:rule.run_on_edit,findRegex:rule.find_regex,trimStrings:rule.trim_strings,replaceString:rule.replace_string,placement:[['user_input',1],['ai_output',2],['slash_command',3],['world_info',5],['reasoning',6]].filter(([key])=>rule.source[key]).map(([,value])=>value),substituteRegex:0,minDepth:rule.min_depth,maxDepth:rule.max_depth,markdownOnly:rule.destination.display,promptOnly:rule.destination.prompt};}

export function fixedReaderFixture(options={}){
 const calls=[],values=new Map(),scope=options.scope||'character';let persistedTrees=null;
 const playerScript={type:'script',id:'unrelated-script',name:'玩家脚本',enabled:false,content:'window.keepMe=true;',info:'keep',button:{enabled:true,buttons:[{name:'keep',visible:true}]},data:{keep:1},export_with:{data:true,button:false}};
 const originalScripts=clone([playerScript]);
 const character=(avatar)=>({avatar,data:{extensions:{regex_scripts:[],tavern_helper:{scripts:clone(originalScripts)}}}});
 const context={characterId:0,chatId:'reader-chat',characters:[character('reader.png'),character('other.png')],extensionSettings:{regex:[],tavern_helper:{script:{scripts:clone(originalScripts),enabled:{global:true,characters:['reader.png','other.png']}}}},chatCompletionSettings:{extensions:{regex_scripts:[]}},getCurrentChatId:()=>context.chatId,getPresetManager:()=>({getSelectedPresetName:()=> 'test preset'}),getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'fixture'}),mainApi:'openai'};
 const ownedRegexes=scope==='global'?context.extensionSettings.regex:context.characters[0].data.extensions.regex_scripts;ownedRegexes.push(fixed(options.fixedVersion||'2.0'));
 const originalRegexes=clone(ownedRegexes);
 if(options.containerDisabled){const enabled=context.extensionSettings.tavern_helper.script.enabled;if(scope==='global')enabled.global=false;else enabled.characters=[];}
 persistedTrees=clone(scope==='global'?context.extensionSettings.tavern_helper.script.scripts:context.characters[0].data.extensions.tavern_helper.scripts);
 const root={TextEncoder,TextDecoder,console,setTimeout,clearTimeout,URL,Blob,Response,AbortController,crypto:webcrypto,location:{origin:'http://tavern.local'}};root.window=root;root.parent=root;root.top=root;
 root.SillyTavern={getContext:()=>context};
 root.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const scriptList=option=>option?.type==='global'?context.extensionSettings.tavern_helper.script.scripts:context.characters[context.characterId].data.extensions.tavern_helper.scripts;
 const regexList=option=>option.type==='global'?context.extensionSettings.regex:option.type==='character'?context.characters[context.characterId].data.extensions.regex_scripts:context.chatCompletionSettings.extensions.regex_scripts;
 const startManagedScript=(trees)=>{
  const managed=trees.flatMap(tree=>tree.type==='folder'?tree.scripts:[tree]).find(tree=>tree.id===SCRIPT_ID);
  if(!managed||managed.enabled===false||options.noBoot)return;
  const data=managed.data.reader_runtime;
  if(options.delegated){root.__readerStandaloneStatus={id:SCRIPT_ID,token:data.ownerToken,phase:'delegated'};calls.push('script-delegated');return;}
  root.ReaderCore={scriptOwner:{id:SCRIPT_ID,token:data.ownerToken,scope},runtimeVersion:data.version,isAlive:true,ready:options.readyForVersion?options.readyForVersion(data.version):options.ready||Promise.resolve(options.readyFails?null:{running:true}),stop(){this.isAlive=false;if(root.ReaderCore===this)delete root.ReaderCore;}};
  calls.push('script-start');
 };
 const helper={
  getTavernHelperVersion:()=> '4.11.3',getScriptTrees:option=>clone(scriptList(option)),
  updateScriptTreesWith(updater,option){
   calls.push('script-write');if(option.type!==scope)throw Error('script scope must match the installed fixed renderer');
   const id=context.characterId,trees=updater(clone(scriptList(option)));if(trees?.then)throw Error('script updater must remain synchronous');
   if(option.type==='global')context.extensionSettings.tavern_helper.script.scripts=clone(trees);
   else context.characters[id].data.extensions.tavern_helper.scripts=clone(trees);
   if(!options.neverPersist)persistedTrees=clone(trees);
   if(!options.containerDisabled)startManagedScript(trees);
   options.onScriptWrite?.({root,context,trees,calls});
   if(options.switchDuringScriptWrite){context.characterId=1;context.chatId='other-chat';}
   return clone(trees);
  },
  getTavernRegexes:option=>clone(regexList(option)).map(normalized),
  replaceTavernRegexes(list,option){calls.push('regex-write');calls.push(list.some(rule=>rule.id===LIGHT_ID)?'light-regex-write':'fixed-regex-write');const target=regexList(option);target.splice(0,Infinity,...list.map(rawFromNormalized));return Promise.resolve();},
 };
 if(options.missingScriptApi){delete helper.getScriptTrees;delete helper.updateScriptTreesWith;}
 root.TavernHelper=helper;
 root.fetch=async(url,init)=>{
  calls.push('persisted-script-read');
  if(String(url).includes('/api/settings/get')){const settings=clone(context.extensionSettings);settings.tavern_helper.script.scripts=persistedTrees;return Response.json({settings:JSON.stringify({extension_settings:settings})});}
  if(!String(url).includes('/api/characters/get'))throw Error('Unexpected network request');
  const body=JSON.parse(init.body),stored=context.characters.find(item=>item.avatar===body.avatar_url);if(!stored)throw Error('Unknown avatar');
  const card=clone(stored);if(card.avatar==='reader.png'&&scope==='character')card.data.extensions.tavern_helper.scripts=persistedTrees;
  return Response.json({json_data:JSON.stringify(card)});
 };
 const metadata={schema:1,repository,version:'2.0',sourceCommit:'c'.repeat(40),manifestSha256:'d'.repeat(64)};
 const release={repository,version:'2.0',distributionCommit:'e'.repeat(40),digest:'f'.repeat(64)};
 const light={...fixed('2.0'),id:LIGHT_ID,scriptName:'读者对话渲染-脚本版',readerRuntime:{schema:1,kind:'light-letter',version:'2.0'},replaceString:'<!-- READER_RUNTIME:{"schema":1,"kind":"light-letter","version":"2.0"} --><!-- READER_LIGHT_VERSION:2.0 --><script>window.ReaderLetter={};window.parent.ReaderCore;</script>'};
 const runtime='export function start(){return {runtimeVersion:"2.0",ready:Promise.resolve({running:true})};} export function stop(){}';
 for(const [name,code] of sources){
  vm.runInContext(code,rootContext(root),{filename:name+'.js'});
  if(name==='fixed-release-client'){
   const real=root.DreamFixedReleaseClient;
   root.DreamFixedReleaseClient={...real,latest:async repo=>repo===repository?{repository,version:'2.0'}:null,download:async selected=>({metadata,release,regex:fixed(selected.version),bytes:new TextEncoder().encode(JSON.stringify(fixed(selected.version)))}),resource:async(_,name)=>{
    calls.push('verified:'+name);if(options.failDownload===name)throw Error('download unavailable');
    const text=name==='reader-runtime.js'?runtime.replaceAll('2.0',_.version):name==='reader-letter.json'?JSON.stringify(light).replaceAll('2.0',_.version):JSON.stringify({schema:1,entries:[]});
    const bytes=new TextEncoder().encode(text);return {metadata:{...metadata,version:_.version},release:{...release,version:_.version},bytes,spec:{path:name==='reader-runtime.js'?'dist/reader-runtime.js':name==='reader-letter.json'?'regex/读者对话渲染-脚本版.json':'worldbook/manifest.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
   }};
  }
 }
 root.dreamWbTH=()=>helper;root.dreamWbScan=async()=>[];root.dreamWbOutdated=()=>[];
 return {root,context,helper,calls,values,metadata,light,scope,originalScripts,originalRegexes,original:originalScripts,get scripts(){return scope==='global'?context.extensionSettings.tavern_helper.script.scripts:context.characters[0].data.extensions.tavern_helper.scripts;},get regexes(){return ownedRegexes;},startManagedScript,switchChat(){context.characterId=1;context.chatId='other-chat';}};
}

function rootContext(root){return vm.isContext(root)?root:vm.createContext(root);}
