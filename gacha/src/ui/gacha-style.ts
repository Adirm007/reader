/** 命运抽卡（读者大厅）的样式。面板跟随读者当前主题：咖啡馆（深色木纹与黄铜，默认）、盛夏（海盐玻璃与天蓝）、水墨（纸笺与青瓷）。
 *  主题只换配色变量；抽卡舞台在三套主题里都是夜色（咖啡馆的暖夜、盛夏的深海、水墨的墨夜），光效才看得清。
 *  卡面按品质着色（普通 灰 · 优良 绿 · 稀有 蓝 · 史诗 紫 · 传说 金 · 神话 赤与虹彩 · 唯一 青与虹彩）。所有动画只动 transform / opacity，遵循系统“减少动态效果”。 */
import {OCTO_SERIF,OCTO_SANS,octoCorners} from './octo-kit';

const BRIGHT = '--s1:#b8b2a3;--s2:#7fc58b;--s3:#69a8ea;--s4:#b88cec;--s5:#f2c35d;--s6:#ff6d6a;--s7:#4fe0cf';
const DEEP = '--s1:#8f8778;--s2:#3f9a5a;--s3:#2f7fc4;--s4:#8559c6;--s5:#c08a12;--s6:#df4a45;--s7:#16998a';
/* 咖啡馆：深色木纹、黄铜与奶油色字，和咖啡馆大厅同一套。 */
const CAFE = `--gc-scrim:radial-gradient(ellipse at 50% 30%,#2a1a10e6,#0b0604f4);--gc-corners:${octoCorners('#c9a26a', '#f0d9a8', 26)};--gc-shell:linear-gradient(180deg,rgba(44,30,20,.97),rgba(27,18,12,.97) 55%,rgba(17,11,8,.98));--gc-shell-line:#c9a26a99;--gc-shell-inset:#0b0705cc;
--gc-acc:#c9a26a;--gc-hi:#f0d9a8;--gc-ink:#f2e7d3;--gc-ink2:#f6e7c2;--gc-sub:#c4b093;--gc-mute:#9b8b75;--gc-line:#c9a26a;
--gc-panel:#1e140dd9;--gc-raise:linear-gradient(160deg,#2f2116e6,#120c08e6);--gc-on:linear-gradient(160deg,#4f3820e6,#1a120ae6);--gc-on-ink:#fff1c9;
--gc-btn:#231811e0;--gc-btn-ink:#f1e8dc;--gc-btn-line:#d9cbb4aa;--gc-btn-inset:#1a120d;--gc-btn-hover:#3e2d20ee;--gc-btn-hover-ink:#fff8e3;
--gc-pri:linear-gradient(180deg,#f4e0a8,#d8b56c 55%,#b38a45);--gc-pri-hover:linear-gradient(180deg,#fff0c4,#e6c37a 55%,#c29652);--gc-pri-ink:#1d1508;--gc-pri-line:#f6e2ae;
--gc-icon:radial-gradient(circle at 50% 35%,#3a2a1ee6,#0d0806e6);--gc-field:#140d09ee;--gc-field-ink:#f3eee4;--gc-field-line:#d9cbb4aa;
--gc-overlay:#0a050399;--gc-bad:#e9a49a;--gc-ok:#b9d9b0;--gc-shadow:#000d;--gc-hero-halo:0 0 2px #0e0906,0 0 6px #0e0906,0 0 12px #0e0906;--gc-text-shadow:0 1px 3px #000;
--gc-hero:radial-gradient(ellipse 30% 90% at 85% 42%,#d8b97824,transparent 72%),linear-gradient(90deg,#0e0906 0%,#0e0906f2 36%,#1c120bd6 62%,#2b1c10a8 100%),#0e0906;
--gc-hero-fade:linear-gradient(0deg,#0e0906 22%,#0e0906d9 44%,#0e090600 74%);--gc-hero-mobile:radial-gradient(ellipse 60% 55% at 72% 22%,#d8b97822,transparent 70%),#1a110b;
--gc-cast:radial-gradient(ellipse at 50% 60%,#3b2717e8,#0c0705f2);--gc-cast-blend:screen;--gc-cast-op:.55;--gc-wave:#e8c48a55;--gc-bob:linear-gradient(90deg,#3b2a14,#6b5328 48%,#3b2a14 52%,#2a1e0e);
--gc-title-grad:linear-gradient(180deg,#fff6dc 10%,#e9cf93 55%,#a88146);--gc-title-shadow:drop-shadow(0 2px 2px #000c);
--gc-banner:linear-gradient(110deg,#170f0af2 35%,#170f0a99);--gc-box:#0f0a07cc;--gc-track:#ffffff14;--gc-scroll:#9a8f7466;
--gc-stage-bg:#080403;--gc-stage-vig:#050302;--gc-card-back:radial-gradient(ellipse at 50% 45%,#4b331f,#24170e 55%,#0c0705);--gc-card-front:linear-gradient(180deg,#24180f,#0d0806 72%);--gc-art:#e4c88a;
color-scheme:dark;${BRIGHT}`;
/* 盛夏：白色海盐玻璃、天蓝描边、深海色的字；抽卡舞台是深海夜色。 */
const SUMMER = `--gc-scrim:radial-gradient(ellipse at 50% 30%,#e6f7fdeb,#9fd3e6f2);--gc-corners:${octoCorners('#3a9cc4', '#ffffff', 26)};--gc-shell:linear-gradient(180deg,rgba(255,255,255,.98),rgba(241,250,254,.98) 55%,rgba(226,244,251,.99));--gc-shell-line:#7fc3dc;--gc-shell-inset:#ffffffcc;
--gc-acc:#3a9cc4;--gc-hi:#1e7ea8;--gc-ink:#1f4656;--gc-ink2:#163a4b;--gc-sub:#4c7383;--gc-mute:#7b98a4;--gc-line:#3a9cc4;
--gc-panel:#ffffffe0;--gc-raise:linear-gradient(160deg,#ffffff,#eaf7fc);--gc-on:linear-gradient(160deg,#d3f0fb,#b6e2f3);--gc-on-ink:#0f3b4e;
--gc-btn:#ffffffeb;--gc-btn-ink:#1f4656;--gc-btn-line:#8fc9de;--gc-btn-inset:#f4fbfe;--gc-btn-hover:#e3f5fc;--gc-btn-hover-ink:#0f3b4e;
--gc-pri:linear-gradient(180deg,#72d2ef,#3aa8d0 55%,#2a8eba);--gc-pri-hover:linear-gradient(180deg,#8adcf3,#47b4dc 55%,#329ac6);--gc-pri-ink:#ffffff;--gc-pri-line:#2a8eba;
--gc-icon:radial-gradient(circle at 50% 35%,#ffffff,#e2f4fb);--gc-field:#ffffff;--gc-field-ink:#1f4656;--gc-field-line:#8fc9de;
--gc-overlay:#5aa8c255;--gc-bad:#c84d40;--gc-ok:#2c8a5e;--gc-shadow:#2a6f8a33;--gc-hero-halo:0 0 2px #ffffff,0 0 6px #ffffff,0 0 12px #ffffff;--gc-text-shadow:none;
--gc-hero:radial-gradient(ellipse 34% 95% at 84% 40%,#ffffffd9,transparent 72%),linear-gradient(90deg,#ffffff 0%,#fffffff2 36%,#e8f7fde6 62%,#c6e9f6cc 100%),#eaf7fc;
--gc-hero-fade:linear-gradient(0deg,#ffffff 24%,#ffffffde 46%,#ffffff00 76%);--gc-hero-mobile:radial-gradient(ellipse 60% 55% at 72% 22%,#ffffffcc,transparent 70%),#dff3fa;
--gc-cast:radial-gradient(ellipse at 50% 60%,#c8ecf8f2,#effafef7);--gc-cast-blend:normal;--gc-cast-op:.92;--gc-wave:#3a9cc466;--gc-bob:linear-gradient(90deg,#1a6386,#5bb8dc 48%,#1a6386 52%,#124a66);
--gc-title-grad:linear-gradient(180deg,#3aa8d0 10%,#1f7fa8 60%,#155f80);--gc-title-shadow:none;
--gc-banner:linear-gradient(110deg,#ffffffeb 35%,#eaf7fcd9);--gc-box:#ffffffd9;--gc-track:#3a9cc41f;--gc-scroll:#3a9cc466;
--gc-stage-bg:#04202f;--gc-stage-vig:#02121c;--gc-card-back:radial-gradient(ellipse at 50% 45%,#2c7a9e,#13465f 55%,#061f2d);--gc-card-front:linear-gradient(180deg,#123b52,#071d2a 72%);--gc-art:#bfe9f7;
color-scheme:light;${DEEP}`;
/* 水墨：纸笺底、墨色字、青瓷描边；抽卡舞台是墨夜。 */
const INK = `--gc-scrim:radial-gradient(ellipse at 50% 30%,#eceee3eb,#b7c0aef2);--gc-corners:${octoCorners('#6f8a74', '#b9c7a8', 26)};--gc-shell:linear-gradient(180deg,rgba(249,246,236,.99),rgba(244,240,228,.99) 55%,rgba(237,233,218,.99));--gc-shell-line:#9aaa8d;--gc-shell-inset:#fbf9f1cc;
--gc-acc:#6f8a74;--gc-hi:#3f5b4b;--gc-ink:#2f4339;--gc-ink2:#253930;--gc-sub:#5c7062;--gc-mute:#88947e;--gc-line:#6f8a74;
--gc-panel:#fbf9f1e6;--gc-raise:linear-gradient(160deg,#fdfbf5,#eeeadb);--gc-on:linear-gradient(160deg,#e3eadb,#cdd9c3);--gc-on-ink:#22362c;
--gc-btn:#fbf9f2;--gc-btn-ink:#2f4339;--gc-btn-line:#a3b199;--gc-btn-inset:#f3f0e6;--gc-btn-hover:#eef1e6;--gc-btn-hover-ink:#22362c;
--gc-pri:linear-gradient(180deg,#86a28a,#647f6b 55%,#4f6a58);--gc-pri-hover:linear-gradient(180deg,#94ae97,#6e8a75 55%,#587463);--gc-pri-ink:#fbf8ee;--gc-pri-line:#4f6a58;
--gc-icon:radial-gradient(circle at 50% 35%,#fffdf6,#ece8da);--gc-field:#fffdf7;--gc-field-ink:#2f4339;--gc-field-line:#a3b199;
--gc-overlay:#6f7c6a55;--gc-bad:#a84a3e;--gc-ok:#3d7a51;--gc-shadow:#4a5a4a33;--gc-hero-halo:0 0 2px #f6f3e8,0 0 6px #f6f3e8,0 0 12px #f6f3e8;--gc-text-shadow:none;
--gc-hero:radial-gradient(ellipse 34% 95% at 84% 40%,#ffffffb8,transparent 72%),linear-gradient(90deg,#f8f5eb 0%,#f8f5ebf2 36%,#eff1e4e6 62%,#dde5d4cc 100%),#f2eee1;
--gc-hero-fade:linear-gradient(0deg,#f6f3e8 24%,#f6f3e8de 46%,#f6f3e800 76%);--gc-hero-mobile:radial-gradient(ellipse 60% 55% at 72% 22%,#ffffffb0,transparent 70%),#e9ebdd;
--gc-cast:radial-gradient(ellipse at 50% 60%,#e3e9dcf2,#f7f4eaf7);--gc-cast-blend:normal;--gc-cast-op:.92;--gc-wave:#6f8a7466;--gc-bob:linear-gradient(90deg,#2c463a,#7d9a82 48%,#2c463a 52%,#1c2c25);
--gc-title-grad:linear-gradient(180deg,#5b7a66 10%,#3c5747 60%,#283d31);--gc-title-shadow:none;
--gc-banner:linear-gradient(110deg,#fbf9f2ee 35%,#efecdfd9);--gc-box:#fbf9f2e6;--gc-track:#6f8a741f;--gc-scroll:#6f8a7466;
--gc-stage-bg:#0e1814;--gc-stage-vig:#060a08;--gc-card-back:radial-gradient(ellipse at 50% 45%,#3d5b4c,#1d3029 55%,#0a120f);--gc-card-front:linear-gradient(180deg,#1c2e27,#0b1310 72%);--gc-art:#d3dcc4;
color-scheme:light;${DEEP}`;
const mix = (v: string, p: number) => `color-mix(in srgb,var(${v}) ${p}%,transparent)`;

export const GACHA_STYLE = `
.bs-gacha{${CAFE}}
.bs-gacha[data-theme=summer]{${SUMMER}}
.bs-gacha[data-theme=ink]{${INK}}
.bs-gacha .gc-stage{${BRIGHT}}
.bs-gacha{position:fixed;inset:0;z-index:1250;display:flex;align-items:center;justify-content:center;padding:14px;background:var(--gc-scrim);color:var(--gc-ink);font:14px/1.6 ${OCTO_SANS};letter-spacing:.02em;--gc-gold:var(--gc-acc)}
.bs-gacha[hidden],.bs-gacha [hidden]{display:none!important}
.bs-gacha *{box-sizing:border-box}
/* 读者把面板放在酒馆主页面里：屏蔽酒馆对表单控件的全局样式（它用 :not(#nothing) 提高优先级），按钮、标题沿用面板自己的字体。 */
.bs-gacha{text-align:left;text-transform:none}
.bs-gacha :is(h2,h3,p,ul,ol,li,small,b,time,figure){text-transform:none;text-shadow:none}
.bs-gacha a{color:inherit}
.bs-gacha :is(small,b,strong,em,time){color:inherit}
.bs-gacha :is(input,select):not(#gc-x){margin:0;box-shadow:none;filter:none;transform:none;font:inherit;line-height:1.4}
.bs-gacha input[type=checkbox]:not(#gc-x){-webkit-appearance:checkbox;appearance:auto;display:inline-block;flex:none;width:16px;height:16px;margin:4px 0 0;padding:0;border:0;border-radius:0;background:none;accent-color:var(--gc-acc);cursor:pointer}
.bs-gacha input[type=checkbox]:not(#gc-x):before,.bs-gacha input[type=checkbox]:not(#gc-x):after{content:none;display:none}
.bs-gacha select:not(#gc-x){-webkit-appearance:auto;appearance:auto;height:auto;width:auto;max-width:100%}
.bs-gacha button,.bs-gacha input,.bs-gacha select{font:inherit;color:inherit}
.bs-gacha button{cursor:pointer}
.bs-gacha button:disabled{cursor:default;opacity:.5}
.gc-shell{position:relative;display:flex;flex-direction:column;width:min(1180px,100%);height:min(840px,100%);overflow:hidden;border:1px solid var(--gc-shell-line);background:var(--gc-corners),var(--gc-shell);box-shadow:inset 0 0 0 4px var(--gc-shell-inset),inset 0 0 0 5px ${mix('--gc-acc', 15)},0 24px 80px var(--gc-shadow)}
.gc-shell:focus{outline:none}
.gc-head{position:relative;z-index:3;display:flex;align-items:center;gap:14px;padding:18px 24px 12px 30px;background:linear-gradient(90deg,transparent,${mix('--gc-acc', 40)} 18%,${mix('--gc-acc', 40)} 82%,transparent) bottom/100% 1px no-repeat}
.gc-title{min-width:0;flex:1}
.gc-title h2{margin:0;font:600 23px/1.3 ${OCTO_SERIF};letter-spacing:.24em;background:var(--gc-title-grad);-webkit-background-clip:text;background-clip:text;color:transparent;filter:var(--gc-title-shadow)}
.gc-title p{margin:2px 0 0;color:var(--gc-sub);font-size:12.5px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:3px 12px;border:1px solid ${mix('--gc-acc', 33)};background:var(--gc-panel);color:var(--gc-sub);font-size:12.5px;white-space:nowrap}
.gc-chip b{font:600 14px/1 ${OCTO_SERIF};color:var(--gc-ink2)}
.gc-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;border:1px solid ${mix('--gc-acc', 50)};background:var(--gc-icon);color:var(--gc-hi);flex:none}
.gc-icon svg{width:19px;height:19px}
.gc-icon:hover,.gc-icon:focus-visible{border-color:var(--gc-hi);outline:2px solid ${mix('--gc-acc', 70)};outline-offset:2px}
.gc-close{font:24px/1 system-ui!important}
.gc-body{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
.gc-view{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 30px 26px;scrollbar-width:thin;scrollbar-color:var(--gc-scroll) transparent}
.gc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:6px 18px;border:1px solid var(--gc-btn-line);background:var(--gc-btn);color:var(--gc-btn-ink);box-shadow:inset 0 0 0 3px var(--gc-btn-inset),inset 0 0 0 4px ${mix('--gc-btn-line', 40)};letter-spacing:.12em;white-space:nowrap}
.gc-btn:hover:not(:disabled),.gc-btn:focus-visible{background:var(--gc-btn-hover);color:var(--gc-btn-hover-ink);border-color:var(--gc-hi);outline:2px solid ${mix('--gc-acc', 70)};outline-offset:2px}
.gc-btn.is-primary{border-color:var(--gc-pri-line);color:var(--gc-pri-ink);background:var(--gc-pri);box-shadow:inset 0 0 0 2px #ffffff40;font-weight:600}
.gc-btn.is-primary:hover:not(:disabled){background:var(--gc-pri-hover);color:var(--gc-pri-ink)}
.gc-btn.is-armed,.gc-btn.is-armed:hover:not(:disabled){border-color:var(--gc-bad);background:${mix('--gc-bad', 18)};color:var(--gc-ink);box-shadow:inset 0 0 0 2px ${mix('--gc-bad', 35)}}
.gc-btn.is-small{min-height:32px;padding:3px 12px;font-size:12.5px;letter-spacing:.06em}
.gc-btn small{font-size:11.5px;opacity:.85;letter-spacing:.04em}
.gc-back{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 14px 4px 10px;border:1px solid ${mix('--gc-acc', 40)};background:var(--gc-panel);color:var(--gc-ink);letter-spacing:.12em}
.gc-back:hover,.gc-back:focus-visible{border-color:var(--gc-hi);outline:2px solid ${mix('--gc-acc', 70)};outline-offset:2px}
.gc-note{margin:8px 0 0;color:var(--gc-mute);font-size:12.5px}
.gc-note.is-bad{color:var(--gc-bad)}
.gc-h3{display:flex;align-items:center;gap:10px;margin:0 0 12px;font:500 16px/1.5 ${OCTO_SERIF};letter-spacing:.16em;color:var(--gc-ink2)}
.gc-h3:before{content:'';width:7px;height:7px;transform:rotate(45deg);background:var(--gc-acc);flex:none}
.gc-h3 small{font:12px/1 ${OCTO_SANS};letter-spacing:.04em;color:var(--gc-mute)}
/* 首页 */
.gc-hero{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:196px;margin:0 0 18px;padding:26px 32px;border:1px solid ${mix('--gc-acc', 25)};background:var(--gc-hero);overflow:hidden;box-shadow:inset 0 0 0 1px ${mix('--gc-shell-inset', 60)},0 10px 26px ${mix('--gc-shadow', 50)}}
.gc-hero:after{content:'';position:absolute;left:32px;right:40%;bottom:18px;height:1px;background:linear-gradient(90deg,${mix('--gc-acc', 66)},transparent)}
.gc-hero-ring{position:absolute;right:calc(15% - 160px);top:50%;z-index:0;width:320px;aspect-ratio:1;transform:translateY(-50%);opacity:.16;pointer-events:none;color:var(--gc-acc)}
.gc-hero-ring svg{display:block;width:100%;height:100%;animation:gc-spin 90s linear infinite}
.gc-hero-fig{position:absolute;right:max(4%,14px);top:10px;z-index:0;height:188%;aspect-ratio:832/1216;background:var(--gc-figure,none) 50% 0/contain no-repeat;-webkit-mask:linear-gradient(180deg,#000 36%,transparent 52%);mask:linear-gradient(180deg,#000 36%,transparent 52%);filter:drop-shadow(0 0 16px ${mix('--gc-shadow', 80)});pointer-events:none}
.gc-hero-fig.is-enter{animation:gc-fig-in .8s ease-out both}
.gc-hero>h3,.gc-hero>p,.gc-hero>.gc-prices{position:relative;z-index:2}
.gc-hero h3{margin:0 0 6px;font:600 21px/1.4 ${OCTO_SERIF};letter-spacing:.2em;color:var(--gc-ink2)}
.gc-hero p{margin:0;max-width:min(560px,60%);color:var(--gc-sub);text-shadow:var(--gc-text-shadow)}
.gc-prices{display:flex;flex-wrap:wrap;gap:6px}
.gc-hero .gc-prices{margin:12px 0 0}
.gc-prices span{padding:1px 10px;border:1px solid ${mix('--gc-acc', 40)};background:var(--gc-panel);color:var(--gc-sub);font-size:12px;white-space:nowrap}
.gc-prices b{color:var(--gc-ink2);font-weight:600}
.gc-dirs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0 0 16px}
.gc-dir{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:116px;padding:18px 22px;border:1px solid ${mix('--gc-acc', 27)};background:var(--gc-raise);text-align:left;transition:border-color .15s,transform .15s,box-shadow .15s;overflow:hidden}
.gc-dir:before{content:'';position:absolute;inset:auto -20px -46px auto;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,${mix('--gc-acc', 14)},transparent 70%)}
.gc-dir strong{font:600 26px/1.2 ${OCTO_SERIF};letter-spacing:.24em;color:var(--gc-ink2)}
.gc-dir span{color:var(--gc-sub);font-size:13px}
.gc-dir:hover,.gc-dir:focus-visible{border-color:var(--gc-hi);transform:translateY(-2px);outline:none;box-shadow:0 10px 24px ${mix('--gc-shadow', 60)}}
.gc-dir[aria-pressed=true]{border-color:var(--gc-hi);background:var(--gc-on);box-shadow:0 0 0 1px ${mix('--gc-hi', 40)},0 0 30px ${mix('--gc-acc', 20)}}
.gc-dir[aria-pressed=true] strong{color:var(--gc-on-ink)}
.gc-themes{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.gc-theme{display:inline-flex;flex-direction:column;align-items:flex-start;min-width:112px;padding:7px 14px 8px;border:1px solid ${mix('--gc-acc', 25)};background:var(--gc-panel);text-align:left;line-height:1.35;transition:border-color .15s}
.gc-theme b{font:500 14.5px/1.4 ${OCTO_SERIF};color:var(--gc-ink2);letter-spacing:.08em}
.gc-theme small{color:var(--gc-mute);font-size:11.5px}
.gc-theme:hover,.gc-theme:focus-visible{border-color:var(--gc-hi);outline:none}
.gc-theme[aria-pressed=true]{border-color:var(--gc-hi);background:var(--gc-on)}
.gc-theme[aria-pressed=true] b{color:var(--gc-on-ink)}
.gc-theme.is-custom{border-style:dashed}
.gc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0 0}
.gc-srcs{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.gc-src{padding:1px 8px;border:1px solid ${mix('--gc-ink', 15)};color:var(--gc-sub);font-size:11.5px}
.gc-src.is-off{opacity:.45;text-decoration:line-through}
/* 撒网 */
.gc-cast{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:var(--gc-cast)}
.gc-cast:before{content:'';position:absolute;right:0;bottom:0;width:min(44%,470px);height:100%;background:var(--gc-host,none) 50% 100%/contain no-repeat;opacity:var(--gc-cast-op);mix-blend-mode:var(--gc-cast-blend);-webkit-mask:linear-gradient(90deg,transparent,#000 40%);mask:linear-gradient(90deg,transparent,#000 40%);pointer-events:none;animation:gc-fade .6s ease-out both}
.gc-cast>*{position:relative}
.gc-sea{position:relative;width:min(520px,90%);height:150px;overflow:hidden;border-bottom:1px solid ${mix('--gc-acc', 20)}}
.gc-sea i{position:absolute;left:-50%;width:200%;height:60px;border-radius:45%;border-top:2px solid var(--gc-wave);animation:gc-wave 5s linear infinite}
.gc-sea i:nth-child(1){bottom:-28px}.gc-sea i:nth-child(2){bottom:-18px;animation-duration:7s;animation-direction:reverse;border-color:${mix('--gc-acc', 33)}}.gc-sea i:nth-child(3){bottom:-8px;animation-duration:9s;border-color:${mix('--gc-ink', 20)}}
.gc-sea b{position:absolute;left:50%;top:14px;width:34px;height:44px;margin-left:-17px;border:1px solid ${mix('--gc-hi', 66)};background:var(--gc-bob);box-shadow:0 0 18px ${mix('--gc-hi', 33)};animation:gc-bob 2.4s ease-in-out infinite}
.gc-cast h3{margin:0;font:600 19px/1.4 ${OCTO_SERIF};letter-spacing:.22em;color:var(--gc-ink2)}
.gc-reports{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px;width:min(620px,100%);margin:0;padding:0;list-style:none}
.gc-reports li{display:flex;justify-content:space-between;gap:8px;padding:5px 10px;border:1px solid ${mix('--gc-ink', 12)};background:var(--gc-panel);font-size:12.5px;color:var(--gc-ink)}
.gc-reports li.is-ok b{color:var(--gc-ok)}.gc-reports li.is-bad b{color:var(--gc-bad)}.gc-reports li.is-wait b{color:var(--gc-mute)}
/* 99 部 */
.gc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px}
.gc-bar .gc-grow{flex:1;min-width:120px;color:var(--gc-sub);font:500 15px/1.4 ${OCTO_SERIF};letter-spacing:.12em}
.gc-grid{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:10px;perspective:1400px}
.gc-work{position:relative;display:flex;flex-direction:column;gap:5px;padding:0;border:0;background:none;text-align:left;color:inherit}
.gc-work-cover{position:relative;aspect-ratio:2/3;overflow:hidden;border:1px solid ${mix('--gc-acc', 33)};background:var(--gc-panel);box-shadow:0 6px 14px ${mix('--gc-shadow', 50)};transition:transform .2s,border-color .2s,box-shadow .2s}
.gc-work-cover img{width:100%;height:100%;object-fit:cover;display:block}
.gc-work:hover .gc-work-cover,.gc-work:focus-visible .gc-work-cover{transform:translateY(-3px);border-color:var(--gc-hi);box-shadow:0 10px 22px ${mix('--gc-shadow', 70)},0 0 0 1px ${mix('--gc-hi', 40)}}
.gc-work:focus-visible{outline:none}
.gc-work-media{position:absolute;left:4px;top:4px;padding:0 5px;background:#05070ddd;border:1px solid #d8b97866;color:#f3dfa8;font-size:10.5px;letter-spacing:.06em}
.gc-work-title{font:500 12.5px/1.35 ${OCTO_SERIF};color:var(--gc-ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.gc-work-meta{font-size:10.5px;color:var(--gc-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-ph{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:10% 10% 12%;background:linear-gradient(160deg,hsl(var(--h) 38% 24%),hsl(var(--h) 45% 10%));color:#f3e7c9}
.gc-ph:before{content:'';position:absolute;inset:5%;border:1px solid #f3dfa855}
.gc-ph:after{content:'';position:absolute;left:50%;top:8%;width:20%;aspect-ratio:1;transform:translateX(-50%);background:var(--gc-sigil,none) center/contain no-repeat;opacity:.6}
.gc-ph b{position:relative;font:600 clamp(11px,1.15vw,15px)/1.3 ${OCTO_SERIF};letter-spacing:.08em;word-break:break-all;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.gc-ph small{position:relative;font-size:10px;color:#d8c294;letter-spacing:.12em}
.gc-grid.is-dealing .gc-work{animation:gc-deal .55s cubic-bezier(.2,.8,.25,1) both;animation-delay:calc(var(--i) * 22ms)}
.gc-grid.is-dealing .gc-work-cover{animation:gc-flipin .6s ease-out both;animation-delay:calc(var(--i) * 22ms + 380ms)}
/* 作品详情 */
.gc-drawer{position:absolute;inset:0;z-index:5;display:flex;justify-content:flex-end;background:var(--gc-overlay)}
.gc-drawer-card{display:flex;flex-direction:column;width:min(520px,100%);height:100%;border-left:1px solid ${mix('--gc-acc', 55)};background:var(--gc-shell);box-shadow:-20px 0 50px ${mix('--gc-shadow', 70)};animation:gc-slide .25s ease-out both}
.gc-drawer-body{flex:1;min-height:0;overflow-y:auto;padding:20px 24px}
.gc-drawer-foot{display:flex;flex-wrap:wrap;gap:10px;padding:12px 24px 18px;border-top:1px solid ${mix('--gc-acc', 20)}}
.gc-detail-top{display:grid;grid-template-columns:132px 1fr;gap:16px;margin:0 0 14px}
.gc-detail-top .gc-work-cover{aspect-ratio:2/3}
.gc-detail-top h3{margin:0;font:600 21px/1.35 ${OCTO_SERIF};letter-spacing:.08em;color:var(--gc-ink2);word-break:break-all}
.gc-detail-top p{margin:4px 0 0;color:var(--gc-sub);font-size:12.5px;word-break:break-all}
.gc-tags{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 0}
.gc-tags span{padding:0 7px;border:1px solid ${mix('--gc-acc', 27)};color:var(--gc-sub);font-size:11.5px}
.gc-text{margin:0 0 10px;color:var(--gc-ink);white-space:pre-wrap}
.gc-link{color:var(--gc-hi);text-decoration:none;border-bottom:1px dashed ${mix('--gc-hi', 55)}}
.gc-link:hover,.gc-link:focus-visible{color:var(--gc-ink2);outline:none;border-bottom-style:solid}
/* 小池 */
.gc-pool-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:0 0 14px}
.gc-pool-work{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
.gc-pool-work .gc-work-cover{width:44px;flex:none}
.gc-pool-work b{display:block;font:600 17px/1.35 ${OCTO_SERIF};color:var(--gc-ink2);letter-spacing:.06em;word-break:break-all}
.gc-pool-work small{color:var(--gc-mute)}
.gc-compile{display:flex;flex-direction:column;align-items:center;gap:16px;padding:36px 0 20px;text-align:center}
.gc-compile h3{margin:0;font:600 18px/1.5 ${OCTO_SERIF};letter-spacing:.18em;color:var(--gc-ink2)}
.gc-compile .gc-sea{width:min(360px,80%);height:96px}
.gc-steps{margin:0;padding:0;min-width:min(320px,100%);list-style:none;text-align:left}
.gc-steps li{display:flex;align-items:center;gap:10px;padding:6px 0;color:var(--gc-mute)}
.gc-steps li.is-now{color:var(--gc-ink2)}.gc-steps li.is-done{color:var(--gc-ok)}
.gc-steps li:before{content:'';width:9px;height:9px;transform:rotate(45deg);border:1px solid currentColor;flex:none}
.gc-steps li.is-now:before{background:var(--gc-hi);animation:gc-pulse 1s ease-in-out infinite}
.gc-steps li.is-done:before{background:var(--gc-ok)}
.gc-tabs{display:flex;gap:0;margin:0 0 0;border-bottom:1px solid ${mix('--gc-acc', 27)}}
.gc-tab{min-width:120px;min-height:42px;padding:6px 22px;border:1px solid transparent;border-bottom:0;background:none;color:var(--gc-mute);font:600 16px/1.3 ${OCTO_SERIF};letter-spacing:.3em}
.gc-tab[aria-selected=true]{border-color:${mix('--gc-acc', 40)};background:var(--gc-on);color:var(--gc-on-ink)}
.gc-tabs{flex-wrap:wrap}
.gc-pity>.gc-btn.is-small{justify-self:start}
.gc-ritems li>div p{margin:3px 0 0;color:var(--gc-sub);font-size:11.5px;line-height:1.5}
@media(max-width:560px){.gc-tab{min-width:0;flex:1;padding:6px 10px}}
.gc-tab:focus-visible{outline:2px solid ${mix('--gc-acc', 70)};outline-offset:-2px}
.gc-banner{position:relative;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:18px;padding:20px 22px;border:1px solid ${mix('--gc-acc', 33)};border-top:0;overflow:hidden;background:var(--gc-banner)}
.gc-banner .gc-banner-bg{position:absolute;inset:-20px;z-index:0;background-size:cover;background-position:center;filter:blur(18px) saturate(1.2);opacity:.35}
.bs-gacha:not([data-theme=cafe]) .gc-banner .gc-banner-bg{opacity:.18}
.gc-banner>:not(.gc-banner-bg){position:relative;z-index:1}
.gc-feature{display:flex;gap:10px;flex-wrap:wrap}
.gc-feature .gc-mini{width:198px}
.gc-mini-emblem{position:relative;flex:none;width:34px;height:34px;margin-top:2px}
.gc-mini-emblem svg{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--c) 55%,transparent))}
.gc-mini-text{min-width:0;flex:1}
.gc-mini{position:relative;display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border:1px solid var(--c);background:var(--gc-raise);box-shadow:0 0 18px color-mix(in srgb,var(--c) 26%,transparent)}
.gc-mini b{display:block;font:600 14px/1.35 ${OCTO_SERIF};color:var(--gc-ink2)}
.gc-mini small{display:block;color:var(--c);letter-spacing:.1em;font-size:11.5px}
.gc-mini p{margin:4px 0 0;color:var(--gc-sub);font-size:11.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.gc-side{display:flex;flex-direction:column;gap:10px;justify-content:center}
.gc-pity{display:grid;gap:9px;padding:11px 13px 10px;border:1px solid ${mix('--gc-acc', 22)};background:var(--gc-box)}
.gc-pity-head{display:flex;align-items:baseline;gap:7px;color:var(--gc-sub);font-size:12.5px;letter-spacing:.06em}
.gc-pity-head b{font:600 22px/1 ${OCTO_SERIF};color:var(--s6);text-shadow:0 0 12px color-mix(in srgb,var(--s6) 40%,transparent)}
.gc-pity-row.is-small .gc-pity-head b{font-size:18px;color:var(--s5);text-shadow:0 0 10px color-mix(in srgb,var(--s5) 35%,transparent)}
.gc-pity-head em{font-style:normal;padding:0 6px;border:1px solid ${mix('--gc-acc', 40)};color:var(--gc-ink2);font:600 11.5px/1.6 ${OCTO_SERIF};letter-spacing:.14em}
.gc-pity-bar{position:relative;height:6px;margin:7px 0 0;background:var(--gc-track);box-shadow:inset 0 0 0 1px ${mix('--gc-ink', 6)}}
.gc-pity-bar i{position:absolute;left:0;top:0;bottom:0;min-width:2px;background:linear-gradient(90deg,var(--s3),var(--s4) 55%,var(--s6));box-shadow:0 0 10px color-mix(in srgb,var(--s6) 40%,transparent)}
.gc-pity-row.is-small .gc-pity-bar i{background:linear-gradient(90deg,var(--s3),var(--s5))}
.gc-pity-bar em{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--s5);box-shadow:0 0 6px var(--s5)}
.gc-pity small{color:var(--gc-mute);font-size:11.5px}
.gc-rates{margin:0;padding:10px 12px;border:1px solid ${mix('--gc-ink', 10)};background:var(--gc-box);color:var(--gc-sub);font-size:12px}
.gc-rates p{margin:0 0 4px}
.gc-draws{display:flex;flex-wrap:wrap;gap:10px}
.gc-draws .gc-btn{flex:1;min-width:150px;min-height:52px;flex-direction:column;gap:0;line-height:1.25}
.gc-list{margin:16px 0 0}
.gc-list summary{cursor:pointer;color:var(--gc-ink2);font:500 15px/1.6 ${OCTO_SERIF};letter-spacing:.12em}
.gc-list summary:focus-visible{outline:2px solid ${mix('--gc-acc', 70)};outline-offset:2px}
.gc-list-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin:10px 0 0}
.gc-list-grid .gc-mini{padding:8px 10px}
/* 回收 */
.gc-recycle-note{margin:0 0 12px}
.gc-rgroup{margin:0 0 14px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:var(--gc-box)}
.gc-rgroup-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid color-mix(in srgb,var(--c) 25%,transparent)}
.gc-rgroup-head>b{font:600 15px/1.3 ${OCTO_SERIF};color:var(--c);letter-spacing:.14em}
.gc-rgroup-head>span{flex:1;min-width:120px;color:var(--gc-sub);font-size:12.5px}
.gc-ritems{margin:0;padding:4px 12px 8px;list-style:none}
.gc-ritems li{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed ${mix('--gc-ink', 10)}}
.gc-ritems li:last-child{border-bottom:0}
.gc-ritems li>div{flex:1;min-width:150px}
.gc-ritems li>div b{font:500 14px/1.4 ${OCTO_SERIF};color:var(--gc-ink2)}
.gc-ritems li>div small{display:block;color:var(--gc-mute);font-size:11.5px}
.gc-ritems li>em{font-style:normal;color:var(--gc-sub);font-size:12.5px;white-space:nowrap}
/* 抽卡舞台：书海中的一本书蓄光、翻开，光柱里飞出卡牌，逐张翻开。只动 transform / opacity / filter。 */
.gc-stage{position:absolute;inset:0;z-index:8;container-type:size;overflow:hidden;background:var(--gc-stage-bg);color:#eee6d2;--glow:#e9d6a4;--glow2:#fffbea;animation:gc-fade .25s ease-out both;-webkit-user-select:none;user-select:none}
.gc-stage-art{position:absolute;inset:-6%;background:var(--gc-stage,none) 64% 36%/cover no-repeat;opacity:.2;filter:blur(2px) saturate(.85) brightness(.75);animation:gc-drift-bg 26s ease-in-out infinite alternate;pointer-events:none}
.gc-stage-sky{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 58% 52% at 50% 52%,color-mix(in srgb,var(--glow) 15%,transparent),transparent 72%),radial-gradient(ellipse at 50% 50%,transparent 28%,color-mix(in srgb,var(--gc-stage-vig) 82%,transparent) 76%,var(--gc-stage-vig))}
.gc-stage-sky:after{content:'';position:absolute;inset:0;background-image:radial-gradient(1.2px 1.2px at 8% 18%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 22% 72%,#fff 60%,transparent 62%),radial-gradient(1.4px 1.4px at 35% 12%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 62% 86%,#fff 60%,transparent 62%),radial-gradient(1.3px 1.3px at 78% 22%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 91% 64%,#fff 60%,transparent 62%),radial-gradient(1.1px 1.1px at 46% 28%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 13% 46%,#fff 60%,transparent 62%),radial-gradient(1.2px 1.2px at 86% 42%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 69% 9%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 30% 90%,#fff 60%,transparent 62%),radial-gradient(1.3px 1.3px at 56% 6%,#fff 60%,transparent 62%);animation:gc-twinkle 4.6s ease-in-out infinite alternate}
.gc-stage-ring{position:absolute;left:50%;top:50%;width:min(660px,118cqmin);aspect-ratio:1;transform:translate(-50%,-50%);opacity:.42;pointer-events:none;transition:opacity .5s;color:var(--gc-art)}
.gc-stage-ring svg{position:absolute;inset:0;width:100%;height:100%;animation:gc-spin 70s linear infinite}
.gc-stage.is-charge .gc-stage-ring{opacity:.9}
.gc-stage.is-charge .gc-stage-ring svg{animation-duration:8s}
.gc-stage.is-open .gc-stage-ring{opacity:.3}
.gc-art{display:block;overflow:visible}
.gc-art-accent{stroke:var(--c,var(--glow))}
.gc-art-fill{fill:var(--gc-art)}
.gc-art-fill-soft{fill:color-mix(in srgb,var(--gc-art) 15%,transparent)}
.gc-art-glint{fill:color-mix(in srgb,var(--c,var(--glow)) 24%,transparent)}
.gc-art-gem{stroke:var(--c);fill:color-mix(in srgb,var(--c) 30%,transparent)}
/* 书 */
.gc-tome{position:absolute;left:50%;top:50%;z-index:3;width:150px;height:196px;margin:-98px 0 0 -75px;perspective:1000px;transform-style:preserve-3d;animation:gc-tome-in .55s cubic-bezier(.2,.9,.3,1.25) both}
.gc-tome-block{position:absolute;inset:5px 3px 5px 9px;border-radius:2px 6px 6px 2px;background:linear-gradient(90deg,#d6c9a8,#fbf4e1 10%,#efe3c6 92%,#d0c2a2);box-shadow:inset -2px 0 0 #cbbd9b,inset -4px 0 0 #f3ead3,inset -6px 0 0 #cdbf9e,0 16px 32px #000c}
.gc-tome-light{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px;border-radius:50%;background:radial-gradient(circle,var(--glow2) 0,var(--glow) 34%,transparent 70%);opacity:0;transform:scale(.4);transition:opacity .5s,transform .7s;mix-blend-mode:screen}
.gc-tome-page{position:absolute;inset:6px 4px 6px 10px;border-radius:2px 6px 6px 2px;transform-origin:0 50%;background:linear-gradient(90deg,#ece1c6,#fffaee 40%,#f3e8d0);box-shadow:inset 0 0 12px #c9b88f66;opacity:0}
.gc-tome-cover{position:absolute;inset:0;z-index:2;transform-origin:0 50%;transform-style:preserve-3d;transition:transform .75s cubic-bezier(.3,.9,.25,1)}
.gc-tome-face,.gc-tome-inside{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.gc-tome-face{border-radius:4px 9px 9px 4px;background:linear-gradient(100deg,#2f1c0e,#6a4420 38%,#4b2e16 68%,#2a190c);box-shadow:inset 0 0 0 2px #1a0f07,inset 6px 0 10px #0009,inset 0 0 22px #0008,0 14px 30px #000c;transition:box-shadow .4s}
.bs-gacha[data-theme=summer] .gc-tome-face{background:linear-gradient(100deg,#0e3a52,#1f6f93 38%,#155675 68%,#0b3246)}
.bs-gacha[data-theme=ink] .gc-tome-face{background:linear-gradient(100deg,#1c2c25,#3e5c4d 38%,#2c463a 68%,#16241e)}
.gc-tome-face svg{position:absolute;inset:0;width:100%;height:100%}
.gc-tome-inside{transform:rotateY(180deg);border-radius:9px 4px 4px 9px;background:linear-gradient(100deg,#2a190c,#4b2e16);box-shadow:inset 0 0 0 2px #1a0f07}
.gc-tome-inside:before{content:'';position:absolute;inset:5px 9px 5px 4px;border-radius:5px 2px 2px 5px;background:repeating-linear-gradient(180deg,transparent 0 13px,#b9a98433 13px 14px) 18px 26px/calc(100% - 36px) calc(100% - 52px) no-repeat,linear-gradient(270deg,#d6c9a8,#fbf4e1 10%,#efe3c6 92%);box-shadow:inset 0 0 14px #c9b88f66}
.gc-tome-face:after{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,transparent 30%,#fff2 48%,transparent 62%) 0 0/250% 100%;animation:gc-shine 3.2s ease-in-out infinite;pointer-events:none}
.gc-stage.is-charge .gc-tome{animation:gc-shake .09s linear infinite}
.gc-stage.is-charge .gc-tome-face{box-shadow:inset 0 0 0 2px #1a0f07,inset 6px 0 10px #0009,0 0 26px color-mix(in srgb,var(--glow) 75%,transparent),0 14px 30px #000c}
.gc-stage.is-charge .gc-tome-light{opacity:.65;transform:scale(1.5)}
.gc-stage.is-open .gc-tome{animation:none}
.gc-stage.is-open .gc-tome-cover{transform:rotateY(-170deg)}
.gc-stage.is-open .gc-tome-light{opacity:1;transform:scale(3.4)}
.gc-stage.is-open .gc-tome-page{animation:gc-page .6s cubic-bezier(.45,.1,.3,1) both}
.gc-stage.is-open .gc-tome-page.p2{animation-delay:.12s}
.gc-stage.is-open .gc-tome-page.p3{animation-delay:.24s}
.gc-stage.is-cards .gc-tome{animation:gc-tome-out .5s ease-in both}
.gc-stage.is-done .gc-tome,.gc-stage.is-done .gc-beam,.gc-stage.is-done .gc-shock{visibility:hidden}
/* 光 */
.gc-beam{position:absolute;left:50%;bottom:50%;z-index:2;width:150px;height:64%;margin-left:-75px;transform-origin:50% 100%;background:linear-gradient(0deg,var(--glow2),color-mix(in srgb,var(--glow) 80%,transparent) 28%,transparent);filter:blur(10px);opacity:0;mix-blend-mode:screen;pointer-events:none}
.gc-stage.is-open .gc-beam{animation:gc-beam 1.3s ease-out both}
.gc-shock{position:absolute;left:50%;top:50%;z-index:4;width:180px;height:180px;margin:-90px;border-radius:50%;border:2px solid var(--glow);box-shadow:0 0 28px var(--glow),inset 0 0 28px var(--glow);opacity:0;pointer-events:none}
.gc-stage.is-open .gc-shock{animation:gc-shock .9s ease-out both}
.gc-stage.is-mythic.is-open .gc-beam{animation:gc-beam 1.6s ease-out both,gc-hue-blur 1.2s linear infinite}
.gc-stage.is-mythic.is-open .gc-shock{animation:gc-shock 1.1s ease-out both,gc-hue 1.2s linear infinite}
.gc-flash{position:absolute;inset:0;z-index:9;background:radial-gradient(circle at 50% 50%,var(--glow2),color-mix(in srgb,var(--glow) 60%,transparent) 42%,transparent 78%);opacity:0;pointer-events:none}
.gc-flash.is-on{animation:gc-flash .75s ease-out both}
.gc-stage.is-quake .gc-slots{animation:gc-quake .5s linear both}
.gc-sparks{position:absolute;inset:0;z-index:6;pointer-events:none;overflow:hidden}
.gc-spark{position:absolute;left:var(--x);top:var(--y);width:var(--s);height:var(--s);margin:calc(var(--s) / -2) 0 0 calc(var(--s) / -2);border-radius:50%;background:radial-gradient(circle,#fff 0,var(--sc) 45%,transparent 72%);opacity:0;animation:gc-spark var(--t) cubic-bezier(.12,.7,.3,1) var(--dl) both}
.gc-spark.is-in{animation-name:gc-spark-in;animation-timing-function:cubic-bezier(.55,0,.85,.45)}
.gc-spark.is-star{border-radius:0;background:var(--sc);clip-path:polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%);filter:drop-shadow(0 0 3px var(--sc))}
.gc-splash{position:absolute;left:0;right:0;top:50%;z-index:8;transform:translateY(-50%);text-align:center;pointer-events:none;opacity:0;font:700 clamp(44px,11cqmin,96px)/1 ${OCTO_SERIF};letter-spacing:.42em;text-indent:.42em;color:#fff6dc;text-shadow:0 0 16px var(--glow),0 0 44px var(--glow),0 2px 2px #000}
.gc-splash small{display:block;margin-top:14px;font:500 clamp(13px,2.4cqmin,18px)/1.4 ${OCTO_SERIF};letter-spacing:.36em;text-indent:.36em;color:#f6e7c2;text-shadow:0 2px 6px #000}
.gc-splash.is-on{animation:gc-splash 1.6s ease-out both}
.gc-stage.is-mythic .gc-splash.is-on{animation:gc-splash 1.6s ease-out both,gc-hue 2.4s linear infinite}
/* 卡牌 */
.gc-slots{position:absolute;inset:64px 20px 108px;z-index:5;display:grid;place-content:center;grid-template-columns:repeat(5,minmax(0,150px));grid-template-columns:repeat(5,minmax(0,clamp(84px,calc((100cqh - 196px) * .34),150px)));gap:16px 18px;perspective:1400px;pointer-events:none}
.gc-slots.is-single{grid-template-columns:minmax(0,210px);grid-template-columns:minmax(0,clamp(120px,calc((100cqh - 180px) * .68),210px))}
.gc-stage.is-cards .gc-slots{pointer-events:auto}
.gc-card{position:relative;width:100%;aspect-ratio:3/4.4;border:0;padding:0;background:none;border-radius:10px;opacity:0;-webkit-tap-highlight-color:transparent}
.gc-stage.is-cards .gc-card{opacity:1;animation:gc-fly .74s cubic-bezier(.2,.85,.25,1) both;animation-delay:calc(var(--i) * 75ms)}
.gc-card.is-open{animation:gc-pop .5s ease-out both!important}
.gc-card.is-held{animation:gc-shake .08s linear infinite!important;z-index:2}
.gc-card.is-held .gc-cardback{box-shadow:0 0 40px var(--c),0 0 90px color-mix(in srgb,var(--c) 60%,transparent)}
.gc-card.is-held .gc-card-inner{transform:scale(1.06)}
.gc-card:focus-visible{outline:none}
.gc-card:focus-visible .gc-face{outline:2px solid #f3dfa8;outline-offset:3px}
.gc-card-inner{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .62s cubic-bezier(.3,.9,.3,1)}
.gc-card.is-open .gc-card-inner{transform:rotateY(180deg)}
.gc-card:not(.is-open):hover .gc-card-inner{transform:translateY(-5px) rotateX(5deg)}
.gc-card-ring{position:absolute;inset:-7px;border-radius:15px;border:2px solid var(--c);box-shadow:0 0 18px var(--c);opacity:0;pointer-events:none}
.gc-card.is-open.s4 .gc-card-ring,.gc-card.is-open.s5 .gc-card-ring,.gc-card.is-open.s6 .gc-card-ring,.gc-card.is-open.s7 .gc-card-ring{animation:gc-ring .85s ease-out both}
.gc-face{position:absolute;inset:0;border-radius:10px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;border:1px solid color-mix(in srgb,var(--c) 60%,var(--gc-art))}
.gc-cardback{background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--c) 26%,transparent),transparent 36%),var(--gc-card-back);box-shadow:0 0 16px color-mix(in srgb,var(--c) 42%,transparent),inset 0 0 0 1px #00000080;transition:box-shadow .2s}
.gc-cardback svg{position:absolute;inset:0;width:100%;height:100%}
.gc-cardback:after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,#ffffff1f 50%,transparent 65%) 0 0/300% 100%;animation:gc-shine 3.6s ease-in-out infinite;animation-delay:calc(var(--i,0) * 120ms);pointer-events:none}
.gc-card:not(.is-open):hover .gc-cardback,.gc-card:not(.is-open):focus-visible .gc-cardback{box-shadow:0 0 30px var(--c),inset 0 0 0 1px #0008}
.gc-stage.is-cards .gc-card.s5:not(.is-open) .gc-cardback,.gc-stage.is-cards .gc-card.s6:not(.is-open) .gc-cardback,.gc-stage.is-cards .gc-card.s7:not(.is-open) .gc-cardback{animation:gc-tease 1.5s ease-in-out infinite}
.gc-front{transform:rotateY(180deg);display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 10px 8px;text-align:center;background:radial-gradient(ellipse at 50% 24%,color-mix(in srgb,var(--c) 36%,transparent),transparent 62%),var(--gc-card-front);box-shadow:0 0 22px color-mix(in srgb,var(--c) 55%,transparent),inset 0 0 0 3px #05070dcc}
.gc-front:before{content:'';position:absolute;inset:5px;border:1px solid color-mix(in srgb,var(--c) 42%,transparent);border-radius:7px;pointer-events:none}
.gc-front-top{position:relative;display:flex;justify-content:space-between;align-items:center;width:100%;padding:0 2px}
.gc-front .gc-stars{color:var(--c);font-size:12px;letter-spacing:-1px;text-shadow:0 0 6px var(--c)}
.gc-front .gc-quality{padding:0 6px;border:1px solid var(--c);background:#05070d99;color:var(--c);font:600 10.5px/1.6 ${OCTO_SERIF};letter-spacing:.14em}
.gc-emblem{position:relative;width:38%;aspect-ratio:1;margin:3px 0 1px}
.gc-emblem svg{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--c) 65%,transparent))}
.gc-front .gc-kind{color:color-mix(in srgb,var(--c) 72%,#fff);font-size:10.5px;letter-spacing:.12em;opacity:.92}
.gc-front b{font:600 15px/1.3 ${OCTO_SERIF};color:#fff3d6;letter-spacing:.04em;word-break:break-all;text-shadow:0 1px 2px #000}
.gc-front p{margin:2px 0 0;color:#cdc3ad;font-size:11px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.gc-front small{margin-top:auto;max-width:100%;color:#968d7c;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-card.s5 .gc-front:after,.gc-card.s6 .gc-front:after,.gc-card.s7 .gc-front:after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,#ffffff55 50%,transparent 65%) 0 0/300% 100%;animation:gc-shine 2.4s ease-in-out infinite;pointer-events:none}
.gc-foil{position:absolute;inset:0;border-radius:10px;padding:2px;background:conic-gradient(from 210deg,#ff6d6a,#f2c35d,#7fc58b,#69a8ea,#b88cec,#ff6d6a);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);animation:gc-hue 3s linear infinite;pointer-events:none}
.gc-card.s6.is-open .gc-front .gc-stars,.gc-card.s6.is-open .gc-front .gc-quality,.gc-card.s7.is-open .gc-front .gc-quality{animation:gc-hue 3s linear infinite}
.s1{--c:var(--s1)}.s2{--c:var(--s2)}.s3{--c:var(--s3)}.s4{--c:var(--s4)}.s5{--c:var(--s5)}.s6{--c:var(--s6)}.s7{--c:var(--s7)}
.gc-mini.is-taken{opacity:.5;filter:saturate(.4)}
/* 舞台上的字与按钮：舞台总是夜色，按钮也用夜色的样子。 */
.gc-stage .gc-btn{--gc-btn:#14131ad9;--gc-btn-ink:#eee9e0;--gc-btn-line:#ded8caaa;--gc-btn-inset:#17161d;--gc-btn-hover:#39333bea;--gc-btn-hover-ink:#fff8e3;--gc-hi:#fff0cd;--gc-acc:#cdbf9b}
.gc-stage .gc-btn.is-primary{--gc-pri:linear-gradient(180deg,#f4e0a8,#d8b56c 55%,#b38a45);--gc-pri-hover:linear-gradient(180deg,#fff0c4,#e6c37a 55%,#c29652);--gc-pri-ink:#1d1508;--gc-pri-line:#f6e2ae}
.gc-stage-hint{position:absolute;left:0;right:0;top:20px;z-index:7;margin:0;text-align:center;color:#ecdcb2;font:500 15px/1.4 ${OCTO_SERIF};letter-spacing:.26em;text-indent:.26em;text-shadow:0 2px 6px #000}
.gc-stage-bar{position:absolute;left:0;right:0;bottom:22px;z-index:7;display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding:0 12px}
.gc-stage-skip{position:absolute;right:16px;top:14px;z-index:7}
.gc-stage-sum{position:absolute;left:0;right:0;bottom:74px;z-index:7;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:0 12px;pointer-events:none}
.gc-stage-chibi{position:absolute;left:clamp(8px,2.6cqw,30px);bottom:10px;z-index:6;display:none;width:clamp(100px,22cqh,168px);aspect-ratio:1;background:var(--gc-chibi,none) 50% 100%/contain no-repeat;filter:drop-shadow(0 6px 10px #000b);pointer-events:none;transform-origin:50% 100%;animation:gc-chibi-in .55s cubic-bezier(.2,.9,.3,1.25) both}
.gc-stage-chibi.is-cheer{background-image:var(--gc-chibi-cheer,var(--gc-chibi,none));animation:gc-chibi-in .55s cubic-bezier(.2,.9,.3,1.25) both,gc-chibi-hop .9s .55s ease-in-out 2}
@container (min-width:960px) and (min-height:520px){.gc-stage-chibi{display:block}}
.gc-stage-sum span{padding:1px 10px;border:1px solid var(--c);background:#05070dd9;color:var(--c);font-size:12px;letter-spacing:.06em;animation:gc-fade .45s ease-out both}
.gc-stage-warn{position:absolute;left:50%;bottom:108px;z-index:7;transform:translateX(-50%);max-width:90%;padding:6px 14px;border:1px solid #e9a49a88;background:#2a1010e6;color:#f3c7bf;font-size:12.5px}
/* 记录、设置与回收 */
.gc-sheet{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;background:var(--gc-shell)}
.gc-sheet-head{display:flex;align-items:center;gap:12px;padding:14px 30px;border-bottom:1px solid ${mix('--gc-acc', 20)}}
.gc-sheet-head h3{flex:1;margin:0;font:600 18px/1.4 ${OCTO_SERIF};letter-spacing:.2em;color:var(--gc-ink2)}
.gc-history{margin:0;padding:0;list-style:none}
.gc-history li{padding:10px 0;border-bottom:1px dashed ${mix('--gc-ink', 10)}}
.gc-history li>div{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.gc-history time{color:var(--gc-mute);font-size:12px}
.gc-history b{font:500 14px/1.4 ${OCTO_SERIF};color:var(--gc-ink2)}
.gc-history span{color:var(--gc-sub)}
.gc-history .gc-res{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 0}
.gc-history .gc-res span{padding:0 7px;border:1px solid var(--c);color:var(--c);font-size:12px}
.gc-form section{margin:0 0 16px;padding:14px 16px;border:1px solid ${mix('--gc-ink', 12)};background:var(--gc-box)}
.gc-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:8px 0}
.gc-row label{color:var(--gc-sub);font-size:13px;letter-spacing:.06em}
.gc-form input[type=number],.gc-form input[type=text],.gc-form input[type=password],.gc-form input[type=url],.gc-form select{min-height:34px;padding:4px 10px;border:1px solid var(--gc-field-line);border-radius:0;background:var(--gc-field);color:var(--gc-field-ink)}
.gc-form input[type=number]{width:120px}
.gc-form input[type=text],.gc-form input[type=password],.gc-form input[type=url]{flex:1;min-width:160px}
.gc-form input:focus-visible,.gc-form select:focus-visible{outline:2px solid ${mix('--gc-acc', 70)};outline-offset:1px}
.gc-check{display:flex;align-items:flex-start;gap:10px;margin:8px 0;cursor:pointer}
.gc-check input{margin-top:4px;accent-color:var(--gc-acc)}
.gc-check span{color:var(--gc-ink)}
.gc-check small{display:block;color:var(--gc-mute);font-size:12px}
.gc-toast{position:absolute;left:50%;bottom:18px;z-index:9;pointer-events:none;transform:translateX(-50%);max-width:min(640px,92%);padding:8px 16px;border:1px solid ${mix('--gc-acc', 55)};background:var(--gc-shell);color:var(--gc-ink);font-size:13px;box-shadow:0 10px 30px ${mix('--gc-shadow', 70)}}
.gc-toast.is-bad{border-color:var(--gc-bad);color:var(--gc-bad)}
@keyframes gc-spin{to{transform:rotate(360deg)}}
@keyframes gc-wave{to{transform:translateX(25%)}}
@keyframes gc-bob{50%{transform:translateY(9px) rotate(4deg)}}
@keyframes gc-pulse{50%{opacity:.35}}
@keyframes gc-deal{from{opacity:0;transform:translate(var(--dx,0),var(--dy,240px)) rotate(var(--rot,-10deg)) scale(.5)}to{opacity:1;transform:none}}
@keyframes gc-flipin{from{transform:rotateY(90deg);filter:brightness(.3)}to{transform:none;filter:none}}
@keyframes gc-slide{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes gc-shake{0%{transform:translate(0,0)}25%{transform:translate(-2px,1px) rotate(-1deg)}50%{transform:translate(2px,-1px)}75%{transform:translate(-1px,-2px) rotate(1deg)}100%{transform:translate(1px,1px)}}
@keyframes gc-fly{0%{opacity:0;transform:translate(var(--fx,0px),var(--fy,0px)) scale(.16) rotate(-28deg)}38%{opacity:1;transform:translate(calc(var(--fx,0px) * .5),calc(var(--fy,0px) * .5 - 90px)) scale(.62) rotate(-8deg)}100%{opacity:1;transform:none}}
@keyframes gc-fade{from{opacity:0}to{opacity:1}}
@keyframes gc-fig-in{from{opacity:0;translate:0 14px}to{opacity:1;translate:0 0}}
@keyframes gc-chibi-in{from{opacity:0;transform:translateY(26px) scale(.7)}to{opacity:1;transform:none}}
@keyframes gc-chibi-hop{0%,100%{transform:none}35%{transform:translateY(-12px) rotate(-3deg)}65%{transform:translateY(0) rotate(2deg)}}
@keyframes gc-drift-bg{from{transform:scale(1.04) translate(-1%,0)}to{transform:scale(1.1) translate(1.5%,-1%)}}
@keyframes gc-twinkle{from{opacity:.3}to{opacity:.85}}
@keyframes gc-tome-in{from{opacity:0;transform:translateY(40px) scale(.7) rotateX(18deg)}to{opacity:1;transform:none}}
@keyframes gc-tome-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(50px) scale(.6)}}
@keyframes gc-page{0%{opacity:1;transform:rotateY(0)}100%{opacity:1;transform:rotateY(-160deg)}}
@keyframes gc-beam{0%{opacity:0;transform:scaleY(.05) scaleX(.3)}25%{opacity:.95;transform:scaleY(1) scaleX(1)}100%{opacity:0;transform:scaleY(1.15) scaleX(1.8)}}
@keyframes gc-shock{0%{opacity:.95;transform:scale(.2)}100%{opacity:0;transform:scale(3.4)}}
@keyframes gc-flash{0%{opacity:0}12%{opacity:var(--fl,.8)}100%{opacity:0}}
@keyframes gc-pop{0%{transform:scale(1)}35%{transform:scale(1.09)}100%{transform:scale(1)}}
@keyframes gc-ring{0%{opacity:.95;transform:scale(.92)}100%{opacity:0;transform:scale(1.32)}}
@keyframes gc-tease{50%{box-shadow:0 0 34px var(--c),0 0 64px color-mix(in srgb,var(--c) 45%,transparent),inset 0 0 0 1px #0008}}
@keyframes gc-spark{0%{opacity:0;transform:rotate(var(--a)) translateX(0) scale(.5)}12%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateX(var(--d)) scale(.9)}}
@keyframes gc-spark-in{0%{opacity:0;transform:rotate(var(--a)) translateX(var(--d)) scale(1)}25%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateX(0) scale(.3)}}
@keyframes gc-hue-blur{from{filter:blur(10px) hue-rotate(0deg)}to{filter:blur(10px) hue-rotate(360deg)}}
@keyframes gc-quake{0%,100%{transform:none}20%{transform:translate(-3px,2px)}40%{transform:translate(3px,-2px)}60%{transform:translate(-2px,-1px)}80%{transform:translate(2px,1px)}}
@keyframes gc-splash{0%{opacity:0;transform:translateY(-50%) scale(1.5);filter:blur(6px)}18%{opacity:1;transform:translateY(-50%) scale(1);filter:none}75%{opacity:1;transform:translateY(-50%) scale(1)}100%{opacity:0;transform:translateY(-50%) scale(.97)}}
@keyframes gc-shine{0%{background-position:120% 0}60%,100%{background-position:-120% 0}}
@keyframes gc-hue{to{filter:hue-rotate(360deg)}}
@media(max-width:1000px){.gc-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(max-width:760px){.gc-hero{min-height:230px;justify-content:flex-end;padding:20px 18px;background:var(--gc-hero-mobile)}.gc-hero:before{content:'';position:absolute;inset:0;z-index:1;background:var(--gc-hero-fade);pointer-events:none}.gc-hero p{max-width:none}.gc-hero.has-fig>p{max-width:60%}.gc-hero.has-fig h3,.gc-hero.has-fig p{text-shadow:var(--gc-hero-halo)}.gc-hero:after{right:18px;left:18px;bottom:12px}.gc-hero-fig{right:-14%;top:-40px;height:200%}.gc-hero-ring{right:-80px;top:34%;width:250px}.gc-cast:before{width:78%;opacity:calc(var(--gc-cast-op) * .5)}.bs-gacha{padding:0}.gc-shell{height:100%;border:0}.gc-head{padding:12px 10px 10px 14px;gap:6px}.gc-title h2{font-size:18px;letter-spacing:.14em;white-space:nowrap}.gc-head .gc-chip.is-pity{display:none}.gc-head .gc-chip{min-height:30px;padding:2px 8px;gap:4px;font-size:11.5px}.gc-head .gc-chip b{font-size:13px}.gc-icon{width:32px;height:32px}.gc-icon svg{width:16px;height:16px}.gc-close{font-size:20px!important}.gc-view{padding:14px 14px 22px}.gc-dirs{grid-template-columns:1fr 1fr;gap:8px}.gc-dir{min-height:92px;padding:12px 14px}.gc-dir strong{font-size:20px}.gc-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gc-banner{grid-template-columns:1fr;padding:14px}.gc-feature .gc-mini{width:calc(50% - 5px)}.gc-slots{inset:54px 6px 132px;grid-template-columns:repeat(2,minmax(0,150px));gap:12px;overflow-x:hidden;overflow-y:auto;place-content:start center;padding:8px 8px 12px}.gc-slots.is-single{place-content:center;grid-template-columns:minmax(0,200px)}.gc-stage-sum{bottom:70px}.gc-stage-hint{top:16px;font-size:14px}.gc-detail-top{grid-template-columns:96px 1fr}.gc-sheet-head{padding:12px 14px}.gc-toast{top:10px;bottom:auto}}
@media(pointer:coarse){.gc-form input[type=text],.gc-form input[type=password],.gc-form input[type=url],.gc-form input[type=number]{font-size:16px}}
@media(prefers-reduced-motion:reduce){.bs-gacha *,.bs-gacha *:before,.bs-gacha *:after{animation:none!important;transition:none!important}.gc-sparks,.gc-stage-art{display:none}.gc-card{opacity:1}}
`;
