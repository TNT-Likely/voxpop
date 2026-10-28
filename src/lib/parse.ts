import { clampInt, nowSec, parseOptionLines } from './util';
import type { DedupMode, PollInput, QuestionType, ResultPolicy } from '../types';

export interface ParseOptions {
  /** 公共建票时可收紧题目数上限 */
  maxQuestions?: number;
  /** extraKeys 是管理员专属能力 */
  allowExtraKeys?: boolean;
}

/**
 * 解析创建问卷的 JSON 输入（后台与自助建票共用）。
 * 错误返回稳定错误码，由前端按语言映射文案。
 */
export function parsePollInput(
  raw: Record<string, unknown>,
  opts: ParseOptions = {}
): { input?: PollInput; error?: string } {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const title = s(raw.title).trim();
  if (!title || title.length > 80) return { error: 'title_too_long' };
  const description = s(raw.description).trim().slice(0, 300);

  const dedupMode = (['device', 'ip', 'open'] as const).includes(s(raw.dedupMode) as DedupMode)
    ? (s(raw.dedupMode) as DedupMode)
    : 'device';
  const resultPolicy = (['always', 'after_vote', 'after_close'] as const).includes(s(raw.resultPolicy) as ResultPolicy)
    ? (s(raw.resultPolicy) as ResultPolicy)
    : 'after_vote';

  const closeInDays = raw.closeInDays == null ? null : clampInt(raw.closeInDays, 1, 365, 0);
  const closeAt = closeInDays && closeInDays > 0 ? nowSec() + closeInDays * 86400 : null;

  const accentRaw = s(raw.accent).trim().replace('#', '');
  const accent = /^[0-9a-fA-F]{6}$/.test(accentRaw) ? '#' + accentRaw.toLowerCase() : '';

  const extraKeys = opts.allowExtraKeys
    ? s(raw.extraKeys)
        .split(/[,，\s]+/)
        .filter(Boolean)
        .filter((k) => /^[a-z0-9_]{1,32}$/.test(k))
        .slice(0, 8)
        .join(',')
    : '';

  const visibility = raw.visibility === 'unlisted' ? 'unlisted' : 'listed';
  const creatorHash = s(raw.creatorHash).slice(0, 64);

  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const maxQuestions = opts.maxQuestions ?? 20;
  if (rawQuestions.length === 0 || rawQuestions.length > maxQuestions) {
    return { error: 'too_many_questions' };
  }
  const questions: PollInput['questions'] = [];
  for (const rq of rawQuestions) {
    const q = (rq ?? {}) as Record<string, unknown>;
    const type = s(q.type) as QuestionType;
    if (!['single', 'multi', 'cascade', 'text'].includes(type)) return { error: 'bad_question' };
    const qTitle = s(q.title).trim();
    if (!qTitle || qTitle.length > 120) return { error: 'title_too_long' };
    const required = q.required !== false;
    const maxChoices = type === 'multi' ? clampInt(q.maxChoices, 2, 50, 3) : 1;
    const maxLen = type === 'text' ? clampInt(q.maxLen, 1, 500, 200) : 0;
    let parsedOptions: { label: string; depth: number }[] = [];
    if (type !== 'text') {
      parsedOptions = parseOptionLines(s(q.optionsText));
      if (parsedOptions.length < 2) return { error: 'options_too_few' };
      if (parsedOptions.length > 200) return { error: 'options_too_few' };
      if (type !== 'cascade' && parsedOptions.some((o) => o.depth > 0)) {
        return { error: 'bad_indent' };
      }
      if (parsedOptions.some((o) => o.depth > 2)) return { error: 'level_too_deep' };
    }
    questions.push({ type, title: qTitle, required, maxChoices, maxLen, parsedOptions });
  }
  return {
    input: { title, description, dedupMode, resultPolicy, closeAt, extraKeys, accent, visibility, creatorHash, questions },
  };
}
