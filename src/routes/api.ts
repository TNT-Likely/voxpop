import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from '../types';
import { cleanDim, clampInt, hmacHex, isClosed } from '../lib/util';
import {
  buildResults, countRecentByCreator, createPoll, getOptionsByQuestionIds, getPoll, getQuestions,
  hasResponded, insertEvent, listForAppFeed, respondToPoll,
} from '../lib/db';
import { ensureVid, voterHash } from '../lib/identity';
import { verifyTurnstile } from '../lib/turnstile';
import { validateAnswers } from '../lib/validate';
import { parsePollInput } from '../lib/parse';

export const api = new Hono<{ Bindings: Env }>();

api.get('/api/health', (c) =>
  c.json({ ok: true, name: 'voxpop', version: '0.2.0', ts: Date.now() })
);

// 公开结果 JSON（按结果可见策略放行；供官网等外部消费，带 CORS）
api.get('/api/polls/:id/results', async (c) => {
  const poll = await getPoll(c.env.DB, c.req.param('id'));
  if (!poll || poll.status === 'draft') return c.json({ error: 'poll_not_found' }, 404);
  const closed = isClosed(poll);
  let allowed = false;
  if (poll.result_policy === 'always' || closed) {
    allowed = true;
  } else if (poll.result_policy === 'after_vote') {
    const vid = getCookie(c, 'vp_vid');
    const ip = c.req.header('CF-Connecting-IP') ?? '';
    const ua = c.req.header('User-Agent') ?? '';
    allowed = await hasResponded(c.env.DB, poll.id, await voterHash(c.env, poll, vid ?? '', ip, ua));
  }
  if (!allowed) return c.json({ error: 'results_hidden' }, 403);
  c.header('Access-Control-Allow-Origin', '*');
  return c.json(await buildResults(c.env.DB, poll, false));
});

// 提交答卷：四层防重（Turnstile → 身份 → 业务预检 → DB 唯一约束）
api.post('/api/polls/:id/respond', async (c) => {
  const poll = await getPoll(c.env.DB, c.req.param('id'));
  if (!poll || poll.status === 'draft') return c.json({ error: 'poll_not_found' }, 404);
  if (isClosed(poll)) return c.json({ error: 'poll_closed' }, 403);

  const ip = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
  if (c.env.RL) {
    try {
      const rl = await c.env.RL.limit({ key: 'respond:' + ip });
      if (!rl.success) return c.json({ error: 'too_many_requests' }, 429);
    } catch {
      // 限流不可用时放行（仍有 DB 唯一约束兜底）
    }
  }

  const body = await c.req.json<{
    answers?: unknown; dims?: unknown; turnstileToken?: unknown; sessionId?: unknown; lang?: unknown;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'bad_request' }, 400);

  if (c.env.TURNSTILE_SECRET_KEY) {
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, token, ip))) {
      return c.json({ error: 'captcha_failed' }, 400);
    }
  }

  const questions = await getQuestions(c.env.DB, poll.id);
  const optionsMap = await getOptionsByQuestionIds(c.env.DB, questions.map((q) => q.id));
  const parsed = validateAnswers(questions, optionsMap, body.answers);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  // 防重身份只认请求自带的 Cookie；ensureVid 负责为后续访问签发
  const cookieVid = getCookie(c, 'vp_vid') ?? '';
  const vid = ensureVid(c);
  const ua = c.req.header('User-Agent') ?? '';
  const vh = await voterHash(c.env, poll, cookieVid, ip, ua);

  const dimsRaw = (body.dims ?? {}) as Record<string, unknown>;
  // 语言维度 = 呈现给用户的问卷语言版本：页面渲染 locale 随提交回传；
  // 缺省回退界面语言 Cookie（不使用浏览器语言——那是访客画像，不是呈现口径）
  const pageLocale = typeof body.lang === 'string' && /^[a-z]{2}$/i.test(body.lang)
    ? body.lang.toLowerCase()
    : '';
  const cookieLang = getCookie(c, 'vp_lang');
  const lang = pageLocale || (cookieLang === 'en' || cookieLang === 'zh' ? cookieLang : '');
  const dims = {
    country: c.req.header('CF-IPCountry') ?? '',
    device: ['desktop', 'mobile', 'tablet'].includes(String(dimsRaw.device)) ? String(dimsRaw.device) : '',
    browser: cleanDim(dimsRaw.browser),
    os: cleanDim(dimsRaw.os),
    lang,
  };
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 40) : '';

  const result = await respondToPoll(c.env.DB, poll, vh, vid, dims, parsed.answers, sessionId);
  if (!result.ok) return c.json({ error: result.reason }, 409);

  // 结果按策略返回：截止后/投后可见策略在提交成功时都返回，截止后可见策略仅在截止后返回
  const includeResults = poll.result_policy !== 'after_close' || isClosed(poll);
  const results = includeResults ? await buildResults(c.env.DB, poll, false) : null;
  return c.json({ ok: true, results });
});

// 埋点上报（仅 pageview；respond 事件由服务端在提交时写入）
api.post('/api/t', async (c) => {
  // 无条件写库接口：限流防刷（超出静默丢弃，不暴露限流信号）
  const tIp = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
  if (c.env.RL) {
    try {
      const rl = await c.env.RL.limit({ key: 't:' + tIp });
      if (!rl.success) return c.body(null, 204);
    } catch {
      // 限流不可用时放行
    }
  }
  const rate = parseFloat(c.env.SAMPLE_RATE ?? '1');
  if (Number.isFinite(rate) && rate < 1 && Math.random() > rate) return c.body(null, 204);

  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || b.type !== 'pageview') return c.body(null, 204);

  const pollIdRaw = typeof b.poll_id === 'string' ? b.poll_id : '';
  const pollId = /^[a-z0-9]{1,16}$/.test(pollIdRaw) ? pollIdRaw : '';

  let extra = '{}';
  if (pollId) {
    // 自定义维度走问卷白名单
    const poll = await getPoll(c.env.DB, pollId);
    if (poll && poll.extra_keys) {
      const allow = new Set(poll.extra_keys.split(',').map((s) => s.trim()).filter(Boolean));
      const src = (b.extra ?? {}) as Record<string, unknown>;
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(src)) {
        if (allow.has(k) && typeof v === 'string' && v.length > 0) obj[k] = v.slice(0, 64);
      }
      extra = JSON.stringify(obj);
    }
  }

  const ref = typeof b.referrer === 'string' ? b.referrer : '';
  let refHost = '';
  if (ref) {
    try {
      refHost = new URL(ref).hostname.slice(0, 100);
    } catch {
      // 非法 referrer 置空
    }
  }
  const dims = (b.dims ?? {}) as Record<string, unknown>;

  await insertEvent(c.env.DB, {
    type: 'pageview',
    pollId,
    path: typeof b.path === 'string' ? b.path.slice(0, 120) : '',
    visitorId: typeof b.visitor_id === 'string' ? b.visitor_id.slice(0, 40) : '',
    sessionId: typeof b.session_id === 'string' ? b.session_id.slice(0, 40) : '',
    country: c.req.header('CF-IPCountry') ?? '',
    device: ['desktop', 'mobile', 'tablet'].includes(String(dims.device)) ? String(dims.device) : '',
    browser: cleanDim(dims.browser),
    os: cleanDim(dims.os),
    lang: typeof b.lang === 'string' ? b.lang.slice(0, 12) : '',
    screen: typeof b.screen === 'string' ? b.screen.slice(0, 12) : '',
    referrer: refHost,
    extra,
  });
  return c.body(null, 204);
});

// 自助建票：Turnstile + 每 IP 每日限额 + 默认不收录（unlisted）
const PUBLIC_DAILY_LIMIT = 5;

api.post('/api/public/polls', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
  if (c.env.RL) {
    try {
      const rl = await c.env.RL.limit({ key: 'public-create:' + ip });
      if (!rl.success) return c.json({ error: 'too_many_requests' }, 429);
    } catch {
      // 限流不可用时仍有每日限额兜底
    }
  }

  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'bad_request' }, 400);

  if (c.env.TURNSTILE_SECRET_KEY) {
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, token, ip))) {
      return c.json({ error: 'captcha_failed' }, 400);
    }
  }

  const creatorHash = await hmacHex(c.env.SERVER_SALT, 'creator|' + ip);
  if ((await countRecentByCreator(c.env.DB, creatorHash)) >= PUBLIC_DAILY_LIMIT) {
    return c.json({ error: 'daily_limit' }, 429);
  }

  const parsed = parsePollInput(body, { allowExtraKeys: false });
  if (parsed.error || !parsed.input) return c.json({ error: parsed.error ?? 'bad_request' }, 400);
  parsed.input.visibility = 'unlisted';
  parsed.input.creatorHash = creatorHash;

  try {
    const id = await createPoll(c.env.DB, parsed.input);
    return c.json({ ok: true, id });
  } catch {
    return c.json({ error: 'level_too_deep' }, 400);
  }
});

// App 发现接口：按 应用×渠道 拉取进行中的投票（供 App 内提示横幅使用）
// app / channel 均为部署方自定义标签（BeeCount 预设渠道：appstore / ipa / apk / googleplay）
api.get('/api/app/polls', async (c) => {
  const app = (c.req.query('app') ?? '').trim().toLowerCase();
  const channel = (c.req.query('channel') ?? '').trim().toLowerCase();
  if ((app && !/^[a-z0-9_-]{1,32}$/.test(app)) || (channel && !/^[a-z0-9_-]{1,32}$/.test(channel))) {
    return c.json({ error: 'bad_request' }, 400);
  }
  const limit = clampInt(c.req.query('limit'), 1, 50, 10);
  const offset = clampInt(c.req.query('offset'), 0, 100000, 0);
  const rows = await listForAppFeed(c.env.DB, app, channel, limit, offset);
  const origin = new URL(c.req.url).origin;
  const polls = rows.map((p) => {
    let url = `${origin}/p/${p.id}?src=app`;
    if (app) url += '&app=' + encodeURIComponent(app);
    if (channel) url += '&channel=' + encodeURIComponent(channel);
    if (p.accent) url += '&accent=' + p.accent.replace('#', '');
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      url,
      closeAt: p.close_at ?? undefined,
      accent: p.accent || undefined,
    };
  });
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ app: app || undefined, channel: channel || undefined, polls });
});
