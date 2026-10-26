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

test('progress below the seed does not start the curse', async () => {
  const host = createReaderHost({ local: { dream_seed: 3 }, statData: makeStatData({ progress: 2, relations: { [target]: makeRelation({ favor: 30 }) } }) });
  hasGirl(await host.render());
});

for (const progress of [3, 4]) {
  test(`curse progress ${progress} permanently selects the author even without targets`, async () => {
    const host = createReaderHost({ local: { dream_seed: 3 }, statData: makeStatData({ progress }) });
    hasAuthor(await host.render());
    hasAuthor(await host.render());
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
  const prompt = await createReaderHost({ statData: makeStatData({ progress: 3, relations }) }).render();
  hasAuthor(prompt);
  assert.ok(prompt.includes('诅咒合格同伴'));
  for (const name of ['诅咒未达标同伴', '诅咒死亡同伴', '诅咒崩溃同伴']) assert.ok(!prompt.includes(name), name);
});

test('after all curse targets finish, the author remains but the old target is omitted', async () => {
  const host = createReaderHost({ statData: makeStatData({ progress: 3, relations: { [target]: makeRelation({ favor: 30 }) } }) });
  assert.ok((await host.render()).includes(target));
  host.setStatData(makeStatData({ progress: 3, relations: { [target]: makeRelation({ favor: 30, hp: 0 }) } }));
  const prompt = await host.render();
  hasAuthor(prompt);
  assert.ok(!prompt.includes(target));
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
  const host = createReaderHost({ statData: makeStatData({ progress: 2 }) });
  host.setStatData(makeStatData({ progress: 3 }), { message: 2 });
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
  const prompt = await createReaderHost({ statData: makeStatData({ progress: 3 }) }).render();
  hasAuthor(prompt);
  assert.doesNotMatch(prompt, /【黑之作家：本轮执行】|【黑之作家：本轮公开创作记录】/);
});
