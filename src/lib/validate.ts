import type { AnswerInput, OptionRow, QuestionRow } from '../types';

interface RawAnswer { questionId?: unknown; optionIds?: unknown; text?: unknown }

/**
 * 校验答卷：
 * - text 题必填与长度
 * - single/cascade 恰好一个合法选项，cascade 必须选到叶子
 * - multi 不超过 max_choices
 * - 未作答的可选题跳过
 */
export function validateAnswers(
  questions: QuestionRow[],
  optionsMap: Map<string, OptionRow[]>,
  raw: unknown
): { ok: true; answers: AnswerInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'bad_answers' };
  const byQid = new Map<string, RawAnswer>();
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const r = item as RawAnswer;
      if (typeof r.questionId === 'string') byQid.set(r.questionId, r);
    }
  }
  const out: AnswerInput[] = [];
  for (const q of questions) {
    const item = byQid.get(q.id);
    if (q.type === 'text') {
      const text = item && typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) {
        if (q.required) return { ok: false, error: 'missing_answer' };
        continue;
      }
      if (text.length > q.max_len) return { ok: false, error: 'text_too_long' };
      out.push({ questionId: q.id, text });
      continue;
    }
    const opts = optionsMap.get(q.id) ?? [];
    const valid = new Set(opts.map((o) => o.id));
    const childSet = new Set(
      opts.map((o) => o.parent_id).filter((v): v is string => v != null)
    );
    const idsRaw = item && Array.isArray(item.optionIds) ? item.optionIds : [];
    const ids = [...new Set(idsRaw.filter((v): v is string => typeof v === 'string' && valid.has(v)))];
    if (ids.length === 0) {
      if (q.required) return { ok: false, error: 'missing_answer' };
      continue;
    }
    if (q.type === 'single' || q.type === 'cascade') {
      if (ids.length !== 1) return { ok: false, error: 'bad_answer' };
      if (q.type === 'cascade' && childSet.has(ids[0])) return { ok: false, error: 'cascade_needs_leaf' };
    } else if (q.type === 'multi') {
      if (ids.length > Math.max(1, q.max_choices)) return { ok: false, error: 'too_many_choices' };
    }
    out.push({ questionId: q.id, optionIds: ids });
  }
  return { ok: true, answers: out };
}
