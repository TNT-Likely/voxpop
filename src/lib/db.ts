import type {
  AnswerInput, Env, OptionRow, PollInput, PollRow, QuestionRow, RespondDims,
} from '../types';
import { genId, nowSec, utcDayStartSec } from './util';

export async function getPoll(db: D1Database, id: string): Promise<PollRow | null> {
  const row = await db.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first<PollRow>();
  return row ?? null;
}

/** 状态为 open 且未到截止时间且已收录的问卷（首页列表用） */
export async function listOpenPolls(db: D1Database): Promise<(PollRow & { response_count: number })[]> {
  const { results } = await db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM responses r WHERE r.poll_id = p.id) AS response_count
     FROM polls p
     WHERE p.status = 'open' AND p.visibility = 'listed' AND (p.close_at IS NULL OR p.close_at > ?)
     ORDER BY p.created_at DESC LIMIT 50`
  ).bind(nowSec()).all();
  return (results ?? []) as unknown as (PollRow & { response_count: number })[];
}

export async function adminListPolls(db: D1Database): Promise<(PollRow & { response_count: number })[]> {
  const { results } = await db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM responses r WHERE r.poll_id = p.id) AS response_count
     FROM polls p ORDER BY p.created_at DESC LIMIT 200`
  ).all();
  return (results ?? []) as unknown as (PollRow & { response_count: number })[];
}

export async function getQuestions(db: D1Database, pollId: string): Promise<QuestionRow[]> {
  const { results } = await db.prepare(
    'SELECT * FROM questions WHERE poll_id = ? ORDER BY sort, id'
  ).bind(pollId).all();
  return (results ?? []) as unknown as QuestionRow[];
}

export async function getOptionsByQuestionIds(
  db: D1Database, questionIds: string[]
): Promise<Map<string, OptionRow[]>> {
  const map = new Map<string, OptionRow[]>();
  if (questionIds.length === 0) return map;
  const placeholders = questionIds.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT * FROM options WHERE question_id IN (${placeholders}) ORDER BY sort, id`
  ).bind(...questionIds).all();
  for (const row of (results ?? []) as unknown as OptionRow[]) {
    const list = map.get(row.question_id) ?? [];
    list.push(row);
    map.set(row.question_id, list);
  }
  return map;
}

export async function hasResponded(db: D1Database, pollId: string, voterHash: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT id FROM responses WHERE poll_id = ? AND voter_hash = ? LIMIT 1'
  ).bind(pollId, voterHash).first();
  return row != null;
}

/** 创建问卷：poll + questions + options 一个事务写入，返回问卷 ID */
export async function createPoll(db: D1Database, input: PollInput): Promise<string> {
  const pollId = genId();
  const ts = nowSec();
  const stmts: D1PreparedStatement[] = [];
  stmts.push(db.prepare(
    `INSERT INTO polls (id, title, title_en, description, description_en, dedup_mode, result_policy, status, close_at, extra_keys, accent, visibility, creator_hash, channels, apps, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(pollId, input.title, input.titleEn, input.description, input.descriptionEn, input.dedupMode, input.resultPolicy, input.closeAt, input.extraKeys, input.accent, input.visibility, input.creatorHash, input.channels, input.apps, ts));

  let sort = 0;
  for (const q of input.questions) {
    const qid = genId(12);
    stmts.push(db.prepare(
      'INSERT INTO questions (id, poll_id, type, title, title_en, required, max_choices, max_len, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(qid, pollId, q.type, q.title, q.titleEn, q.required ? 1 : 0, q.maxChoices, q.maxLen, sort++));
    if (q.type === 'text') continue;
    const stack: { id: string; depth: number }[] = [];
    for (let i = 0; i < q.parsedOptions.length; i++) {
      const { label, depth } = q.parsedOptions[i];
      if (depth > 2) throw new Error('级联选项最深 3 层');
      if (q.type !== 'cascade' && depth > 0) throw new Error('只有级联题支持缩进子选项');
      const oid = genId(12);
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
      stmts.push(db.prepare(
        'INSERT INTO options (id, question_id, parent_id, label, label_en, sort) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(oid, qid, parentId, label, q.parsedOptionsEn[i] ?? '', i));
      stack.push({ id: oid, depth });
    }
  }
  await db.batch(stmts);
  return pollId;
}

export async function setPollStatus(db: D1Database, id: string, status: 'open' | 'closed'): Promise<void> {
  await db.prepare(
    'UPDATE polls SET status = ?, closed_at = ? WHERE id = ?'
  ).bind(status, status === 'closed' ? nowSec() : null, id).run();
}

export async function setPollVisibility(db: D1Database, id: string, visibility: 'listed' | 'unlisted'): Promise<void> {
  await db.prepare('UPDATE polls SET visibility = ? WHERE id = ?').bind(visibility, id).run();
}

export async function setPollAccent(db: D1Database, id: string, accent: string): Promise<void> {
  await db.prepare('UPDATE polls SET accent = ? WHERE id = ?').bind(accent, id).run();
}

export async function setPollChannels(db: D1Database, id: string, channels: string): Promise<void> {
  await db.prepare('UPDATE polls SET channels = ? WHERE id = ?').bind(channels, id).run();
}

export async function setPollApps(db: D1Database, id: string, apps: string): Promise<void> {
  await db.prepare('UPDATE polls SET apps = ? WHERE id = ?').bind(apps, id).run();
}

export async function setPollTitleEn(db: D1Database, id: string, titleEn: string): Promise<void> {
  await db.prepare('UPDATE polls SET title_en = ? WHERE id = ?').bind(titleEn, id).run();
}

/* ---------- 标签注册表（应用 / 渠道的 slug + 显示名，后台维护） ---------- */

export interface RegistryEntry { slug: string; name: string }

export async function listRegistry(db: D1Database, kind: 'app' | 'channel'): Promise<RegistryEntry[]> {
  const { results } = await db.prepare(
    'SELECT slug, name FROM registry WHERE kind = ? ORDER BY created_at, slug'
  ).bind(kind).all();
  return (results ?? []) as unknown as RegistryEntry[];
}

export async function addRegistry(db: D1Database, kind: 'app' | 'channel', slug: string, name: string): Promise<void> {
  await db.prepare(
    'INSERT OR REPLACE INTO registry (kind, slug, name, created_at) VALUES (?, ?, ?, ?)'
  ).bind(kind, slug, name, nowSec()).run();
}

export async function deleteRegistry(db: D1Database, kind: 'app' | 'channel', slug: string): Promise<void> {
  await db.prepare('DELETE FROM registry WHERE kind = ? AND slug = ?').bind(kind, slug).run();
}

/** slug → 显示名（找不到时回退 slug 本身） */
export async function registryNameMaps(db: D1Database): Promise<{ apps: Map<string, string>; channels: Map<string, string> }> {
  const [apps, channels] = await Promise.all([listRegistry(db, 'app'), listRegistry(db, 'channel')]);
  return {
    apps: new Map(apps.map((a) => [a.slug, a.name])),
    channels: new Map(channels.map((ch) => [ch.slug, ch.name])),
  };
}

/** 自助建票限流：某创建者指纹当天已创建的问卷数 */
export async function countRecentByCreator(db: D1Database, creatorHash: string): Promise<number> {
  const dayStart = utcDayStartSec(0);
  const row = await db.prepare(
    'SELECT COUNT(*) AS n FROM polls WHERE creator_hash = ? AND created_at >= ?'
  ).bind(creatorHash, dayStart).first<{ n: number }>();
  return row?.n ?? 0;
}

export interface AppFeedPoll {
  id: string;
  title: string;
  description: string;
  close_at: number | null;
  accent: string;
}

/**
 * App 发现接口的数据查询：状态 open、未到截止；
 * 应用与渠道双维匹配（空标签 = 通配）；已收录问卷始终可见，
 * 未收录问卷必须显式定向了应用或渠道（App 专属问卷）。
 */
export async function listForAppFeed(db: D1Database, app: string, channel: string, limit = 10, offset = 0): Promise<AppFeedPoll[]> {
  const { results } = await db.prepare(
    `SELECT p.id, p.title, p.description, p.close_at, p.accent
     FROM polls p
     WHERE p.status = 'open'
       AND (p.close_at IS NULL OR p.close_at > ?)
       AND (p.apps = '' OR instr(',' || p.apps || ',', ',' || ? || ',') > 0)
       AND (p.channels = '' OR instr(',' || p.channels || ',', ',' || ? || ',') > 0)
       AND (p.visibility = 'listed' OR p.channels != '' OR p.apps != '')
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).bind(nowSec(), app, channel, limit, offset).all();
  return (results ?? []) as unknown as AppFeedPoll[];
}

/** CSV 导出：答卷长表（一行一答案），UTF-8 BOM 便于 Excel 直接打开 */
export async function exportPollCsv(db: D1Database, pollId: string): Promise<string | null> {
  const poll = await getPoll(db, pollId);
  if (!poll) return null;
  const questions = await getQuestions(db, pollId);
  const optionsMap = await getOptionsByQuestionIds(db, questions.map((q) => q.id));
  const labelOf = new Map<string, string>();
  for (const list of optionsMap.values()) for (const o of list) labelOf.set(o.id, o.label);
  const qTitle = new Map(questions.map((q) => [q.id, q.title]));
  const { results: responses } = await db.prepare(
    'SELECT * FROM responses WHERE poll_id = ? ORDER BY created_at'
  ).bind(pollId).all();
  const { results: answers } = await db.prepare(
    `SELECT a.*, r.created_at AS r_ts, r.country, r.device, r.browser, r.os
     FROM answers a JOIN responses r ON r.id = a.response_id WHERE r.poll_id = ? ORDER BY a.id`
  ).bind(pollId).all();
  const byResponse = new Map<string, Record<string, unknown>[]>();
  for (const a of answers as unknown as Record<string, unknown>[]) {
    const list = byResponse.get(String(a.response_id)) ?? [];
    list.push(a);
    byResponse.set(String(a.response_id), list);
  }
  const esc2 = (v: unknown) => {
    const s2 = v == null ? '' : String(v);
    return /[",\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
  };
  const header = 'response_id,submitted_at,country,device,browser,os,question,answer';
  const lines: string[] = [header];
  for (const r of (responses ?? []) as unknown as Record<string, unknown>[]) {
    const list = byResponse.get(String(r.id)) ?? [];
    if (list.length === 0) {
      lines.push([r.id, new Date(Number(r.created_at) * 1000).toISOString(), r.country, r.device, r.browser, r.os, '(no answers)', ''].map(esc2).join(','));
    }
    for (const a of list) {
      const qid = String(a.question_id);
      const answer = a.option_id != null ? (labelOf.get(String(a.option_id)) ?? String(a.option_id)) : String(a.text_value ?? '');
      lines.push([
        r.id, new Date(Number(r.created_at) * 1000).toISOString(),
        r.country, r.device, r.browser, r.os,
        qTitle.get(qid) ?? qid, answer,
      ].map(esc2).join(','));
    }
  }
  return '﻿' + lines.join('\r\n');
}

export async function deletePoll(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM polls WHERE id = ?').bind(id).run();
}

/** 写入答卷：业务预检 + 一个事务写入答卷、答案与 respond 事件；唯一约束兜底 */
export async function respondToPoll(
  db: D1Database,
  poll: PollRow,
  voterHash: string,
  vid: string,
  dims: RespondDims,
  answers: AnswerInput[],
  sessionId: string
): Promise<{ ok: true } | { ok: false; reason: 'already_responded' }> {
  const dup = await db.prepare(
    'SELECT id FROM responses WHERE poll_id = ? AND voter_hash = ? LIMIT 1'
  ).bind(poll.id, voterHash).first();
  if (dup) return { ok: false, reason: 'already_responded' };

  const responseId = crypto.randomUUID();
  const ts = nowSec();
  const stmts: D1PreparedStatement[] = [];
  stmts.push(db.prepare(
    `INSERT INTO responses (id, poll_id, voter_hash, country, device, browser, os, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(responseId, poll.id, voterHash, dims.country, dims.device, dims.browser, dims.os, ts));
  for (const a of answers) {
    for (const oid of a.optionIds ?? []) {
      stmts.push(db.prepare(
        'INSERT INTO answers (response_id, question_id, option_id, created_at) VALUES (?, ?, ?, ?)'
      ).bind(responseId, a.questionId, oid, ts));
    }
    if (a.text != null) {
      stmts.push(db.prepare(
        'INSERT INTO answers (response_id, question_id, text_value, created_at) VALUES (?, ?, ?, ?)'
      ).bind(responseId, a.questionId, a.text, ts));
    }
  }
  stmts.push(db.prepare(
    `INSERT INTO events (type, poll_id, path, visitor_id, session_id, country, device, browser, os, ts)
     VALUES ('respond', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(poll.id, '/p/' + poll.id, vid, sessionId, dims.country, dims.device, dims.browser, dims.os, ts));

  try {
    await db.batch(stmts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|CONSTRAINT/i.test(msg)) return { ok: false, reason: 'already_responded' };
    throw e;
  }
  return { ok: true };
}

export interface ResultsPayload {
  total: number;
  breakdown: Record<string, Record<string, number>>;
  questions: unknown[];
}

/** 按语言取显示文本：en 且有翻译用翻译，否则回退中文 */
function pick(locale: string, zh: string, en: string): string {
  return locale === 'en' && en ? en : zh;
}

/**
 * 结果聚合：每题各选项计数（级联聚合为树）、答卷维度构成、
 * includeText 时附带文本答案内容（仅管理端）。
 * locale 用于按语言输出题干与选项文本。
 */
export async function buildResults(db: D1Database, poll: PollRow, includeText: boolean, locale = 'zh'): Promise<ResultsPayload> {
  const questions = await getQuestions(db, poll.id);
  const optionsMap = await getOptionsByQuestionIds(db, questions.map((q) => q.id));
  const total = (await db.prepare(
    'SELECT COUNT(*) AS n FROM responses WHERE poll_id = ?'
  ).bind(poll.id).first<{ n: number }>())?.n ?? 0;

  const counts = new Map<string, number>();
  if (questions.length > 0) {
    const { results } = await db.prepare(
      `SELECT a.question_id AS qid, a.option_id AS oid, COUNT(*) AS c
       FROM answers a JOIN responses r ON r.id = a.response_id
       WHERE r.poll_id = ? AND a.option_id IS NOT NULL
       GROUP BY a.question_id, a.option_id`
    ).bind(poll.id).all();
    for (const row of (results ?? []) as unknown as { qid: string; oid: string; c: number }[]) {
      counts.set(`${row.qid}:${row.oid}`, row.c);
    }
  }

  const breakdown: Record<string, Record<string, number>> = { device: {}, browser: {}, os: {}, country: {} };
  const { results: dimRows } = await db.prepare(
    `SELECT device, browser, os, country, COUNT(*) AS c
     FROM responses WHERE poll_id = ? GROUP BY device, browser, os, country`
  ).bind(poll.id).all();
  for (const row of (dimRows ?? []) as unknown as Record<string, string | number>[]) {
    for (const key of ['device', 'browser', 'os', 'country'] as const) {
      const v = String(row[key] || 'unknown');
      breakdown[key][v] = (breakdown[key][v] ?? 0) + Number(row.c);
    }
  }
  for (const key of Object.keys(breakdown)) {
    breakdown[key] = Object.fromEntries(
      Object.entries(breakdown[key]).sort((a, b) => b[1] - a[1]).slice(0, 24)
    );
  }

  const questionsOut: unknown[] = [];
  for (const q of questions) {
    if (q.type === 'text') {
      const n = (await db.prepare(
        `SELECT COUNT(*) AS n FROM answers a JOIN responses r ON r.id = a.response_id
         WHERE a.question_id = ? AND a.text_value IS NOT NULL`
      ).bind(q.id).first<{ n: number }>())?.n ?? 0;
      let texts: unknown;
      if (includeText) {
        const { results } = await db.prepare(
          `SELECT a.text_value AS text, a.created_at AS ts
           FROM answers a JOIN responses r ON r.id = a.response_id
           WHERE a.question_id = ? AND a.text_value IS NOT NULL
           ORDER BY a.created_at DESC LIMIT 200`
        ).bind(q.id).all();
        texts = results ?? [];
      }
      questionsOut.push({
        id: q.id, type: q.type, title: pick(locale, q.title, q.title_en), required: !!q.required,
        answerCount: n, ...(texts ? { texts } : {}),
      });
      continue;
    }
    const opts = optionsMap.get(q.id) ?? [];
    const byId = new Map<string, { id: string; label: string; count: number; children: unknown[] }>();
    for (const o of opts) {
      byId.set(o.id, { id: o.id, label: pick(locale, o.label, o.label_en), count: counts.get(`${q.id}:${o.id}`) ?? 0, children: [] });
    }
    const roots: { id: string; label: string; count: number; children: unknown[] }[] = [];
    for (const o of opts) {
      const node = byId.get(o.id)!;
      const parent = o.parent_id ? byId.get(o.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    // 非叶子节点的计数 = 所有叶子后代之和（级联语义：作答落在叶子）
    const sumUp = (node: { count: number; children: { count: number; children: unknown[] }[] }): number => {
      node.count = node.count + node.children.reduce((s, ch) => s + sumUp(ch as never), 0);
      return node.count;
    };
    for (const root of roots) sumUp(root as never);
    questionsOut.push({
      id: q.id, type: q.type, title: pick(locale, q.title, q.title_en), required: !!q.required,
      maxChoices: q.max_choices, options: roots,
    });
  }
  return { total, breakdown, questions: questionsOut };
}

export async function insertEvent(db: D1Database, e: {
  type: string; pollId: string; path: string; visitorId: string; sessionId: string;
  country: string; device: string; browser: string; os: string;
  lang: string; screen: string; referrer: string; extra: string;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO events (type, poll_id, path, visitor_id, session_id, country, device, browser, os, lang, screen, referrer, extra, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    e.type, e.pollId, e.path, e.visitorId, e.sessionId,
    e.country, e.device, e.browser, e.os, e.lang, e.screen, e.referrer, e.extra, nowSec()
  ).run();
}

/** 管理端导出：全量 JSON */
export async function exportPoll(db: D1Database, pollId: string): Promise<unknown | null> {
  const poll = await getPoll(db, pollId);
  if (!poll) return null;
  const questions = await getQuestions(db, pollId);
  const optionsMap = await getOptionsByQuestionIds(db, questions.map((q) => q.id));
  const { results: responses } = await db.prepare(
    'SELECT * FROM responses WHERE poll_id = ? ORDER BY created_at'
  ).bind(pollId).all();
  const { results: answers } = await db.prepare(
    `SELECT a.* FROM answers a JOIN responses r ON r.id = a.response_id WHERE r.poll_id = ? ORDER BY a.id`
  ).bind(pollId).all();
  return {
    poll,
    questions: questions.map((q) => ({ ...q, options: optionsMap.get(q.id) ?? [] })),
    responses,
    answers,
    exportedAt: nowSec(),
  };
}

export interface DailyPoint { day: string; responses: number; pageviews: number }

/** 近 N 天每日答卷数与浏览量（UTC 日界，用于后台趋势图表） */
export async function getDailySeries(db: D1Database, pollId: string, days = 14): Promise<DailyPoint[]> {
  const startSec = utcDayStartSec(-(days - 1));
  const [respRows, pvRows] = await Promise.all([
    db.prepare(
      `SELECT date(created_at, 'unixepoch') AS d, COUNT(*) AS c
       FROM responses WHERE poll_id = ? AND created_at >= ? GROUP BY d`
    ).bind(pollId, startSec).all(),
    db.prepare(
      `SELECT date(ts, 'unixepoch') AS d, COUNT(*) AS c
       FROM events WHERE poll_id = ? AND type = 'pageview' AND ts >= ? GROUP BY d`
    ).bind(pollId, startSec).all(),
  ]);
  const respMap = new Map<string, number>();
  for (const r of (respRows.results ?? []) as unknown as { d: string; c: number }[]) respMap.set(r.d, r.c);
  const pvMap = new Map<string, number>();
  for (const r of (pvRows.results ?? []) as unknown as { d: string; c: number }[]) pvMap.set(r.d, r.c);
  const out: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date((startSec + i * 86400) * 1000).toISOString().slice(0, 10);
    out.push({ day, responses: respMap.get(day) ?? 0, pageviews: pvMap.get(day) ?? 0 });
  }
  return out;
}

/** 某问卷的累计页面浏览量（events 明细；历史数据以 event_daily 为准） */
export async function getPollPageviews(db: D1Database, pollId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE poll_id = ? AND type = 'pageview'"
  ).bind(pollId).first<{ n: number }>();
  return row?.n ?? 0;
}
