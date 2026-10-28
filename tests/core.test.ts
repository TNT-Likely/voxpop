import { describe, expect, it } from 'vitest';
import { parsePollInput } from '../src/lib/parse';
import { validateAnswers } from '../src/lib/validate';
import { cleanDim, clampInt, isClosed, parseOptionLines } from '../src/lib/util';
import { voterHash } from '../src/lib/identity';
import type { Env, OptionRow, PollRow, QuestionRow } from '../src/types';

// ---------- parseOptionLines ----------

describe('parseOptionLines', () => {
  it('按两个空格解析层级', () => {
    const r = parseOptionLines('iOS\n  iPhone\n    iOS 26\nAndroid');
    expect(r).toEqual([
      { label: 'iOS', depth: 0 },
      { label: 'iPhone', depth: 1 },
      { label: 'iOS 26', depth: 2 },
      { label: 'Android', depth: 0 },
    ]);
  });
  it('忽略空行与首尾空白', () => {
    const r = parseOptionLines('  A  \n\nB');
    expect(r).toEqual([{ label: 'A', depth: 1 }, { label: 'B', depth: 0 }]);
  });
});

// ---------- parsePollInput ----------

const basePoll = { title: '测试', questions: [] };

function q(over: Record<string, unknown> = {}) {
  return { type: 'single', title: 'Q1', required: true, optionsText: 'A\nB', ...over };
}

describe('parsePollInput', () => {
  it('标题必填且 ≤80', () => {
    expect(parsePollInput({ ...basePoll, title: '' }).error).toBe('title_too_long');
    expect(parsePollInput({ ...basePoll, title: 'x'.repeat(81) }).error).toBe('title_too_long');
    expect(parsePollInput({ ...basePoll, title: 'ok', questions: [q()] }).error).toBeUndefined();
  });

  it('题目数量上限', () => {
    const many = { title: 't', questions: Array.from({ length: 21 }, () => q()) };
    expect(parsePollInput({ ...many }).error).toBe('too_many_questions');
  });

  it('选择/级联题至少两个选项', () => {
    expect(parsePollInput({ title: 't', questions: [q({ optionsText: 'A' })] }).error).toBe('options_too_few');
  });

  it('非级联题不允许缩进子选项', () => {
    expect(parsePollInput({ title: 't', questions: [q({ optionsText: 'A\n  B' })] }).error).toBe('bad_indent');
  });

  it('级联最深 3 层', () => {
    const deep = 'A\n  B\n    C\n      D';
    expect(parsePollInput({ title: 't', questions: [q({ type: 'cascade', optionsText: deep })] }).error).toBe('level_too_deep');
    const ok3 = 'A\n  B\n    C';
    const r = parsePollInput({ title: 't', questions: [q({ type: 'cascade', optionsText: ok3 })] });
    expect(r.error).toBeUndefined();
    expect(r.input!.questions[0].parsedOptions[2].depth).toBe(2);
  });

  it('英文选项必须与中文逐行对齐', () => {
    const ok = parsePollInput({
      title: 't',
      questions: [q({ optionsText: 'A\nB', optionsTextEn: 'A en\nB en', titleEn: 'T en' })],
    });
    expect(ok.error).toBeUndefined();
    expect(ok.input!.questions[0].parsedOptionsEn).toEqual(['A en', 'B en']);
    expect(parsePollInput({
      title: 't',
      questions: [q({ optionsText: 'A\nB', optionsTextEn: 'A en' })],
    }).error).toBe('en_mismatch');
    expect(parsePollInput({
      title: 't',
      questions: [q({ type: 'cascade', optionsText: 'A\n  B', optionsTextEn: 'A\nB' })],
    }).error).toBe('en_mismatch');
  });

  it('标签清洗：小写、去重、去非法、上限 8', () => {
    const r = parsePollInput({
      title: 't',
      apps: 'BeeCount, beecount, 坏!, X'.repeat(3) + ',a-b_c',
      questions: [q()],
    });
    expect(r.input!.apps.split(',').every((s) => /^[a-z0-9_-]{1,32}$/.test(s))).toBe(true);
    expect(new Set(r.input!.apps.split(',')).size).toBe(r.input!.apps.split(',').length);
    expect(r.input!.apps.split(',').length).toBeLessThanOrEqual(8);
  });

  it('extraKeys 仅管理员可用', () => {
    const body = { title: 't', extraKeys: 'src,app_ver', questions: [q()] };
    expect(parsePollInput(body, { allowExtraKeys: true }).input!.extraKeys).toBe('src,app_ver');
    expect(parsePollInput(body).input!.extraKeys).toBe('');
  });

  it('主题色归一为小写 #rrggbb', () => {
    expect(parsePollInput({ title: 't', accent: '#FF7043', questions: [q()] }).input!.accent).toBe('#ff7043');
    expect(parsePollInput({ title: 't', accent: 'zzz', questions: [q()] }).input!.accent).toBe('');
  });

  it('截止天数换算为时间戳', () => {
    const before = Math.floor(Date.now() / 1000);
    const r = parsePollInput({ title: 't', closeInDays: 7, questions: [q()] });
    expect(r.input!.closeAt).toBeGreaterThanOrEqual(before + 7 * 86400 - 5);
  });
});

// ---------- validateAnswers ----------

const questions: QuestionRow[] = [
  { id: 'q1', poll_id: 'p', type: 'single', title: '单选', required: 1, max_choices: 1, max_len: 200, sort: 0 },
  { id: 'q2', poll_id: 'p', type: 'multi', title: '多选', required: 1, max_choices: 2, max_len: 200, sort: 1 },
  { id: 'q3', poll_id: 'p', type: 'cascade', title: '级联', required: 1, max_choices: 1, max_len: 200, sort: 2 },
  { id: 'q4', poll_id: 'p', type: 'text', title: '文本', required: 1, max_choices: 1, max_len: 10, sort: 3 },
  { id: 'q5', poll_id: 'p', type: 'single', title: '选填', required: 0, max_choices: 1, max_len: 200, sort: 4 },
];
const optionsMap = new Map<string, OptionRow[]>([
  ['q1', [
    { id: 'a1', question_id: 'q1', parent_id: null, label: 'A', sort: 0 },
    { id: 'a2', question_id: 'q1', parent_id: null, label: 'B', sort: 1 },
  ]],
  ['q2', [
    { id: 'b1', question_id: 'q2', parent_id: null, label: 'X', sort: 0 },
    { id: 'b2', question_id: 'q2', parent_id: null, label: 'Y', sort: 1 },
    { id: 'b3', question_id: 'q2', parent_id: null, label: 'Z', sort: 2 },
  ]],
  ['q3', [
    { id: 'c1', question_id: 'q3', parent_id: null, label: '父', sort: 0 },
    { id: 'c2', question_id: 'q3', parent_id: 'c1', label: '子', sort: 1 },
  ]],
]);

describe('validateAnswers', () => {
  it('必答缺失报 missing_answer', () => {
    const r = validateAnswers(questions, optionsMap, []);
    expect(r).toEqual({ ok: false, error: 'missing_answer' });
  });
  it('单选多值报 bad_answer，未知选项被过滤', () => {
    const r = validateAnswers(questions, optionsMap, [
      { questionId: 'q1', optionIds: ['a1', 'a2', 'ghost'] },
      { questionId: 'q2', optionIds: ['b1'] },
      { questionId: 'q3', optionIds: ['c2'] },
      { questionId: 'q4', text: 'hi' },
    ]);
    expect(r).toEqual({ ok: false, error: 'bad_answer' });
  });
  it('级联必须选到叶子', () => {
    const r = validateAnswers(questions, optionsMap, [
      { questionId: 'q1', optionIds: ['a1'] },
      { questionId: 'q2', optionIds: ['b1'] },
      { questionId: 'q3', optionIds: ['c1'] },
      { questionId: 'q4', text: 'hi' },
    ]);
    expect(r).toEqual({ ok: false, error: 'cascade_needs_leaf' });
  });
  it('多选超限报 too_many_choices', () => {
    const r = validateAnswers(questions, optionsMap, [
      { questionId: 'q1', optionIds: ['a1'] },
      { questionId: 'q2', optionIds: ['b1', 'b2', 'b3'] },
      { questionId: 'q3', optionIds: ['c2'] },
      { questionId: 'q4', text: 'hi' },
    ]);
    expect(r).toEqual({ ok: false, error: 'too_many_choices' });
  });
  it('文本超长报 text_too_long，选填缺失可跳过', () => {
    const answers = [
      { questionId: 'q1', optionIds: ['a1'] },
      { questionId: 'q2', optionIds: ['b1'] },
      { questionId: 'q3', optionIds: ['c2'] },
      { questionId: 'q4', text: 'x'.repeat(11) },
      { questionId: 'q5', optionIds: ['a2'] },
    ];
    expect(validateAnswers(questions, optionsMap, answers).ok).toBe(false);
    const noQ5 = answers.filter((a) => a.questionId !== 'q5');
    expect(validateAnswers(questions, optionsMap, noQ5.map((a, i) => i === 3 ? { questionId: 'q4', text: 'short' } : a)).ok).toBe(true);
  });
  it('合法答卷通过并保留顺序', () => {
    const r = validateAnswers(questions, optionsMap, [
      { questionId: 'q1', optionIds: ['a1'] },
      { questionId: 'q2', optionIds: ['b1', 'b2'] },
      { questionId: 'q3', optionIds: ['c2'] },
      { questionId: 'q4', text: 'hello' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.map((a) => a.questionId)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
});

// ---------- 工具 ----------

describe('util', () => {
  it('cleanDim 只放行合法枚举串', () => {
    expect(cleanDim('Chrome')).toBe('Chrome');
    expect(cleanDim('<script>')).toBe('');
    expect(cleanDim(123)).toBe('');
  });
  it('clampInt 边界', () => {
    expect(clampInt(99, 1, 50, 3)).toBe(50);
    expect(clampInt('abc', 1, 50, 3)).toBe(3);
  });
  it('isClosed：显式截止或到期', () => {
    expect(isClosed({ status: 'closed', close_at: null })).toBe(true);
    expect(isClosed({ status: 'open', close_at: Math.floor(Date.now() / 1000) - 1 })).toBe(true);
    expect(isClosed({ status: 'open', close_at: Math.floor(Date.now() / 1000) + 999 })).toBe(false);
  });
});

// ---------- 防重身份 ----------

const env = { SERVER_SALT: 'test-salt' } as Env;
const poll: PollRow = {
  id: 'p1', title: '', description: '', dedup_mode: 'device', result_policy: 'after_vote',
  status: 'open', close_at: null, extra_keys: '', accent: '', visibility: 'listed',
  creator_hash: '', channels: '', apps: '', created_at: 0, closed_at: null,
};

describe('voterHash', () => {
  it('同输入同哈希（device 模式 Cookie 身份稳定）', async () => {
    const a = await voterHash(env, poll, 'vid-1', '1.2.3.4', 'UA');
    const b = await voterHash(env, poll, 'vid-1', '1.2.3.4', 'UA');
    expect(a).toBe(b);
    expect(a).not.toBe(await voterHash(env, poll, 'vid-2', '1.2.3.4', 'UA'));
  });
  it('无 Cookie 退化为 ip+UA，仍稳定', async () => {
    const a = await voterHash(env, poll, '', '1.2.3.4', 'UA');
    const b = await voterHash(env, poll, '', '5.6.7.8', 'UA');
    expect(a).not.toBe(b);
    expect(a).toBe(await voterHash(env, poll, '', '1.2.3.4', 'UA'));
  });
  it('open 模式每次随机（宽松语义）', async () => {
    const a = await voterHash(env, { ...poll, dedup_mode: 'open' }, 'vid-1', '1.2.3.4', 'UA');
    const b = await voterHash(env, { ...poll, dedup_mode: 'open' }, 'vid-1', '1.2.3.4', 'UA');
    expect(a).not.toBe(b);
  });
  it('不同问卷哈希不同', async () => {
    const a = await voterHash(env, poll, 'vid-1', '1.2.3.4', 'UA');
    expect(a).not.toBe(await voterHash(env, { ...poll, id: 'p2' }, 'vid-1', '1.2.3.4', 'UA'));
  });
});
