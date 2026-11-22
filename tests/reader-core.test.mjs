import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderHost, makeRelation, makeStatData } from './helpers/reader-host.mjs';

const target = '边界测试同伴';
const hasAuthor = prompt => assert.match(prompt, /黑之作家/, 'the main prompt must contain the active Black Author persona');
const hasGirl = prompt => {
  assert.match(prompt, /哀怜的少女/, 'ordinary kuromaku must contain the compassionate girl');
  assert.doesNotMatch(prompt, /黑之作家|【无形恶意】|【诅咒尽头】/, 'inactive author rules must not leak into the main prompt');
};

test('the complete worldbook renders and leaves the following EJS entry reachable', async () => {
  const host = createReaderHost({ statData: makeStatData() });
  const prompt = await host.render({ suffix: '\n<%_ const neighboringEntry = "后续世界书仍正常渲染"; _%><%- neighboringEntry %>' });
  hasGirl(prompt);
  assert.match(prompt, /后续世界书仍正常渲染/);
  assert.doesNotMatch(prompt, /<%|%>/, 'raw EJS must not become model input');
});

test('ordinary kuromaku has a compassionate persona without explicit curse or malice', async () => {
  const host = createReaderHost({ statData: makeStatData() });
  const prompt = await host.render();
  hasGirl(prompt);
  assert.doesNotMatch(prompt, /无形恶意|诅咒尽头|暗藏悲剧|少女的暗笔/);
  assert.equal(host.requests.length, 0, 'ordinary turns should not need the hidden author resource');
});

for (const [label, relation, active] of [
  ['favor 70 and HP 1 qualify', makeRelation(), true],
  ['favor 69 does not qualify', makeRelation({ favor: 69 }), false],
  ['HP 0 does not qualify', makeRelation({ hp: 0 }), false],
  ['negative HP does not qualify', makeRelation({ hp: -1 }), false],
  ['HP below 1 does not qualify', makeRelation({ hp: 0.5 }), false],
  ['missing HP does not qualify', { 好感度: 70, 状态效果: {} }, false],
  ['null HP does not qualify', makeRelation({ hp: null }), false],
  ['blank HP does not qualify', makeRelation({ hp: '' }), false],
  ['invalid HP does not qualify', makeRelation({ hp: 'unknown' }), false],
  ['missing favor does not qualify', { 生命值: { 当前: 1 }, 状态效果: {} }, false],
  ['mental collapse does not qualify', makeRelation({ statuses: { 精神崩溃: { 层数: 1, 剩余时间: '永久' } } }), false],
  ['irreversible mental collapse does not qualify', makeRelation({ hp: 1435, statuses: { 不可逆精神崩溃: { 类型: '减益', 层数: 1, 剩余时间: '永久' } } }), false],
]) {
  test(`normal target condition: ${label}`, async () => {
    const prompt = await createReaderHost({ statData: makeStatData({ relations: { [target]: relation } }) }).render();
    if (active) {
      hasAuthor(prompt);
      assert.ok(prompt.includes(target), 'the qualifying target must reach the execution prompt');
    } else {
      hasGirl(prompt);
      assert.ok(!prompt.includes(target), 'ineligible characters must not enter an execution list');
    }
  });
}

test('九十九夜梦 herself is excluded using the relation key', async () => {
  const prompt = await createReaderHost({ statData: makeStatData({ relations: { 九十九夜梦: makeRelation({ favor: 100, hp: 100 }) } }) }).render();
  hasGirl(prompt);
});

test('another character whose full name contains 九十九夜梦 is not treated as her', async () => {
  const name = '九十九夜梦的同学';
  const prompt = await createReaderHost({ statData: makeStatData({ relations: { [name]: makeRelation() } }) }).render();
  hasAuthor(prompt);
  assert.ok(prompt.includes(name));
});

test('the execution prompt includes every current eligible target and omits ineligible ones', async () => {
  const relations = {
    合格同伴甲: makeRelation(),
    合格同伴乙: makeRelation({ favor: 100, hp: 400 }),
    未达标同伴: makeRelation({ favor: 69 }),
    已死亡同伴: makeRelation({ hp: 0 }),
    已崩溃同伴: makeRelation({ statuses: { 精神崩溃: { 层数: 1 } } }),
  };
  const prompt = await createReaderHost({ statData: makeStatData({ relations }) }).render();
  hasAuthor(prompt);
  for (const name of ['合格同伴甲', '合格同伴乙']) assert.ok(prompt.includes(name), name);
  for (const name of ['未达标同伴', '已死亡同伴', '已崩溃同伴']) assert.ok(!prompt.includes(name), name);
});

for (const [label, outcome] of [
  ['death', makeRelation({ hp: 0 })],
  ['mental collapse while HP is positive', makeRelation({ hp: 1435, statuses: { 不可逆精神崩溃: { 层数: 1 } } })],
]) {
  test(`the next turn returns to the girl after MVU records ${label}`, async () => {
    const host = createReaderHost({ statData: makeStatData({ relations: { [target]: makeRelation() } }) });
    hasAuthor(await host.render());
    host.setStatData(makeStatData({ relations: { [target]: outcome } }));
    const nextPrompt = await host.render();
    hasGirl(nextPrompt);
    assert.ok(!nextPrompt.includes(target));
  });
}

test('a revived or restored character is reconsidered from current MVU values', async () => {
  const host = createReaderHost({ statData: makeStatData({ relations: { [target]: makeRelation({ hp: 0 }) } }) });
  hasGirl(await host.render());
  host.setStatData(makeStatData({ relations: { [target]: makeRelation({ hp: 50 }) } }));
  const restoredPrompt = await host.render();
  hasAuthor(restoredPrompt);
  assert.ok(restoredPrompt.includes(target));
});

test('progress below 9 does not start the curse even after a kill', async () => {
  const host = createReaderHost({ statData: makeStatData({ progress: 8, killedOnce: true, relations: { [target]: makeRelation({ favor: 30 }) } }) });
  hasGirl(await host.render());
});

test('progress 9 without at least one prior kill does not start the curse', async () => {
  const host = createReaderHost({ statData: makeStatData({ progress: 9, killedOnce: false, relations: { [target]: makeRelation({ favor: 30 }) } }) });
  hasGirl(await host.render());
});

for (const progress of [9, 10]) {
  test(`curse progress ${progress} with prior kill permanently selects the third-form author even without targets`, async () => {
    const host = createReaderHost({ statData: makeStatData({ progress, killedOnce: true }) });
    const prompt1 = await host.render();
    hasAuthor(prompt1);
    assert.match(prompt1, /纸牌/, 'cursed persistent form uses the third persona');
    assert.match(prompt1, /你于我是唯一/);
    assert.doesNotMatch(prompt1, /纸牌与仪式匕首/, 'one-time CG does not trigger until user actively seeks her');
    assert.equal(host.cache.stat_data.主角.状态效果.祝福.效果.includes('+45%'), true);
    const prompt2 = await host.render();
    hasAuthor(prompt2);
  });
}

test('the curse lowers only the favor threshold to 30', async () => {
  const relations = {
    诅咒合格同伴: makeRelation({ favor: 30 }),
    诅咒未达标同伴: makeRelation({ favor: 29 }),
    诅咒死亡同伴: makeRelation({ favor: 30, hp: 0 }),
    诅咒崩溃同伴: makeRelation({ favor: 30, statuses: { 精神崩溃: { 层数: 1 } } }),
    九十九夜梦: makeRelation({ favor: 100, hp: 100 }),
  };
  const prompt = await createReaderHost({ statData: makeStatData({ progress: 9, killedOnce: true, relations }) }).render();
  hasAuthor(prompt);
  assert.ok(prompt.includes('诅咒合格同伴'));
  for (const name of ['诅咒未达标同伴', '诅咒死亡同伴', '诅咒崩溃同伴']) assert.ok(!prompt.includes(name), name);
});

test('after all curse targets finish, the author remains but the old target is omitted', async () => {
  const host = createReaderHost({ statData: makeStatData({ progress: 9, killedOnce: true, relations: { [target]: makeRelation({ favor: 30 }) } }) });
  assert.ok((await host.render()).includes(target));
  host.setStatData(makeStatData({ progress: 9, killedOnce: true, relations: { [target]: makeRelation({ favor: 30, hp: 0 }) } }));
  const prompt = await host.render();
  hasAuthor(prompt);
  assert.ok(!prompt.includes(target));
});

test('execution prompt specifies single +1 progress per kill turn and pre-initializes 黑幕已点杀', async () => {
  const host = createReaderHost({
    statData: makeStatData({
      relations: {
        同伴甲: makeRelation(),
        同伴乙: makeRelation({ favor: 90, hp: 10 }),
      },
    }),
  });
  const prompt = await host.render();
  hasAuthor(prompt);
  assert.match(prompt, /无论本轮名单中有 1 人还是多人.*仅执行一次进度推进/);
  assert.match(prompt, /\/事件\/黑幕已点杀/);
  assert.equal(host.cache.stat_data.事件.黑幕已点杀, false);
});

test('one-time CG triggers only when cursed and user actively seeks her or visits the cafe', async () => {
  const host = createReaderHost({
    userMessage: '我在城里逛了一圈，准备去铁匠铺。',
    statData: makeStatData({ progress: 9, killedOnce: true }),
  });
  const normalCursed = await host.render();
  hasAuthor(normalCursed);
  assert.doesNotMatch(normalCursed, /纸牌与仪式匕首/);

  host.setUserMessage('夜梦，出来见我，我要找你当面对质。');
  const foundByKeyword = await host.render();
  hasAuthor(foundByKeyword);
  assert.match(foundByKeyword, /纸牌与仪式匕首/);
  assert.match(foundByKeyword, /我已经笑够了，让我们散场吧/);
  assert.equal(host.cache.stat_data.事件.黑幕结局, '');

  const cafeHost = createReaderHost({
    userMessage: '推开门坐了下来。',
    statData: makeStatData({ progress: 9, killedOnce: true, location: '不明次元·某咖啡馆' }),
  });
  const foundByCafe = await cafeHost.render();
  assert.match(foundByCafe, /纸牌与仪式匕首/);
});

test('ending=killed permanently reverts to pure 哀怜的少女, removes 祝福, and injects revival unseal only on demand', async () => {
  const host = createReaderHost({
    userMessage: '继续前进吧。',
    statData: makeStatData({
      progress: 9,
      killedOnce: true,
      ending: 'killed',
      relations: { [target]: makeRelation({ favor: 100, hp: 50 }) },
      heroStatuses: {
        祝福: { 类型: '特殊', 效果: '造成的最终伤害+45%', 层数: 1, 剩余时间: '永久', 来源: '少女的祝福' },
        保留状态: { 类型: '增益', 层数: 1 },
      },
    }),
  });
  const prompt = await host.render();
  hasGirl(prompt);
  assert.doesNotMatch(prompt, /纸牌与仪式匕首|复活解禁|\/事件\/进度/);
  assert.ok(!prompt.includes(target));
  assert.equal(host.cache.stat_data.主角.状态效果.祝福, undefined, '祝福 must be removed on killed ending');
  assert.ok(host.cache.stat_data.主角.状态效果.保留状态, 'other hero statuses must be preserved');

  host.setUserMessage('我想想办法复活之前死去的同伴。');
  const revivalPrompt = await host.render();
  hasGirl(revivalPrompt);
  assert.match(revivalPrompt, /【复活解禁】/);
});

test('ending=confessed keeps third-stage confessed persona and 祝福 with zero malice/curse tokens, revival unseal only on demand', async () => {
  const host = createReaderHost({
    userMessage: '今天去旅馆休息一下。',
    statData: makeStatData({
      progress: 9,
      killedOnce: true,
      ending: 'confessed',
      relations: { [target]: makeRelation({ favor: 100, hp: 50 }) },
    }),
  });
  const prompt = await host.render();
  hasAuthor(prompt);
  assert.match(prompt, /卸下假面|守在唯一读者席上的共犯与挚爱/);
  assert.doesNotMatch(prompt, /【无形恶意】|【自然死亡】|【诅咒尽头】|【黑之作家：本轮执行】|纸牌与仪式匕首|复活解禁|\/事件\/进度/);
  assert.ok(!prompt.includes(target), 'confessed ending must never generate kill targets');
  assert.equal(host.cache.stat_data.主角.状态效果.祝福.效果.includes('+45%'), true, '祝福 must remain on confessed ending');

  host.setUserMessage('我们去把死去的同伴复活吧。');
  const revivalPrompt = await host.render();
  assert.match(revivalPrompt, /【复活解禁】/);
});

for (const persona of ['reader', 'shoujo', 'genki', 'weirdo']) {
  test(`main persona ${persona} does not run black-author rules, even with a kuromaku IF`, async () => {
    const host = createReaderHost({
      local: { dream_persona: persona, dream_sub_persona_map: { kuromaku: { enabled: true, appearance: 'default' } } },
      statData: makeStatData({ progress: 3, relations: { [target]: makeRelation() } }),
    });
    const prompt = await host.render();
    assert.doesNotMatch(prompt, /黑之作家|【无形恶意】|【诅咒尽头】/);
    assert.ok(!prompt.includes(target));
    assert.match(prompt, /哀怜的少女/, 'the harmless kuromaku IF still renders');
  });
}

test('switching away from kuromaku stops author injection and switching back recomputes it', async () => {
  const host = createReaderHost({ statData: makeStatData({ relations: { [target]: makeRelation() } }) });
  hasAuthor(await host.render());
  host.setLocal('dream_persona', 'reader');
  const otherPrompt = await host.render();
  assert.doesNotMatch(otherPrompt, /黑之作家/);
  assert.ok(!otherPrompt.includes(target));
  host.setLocal('dream_persona', 'kuromaku');
  hasAuthor(await host.render());
});

test('silent mode still supplies the author and this turn’s target to the main model', async () => {
  const host = createReaderHost({ local: { dream_silent_mode: 'on' }, statData: makeStatData({ relations: { [target]: makeRelation() } }) });
  const prompt = await host.render();
  hasAuthor(prompt);
  assert.ok(prompt.includes(target), 'silence must not suppress the execution task');
  assert.match(prompt, /静默/);
});

test('the selected swipe controls persona selection without a chat-wide active flag', async () => {
  const host = createReaderHost({ statData: makeStatData() });
  host.setStatData(makeStatData({ relations: { [target]: makeRelation() } }), { message: 2, swipe: 0 });
  host.setStatData(makeStatData({ relations: { [target]: makeRelation({ hp: 0 }) } }), { message: 2, swipe: 1 });
  host.selectMessage(2, 0);
  hasAuthor(await host.render());
  host.selectMessage(2, 1);
  hasGirl(await host.render());
  host.selectMessage(2, 0);
  hasAuthor(await host.render());
});

test('returning to a message before the curse restores that message’s normal selection', async () => {
  const host = createReaderHost({ statData: makeStatData({ progress: 8, killedOnce: true }) });
  host.setStatData(makeStatData({ progress: 9, killedOnce: true }), { message: 2 });
  host.selectMessage(2);
  hasAuthor(await host.render());
  host.selectMessage(0);
  hasGirl(await host.render());
});

test('missing or invalid cached text stays inside this entry and never leaks EJS source', async () => {
  for (const cached of [undefined, 'not-json', '{}']) {
    const host = createReaderHost({ local: { dream_black_author_prompt: cached }, statData: makeStatData({ relations: { [target]: makeRelation() } }) });
    const prompt = await host.render({ suffix: '\n<%- "相邻条目继续正常输出" %>' });
    assert.match(prompt, /读者资料未就绪/);
    assert.match(prompt, /相邻条目继续正常输出/);
    assert.doesNotMatch(prompt, /<%|%>/);
    assert.ok(!prompt.includes(target));
    assert.equal(host.requests.length, 0);
  }
});

test('preview and repeated preparation never consume targets or change the cached raw text', async () => {
  const host = createReaderHost({ statData: makeStatData({ relations: { [target]: makeRelation() } }) });
  const cached = host.local.dream_black_author_prompt;
  hasAuthor(await host.render({ dryRun: true }));
  assert.equal(host.writes.length, 0);
  hasAuthor(await host.render());
  hasAuthor(await host.render());
  assert.equal(host.local.dream_black_author_prompt, cached);
  assert.equal(host.requests.length, 0);
});

for (const [theme, place] of [['cafe', '咖啡馆'], ['summer', '海滨咖啡馆'], ['ink', '茶楼']]) {
  test(`the cached author uses the current ${theme} theme and address without storing filled text`, async () => {
    const host = createReaderHost({ local: { dream_visual_theme: theme, dream_user_address: '观星者' }, statData: makeStatData({ relations: { [target]: makeRelation() } }) });
    const cached = host.local.dream_black_author_prompt;
    const prompt = await host.render();
    hasAuthor(prompt);
    assert.ok(prompt.includes(place));
    assert.ok(prompt.includes('观星者'));
    assert.doesNotMatch(prompt, /__READER_PLACE__|(?:^|\n)哀怜的少女:/);
    assert.equal(host.local.dream_black_author_prompt, cached);
  });
}

test('the idle curse keeps the persona without a fabricated execution or public target plan', async () => {
  const prompt = await createReaderHost({ statData: makeStatData({ progress: 9, killedOnce: true }) }).render();
  hasAuthor(prompt);
  assert.doesNotMatch(prompt, /【黑之作家：本轮执行】|【黑之作家：本轮公开创作记录】/);
});

test('multi-core secondary mode prevents global macro writes while preserving local tags, silent mode and custom wake words', async () => {
  const host = createReaderHost({
    local: {
      dream_persona: 'reader',
      系统名: '莉莉丝系统',
      系统核心: '莉莉丝',
      dream_core_manager: JSON.stringify({
        enabled: true,
        primary: '莉莉丝',
        activeCores: ['莉莉丝', '九十九夜梦'],
        cores: {
          九十九夜梦: { silent: true, wakeKeywords: ['暗号唤醒'] },
        },
      }),
    },
    userMessage: '今天继续冒险，不提暗号。',
    statData: makeStatData(),
  });
  const silentPrompt = await host.render();
  assert.equal(host.local.系统名, '莉莉丝系统', 'secondary Reader must not overwrite primary 系统名');
  assert.equal(host.local.系统核心, '莉莉丝', 'secondary Reader must not overwrite primary 系统核心');
  assert.match(silentPrompt, /<读者>/, 'secondary Reader uses its own local tag rather than primary core name');
  assert.match(silentPrompt, /静默/, 'per-core silent flag takes effect');

  host.setUserMessage('我要用暗号唤醒读者。');
  const wokenPrompt = await host.render();
  assert.doesNotMatch(wokenPrompt, /静默状态，非必要不主动发送信件/);
  assert.match(wokenPrompt, /<读者>/);
});

test('dream_extra_settings blends mechanism/appearance/personality directly into native prompt fields across all personas', async () => {
  const items = [
    { id: '1', name: '口癖', kind: 'personality', enabled: true, applyWhenSilent: false, content: '句尾偶尔轻声加一句“别翻页太快哦”。' },
    { id: '2', name: '进度联动', kind: 'mechanism', enabled: true, applyWhenSilent: true, content: '当前测试进度=<%= stat_data.事件.进度 %>' },
    { id: '3', name: '', kind: 'appearance', enabled: true, applyWhenSilent: false, content: '鼻梁架着细框金丝眼镜' },
    { id: '4', name: '禁用项', kind: 'mechanism', enabled: false, applyWhenSilent: true, content: 'SHOULD_NOT_APPEAR' },
    { id: '5', name: '语法坏项', kind: 'mechanism', enabled: true, applyWhenSilent: false, content: '<% throw new Error("boom"); %>' },
  ];
  for (const persona of ['reader', 'shoujo', 'genki', 'weirdo', 'kuromaku']) {
    const host = createReaderHost({
      local: { dream_persona: persona, dream_extra_settings: JSON.stringify(items) },
      statData: makeStatData({ progress: 5 }),
    });
    const prompt = await host.render();
    assert.doesNotMatch(prompt, /【附加设定】|性格补充|外貌补充|附加机制/, `must blend natively without extra/supplement labels (${persona})`);
    const chapterIdx = prompt.indexOf('【章节起始】');
    const mechIdx = prompt.indexOf('【进度联动】: 当前测试进度=5');
    const contractIdx = prompt.indexOf('【命定契约】');
    assert.ok(chapterIdx >= 0 && mechIdx > chapterIdx && mechIdx < contractIdx, `mechanism placed right after 【章节起始】 (${persona})`);
    assert.match(prompt, /性格:[^\r\n]*；口癖：句尾偶尔轻声加一句“别翻页太快哦”。/, `personality blended directly onto 性格: line (${persona})`);
    assert.match(prompt, /此刻形象:[^\r\n]*；鼻梁架着细框金丝眼镜/, `appearance blended directly onto 此刻形象: line (${persona})`);
    assert.ok(!prompt.includes('SHOULD_NOT_APPEAR'), `disabled item omitted for ${persona}`);
    assert.doesNotMatch(prompt, /<%|%>/, `broken EJS must not leak for ${persona}`);
  }

  // Also verify cursed kuromaku (third persona from black-author.prompt.json) blends personality natively
  const cursedHost = createReaderHost({
    local: { dream_persona: 'kuromaku', dream_extra_settings: JSON.stringify(items) },
    statData: makeStatData({ progress: 9, killedOnce: true }),
  });
  const cursedPrompt = await cursedHost.render();
  assert.match(cursedPrompt, /性格:[^\r\n]*；口癖：句尾偶尔轻声加一句“别翻页太快哦”。/);
  assert.match(cursedPrompt, /此刻形象:[^\r\n]*；鼻梁架着细框金丝眼镜/);

  const silentHost = createReaderHost({
    local: { dream_persona: 'reader', dream_silent_mode: 'on', dream_extra_settings: JSON.stringify(items) },
    statData: makeStatData({ progress: 7 }),
  });
  const silentPrompt = await silentHost.render();
  assert.doesNotMatch(silentPrompt, /【附加设定】|性格补充|外貌补充/);
  assert.match(silentPrompt, /【进度联动】: 当前测试进度=7/, 'applyWhenSilent item renders in silent mode');
  assert.ok(!silentPrompt.includes('别翻页太快哦'), 'non-silent personality stays out of silent mode');
  assert.ok(!silentPrompt.includes('金丝眼镜'), 'non-silent appearance stays out of silent mode');
});

test('unlimited dream_banlist renders all 15 banned books in [书目展示]', async () => {
  const banlist = Array.from({ length: 15 }, (_, i) => `禁书${i + 1}`);
  const host = createReaderHost({
    local: {
      dream_persona: 'reader',
      dream_banlist: JSON.stringify(banlist),
    },
    userMessage: '我想看看定调书架',
    statData: makeStatData({ location: '不明次元·某咖啡馆' }),
  });
  const prompt = await host.render();
  assert.match(prompt, /\[书目展示\]/);
  for (const title of banlist) {
    assert.ok(prompt.includes(title), `banlist must include ${title}`);
  }
});

test('regex metacharacters in wakeKeywords never crash rendering and match literally case-insensitively', async () => {
  for (const kw of [':)', 'C++', '*', '(读者']) {
    const host = createReaderHost({
      local: {
        dream_persona: 'reader',
        dream_core_manager: JSON.stringify({
          enabled: true,
          primary: '九十九夜梦',
          activeCores: ['九十九夜梦'],
          cores: { 九十九夜梦: { silent: true, wakeKeywords: [kw] } },
        }),
      },
      userMessage: '普通消息',
      statData: makeStatData(),
    });
    const silentOut = await host.render();
    assert.match(silentOut, /保持完全静默/);
    assert.doesNotMatch(silentOut, /<%|%>/);

    host.setUserMessage(`测试触发 ${kw.toLowerCase()} 完成`);
    const wokenOut = await host.render();
    assert.doesNotMatch(wokenOut, /保持完全静默/);
    assert.match(wokenOut, /<读者>/);
  }
});

test('extra personality with $& / $\' does not duplicate kuromaku persona line and inline EJS compiler matches preview semantics', async () => {
  const items = [
    { id: '1', name: '', kind: 'personality', enabled: true, content: "价格写作$&与$'" },
    { id: '2', name: '分号', kind: 'mechanism', enabled: true, content: '人格=<%- persona; %>' },
    { id: '3', name: '原样', kind: 'mechanism', enabled: true, content: "<%= '<b>粗</b>' %>" },
    { id: '4', name: '吞空白', kind: 'mechanism', enabled: true, content: 'A   <%_ if (true) { _%>   B   <%_ } _%>   C' },
  ];
  const host = createReaderHost({
    local: { dream_persona: 'kuromaku', dream_extra_settings: JSON.stringify(items) },
    statData: makeStatData({ relations: { [target]: makeRelation() } }),
  });
  const prompt = await host.render();
  const line = prompt.split(/\r?\n/).find((l) => /性格:/.test(l) && l.includes('价格写作')) || '';
  assert.ok(line.includes("价格写作$&与$'"), 'literal $& and $\' must be preserved verbatim');
  assert.equal((line.match(/性格:/g) || []).length, 1, '$& must not duplicate 性格: prefix');
  assert.ok(prompt.includes('【分号】: 人格=kuromaku'));
  assert.ok(prompt.includes('【原样】: <b>粗</b>'));
  assert.ok(prompt.includes('【吞空白】: ABC'));
});
