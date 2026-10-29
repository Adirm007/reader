/* ★ READER TEMPLATE SYSTEM START · 原版条目模仿移植 v1.5 ★ */
(function(){
'use strict';
var API_VERSION=2;
var LIBRARY_KEY='reader_generic_template_library_v1';
var WRITER_KEY='reader_generic_writer_settings_v1';
var DEFAULT_TEMPLATE_ID='reader-default-fated-character';
var DEFAULT_TEMPLATE_TEXT="# 格式：严格遵循以下 YAML 结构。不要输出任何 Markdown 代码块标记，直接输出内容\n\n基本信息:\n  姓名: ${中文姓名，如：莉莉尔}\n  称号: ${称号，如：迷雾侦探/仲夏夜的恶作剧}\n  性别: ${性别}\n  年龄: ${外表年龄 / 实际年龄，若非二者差距极大则仅输出一个数字}\n  种族: {{race}}\n  阵营: ${阵营，如：混乱善良 / 守序中立}\n  生命层级: {{life_tier}} (具体等级Lv.xx)\n\n背景故事:\n  出身: ${出身背景，简述诞生或家族情况}\n  关键经历:\n    - ${关键经历1：角色过去重要经历，对其有极大影响的事件，如参与塑造性格或取得某种能力}\n    - ${关键经历2：同上}\n    - ${当前状态：目前正在哪里做什么，行动的目的如有则填写}\n\n外貌描写:\n  整体印象: ${整体印象，如：清冷如霜雪般的少女，散发着生人勿近的气质}\n  面部特征: ${面部特征，肤色、脸型、妆容等}\n  体型: ${体型描述，如：高挑纤细，骨架极小显轻盈，或丰满圆润}\n  发色与瞳色: ${发型发色与瞳色，如：瀑布般银白长发，异色瞳}\n  衣着装饰:\n    - ${服装细节1：主装风格，材质与设计}\n    - ${服装细节2：配饰，如头纱、丝袜、鞋履}\n  显著特征:\n    - ${显著的种族或个人特征，如：猫耳猫尾、头顶的光环、伴生的宠物}\n\n身体数据:\n  身高: ${cm}\n  体重: ${kg}\n  三围: \"Bxx(Cup) / Wxx / Hxx\"\n  感官特征: ${感官特征，如体温、体香、触感}\n  私密部位:\n    外观: ${私密部位外观，如：颜色、无毛/有毛、形状特征}\n    内部: ${内部构造描述，如：紧致度、温度、特殊结构、分泌液气味等}\n\n性相关:\n  敏感带: ${敏感带，如：耳尖、龙角根部、尾巴、大腿内侧}\n  特殊体质: ${特殊体质，如：体液具有催情效果、兴奋时翅膀张开、痛觉转化为快感；无则留空}\n  高潮特征: ${高潮时的表现，如：瞳孔涣散、念出特定台词、身体颤抖}\n  性取向: ${性取向，如：泛性恋}\n  性经验: ${性经验，如：无/丰富/理论派}\n  态度: ${对性的态度，如：视为神圣繁衍、视为进食、视为戏剧高潮、羞涩但渴望}\n  性欲望: ${性欲望的表现模式，如：潜伏期/发情期区别，喜欢某种Play}\n\n性格特征:\n  行为模式:\n    - ${行为模式1：日常习惯}\n    - ${行为模式2：应对危机或压力时的反应}\n  语言风格: ${语言风格，如：咏叹调、古雅、腹黑毒舌、三无、活泼}\n  道德观念:\n    核心价值观: ${核心价值观}\n    底线: ${底线}\n  性格侧写:\n    - 特质: ${主导/核心性格}\n      描述: ${体现与行为举例}\n    - 特质: ${次要/表象性格}\n      描述: ${体现与行为举例}\n    - 特质: ${隐藏/本质性格}\n      描述: ${只有亲密或特定时刻才会展露的一面}\n\n目标动机:\n  短期目标: ${短期目标}\n  长期目标: ${长期目标}\n  核心驱动: ${核心驱动力}\n\n战斗能力:\n  战斗风格:\n    - ${战斗风格描述，如：导演视角控制场面、战场舞者、精神控制}\n  技能: # 技能需符合生命层级，描述包含名称、品质与效果\n    - 名称: ${技能名}\n      品质: ${品质：普通/稀有/史诗/传说/神话}\n      效果: ${具体效果描述}\n    - 名称: ${技能名}\n      品质: ${品质}\n      效果: ${...}\n  要素/权能/法则: ${可选：若为第四/五/六层级，在此处添加对应层级的要素/权能/法则的名称与效果}\n\n物品与装备:\n  武器:\n    - ${武器名称与描述，如：手杖: 精致紫杉木手杖，战斗时变形为符文刺剑，或是发射炼金弹药的魔导枪械}\n  随身物品:\n    - ${随身物品1，如：定情信物、剧本}\n    - ${随身物品2，如：特殊的糖果、附魔道具}";
var DEFAULT_GENERATION_INSTRUCTION='依据模板中的字段、占位符说明和用户偏好编写一份完整内容。必须保留模板的字段顺序、层级、列表形状与整体格式；用具体内容替换占位符。模板里的说明性注释只用于理解，除非它本身属于目标格式，否则不要照抄。不要输出 Markdown 代码块标记。';
var DEFAULT_ENTRY_NAME_RULE='若内容是人物设定，使用“基本信息.姓名”；否则概括内容主体，生成简短、可辨识且不带书名号的世界书条目名。';
var DEFAULT_KEYWORD_RULE='提取能在聊天文本中自然出现、可稳定触发该条目的关键词。主要关键词优先选择专名、简称和泛化场所/类别；次要关键词只在确有固定活动区域或必须同时满足的限定时生成。避免整句、过宽泛词和仅出现一次的修饰词。每行一个关键词。';
function exposeLegacyInlineHandler(name,handler){if(typeof handler==='function')window[name]=handler;}
exposeLegacyInlineHandler('toggleMenu',typeof toggleMenu==='function'?toggleMenu:null);
exposeLegacyInlineHandler('orderItem',typeof orderItem==='function'?orderItem:null);
exposeLegacyInlineHandler('togglePlay',typeof togglePlay==='function'?togglePlay:null);
exposeLegacyInlineHandler('handleTrackBtnClick',typeof handleTrackBtnClick==='function'?handleTrackBtnClick:null);
exposeLegacyInlineHandler('toggleDisplayMode',typeof toggleDisplayMode==='function'?toggleDisplayMode:null);
exposeLegacyInlineHandler('toggleVisualTheme',typeof toggleVisualTheme==='function'?toggleVisualTheme:null);
exposeLegacyInlineHandler('toggleSilent',typeof toggleSilent==='function'?toggleSilent:null);
exposeLegacyInlineHandler('toggleAutoUnseal',typeof toggleAutoUnseal==='function'?toggleAutoUnseal:null);
exposeLegacyInlineHandler('toggleCafeEnvelopeBeautify',typeof toggleCafeEnvelopeBeautify==='function'?toggleCafeEnvelopeBeautify:null);
exposeLegacyInlineHandler('toggleYuanPlus',typeof toggleYuanPlus==='function'?toggleYuanPlus:null);
exposeLegacyInlineHandler('toggleYuanPlusStream',typeof toggleYuanPlusStream==='function'?toggleYuanPlusStream:null);
exposeLegacyInlineHandler('saveYuanPlusPreference',typeof saveYuanPlusPreference==='function'?saveYuanPlusPreference:null);
exposeLegacyInlineHandler('handleRhythmOrPrayer',typeof handleRhythmOrPrayer==='function'?handleRhythmOrPrayer:null);
exposeLegacyInlineHandler('openBookshelf',typeof openBookshelf==='function'?openBookshelf:null);
exposeLegacyInlineHandler('openChessGame',typeof openChessGame==='function'?openChessGame:null);
exposeLegacyInlineHandler('openCustomPersonaManager',typeof openCustomPersonaManager==='function'?openCustomPersonaManager:null);
exposeLegacyInlineHandler('showToast',typeof showToast==='function'?showToast:null);
var REVERSE_SYSTEM_PROMPT=[
'你是“世界书条目模板反推器”。你的任务不是续写条目，而是把一个已经写好的实例反推成可重复使用的生成模板。',
'必须遵守：',
'1. 识别原条目的格式（YAML、JSON、纯文本分节、XML、EJS 或其他），保持其格式语法。',
'2. 保留所有有复用价值的字段、标题、顺序、层级、列表形状、固定宏和结构约束。',
'3. 把实例专属的值替换为 ${填写说明，如：示例} 形式的占位符；说明要具体、可执行，并在有帮助时附一个简短示例。',
'4. 原文中已经是宏或变量的内容（例如 {{race}}、<user>、EJS）若代表通用输入，应原样保留。',
'5. 仅作为实例名称的最外层包裹可改为通用“姓名/名称”字段或占位符；不要保留会把新内容锁死为原实例的专名。',
'6. 不得概括、删项或把多层结构压成一段话。敏感字段也只做结构化占位，不擅自删除。',
'7. 不输出 Markdown 代码块。把最终模板完整包裹在 <reader_template> 与 </reader_template> 中。'
].join('\n');
var STYLE_TEXT=[
'.rts-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(8,5,4,.91);backdrop-filter:blur(6px);overflow:auto;padding:24px 12px;box-sizing:border-box;color:#ead9bd;font-family:"Microsoft YaHei","Noto Sans SC",sans-serif}',
'.rts-card{width:min(980px,96vw);margin:0 auto;background:linear-gradient(145deg,#25170f,#120b07);border:1px solid #8b673d;border-radius:14px;box-shadow:0 24px 80px #000;padding:20px;box-sizing:border-box}',
'.rts-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid rgba(197,157,95,.25);padding-bottom:12px;margin-bottom:14px}.rts-title{font-size:22px;color:#f1cf91;letter-spacing:3px}.rts-sub{font-size:12px;color:#ac987c;margin-top:6px;line-height:1.6}.rts-x{font-size:28px;line-height:1;color:#ad8b5d;cursor:pointer;border:0;background:transparent}.rts-x:hover{color:#fff}',
'.rts-tools,.rts-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.rts-btn{border:1px solid #8b673d;background:#2a1b12;color:#ebcc96;border-radius:7px;padding:8px 13px;cursor:pointer;font-size:12px}.rts-btn:hover{background:#3b281b;color:#fff}.rts-btn.primary{background:#76512d;color:#fff;border-color:#d0a35d}.rts-btn.danger{border-color:#934b49;color:#e8aaa7}.rts-btn.ghost{opacity:.78}',
'.rts-list{display:grid;gap:9px}.rts-row{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:12px;align-items:center;border:1px solid rgba(197,157,95,.2);background:rgba(255,255,255,.025);padding:11px;border-radius:9px}.rts-name{font-weight:700;color:#f0d4a2}.rts-meta{font-size:11px;color:#9e8a70;margin-top:5px;line-height:1.5}.rts-tag{display:inline-block;margin-left:7px;padding:2px 6px;border:1px solid #7f9b68;border-radius:10px;color:#bfe2a2;font-size:10px}',
'.rts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rts-span2{grid-column:1/-1}.rts-field{display:flex;flex-direction:column;gap:5px}.rts-label{font-size:12px;color:#d6b982;font-weight:700}.rts-hint{font-size:11px;color:#8f7e6b;line-height:1.5}.rts-input,.rts-select,.rts-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(197,157,95,.35);border-radius:7px;background:#1a100c;color:#f1e4d0;padding:8px;font-size:12px}.rts-textarea{min-height:110px;resize:vertical;line-height:1.55}.rts-textarea.tall{min-height:360px;font-family:Consolas,"Microsoft YaHei",monospace}.rts-check{display:flex;align-items:center;gap:7px;font-size:12px;color:#dbc9ad;cursor:pointer}.rts-check input{width:17px;height:17px}',
'.rts-entry-list{max-height:48vh;overflow:auto;border:1px solid rgba(197,157,95,.18);border-radius:8px;padding:6px}.rts-entry{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;padding:8px;border-bottom:1px dashed rgba(197,157,95,.16);cursor:pointer}.rts-entry:last-child{border-bottom:0}.rts-entry:hover{background:rgba(197,157,95,.08)}.rts-entry-name{color:#ead1a4;font-size:12px}.rts-entry-meta{color:#8f7e6b;font-size:10px;margin-top:3px}.rts-preview{white-space:pre-wrap;max-height:220px;overflow:auto;background:#0d0806;border:1px solid rgba(197,157,95,.18);border-radius:8px;padding:10px;font:11px/1.55 Consolas,monospace;color:#cbbca8}',
'.rts-section{border:1px solid rgba(197,157,95,.18);border-radius:9px;padding:12px;margin:10px 0;background:rgba(0,0,0,.12)}.rts-section-title{font-size:14px;color:#e1c088;margin-bottom:9px}.rts-status{min-height:22px;margin:8px 0;color:#c9b18d;font-size:12px;white-space:pre-wrap}.rts-empty{text-align:center;padding:28px;color:#8d7d69}.rts-blue-list{max-height:230px;overflow:auto;display:grid;gap:5px;padding:4px}.rts-blue-item{padding:7px;border:1px solid rgba(197,157,95,.13);border-radius:6px;background:rgba(255,255,255,.02)}',
'.rts-ov[data-rts-theme="summer"]{color-scheme:light;background:radial-gradient(circle at 14% 10%,rgba(255,245,166,.55),transparent 24%),radial-gradient(circle at 88% 16%,rgba(126,205,224,.48),transparent 26%),linear-gradient(145deg,rgba(225,248,246,.94),rgba(255,248,225,.92));color:#315e6d;backdrop-filter:blur(8px)}',
'.rts-ov[data-rts-theme="summer"] .rts-card{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(255,253,242,.98),rgba(238,250,246,.97));border:1px solid rgba(80,166,196,.55);border-radius:20px;box-shadow:0 24px 65px rgba(43,107,125,.24),inset 0 0 0 1px rgba(255,255,255,.92);color:#315e6d}.rts-ov[data-rts-theme="summer"] .rts-card::before{content:"";position:absolute;right:-58px;top:-70px;width:190px;height:190px;border-radius:50%;background:repeating-conic-gradient(from 4deg,rgba(255,199,82,.20) 0 9deg,transparent 9deg 18deg);pointer-events:none}.rts-ov[data-rts-theme="summer"] .rts-card::after{content:"SUMMER SERVICE · 盛夏";position:absolute;right:24px;bottom:14px;color:rgba(50,125,155,.16);font:700 11px/1 Georgia,serif;letter-spacing:2px;pointer-events:none}.rts-ov[data-rts-theme="summer"] .rts-card>*{position:relative;z-index:1}',
'.rts-ov[data-rts-theme="summer"] .rts-head{border-bottom:1px solid rgba(71,156,188,.28)}.rts-ov[data-rts-theme="summer"] .rts-title{color:#327d9b;font-family:Georgia,"Noto Serif SC","Songti SC",serif;text-shadow:0 1px #fff}.rts-ov[data-rts-theme="summer"] .rts-sub{color:#648892}.rts-ov[data-rts-theme="summer"] .rts-x{color:#df7358}.rts-ov[data-rts-theme="summer"] .rts-x:hover{color:#bd4f3a;transform:rotate(8deg)}',
'.rts-ov[data-rts-theme="summer"] .rts-btn{border-color:rgba(72,159,190,.38);background:rgba(255,255,255,.72);color:#327d9b;box-shadow:0 3px 10px rgba(61,134,151,.08)}.rts-ov[data-rts-theme="summer"] .rts-btn:hover{border-color:#e88b67;background:#fff;color:#df674f}.rts-ov[data-rts-theme="summer"] .rts-btn.primary{border-color:#df7358;background:linear-gradient(135deg,#ed8d6c,#df674f);color:#fff}.rts-ov[data-rts-theme="summer"] .rts-btn.danger{border-color:rgba(201,91,80,.5);color:#c7594d}.rts-ov[data-rts-theme="summer"] .rts-btn.ghost{background:rgba(230,248,246,.82)}',
'.rts-ov[data-rts-theme="summer"] .rts-row,.rts-ov[data-rts-theme="summer"] .rts-section,.rts-ov[data-rts-theme="summer"] .rts-blue-item{border-color:rgba(92,174,200,.24);background:rgba(255,255,255,.58)}.rts-ov[data-rts-theme="summer"] .rts-row:hover,.rts-ov[data-rts-theme="summer"] .rts-entry:hover{background:rgba(255,255,255,.88)}.rts-ov[data-rts-theme="summer"] .rts-name,.rts-ov[data-rts-theme="summer"] .rts-entry-name,.rts-ov[data-rts-theme="summer"] .rts-section-title,.rts-ov[data-rts-theme="summer"] .rts-label{color:#327d9b}.rts-ov[data-rts-theme="summer"] .rts-meta,.rts-ov[data-rts-theme="summer"] .rts-entry-meta,.rts-ov[data-rts-theme="summer"] .rts-hint,.rts-ov[data-rts-theme="summer"] .rts-status{color:#648892}.rts-ov[data-rts-theme="summer"] .rts-tag{border-color:#7fb99a;color:#4d8c6d;background:rgba(226,246,228,.72)}',
'.rts-ov[data-rts-theme="summer"] .rts-input,.rts-ov[data-rts-theme="summer"] .rts-select,.rts-ov[data-rts-theme="summer"] .rts-textarea{border-color:rgba(71,156,188,.34);background:rgba(255,253,244,.92);color:#2d5968;box-shadow:inset 0 1px 3px rgba(47,111,129,.06)}.rts-ov[data-rts-theme="summer"] .rts-input:focus,.rts-ov[data-rts-theme="summer"] .rts-select:focus,.rts-ov[data-rts-theme="summer"] .rts-textarea:focus{outline:2px solid rgba(93,180,205,.24);border-color:#5db4cd}.rts-ov[data-rts-theme="summer"] .rts-input::placeholder,.rts-ov[data-rts-theme="summer"] .rts-textarea::placeholder{color:#91a9ac}.rts-ov[data-rts-theme="summer"] .rts-check{color:#477380}.rts-ov[data-rts-theme="summer"] .rts-check input{accent-color:#df7358}.rts-ov[data-rts-theme="summer"] .rts-entry-list{border-color:rgba(71,156,188,.25);background:rgba(230,248,246,.42)}.rts-ov[data-rts-theme="summer"] .rts-entry{border-bottom-color:rgba(71,156,188,.2)}.rts-ov[data-rts-theme="summer"] .rts-preview{border-color:rgba(71,156,188,.28);background:#f5fbf8;color:#3c6671}.rts-ov[data-rts-theme="summer"] .rts-empty{color:#78979d}',
'@media(max-width:700px){.rts-grid{grid-template-columns:1fr}.rts-span2{grid-column:auto}.rts-row{grid-template-columns:1fr}.rts-card{padding:14px}.rts-ov{padding:10px 4px}}'
].join('');

function nowId(prefix){return (prefix||'reader-template')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
function storage(){try{return window.parent&&window.parent.localStorage?window.parent.localStorage:window.localStorage;}catch(e){return window.localStorage;}}
function clone(value){return JSON.parse(JSON.stringify(value));}
function uniqueStrings(items){var seen=Object.create(null),out=[];(items||[]).forEach(function(item){var value=String(item==null?'':item).trim();if(!value||seen[value])return;seen[value]=1;out.push(value);});return out;}
function parseList(text){return uniqueStrings(String(text||'').split(/[\n,，、|]+/));}
function esc(text){return String(text==null?'':text).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function hostDocument(){if(window.__readerTrackedDocument)return window.__readerTrackedDocument;try{return window.parent&&window.parent.document?window.parent.document:document;}catch(e){return document;}}
var ACTIVE_VISUAL_THEME='';
function currentVisualTheme(source){
 var sourceNode=null,sourceTheme='';
 try{sourceNode=source&&source.nodeType?source:(source&&source.currentTarget?source.currentTarget:(source&&source.target?source.target:null));}catch(e){}
 try{var sourceOverlay=sourceNode&&sourceNode.closest?sourceNode.closest('.rts-ov[data-rts-theme]'):null;sourceTheme=sourceOverlay?sourceOverlay.getAttribute('data-rts-theme')||'':'';}catch(e2){}
 try{if(sourceTheme!=='summer'&&sourceTheme!=='cafe'){var sourceDoc=sourceNode&&sourceNode.ownerDocument;sourceTheme=sourceDoc&&sourceDoc.documentElement?sourceDoc.documentElement.getAttribute('data-dream-theme')||'':'';}}catch(e3){}
 if(sourceTheme==='summer'||sourceTheme==='cafe'){ACTIVE_VISUAL_THEME=sourceTheme;return sourceTheme;}
 if(ACTIVE_VISUAL_THEME==='summer'||ACTIVE_VISUAL_THEME==='cafe')return ACTIVE_VISUAL_THEME;
 var localTheme='',hostTheme='';
 try{localTheme=document.documentElement.getAttribute('data-dream-theme')||'';}catch(e4){}
 try{var host=hostDocument();hostTheme=host&&host.documentElement?host.documentElement.getAttribute('data-dream-theme')||'':'';}catch(e5){}
 if(localTheme==='summer'||hostTheme==='summer'){ACTIVE_VISUAL_THEME='summer';return 'summer';}
 if(localTheme==='cafe'||hostTheme==='cafe'){ACTIVE_VISUAL_THEME='cafe';return 'cafe';}
 try{if(typeof getVisualTheme==='function'){var current=getVisualTheme();if(current==='summer'||current==='cafe'){ACTIVE_VISUAL_THEME=current;return current;}}}catch(e6){}
 try{ACTIVE_VISUAL_THEME=storage().getItem('dream_visual_theme')==='summer'?'summer':'cafe';return ACTIVE_VISUAL_THEME;}catch(e7){ACTIVE_VISUAL_THEME='cafe';return 'cafe';}
}
function notify(message,type){if(window.__readerControllerAlive===false)return;try{var p=window.parent;if(p&&p.toastr&&typeof p.toastr[type||'info']==='function'){p.toastr[type||'info'](message,'读者·条目模仿');return;}}catch(e){}try{if(typeof showToast==='function'){showToast(message);return;}}catch(e2){}console.log('[ReaderTemplate]',message);}
function routed(cfg){try{return typeof window.dreamApplyApiRoute==='function'?window.dreamApplyApiRoute('template',cfg):cfg;}catch(e){return cfg;}}
function api(token){var th=window.TavernHelper;try{if(!th)th=window.parent&&window.parent.TavernHelper;}catch(e){}if(!th)throw new Error('未检测到 TavernHelper API');return window.ReaderTransactions?window.ReaderTransactions.guardApi(th,token||window.ReaderActiveTaskToken):th;}
function isExcludedEntrySettingKey(key,isRoot){
 var compact=String(key||'').replace(/[^a-z0-9_]/gi,'').toLowerCase();
 if(compact.indexOf('filter')>=0)return true;
 if(/^(key|keys|keysecondary|keyssecondary|keys_secondary|keywords|primarykeywords|secondarykeywords|selectivelogic)$/.test(compact))return true;
 if(isRoot&&/^(uid|id|name|comment|content|displayindex)$/.test(compact))return true;
 return false;
}
function sanitizeEntrySettings(value,isRoot){
 if(value==null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(function(item){return sanitizeEntrySettings(item,false);});
 var out={};Object.keys(value).forEach(function(key){if(isExcludedEntrySettingKey(key,!!isRoot))return;var child=value[key];if(typeof child==='function')return;out[key]=sanitizeEntrySettings(child,false);});return out;
}
function defaultOutput(){
 return {targetWorldbook:'阿斯塔利亚人物志',enabled:true,strategyType:'selective',positionType:'after_character_definition',role:'system',depth:0,order:601,probability:100,scanDepth:'same_as_global',keywordMode:'smart',keywordRule:DEFAULT_KEYWORD_RULE,manualPrimary:'',manualSecondary:'',secondaryLogic:'and_any',preventIncoming:true,preventOutgoing:true,passthroughSettings:{}};
}
function defaultTemplate(){
 return {schemaVersion:API_VERSION,id:DEFAULT_TEMPLATE_ID,name:'常规命定角色生成',templateText:DEFAULT_TEMPLATE_TEXT,generationInstruction:DEFAULT_GENERATION_INSTRUCTION,entryNameRule:DEFAULT_ENTRY_NAME_RULE,output:defaultOutput(),source:{kind:'builtin',label:'原缘加强默认模板'}};
}
function normalizeOutput(raw){
 var d=defaultOutput(),o=raw&&typeof raw==='object'?raw:{};
 Object.keys(d).forEach(function(k){if(o[k]!==undefined)d[k]=o[k];});
 d.targetWorldbook=String(d.targetWorldbook||'').trim();
 d.strategyType=['constant','selective','vectorized'].indexOf(d.strategyType)>=0?d.strategyType:'selective';
 d.positionType=String(d.positionType||'after_character_definition');
 d.role=['system','assistant','user'].indexOf(d.role)>=0?d.role:'system';
 d.depth=Math.max(0,parseInt(d.depth,10)||0);
 d.order=parseInt(d.order,10);if(!Number.isFinite(d.order))d.order=100;
 d.probability=Math.max(0,Math.min(100,parseInt(d.probability,10)));if(!Number.isFinite(d.probability))d.probability=100;
 d.keywordMode=['smart','manual','none'].indexOf(d.keywordMode)>=0?d.keywordMode:'smart';
 if(d.strategyType!=='selective')d.keywordMode='none';
 else if(d.keywordMode==='none')d.keywordMode='smart';
 d.secondaryLogic=['and_any','and_all','not_all','not_any'].indexOf(d.secondaryLogic)>=0?d.secondaryLogic:'and_any';
 d.passthroughSettings=sanitizeEntrySettings(d.passthroughSettings&&typeof d.passthroughSettings==='object'?d.passthroughSettings:{},true);
 return d;
}
function normalizeTemplate(raw){
 if(!raw||typeof raw!=='object')return null;
 var name=String(raw.name||'').trim(),text=String(raw.templateText||'').trim();
 if(!name||!text)return null;
 return {schemaVersion:API_VERSION,id:String(raw.id||nowId()),name:name,templateText:text,generationInstruction:String(raw.generationInstruction||DEFAULT_GENERATION_INSTRUCTION),entryNameRule:String(raw.entryNameRule||DEFAULT_ENTRY_NAME_RULE),output:normalizeOutput(raw.output),source:raw.source&&typeof raw.source==='object'?clone(raw.source):{kind:'import'}};
}
function initialLibrary(){return {schemaVersion:API_VERSION,yuanTemplateId:DEFAULT_TEMPLATE_ID,templates:[defaultTemplate()]};}
function loadLibrary(){
 var raw=null;try{raw=storage().getItem(LIBRARY_KEY);}catch(e){}
 if(!raw){var init=initialLibrary();saveLibrary(init);return init;}
 try{
  var parsed=JSON.parse(raw),templates=Array.isArray(parsed.templates)?parsed.templates.map(normalizeTemplate).filter(Boolean):[];
  var active=String(parsed.yuanTemplateId||'');
  if(active&&!templates.some(function(t){return t.id===active;}))active=templates[0]?templates[0].id:'';
  return {schemaVersion:API_VERSION,yuanTemplateId:active,templates:templates};
 }catch(e2){var fallback=initialLibrary();saveLibrary(fallback);return fallback;}
}
function saveLibrary(lib){storage().setItem(LIBRARY_KEY,JSON.stringify(lib));}
function loadWriterSettings(){
 var d={templateId:'',usePreset:false,useStream:false,preference:'',useHistory:false,historyCount:10,sendGreen:false,selectedBlue:[]};
 try{var raw=storage().getItem(WRITER_KEY);if(raw){var parsed=JSON.parse(raw);Object.keys(d).forEach(function(k){if(parsed[k]!==undefined)d[k]=parsed[k];});}}catch(e){}
 d.historyCount=Math.max(1,Math.min(100,parseInt(d.historyCount,10)||10));
 d.selectedBlue=Array.isArray(d.selectedBlue)?d.selectedBlue.map(String):[];
 return d;
}
function saveWriterSettings(settings){storage().setItem(WRITER_KEY,JSON.stringify(settings));}
function findTemplate(id){return loadLibrary().templates.find(function(t){return t.id===id;})||null;}
function getYuanTemplate(){var lib=loadLibrary();return lib.templates.find(function(t){return t.id===lib.yuanTemplateId;})||lib.templates[0]||null;}

function ensureStyle(doc){if(doc.getElementById('reader-template-system-style'))return;var st=doc.createElement('style');st.id='reader-template-system-style';st.textContent=STYLE_TEXT;(doc.head||doc.documentElement).appendChild(st);}
function closeOverlay(doc){doc=doc||hostDocument();var old=doc.getElementById('reader-template-system-overlay');if(old)old.remove();}
function overlay(title,subtitle,themeSource){
 var doc=hostDocument();ensureStyle(doc);closeOverlay(doc);
 var ov=doc.createElement('div');ov.id='reader-template-system-overlay';ov.className='rts-ov';
 ov.setAttribute('data-rts-theme',currentVisualTheme(themeSource));
 var card=doc.createElement('div');card.className='rts-card';
 card.innerHTML='<div class="rts-head"><div><div class="rts-title">'+esc(title)+'</div><div class="rts-sub">'+esc(subtitle||'')+'</div></div><button type="button" class="rts-x" title="关闭">×</button></div>';
 ov.appendChild(card);doc.body.appendChild(ov);
 card.querySelector('.rts-x').addEventListener('click',function(){closeOverlay(doc);});
 ov.addEventListener('click',function(e){if(e.target===ov)closeOverlay(doc);});
 return {doc:doc,overlay:ov,card:card};
}
function button(doc,label,kind){var b=doc.createElement('button');b.type='button';b.className='rts-btn'+(kind?' '+kind:'');b.textContent=label;return b;}
function downloadJson(payload,filename){
 var doc=hostDocument(),win=doc.defaultView||window,blob=new win.Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=win.URL.createObjectURL(blob),a=doc.createElement('a');
 a.href=url;a.download=String(filename||'读者模板.json').replace(/[\\/:*?"<>|]/g,'_');doc.body.appendChild(a);a.click();a.remove();setTimeout(function(){win.URL.revokeObjectURL(url);},500);
}
function readFile(file){if(file&&typeof file.text==='function')return file.text();return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(String(r.result||''));};r.onerror=function(){reject(new Error('文件读取失败'));};r.readAsText(file,'utf-8');});}

async function boundWorldbooks(){
 var th=api();if(typeof th.getCharWorldbookNames!=='function')throw new Error('当前 TavernHelper 不支持读取角色卡绑定世界书');
 var info=await Promise.resolve(th.getCharWorldbookNames('current'));info=info||{primary:null,additional:[]};
 var books=uniqueStrings([info.primary].concat(Array.isArray(info.additional)?info.additional:[]));
 return {primary:info.primary||null,additional:Array.isArray(info.additional)?info.additional.slice():[],books:books};
}
async function loadBoundEntries(){
 var th=api(),info=await boundWorldbooks(),all=[];
 if(typeof th.getWorldbook!=='function')throw new Error('当前 TavernHelper 不支持读取世界书条目');
 for(var i=0;i<info.books.length;i++){
  var book=info.books[i];
  try{var entries=await th.getWorldbook(book);(entries||[]).forEach(function(entry,index){all.push({bookName:book,entry:entry,index:index,key:book+'::'+String(entry.uid!=null?entry.uid:(entry.name||index))});});}
  catch(e){console.warn('[ReaderTemplate] 读取世界书失败',book,e);}
 }
 return {info:info,items:all};
}
function entryLamp(entry){return entry&&entry.strategy&&entry.strategy.type==='constant'?'蓝灯':entry&&entry.strategy&&entry.strategy.type==='selective'?'绿灯':entry&&entry.strategy&&entry.strategy.type==='vectorized'?'向量化':'其他';}
function strategyLabel(type){return type==='constant'?'蓝灯':type==='vectorized'?'向量化':'绿灯';}
function outputFromEntry(bookName,entry){
 var o=defaultOutput(),p=entry.position||{},s=entry.strategy||{},r=entry.recursion||{};
 o.targetWorldbook=bookName;o.enabled=entry.enabled!==false;o.strategyType=['constant','selective','vectorized'].indexOf(s.type)>=0?s.type:'selective';o.positionType=p.type||o.positionType;o.role=p.role||'system';o.depth=p.depth||0;o.order=Number.isFinite(Number(p.order))?Number(p.order):o.order;o.probability=Number.isFinite(Number(entry.probability))?Number(entry.probability):100;o.scanDepth=s.scan_depth==null?'same_as_global':s.scan_depth;o.keywordMode=o.strategyType==='selective'?'smart':'none';o.manualPrimary='';o.manualSecondary='';o.secondaryLogic='and_any';o.preventIncoming=r.prevent_incoming===undefined?o.preventIncoming:r.prevent_incoming;o.preventOutgoing=r.prevent_outgoing===undefined?o.preventOutgoing:r.prevent_outgoing;o.passthroughSettings=sanitizeEntrySettings(entry,true);
 return o;
}

function stripFences(raw){return String(raw||'').replace(/^\s*```[a-z0-9_-]*\s*/i,'').replace(/\s*```\s*$/,'').trim();}
async function reverseEntry(item){
 var th=api();if(typeof th.generateRaw!=='function')throw new Error('当前 TavernHelper 不支持 generateRaw，无法反推模板');
 var entry=item.entry||{};
 var prompt=['【来源世界书】'+item.bookName,'【原条目名】'+String(entry.name||'未命名条目'),'【原条目灯色】'+entryLamp(entry),'【待反推内容】\n'+String(entry.content||'')].join('\n\n');
 var raw=await th.generateRaw(routed({user_input:prompt,max_chat_history:0,should_stream:false,ordered_prompts:[{role:'system',content:REVERSE_SYSTEM_PROMPT},'user_input']}));
 var text=String(raw||''),m=text.match(/<reader_template>([\s\S]*?)<\/reader_template>/i),result=stripFences(m?m[1]:text);
 if(!result)throw new Error('模型没有返回可保存的模板');
 return result;
}

function renderTemplateEditor(template,isNew){
 var t=normalizeTemplate(template)||defaultTemplate(),shell=overlay(isNew?'保存反推模板':'编辑模板','模板与它生成条目的写入行为保存在同一条记录中。'),doc=shell.doc,card=shell.card,o=t.output;
 var form=doc.createElement('div');form.className='rts-grid';
 form.innerHTML=[
 '<label class="rts-field"><span class="rts-label">模板名称 *</span><input id="rts-e-name" class="rts-input"></label>',
 '<label class="rts-field"><span class="rts-label">目标世界书 *</span><input id="rts-e-book" class="rts-input" placeholder="不存在时自动创建并挂载"></label>',
 '<label class="rts-field rts-span2"><span class="rts-label">格式模板 *</span><textarea id="rts-e-template" class="rts-textarea tall"></textarea></label>',
 '<label class="rts-field rts-span2"><span class="rts-label">生成指令</span><textarea id="rts-e-instruction" class="rts-textarea"></textarea></label>',
 '<label class="rts-field rts-span2"><span class="rts-label">条目命名规则</span><textarea id="rts-e-name-rule" class="rts-textarea"></textarea></label>',
 '<label class="rts-field"><span class="rts-label">激活策略</span><select id="rts-e-strategy" class="rts-select"><option value="selective">绿灯（关键词触发）</option><option value="constant">蓝灯（常驻）</option><option value="vectorized">向量化</option></select></label>',
 '<label class="rts-field"><span class="rts-label">关键词模式</span><select id="rts-e-keymode" class="rts-select"><option value="smart">智能生成</option><option value="manual">固定关键词</option><option value="none">不生成（仅蓝灯有效）</option></select></label>',
 '<label class="rts-field rts-span2"><span class="rts-label">智能关键词生成规则</span><textarea id="rts-e-keyrule" class="rts-textarea"></textarea></label>',
 '<label class="rts-field"><span class="rts-label">固定主要关键词</span><textarea id="rts-e-primary" class="rts-textarea" placeholder="每行或逗号分隔"></textarea></label>',
 '<label class="rts-field"><span class="rts-label">固定次要关键词</span><textarea id="rts-e-secondary" class="rts-textarea" placeholder="每行或逗号分隔"></textarea></label>',
 '<label class="rts-field"><span class="rts-label">插入位置</span><select id="rts-e-position" class="rts-select"><option value="before_character_definition">角色定义前</option><option value="after_character_definition">角色定义后</option><option value="before_example_messages">示例消息前</option><option value="after_example_messages">示例消息后</option><option value="before_author_note">作者注释前</option><option value="after_author_note">作者注释后</option><option value="at_depth">指定深度</option><option value="outlet">Outlet</option></select></label>',
 '<label class="rts-field"><span class="rts-label">消息身份</span><select id="rts-e-role" class="rts-select"><option value="system">system</option><option value="assistant">assistant</option><option value="user">user</option></select></label>',
 '<label class="rts-field"><span class="rts-label">插入顺序</span><input id="rts-e-order" class="rts-input" type="number"></label>',
 '<label class="rts-field"><span class="rts-label">激活概率 %</span><input id="rts-e-prob" class="rts-input" type="number" min="0" max="100"></label>',
 '<label class="rts-field"><span class="rts-label">指定深度</span><input id="rts-e-depth" class="rts-input" type="number" min="0"></label>',
 '<label class="rts-field"><span class="rts-label">扫描深度</span><input id="rts-e-scan" class="rts-input" placeholder="same_as_global 或数字"></label>',
 '<label class="rts-field"><span class="rts-label">次要关键词逻辑</span><select id="rts-e-logic" class="rts-select"><option value="and_any">满足任一</option><option value="and_all">满足全部</option><option value="not_all">非全部满足</option><option value="not_any">全部不满足</option></select></label>',
 '<div class="rts-field"><span class="rts-label">条目开关</span><label class="rts-check"><input id="rts-e-enabled" type="checkbox">生成后启用条目</label></div>',
 '<div class="rts-field"><span class="rts-label">递归</span><label class="rts-check"><input id="rts-e-incoming" type="checkbox">阻止被其他条目递归激活</label><label class="rts-check"><input id="rts-e-outgoing" type="checkbox">阻止递归激活其他条目</label></div>',
 '<label class="rts-field rts-span2"><span class="rts-label">高级条目设置 JSON</span><textarea id="rts-e-passthrough" class="rts-textarea tall"></textarea><span class="rts-hint">从条目反推时，这里默认完整复刻源条目的其余设置。uid、名称、正文、关键词和所有过滤器字段会自动排除；上方可视设置保存时优先。</span></label>'
 ].join('');
 card.appendChild(form);
 function set(id,value){var el=form.querySelector(id);if(el)el.value=value==null?'':value;}
 var positionSelect=form.querySelector('#rts-e-position');if(o.positionType&&!positionSelect.querySelector('option[value="'+String(o.positionType).replace(/"/g,'\\"')+'"]')){var sourcePositionOption=doc.createElement('option');sourcePositionOption.value=o.positionType;sourcePositionOption.textContent='源条目位置：'+o.positionType;positionSelect.appendChild(sourcePositionOption);}
 set('#rts-e-name',t.name);set('#rts-e-book',o.targetWorldbook);set('#rts-e-template',t.templateText);set('#rts-e-instruction',t.generationInstruction);set('#rts-e-name-rule',t.entryNameRule);set('#rts-e-strategy',o.strategyType);set('#rts-e-keymode',o.keywordMode);set('#rts-e-keyrule',o.keywordRule);set('#rts-e-primary',o.manualPrimary);set('#rts-e-secondary',o.manualSecondary);set('#rts-e-position',o.positionType);set('#rts-e-role',o.role);set('#rts-e-order',o.order);set('#rts-e-prob',o.probability);set('#rts-e-depth',o.depth);set('#rts-e-scan',o.scanDepth);set('#rts-e-logic',o.secondaryLogic);set('#rts-e-passthrough',JSON.stringify(o.passthroughSettings||{},null,2));
 form.querySelector('#rts-e-enabled').checked=o.enabled!==false;form.querySelector('#rts-e-incoming').checked=o.preventIncoming!==false;form.querySelector('#rts-e-outgoing').checked=o.preventOutgoing!==false;
 var status=doc.createElement('div');status.className='rts-status';card.appendChild(status);
 var actions=doc.createElement('div');actions.className='rts-actions';var save=button(doc,'保存模板','primary'),cancel=button(doc,'返回模板管理','ghost');actions.appendChild(save);actions.appendChild(cancel);card.appendChild(actions);
 cancel.addEventListener('click',openTemplateManager);
 save.addEventListener('click',function(){
  var name=form.querySelector('#rts-e-name').value.trim(),text=form.querySelector('#rts-e-template').value.trim(),book=form.querySelector('#rts-e-book').value.trim();
  if(!name||!text||!book){status.textContent='模板名称、格式模板和目标世界书不能为空。';return;}
  var passthrough;try{passthrough=JSON.parse(form.querySelector('#rts-e-passthrough').value.trim()||'{}');if(!passthrough||Array.isArray(passthrough)||typeof passthrough!=='object')throw new Error('必须是 JSON 对象');passthrough=sanitizeEntrySettings(passthrough,true);}catch(jsonError){status.textContent='高级条目设置 JSON 无效：'+jsonError.message;return;}
  var lib=loadLibrary(),conflict=lib.templates.some(function(x){return x.id!==t.id&&x.name===name;});if(conflict){status.textContent='已经存在同名模板。';return;}
  t.name=name;t.templateText=text;t.generationInstruction=form.querySelector('#rts-e-instruction').value.trim()||DEFAULT_GENERATION_INSTRUCTION;t.entryNameRule=form.querySelector('#rts-e-name-rule').value.trim()||DEFAULT_ENTRY_NAME_RULE;
  t.output=normalizeOutput({targetWorldbook:book,enabled:form.querySelector('#rts-e-enabled').checked,strategyType:form.querySelector('#rts-e-strategy').value,positionType:form.querySelector('#rts-e-position').value,role:form.querySelector('#rts-e-role').value,depth:form.querySelector('#rts-e-depth').value,order:form.querySelector('#rts-e-order').value,probability:form.querySelector('#rts-e-prob').value,scanDepth:form.querySelector('#rts-e-scan').value.trim()||'same_as_global',keywordMode:form.querySelector('#rts-e-keymode').value,keywordRule:form.querySelector('#rts-e-keyrule').value.trim()||DEFAULT_KEYWORD_RULE,manualPrimary:form.querySelector('#rts-e-primary').value,manualSecondary:form.querySelector('#rts-e-secondary').value,secondaryLogic:form.querySelector('#rts-e-logic').value,preventIncoming:form.querySelector('#rts-e-incoming').checked,preventOutgoing:form.querySelector('#rts-e-outgoing').checked,passthroughSettings:passthrough});
  var idx=lib.templates.findIndex(function(x){return x.id===t.id;});if(idx>=0)lib.templates[idx]=t;else lib.templates.push(t);if(!lib.yuanTemplateId)lib.yuanTemplateId=t.id;saveLibrary(lib);notify('模板“'+t.name+'”已保存','success');openTemplateManager();
 });
}

function openTemplateManager(e){
 if(e&&e.stopPropagation)e.stopPropagation();
 var shell=overlay('条目模仿 · 模板管理','保存、导入、导出、编辑、重命名、删除模板，并指定缘加强当前使用的模板。',e),doc=shell.doc,card=shell.card,lib=loadLibrary();
 var tools=doc.createElement('div');tools.className='rts-tools';var reverse=button(doc,'从世界书反推模板','primary'),importBtn=button(doc,'导入模板 JSON'),exportAll=button(doc,'导出全部');tools.appendChild(reverse);tools.appendChild(importBtn);tools.appendChild(exportAll);card.appendChild(tools);
 var file=doc.createElement('input');file.type='file';file.accept='.json,application/json';file.style.display='none';card.appendChild(file);
 var list=doc.createElement('div');list.className='rts-list';card.appendChild(list);
 if(!lib.templates.length){list.innerHTML='<div class="rts-empty">还没有模板。可以从当前角色卡绑定的任意世界书条目反推。</div>';}
 lib.templates.forEach(function(t){
  var row=doc.createElement('div');row.className='rts-row';row.innerHTML='<div><div class="rts-name">'+esc(t.name)+(lib.yuanTemplateId===t.id?'<span class="rts-tag">缘加强使用中</span>':'')+'</div><div class="rts-meta">'+esc(strategyLabel(t.output.strategyType)+' · '+t.output.targetWorldbook+' · '+t.output.positionType+' / '+t.output.order+' / '+t.output.probability+'%')+'</div></div>';
  var acts=doc.createElement('div');acts.className='rts-actions';[['编辑','edit',''],['设为缘加强','yuan',''],['导出','export',''],['重命名','rename','ghost'],['删除','delete','danger']].forEach(function(a){var b=button(doc,a[0],a[2]);b.dataset.action=a[1];acts.appendChild(b);});row.appendChild(acts);list.appendChild(row);
  acts.addEventListener('click',function(ev){
   var action=ev.target&&ev.target.dataset?ev.target.dataset.action:'';if(!action)return;
   if(action==='edit'){renderTemplateEditor(t,false);return;}
   if(action==='yuan'){var l=loadLibrary();l.yuanTemplateId=t.id;saveLibrary(l);notify('缘加强将使用“'+t.name+'”','success');openTemplateManager();return;}
   if(action==='export'){downloadJson({readerTemplateExportVersion:API_VERSION,template:t},t.name+'.reader-template.json');return;}
   if(action==='rename'){var win=doc.defaultView||window,newName=win.prompt('输入新的模板名称',t.name);if(newName==null)return;newName=String(newName).trim();var l2=loadLibrary();if(!newName||l2.templates.some(function(x){return x.id!==t.id&&x.name===newName;})){notify('名称为空或已经存在同名模板','error');return;}var target=l2.templates.find(function(x){return x.id===t.id;});target.name=newName;saveLibrary(l2);openTemplateManager();return;}
   if(action==='delete'){var win2=doc.defaultView||window;if(!win2.confirm('确定删除模板“'+t.name+'”？此操作不会删除已经写入世界书的条目。'))return;var l3=loadLibrary();l3.templates=l3.templates.filter(function(x){return x.id!==t.id;});if(l3.yuanTemplateId===t.id)l3.yuanTemplateId=l3.templates[0]?l3.templates[0].id:'';saveLibrary(l3);openTemplateManager();}
  });
 });
 reverse.addEventListener('click',openReverseBrowser);importBtn.addEventListener('click',function(){file.click();});exportAll.addEventListener('click',function(){downloadJson({readerTemplateExportVersion:API_VERSION,library:lib},'读者条目模仿模板库.json');});
 file.addEventListener('change',async function(){if(!file.files||!file.files[0])return;try{var parsed=JSON.parse(await readFile(file.files[0])),incoming=[];if(parsed.template)incoming=[parsed.template];else if(parsed.library&&Array.isArray(parsed.library.templates))incoming=parsed.library.templates;else if(Array.isArray(parsed.templates))incoming=parsed.templates;else if(parsed.templateText)incoming=[parsed];var l=loadLibrary(),added=0;incoming.map(normalizeTemplate).filter(Boolean).forEach(function(t){t.id=nowId();var base=t.name,n=2;while(l.templates.some(function(x){return x.name===t.name;})){t.name=base+' ('+(n++)+')';}l.templates.push(t);added++;});if(!added)throw new Error('文件里没有可识别的模板');if(!l.yuanTemplateId)l.yuanTemplateId=l.templates[0].id;saveLibrary(l);notify('已导入 '+added+' 个模板','success');openTemplateManager();}catch(err){notify('导入失败：'+err.message,'error');}});
}

async function openReverseBrowser(e){
 if(e&&e.stopPropagation)e.stopPropagation();
 var shell=overlay('从世界书反推模板','读取当前角色卡主世界书与全部额外世界书；选择一个条目后交给内置反推提示词。',e),doc=shell.doc,card=shell.card;
 var status=doc.createElement('div');status.className='rts-status';status.textContent='正在读取当前绑定世界书……';card.appendChild(status);
 try{
  var data=await loadBoundEntries();if(!data.items.length){status.textContent='当前角色卡没有可读取的绑定世界书条目。';return;}
  status.textContent='共读取 '+data.info.books.length+' 本世界书、'+data.items.length+' 个条目。';
  var grid=doc.createElement('div');grid.className='rts-grid';grid.innerHTML='<label class="rts-field"><span class="rts-label">新模板名称 *</span><input id="rts-r-name" class="rts-input" placeholder="例如：人物志模板"></label><label class="rts-field"><span class="rts-label">筛选条目</span><input id="rts-r-filter" class="rts-input" placeholder="输入世界书名或条目名"></label>';card.appendChild(grid);
  var list=doc.createElement('div');list.className='rts-entry-list';card.appendChild(list);var preview=doc.createElement('div');preview.className='rts-preview';preview.textContent='选择条目后在此预览。';card.appendChild(preview);var selected=null;
  function render(filter){list.innerHTML='';var q=String(filter||'').toLowerCase();data.items.filter(function(item){return !q||(item.bookName+' '+(item.entry.name||'')).toLowerCase().indexOf(q)>=0;}).forEach(function(item){var label=doc.createElement('label');label.className='rts-entry';label.innerHTML='<input type="radio" name="rts-source-entry"><div><div class="rts-entry-name">'+esc(item.entry.name||'未命名条目')+'</div><div class="rts-entry-meta">'+esc(item.bookName+' · '+entryLamp(item.entry)+(item.entry.enabled===false?' · 已禁用':''))+'</div></div>';label.querySelector('input').addEventListener('change',function(){selected=item;preview.textContent=String(item.entry.content||'');if(!grid.querySelector('#rts-r-name').value.trim())grid.querySelector('#rts-r-name').value=(item.entry.name||'未命名')+'模板';});list.appendChild(label);});}
  render('');grid.querySelector('#rts-r-filter').addEventListener('input',function(){render(this.value);});
  var actions=doc.createElement('div');actions.className='rts-actions';var run=button(doc,'反推并进入编辑','primary'),back=button(doc,'返回模板管理','ghost');actions.appendChild(run);actions.appendChild(back);card.appendChild(actions);back.addEventListener('click',openTemplateManager);
  run.addEventListener('click',async function(){var name=grid.querySelector('#rts-r-name').value.trim();if(!selected||!name){status.textContent='请先选择一个条目并填写新模板名称。';return;}run.disabled=true;status.textContent='正在反推结构。此步骤使用独立内置提示词，不发送其他世界书……';try{var text=await reverseEntry(selected);var draft={schemaVersion:API_VERSION,id:nowId(),name:name,templateText:text,generationInstruction:DEFAULT_GENERATION_INSTRUCTION,entryNameRule:DEFAULT_ENTRY_NAME_RULE,output:outputFromEntry(selected.bookName,selected.entry),source:{kind:'worldbook',bookName:selected.bookName,entryUid:selected.entry.uid,entryName:selected.entry.name||''}};renderTemplateEditor(draft,true);}catch(err){status.textContent='反推失败：'+err.message;run.disabled=false;}});
 }catch(err){status.textContent='读取失败：'+err.message;}
}

function keyMatches(key,text){
 if(!key)return false;if(typeof key==='string')return key.length>0&&text.indexOf(key)>=0;
 try{if(key&&typeof key.test==='function'){key.lastIndex=0;return key.test(text);}}catch(e){}
 return false;
}
function greenMatches(entry,text){
 if(!entry||entry.enabled===false||!entry.strategy||entry.strategy.type!=='selective')return false;
 var primary=Array.isArray(entry.strategy.keys)?entry.strategy.keys:[];if(!primary.some(function(k){return keyMatches(k,text);}))return false;
 var sec=entry.strategy.keys_secondary||{},keys=Array.isArray(sec.keys)?sec.keys:[];if(!keys.length)return true;var hits=keys.map(function(k){return keyMatches(k,text);});
 if(sec.logic==='and_all')return hits.every(Boolean);if(sec.logic==='not_all')return !hits.every(Boolean);if(sec.logic==='not_any')return !hits.some(Boolean);return hits.some(Boolean);
}
function collectAssistantHistory(count){
 var th=api();if(typeof th.getLastMessageId!=='function'||typeof th.getChatMessages!=='function')return '';
 var last=th.getLastMessageId();if(last<0)return '';var messages=th.getChatMessages('0-'+last,{role:'assistant'})||[],recent=messages.slice(-count),parts=[];
 recent.forEach(function(msg){var text=String(msg.message||'').trim();if(text)parts.push(text);});return parts.join('\n\n---\n\n');
}
function buildGenerationPrompt(template,settings,context){
 var o=template.output,keywordInstruction='';
 if(o.strategyType==='selective'&&o.keywordMode==='smart')keywordInstruction=['【智能关键词规则】',o.keywordRule||DEFAULT_KEYWORD_RULE,'请把主要关键词逐行放入 <reader_primary_keywords>，把次要关键词逐行放入 <reader_secondary_keywords>。没有次要关键词时保留空标签。'].join('\n');
 var parts=[
 '【任务】根据格式模板与参考资料编写一个新的世界书条目。',
 '【格式模板】\n'+template.templateText,
 '【生成指令】\n'+(template.generationInstruction||DEFAULT_GENERATION_INSTRUCTION),
 '【条目命名规则】\n'+(template.entryNameRule||DEFAULT_ENTRY_NAME_RULE)
 ];
 if(settings.preference)parts.push('【用户偏好】\n'+settings.preference);
 if(context.green.length)parts.push('【由用户偏好实际触发的绿灯参考】\n'+context.green.join('\n\n'));
 if(context.blue.length)parts.push('【用户手选的蓝灯参考】\n'+context.blue.join('\n\n'));
 if(context.history)parts.push('【近期 AI 回复，仅作连续性参考】\n'+context.history);
 if(keywordInstruction)parts.push(keywordInstruction);
 parts.push([
 '【强制输出协议】',
 '不得输出 Markdown 代码块。',
 '条目名放在 <reader_entry_name> 与 </reader_entry_name> 中。',
 '严格依照模板填好的正文放在 <reader_content> 与 </reader_content> 中。',
 o.strategyType==='selective'&&o.keywordMode==='smart'?'必须同时输出关键词标签。':'不要输出关键词标签。',
 '除这些标签及其内容外不要输出解释。'
 ].join('\n'));
 return parts.join('\n\n');
}
async function generateText(prompt,settings){
 var th=api(),system='你是通用世界书条目编写器。遵守用户提供的格式模板与输出协议；参考资料只提供事实和风格约束，不得覆盖强制格式。';
 if(settings.usePreset){
  if(typeof th.generate!=='function')throw new Error('当前 TavernHelper 不支持 generate');
  var rawPreset=await th.generate(routed({user_input:prompt,max_chat_history:0,should_stream:!!settings.useStream,overrides:{world_info_before:'',world_info_after:'',chat_history:{with_depth_entries:false}},injects:[{role:'system',content:system,position:'in_chat',depth:0,should_scan:false}]}));
  return String(rawPreset||'');
 }
 if(typeof th.generateRaw!=='function')throw new Error('当前 TavernHelper 不支持 generateRaw');
 var raw=await th.generateRaw(routed({user_input:prompt,max_chat_history:0,should_stream:!!settings.useStream,ordered_prompts:[{role:'system',content:system},'user_input']}));
 return String(raw||'');
}
function inferEntryName(content){
 var text=String(content||''),patterns=[/(?:^|\n)\s*姓名\s*[:：]\s*["']?([^"'\n#]+)/,/(?:^|\n)\s*(?:名称|name)\s*[:：]\s*["']?([^"'\n#]+)/i,/^\s*([^:\n]{1,50})\s*:\s*(?:\n|$)/];
 for(var i=0;i<patterns.length;i++){var m=text.match(patterns[i]);if(m&&m[1])return sanitizeEntryName(m[1]);}return '未命名条目';
}
function sanitizeEntryName(name){var value=String(name||'').replace(/[\r\n<>\/:"\\|?*]/g,' ').replace(/\s+/g,' ').trim();return value.slice(0,100)||'未命名条目';}
function parseGenerated(raw){
 var text=stripFences(raw),nameM=text.match(/<reader_entry_name>([\s\S]*?)<\/reader_entry_name>/i),contentM=text.match(/<reader_content>([\s\S]*?)<\/reader_content>/i),primaryM=text.match(/<reader_primary_keywords>([\s\S]*?)<\/reader_primary_keywords>/i),secondaryM=text.match(/<reader_secondary_keywords>([\s\S]*?)<\/reader_secondary_keywords>/i);
 var content=contentM?stripFences(contentM[1]):text.replace(/<reader_entry_name>[\s\S]*?<\/reader_entry_name>/gi,'').replace(/<reader_(?:primary|secondary)_keywords>[\s\S]*?<\/reader_(?:primary|secondary)_keywords>/gi,'').trim();
 if(!content)throw new Error('模型返回中没有可写入的正文');
 return {entryName:sanitizeEntryName(nameM?nameM[1]:inferEntryName(content)),content:content,primary:parseList(primaryM?primaryM[1]:''),secondary:parseList(secondaryM?secondaryM[1]:'')};
}
function buildWorldbookEntry(template,result){
 var o=normalizeOutput(template.output),type=o.strategyType;
 var primary=[],secondary=[];
 if(type==='selective'){
  if(o.keywordMode==='manual'){primary=parseList(o.manualPrimary);secondary=parseList(o.manualSecondary);}
  else if(o.keywordMode==='smart'){primary=result.primary;secondary=result.secondary;}
  if(o.keywordMode==='none')primary=[];
  if(!primary.length&&o.keywordMode!=='none')primary=[result.entryName];
 }
 var scan=String(o.scanDepth)==='same_as_global'?'same_as_global':Math.max(1,parseInt(o.scanDepth,10)||1);
 var entry=sanitizeEntrySettings(o.passthroughSettings||{},true);
 entry.name=result.entryName;entry.enabled=o.enabled!==false;
 entry.strategy=Object.assign({},entry.strategy&&typeof entry.strategy==='object'?entry.strategy:{},{type:type,keys:type==='selective'?uniqueStrings(primary):[],keys_secondary:{logic:o.secondaryLogic||'and_any',keys:type==='selective'?uniqueStrings(secondary):[]},scan_depth:scan});
 var sourcePosition=entry.position&&typeof entry.position==='object'?entry.position:{};
 entry.position=Object.assign({},sourcePosition,{type:o.positionType,order:o.order});
 if(o.positionType==='at_depth'){entry.position.role=o.role||'system';entry.position.depth=o.depth||0;}
 else{if(entry.position.role===undefined)entry.position.role=o.role||'system';if(entry.position.depth===undefined)entry.position.depth=o.depth||0;}
 entry.content=result.content;entry.probability=o.probability;
 entry.recursion=Object.assign({delay_until:null},entry.recursion&&typeof entry.recursion==='object'?entry.recursion:{},{prevent_incoming:o.preventIncoming!==false,prevent_outgoing:o.preventOutgoing!==false});
 entry.effect=Object.assign({sticky:null,cooldown:null,delay:null},entry.effect&&typeof entry.effect==='object'?entry.effect:{});
 return entry;
}
async function ensureTargetWorldbook(target,token){
 target=String(target||'').trim();if(!target)throw new Error('模板没有设置目标世界书');
 var th=api(token),info=await boundWorldbooks();if(info.books.indexOf(target)>=0)return target;
 var exists=false;
 if(typeof th.getWorldbookNames==='function'){try{var names=await Promise.resolve(th.getWorldbookNames());exists=Array.isArray(names)&&names.indexOf(target)>=0;}catch(e){}}
 if(!exists&&typeof th.getWorldbook==='function'){try{await th.getWorldbook(target);exists=true;}catch(e2){}}
 if(!exists){if(typeof th.createWorldbook!=='function')throw new Error('当前 TavernHelper 不支持创建世界书');await th.createWorldbook(target);}
 var primary=info.primary,additional=info.additional.slice();
 if(!primary)primary=target;else if(primary!==target&&additional.indexOf(target)<0)additional.push(target);
 if(typeof th.rebindCharWorldbooks==='function')await th.rebindCharWorldbooks('current',{primary:primary,additional:uniqueStrings(additional)});
 else if(typeof th.setCurrentCharLorebooks==='function')await th.setCurrentCharLorebooks({primary:primary,additional:uniqueStrings(additional)});
 else throw new Error('世界书已创建，但当前 TavernHelper 不支持挂载到角色卡');
 return target;
}
async function writeEntry(template,result,token){
 var th=api(token),book=await ensureTargetWorldbook(template.output.targetWorldbook,token),entry=buildWorldbookEntry(template,result);
 if(typeof th.createWorldbookEntries==='function')await th.createWorldbookEntries(book,[entry]);
 else if(typeof th.updateWorldbookWith==='function')await th.updateWorldbookWith(book,function(entries){entries.push(entry);return entries;});
 else throw new Error('当前 TavernHelper 不支持写入世界书条目');
 return {bookName:book,entry:entry};
}
async function collectContext(settings,bound){
 var blue=[],green=[],selected=Object.create(null);(settings.selectedBlue||[]).forEach(function(k){selected[k]=1;});
 bound.items.forEach(function(item){var e=item.entry||{},label='【'+item.bookName+' / '+(e.name||'未命名条目')+'】\n'+String(e.content||'');if(selected[item.key])blue.push(label);if(settings.sendGreen&&settings.preference&&greenMatches(e,settings.preference))green.push(label);});
 return {blue:blue,green:green,history:settings.useHistory?collectAssistantHistory(settings.historyCount):''};
}
async function runWriter(template,settings,bound,token){
 var tx=window.ReaderTransactions;token=token||(tx?tx.capture():null);
 var context=await collectContext(settings,bound);if(tx)tx.assertCurrent(token);
 var prompt=buildGenerationPrompt(template,settings,context),raw=await generateText(prompt,settings);
 if(tx)tx.assertCurrent(token);
 var result=parseGenerated(raw),saved=await writeEntry(template,result,token);
 if(tx)tx.assertCurrent(token);
 return {entryName:saved.entry.name,bookName:saved.bookName,entry:saved.entry,raw:raw};
}

async function openWriter(e){
 if(e&&e.stopPropagation)e.stopPropagation();
 var lib=loadLibrary(),saved=loadWriterSettings(),shell=overlay('条目模仿 · 编写','选择模板与参考资料，组合提示词生成内容，并按模板的写入设置创建/挂载世界书。',e),doc=shell.doc,card=shell.card;
 if(!lib.templates.length){card.insertAdjacentHTML('beforeend','<div class="rts-empty">没有可用模板。请先在模板管理中导入或反推一个模板。</div>');return;}
 if(!saved.templateId||!lib.templates.some(function(t){return t.id===saved.templateId;}))saved.templateId=lib.yuanTemplateId||lib.templates[0].id;
 var section=doc.createElement('div');section.className='rts-section';section.innerHTML=[
 '<div class="rts-section-title">生成设置</div><div class="rts-grid">',
 '<label class="rts-field"><span class="rts-label">已有模板 *</span><select id="rts-w-template" class="rts-select"></select><span id="rts-w-template-meta" class="rts-hint"></span></label>',
 '<div class="rts-field"><span class="rts-label">调用方式</span><label class="rts-check"><input id="rts-w-preset" type="checkbox">发送当前预设（自动排除世界书占位与深度条目）</label><label class="rts-check"><input id="rts-w-stream" type="checkbox">流式生成</label></div>',
 '<label class="rts-field rts-span2"><span class="rts-label">用户偏好</span><textarea id="rts-w-pref" class="rts-textarea" placeholder="可留空；保存后下次继续使用"></textarea></label>',
 '<div class="rts-field"><span class="rts-label">聊天记录</span><label class="rts-check"><input id="rts-w-history" type="checkbox">发送聊天记录（仅 AI 回复）</label><input id="rts-w-history-count" class="rts-input" type="number" min="1" max="100" placeholder="回溯楼层数"></div>',
 '<div class="rts-field"><span class="rts-label">世界书参考</span><label class="rts-check"><input id="rts-w-green" type="checkbox">发送偏好关键词实际触发的绿灯</label><span class="rts-hint">范围：当前卡主世界书与全部额外世界书。</span></div>',
 '</div>'
 ].join('');card.appendChild(section);
 var select=section.querySelector('#rts-w-template');lib.templates.forEach(function(t){var op=doc.createElement('option');op.value=t.id;op.textContent=t.name;select.appendChild(op);});select.value=saved.templateId;
 section.querySelector('#rts-w-preset').checked=!!saved.usePreset;section.querySelector('#rts-w-stream').checked=!!saved.useStream;section.querySelector('#rts-w-pref').value=saved.preference||'';section.querySelector('#rts-w-history').checked=!!saved.useHistory;section.querySelector('#rts-w-history-count').value=saved.historyCount;section.querySelector('#rts-w-green').checked=!!saved.sendGreen;
 function updateMeta(){var t=findTemplate(select.value);section.querySelector('#rts-w-template-meta').textContent=t?strategyLabel(t.output.strategyType)+' → '+t.output.targetWorldbook+'；'+t.output.positionType+' / 顺序 '+t.output.order+' / '+t.output.probability+'%':'';}select.addEventListener('change',updateMeta);updateMeta();
 var blueSec=doc.createElement('div');blueSec.className='rts-section';blueSec.innerHTML='<div class="rts-section-title">发送蓝灯（手选参考资料）</div><div class="rts-hint">这里只发送你勾选的蓝灯；未勾选的不会随独立生成发送。</div><div id="rts-w-blue-list" class="rts-blue-list"><div class="rts-status">正在读取绑定世界书……</div></div>';card.appendChild(blueSec);
 var status=doc.createElement('div');status.className='rts-status';card.appendChild(status);var actions=doc.createElement('div');actions.className='rts-actions';var save=button(doc,'保存设置'),run=button(doc,'开始编写并写入','primary'),manage=button(doc,'模板管理','ghost');actions.appendChild(save);actions.appendChild(run);actions.appendChild(manage);card.appendChild(actions);
 var bound={info:{books:[]},items:[]};try{bound=await loadBoundEntries();var box=blueSec.querySelector('#rts-w-blue-list');box.innerHTML='';var blueItems=bound.items.filter(function(item){return item.entry&&item.entry.strategy&&item.entry.strategy.type==='constant';});if(!blueItems.length)box.innerHTML='<div class="rts-empty">当前绑定世界书中没有蓝灯条目。</div>';blueItems.forEach(function(item){var label=doc.createElement('label');label.className='rts-check rts-blue-item';label.innerHTML='<input type="checkbox" data-blue-key="'+esc(item.key)+'"><span><b>'+esc(item.entry.name||'未命名条目')+'</b><br><span class="rts-hint">'+esc(item.bookName+(item.entry.enabled===false?' · 当前已禁用':''))+'</span></span>';label.querySelector('input').checked=saved.selectedBlue.indexOf(item.key)>=0;box.appendChild(label);});}catch(err){blueSec.querySelector('#rts-w-blue-list').innerHTML='<div class="rts-status">读取参考资料失败：'+esc(err.message)+'</div>';}
 function readSettings(){return {templateId:select.value,usePreset:section.querySelector('#rts-w-preset').checked,useStream:section.querySelector('#rts-w-stream').checked,preference:section.querySelector('#rts-w-pref').value.trim(),useHistory:section.querySelector('#rts-w-history').checked,historyCount:Math.max(1,Math.min(100,parseInt(section.querySelector('#rts-w-history-count').value,10)||10)),sendGreen:section.querySelector('#rts-w-green').checked,selectedBlue:Array.prototype.slice.call(blueSec.querySelectorAll('input[data-blue-key]:checked')).map(function(x){return x.getAttribute('data-blue-key');})};}
 save.addEventListener('click',function(){saved=readSettings();saveWriterSettings(saved);status.textContent='设置已保存。';notify('编写设置已保存','success');});
 manage.addEventListener('click',openTemplateManager);
 run.addEventListener('click',async function(){saved=readSettings();saveWriterSettings(saved);var t=findTemplate(saved.templateId);if(!t){status.textContent='必须选择一个已有模板。';return;}run.disabled=true;status.textContent='正在组装提示词并生成'+(saved.useStream?'（流式）':'')+'……';try{var result=await runWriter(t,saved,bound);status.textContent='完成：条目“'+result.entryName+'”已写入《'+result.bookName+'》。';notify(status.textContent,'success');run.disabled=false;}catch(err){status.textContent='编写失败：'+err.message;notify(status.textContent,'error');run.disabled=false;}});
}

async function generateForYuanPlus(token){
 var template=getYuanTemplate();if(!template)throw new Error('模板库为空，请先在“条目模仿 → 模板管理”中准备模板');
 var preference='';try{if(typeof getYuanPlusPreference==='function')preference=getYuanPlusPreference();}catch(e){}
 var useStream=false;try{if(typeof getYuanPlusStreamEnabled==='function')useStream=getYuanPlusStreamEnabled();}catch(e2){}
 var bound=await loadBoundEntries(),settings={templateId:template.id,usePreset:false,useStream:useStream,preference:preference,useHistory:false,historyCount:10,sendGreen:!!preference,selectedBlue:[]};
 bound.items.forEach(function(item){var e=item.entry||{},name=String(e.name||'');if(e.enabled!==false&&e.strategy&&e.strategy.type==='constant'&&typeof YUAN_PLUS_BLUE_WHITELIST!=='undefined'&&YUAN_PLUS_BLUE_WHITELIST.some(function(k){return name.indexOf(k)>=0;}))settings.selectedBlue.push(item.key);});
 return runWriter(template,settings,bound,token);
}

function bindMenuNode(li){
 if(!li)return li;li.style.gridColumn='1/-1';li.style.width='100%';if(li.getAttribute('data-rts-bound')==='1')return li;li.setAttribute('data-rts-bound','1');
 li.addEventListener('click',function(e){var target=e.target&&e.target.closest?e.target.closest('[data-rts-action]'):null;if(!target)return;e.preventDefault();e.stopPropagation();var action=target.getAttribute('data-rts-action');if(action==='write')openWriter(e);else if(action==='reverse')openReverseBrowser(e);else openTemplateManager(e);});
 return li;
}
function menuNode(doc){
 var li=doc.createElement('li');li.className='m-nested';li.setAttribute('data-reader-template-menu','1');
 li.innerHTML='<details><summary><span>条目模仿</span><span class="m-cost free" style="color:#c59d5f;">▧</span></summary><div class="sub-opts"><div class="sub-opt" data-rts-action="write"><span>编写</span><span>生成并写入</span></div><div class="sub-opt" data-rts-action="reverse"><span>从世界书反推模板</span><span>AI</span></div><div class="sub-opt" data-rts-action="manage"><span>模板管理</span><span>JSON</span></div></div></details>';
 return bindMenuNode(li);
}
function installMenusIn(doc){
 if(!doc||!doc.querySelectorAll)return;var lists=doc.querySelectorAll('.wrapper-v9-fix .menu-board .m-list,.dream-fpp .menu-board .m-list');for(var i=0;i<lists.length;i++){var existing=lists[i].querySelector('[data-reader-template-menu]');if(existing){bindMenuNode(existing);continue;}var node=menuNode(doc),firstNested=lists[i].querySelector('.m-nested');if(firstNested)lists[i].insertBefore(node,firstNested);else lists[i].appendChild(node);}}
function watchDocument(doc){if(!doc||!doc.body)return;installMenusIn(doc);try{var win=doc.defaultView||window,key='__readerTemplateMenuObserverV1';if(win[key])return;var Obs=win.MutationObserver||MutationObserver;var observer=new Obs(function(){installMenusIn(doc);});observer.observe(doc.body,{childList:true,subtree:true});win[key]=observer;}catch(e){}}
function installAll(){watchDocument(document);try{var host=hostDocument();if(host!==document)watchDocument(host);}catch(e){}}

window.ReaderTemplateSystem={version:API_VERSION,openManager:openTemplateManager,openReverse:openReverseBrowser,openWriter:openWriter,getYuanTemplateText:function(){var t=getYuanTemplate();return t?t.templateText:'';},getYuanTemplate:getYuanTemplate,generateForYuanPlus:generateForYuanPlus,loadLibrary:loadLibrary,_debug:{sanitizeEntrySettings:sanitizeEntrySettings,outputFromEntry:outputFromEntry,buildWorldbookEntry:buildWorldbookEntry}};
setTimeout(installAll,0);
})();
/* ★ READER TEMPLATE SYSTEM END ★ */

