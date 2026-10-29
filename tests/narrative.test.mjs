import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderHost, makeStatData } from './helpers/reader-host.mjs';

const CONTEXT = '7:reader-test-chat', RUN = 'run-a';
const META = { version: 2, kind: 'narrative', contextId: CONTEXT, runId: RUN, depth: 7 };
const automaticText = '我先抬手示意同伴停下，问眼前的人：你究竟想要什么？';

function fixture({ summary = '断点唯一标记：正在施法，尚未完成。', automatic = true, text = automaticText } = {}) {
  const host = createReaderHost({
    local: {
      dream_persona: 'reader',
      booksea: {
        activeExpedition: { hostContext: CONTEXT, mode: 'battle', run: { id: RUN }, narrative: { active: true } },
        narrativeMode: { version: 1, active: true, contextId: CONTEXT, runId: RUN, depth: 7, startDepth: 3,
          floor: { themeName: '测试书街', subtitle: '仍在同一页', scene: '高塔前庭', level: 11, quality: '史诗',
            monsters: [{ name: '测试守卫', role: '精英', level: 11 }] }, party: ['主角', '同行者'],
          ...(automatic ? { transition: 'user-message', breakpoint: summary } : {}) },
      },
    },
    statData: makeStatData(),
  });
  host.chat[1].mes = text;
  const meta = { ...META, summary };
  host.chat[1].extra = { bookseaHandoff: meta };
  const render = options => host.render({ ...options, extra: {
    SillyTavern: { chat: host.chat, characterId: 7, getCurrentChatId: () => 'reader-test-chat' }, ...options?.extra,
  } });
  return { host, meta, summary, render };
}

for (const [phase, summary] of [
  ['battle', '战斗断点标记：主角HP37，敌人仍存活；炎枪已支付8MP，施法尚未完成。'],
  ['supplier', '补给员断点标记：正在询问价格，上一条回复尚未返回，没有成交。'],
]) {
  test(`任意用户原消息承接 ${phase} 现场并自动切正文，不要求触发词`, async () => {
    const state = fixture({ summary });
    state.host.local.booksea.activeExpedition.mode = phase;
    const before = structuredClone(state.host.local.booksea);
    const prompt = await state.render();
    assert.match(prompt, /这是<user>主动切回正文：请承接断点记录/);
    assert.ok(prompt.includes(summary));
    assert.equal(prompt.split(summary).length - 1, 1);
    assert.match(prompt, /从迷宫中的当前位置自然地继续书写，不要重复描写入场/);
    assert.doesNotMatch(prompt, /迷宫已自动暂停并切到正文模式|游戏的数值战局保持暂停/);
    assert.deepEqual(state.host.local.booksea, before, '提示词渲染不修改游戏存档');
    assert.equal(state.host.chat[1].mes, automaticText);
    assert.equal(state.host.requests.length, 0);
  });
}

test('手动固定词继续读取同一聊天和远征的断点', async () => {
  const state = fixture({ automatic: false, text: '普罗泰利西翁正文模式', summary: '手动断点唯一标记。' });
  const prompt = await state.render();
  assert.ok(prompt.includes(state.summary));
  assert.match(prompt, /主动切回正文/);
  assert.doesNotMatch(prompt, /迷宫已自动暂停并切到正文模式/);
});

test('手动固定词兼容仅有消息变量且没有 owner 的既有交接', async () => {
  const state = fixture({ automatic: false, text: '普罗泰利西翁正文模式', summary: '既有手动变量交接唯一标记。' });
  delete state.host.chat[1].extra;
  state.host.chat[1].variables = [{ stat_data: makeStatData(), bookseaPromptHandoff: state.meta }];
  assert.ok((await state.render()).includes(state.summary));
});

test('自动交接仅有消息变量时，owner 为当前原用户楼层才能注入', async () => {
  const state = fixture({ summary: '原用户楼层的有归属变量断点。' });
  delete state.host.chat[1].extra;
  state.host.chat[1].variables = [{ stat_data: makeStatData(), bookseaPromptHandoff: { ...state.meta, messageId: 1 } }];
  const prompt = await state.render();
  assert.ok(prompt.includes(state.summary));
  assert.match(prompt, /这是<user>主动切回正文：请承接断点记录/);
});

test('自动交接不把无 owner 的继承变量当作本条新现场', async () => {
  const state = fixture();
  delete state.host.chat[1].extra;
  state.host.chat[1].variables = [{ stat_data: makeStatData(), bookseaPromptHandoff: state.meta }];
  assert.ok(!(await state.render()).includes(state.summary));
});

for (const [field, value] of [['runId', 'other-run'], ['contextId', '7:other-chat']]) {
  test(`原消息的 ${field} 不匹配时不注入旧断点`, async () => {
    const state = fixture();
    state.meta[field] = value;
    assert.ok(!(await state.render()).includes(state.summary));
  });
}

test('进入下一层的交接同样拒绝其他聊天的断点', async () => {
  const state = fixture({ automatic: false, text: '前往下一层（普罗泰利西翁正文模式）', summary: '下一层旧聊天唯一断点。' });
  state.meta.kind = 'narrative-descend';
  state.meta.contextId = '7:other-chat';
  assert.ok(!(await state.render()).includes(state.summary));
});

test('手动入口的镜像与远征 context 不一致时不注入旧断点', async () => {
  const state = fixture({ automatic: false, text: '普罗泰利西翁正文模式' });
  state.host.local.booksea.narrativeMode.contextId = '7:other-chat';
  state.meta.contextId = '7:other-chat';
  assert.ok(!(await state.render()).includes(state.summary));
});

test('整份旧聊天交接数据也不能在当前聊天重新注入断点', async () => {
  const state = fixture();
  state.host.local.booksea.activeExpedition.hostContext = '7:other-chat';
  state.host.local.booksea.narrativeMode.contextId = '7:other-chat';
  state.meta.contextId = '7:other-chat';
  assert.ok(!(await state.render()).includes(state.summary));
});

for (const generateType of ['swipe', 'regenerate']) {
  test(`${generateType} 保留助手占位楼层时回溯原用户消息的交接`, async () => {
    const state = fixture({ summary: `${generateType} 原用户现场唯一标记。` });
    state.host.chat.push({ is_user: false, mes: '将要被重新生成的正文。', swipe_id: 0 });
    state.host.selectMessage(2);
    const prompt = await state.render({ generateType });
    assert.ok(prompt.includes(state.summary));
    assert.match(prompt, /这是<user>主动切回正文：请承接断点记录/);
  });
}

test('候选消息按所选 swipe 的交接读取，不沿用另一候选', async () => {
  const state = fixture();
  delete state.host.chat[1].extra;
  state.host.chat[1].swipe_info = [{ extra: { bookseaHandoff: state.meta } },
    { extra: { bookseaHandoff: { ...state.meta, runId: 'other-run', summary: '另一候选断点标记。' } } }];
  state.host.selectMessage(1, 0);
  assert.ok((await state.render()).includes(state.summary));
  state.host.selectMessage(1, 1);
  const next = await state.render();
  assert.ok(!next.includes(state.summary));
  assert.ok(!next.includes('另一候选断点标记。'));
});

test('所选候选的 extra 优先于原消息共用的旧 extra', async () => {
  const state = fixture({ summary: '原消息共用的旧断点标记。' });
  const selected = { ...state.meta, summary: '当前候选自己的现场标记。' };
  state.host.chat[1].swipe_info = [{}, { extra: { bookseaHandoff: selected } }];
  state.host.selectMessage(1, 1);
  const prompt = await state.render();
  assert.ok(prompt.includes(selected.summary));
  assert.ok(!prompt.includes(state.summary));
});

test('后续普通正文不因 MVU 继承消息变量而反复注入上一轮断点', async () => {
  const state = fixture({ summary: '只应出现在第一轮交接的唯一现场标记。' });
  state.host.chat[1].variables = [{ stat_data: makeStatData(), bookseaPromptHandoff: { ...state.meta, messageId: 1 } }];
  assert.ok((await state.render()).includes(state.summary));
  state.host.chat.push({ is_user: false, mes: '正文已经承接了当前现场。', swipe_id: 0 });
  state.host.chat.push({ is_user: true, mes: '继续刚才的对话。', swipe_id: 0 });
  state.host.selectMessage(3);
  const next = await state.render();
  assert.ok(!next.includes(state.summary), '继承来的 bookseaPromptHandoff 不是本条用户消息的新交接');
  assert.match(next, /\[普罗泰利西翁·正文模式\]/);
});

test('正文复用既有规则，仅为断点中已经在场的特殊存在保留例外', async () => {
  const state = fixture({ summary: '补给员与宝箱怪已在当前现场；待结算FP150，施法费用已经支付。' });
  const prompt = await state.render();
  assert.match(prompt, /正文模式下不会遇到「补给员」「宝箱怪」「\?」等特殊存在，不要写出它们；断点记录中已在场者除外/);
  assert.match(prompt, /战斗过程与战利品照常由正文处理/);
  assert.ok(prompt.includes(state.summary));
  assert.doesNotMatch(prompt, /游戏的数值战局保持暂停|正文期间实际发生的三资源与背包消耗照常更新宿主变量/);
  assert.match(prompt, /<booksea-game>迷宫模式<\/booksea-game>/);
});

const specialCases = [
  { key: 'supplier', mode: 'supplier', kind: 'supplier', heading: '【补给员】' },
  { key: 'mimic', mode: 'battle', kind: 'mimic', heading: '【书海·宝箱怪】' },
  { key: 'hunter', mode: 'battle', kind: 'enemy', hunter: true, heading: '【「?」】' },
];

function specialFixture(special) {
  const state = fixture({ summary: '当前遭遇现场，不使用描述文字识别对象。' });
  const active = state.host.local.booksea.activeExpedition;
  const thing = { id: 'current-special', kind: special.kind, used: false, name: '现场对象', ...(special.hunter ? { hunter: true } : {}) };
  Object.assign(active, { depth: 7, mode: special.mode, encounterId: thing.id,
    region: { depth: 7, things: [thing] },
    ...(special.mode === 'supplier' ? { supplierState: { thingId: thing.id } } : {}),
    narrative: { active: true, transition: 'user-message', startDepth: 7, depth: 7 },
  });
  return { ...state, active, thing };
}

for (const special of specialCases) {
  test(`自动正文按当前权威遭遇复用 ${special.key} 原资料，不依赖描述词`, async () => {
    const state = specialFixture(special);
    const prompt = await state.render();
    assert.ok(prompt.includes(special.heading));
    for (const other of specialCases.filter(item => item !== special)) assert.ok(!prompt.includes(other.heading));
  });

  test(`正文下行后不把原层 ${special.key} 资料带到新层`, async () => {
    const state = specialFixture(special);
    state.active.narrative.depth = 8;
    state.host.local.booksea.narrativeMode.depth = 8;
    assert.ok(!(await state.render()).includes(special.heading));
  });

  test(`仅在地图或描述里出现的 ${special.key} 不激活正文资料`, async () => {
    const state = specialFixture(special);
    state.active.mode = 'explore';
    state.meta.summary = '补给员、宝箱怪、「?」都只是旧记录中提及的名字。';
    assert.ok(!(await state.render()).includes(special.heading));
  });

  test(`手动正文保留 ${special.key} 既有资料屏蔽规则`, async () => {
    const state = specialFixture(special);
    delete state.active.narrative.transition;
    delete state.host.local.booksea.narrativeMode.transition;
    assert.ok(!(await state.render()).includes(special.heading));
  });
}

test('另一聊天的权威现场不能激活当前正文特殊存在资料', async () => {
  const state = specialFixture(specialCases[0]);
  state.active.hostContext = '7:other-chat';
  state.host.local.booksea.narrativeMode.contextId = '7:other-chat';
  assert.ok(!(await state.render()).includes('【补给员】'));
});
