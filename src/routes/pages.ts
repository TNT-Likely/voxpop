import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env, PollRow } from '../types';
import { esc, fmtDate, isClosed, jsonForScript } from '../lib/util';
import { layout, notFoundBody } from '../lib/html';
import { dictFor, detectLocale, t, type Locale } from '../lib/i18n';
import {
  buildResults, getOptionsByQuestionIds, getPoll, getQuestions, hasResponded, listOpenPolls,
} from '../lib/db';
import type { ResultsPayload } from '../lib/db';
import { ensureVid, voterHash } from '../lib/identity';

export const pages = new Hono<{ Bindings: Env }>();

/** 语言判定 + Cookie 记忆（?lang= 显式切换时写入） */
export function localeOf(c: Context<{ Bindings: Env }>): Locale {
  const param = c.req.query('lang');
  const loc = detectLocale(param, getCookie(c, 'vp_lang'), c.req.header('Accept-Language'));
  if (param === 'en' || param === 'zh') {
    setCookie(c, 'vp_lang', loc, { path: '/', maxAge: 31536000, sameSite: 'Lax', secure: true });
  }
  return loc;
}

/** 主题色：URL 参数优先（嵌入换肤），其次问卷自身配置 */
export function accentOf(c: Context<{ Bindings: Env }>, poll?: PollRow): string {
  const q = (c.req.query('accent') ?? '').replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(q)) return '#' + q.toLowerCase();
  const stored = (poll?.accent ?? '').replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(stored) ? '#' + stored.toLowerCase() : '';
}

function curPath(c: Context<{ Bindings: Env }>): string {
  const u = new URL(c.req.url);
  return u.pathname + u.search;
}

pages.get('/', async (c) => {
  const loc = localeOf(c);
  ensureVid(c);
  const polls = await listOpenPolls(c.env.DB);
  const cards = polls.map((p) => `
  <a class="vp-card" href="/p/${p.id}">
    <h2 class="vp-card-title">${esc(p.title)}</h2>
    ${p.description ? `<p class="vp-card-desc">${esc(p.description)}</p>` : ''}
    <p class="vp-card-meta">${esc(t(loc, 'participants', { n: p.response_count }))} · ${p.close_at ? esc(t(loc, 'closingOn', { date: fmtDate(p.close_at) })) : esc(t(loc, 'ongoing'))}</p>
  </a>`).join('');
  const body = `<h1 class="vp-home-title">${esc(t(loc, 'ongoingTitle'))}</h1>
  <div class="vp-home">
  ${cards || `<p class="vp-empty">${esc(t(loc, 'emptyHome'))}</p>`}
  </div>`;
  return c.html(layout({ title: `众声 VoxPop · ${t(loc, 'tagline')}`, body, locale: loc, path: curPath(c) }));
});

pages.get('/p/:id', (c) => renderPollPage(c, c.req.param('id'), false));
pages.get('/embed/:id', (c) => renderPollPage(c, c.req.param('id'), true));

async function renderPollPage(c: Context<{ Bindings: Env }>, id: string, embed: boolean): Promise<Response> {
  const poll = await getPoll(c.env.DB, id);
  if (!poll || poll.status === 'draft') {
    const loc = localeOf(c);
    return c.html(layout({ title: '404 · 众声 VoxPop', body: notFoundBody(loc), locale: loc, path: curPath(c) }), 404);
  }
  const loc = localeOf(c);
  ensureVid(c); // 为后续访问签发访客 Cookie
  const cookieVid = getCookie(c, 'vp_vid') ?? '';
  const ip = c.req.header('CF-Connecting-IP') ?? '';
  const ua = c.req.header('User-Agent') ?? '';
  const vh = await voterHash(c.env, poll, cookieVid, ip, ua);
  const hasVoted = poll.dedup_mode !== 'open' ? await hasResponded(c.env.DB, poll.id, vh) : false;
  const closed = isClosed(poll);

  // 结果可见性：截止后全部可见；进行中按策略
  let showResults: boolean;
  if (closed) showResults = true;
  else if (hasVoted) showResults = poll.result_policy !== 'after_close';
  else showResults = poll.result_policy === 'always';

  let results: ResultsPayload | null = null;
  if (showResults) results = await buildResults(c.env.DB, poll, false);

  const questions = await getQuestions(c.env.DB, poll.id);
  const optionsMap = await getOptionsByQuestionIds(c.env.DB, questions.map((q) => q.id));
  const turnstileSiteKey =
    c.env.TURNSTILE_SITE_KEY && c.env.TURNSTILE_SECRET_KEY ? c.env.TURNSTILE_SITE_KEY : null;
  const accent = accentOf(c, poll);

  const payload = {
    mode: showResults ? 'results' : 'form',
    closed,
    hasVoted,
    poll: { id: poll.id, title: poll.title, link: new URL(c.req.url).origin + '/p/' + poll.id },
    questions: questions.map((q) => ({
      id: q.id, type: q.type, title: q.title,
      required: !!q.required, maxChoices: q.max_choices, maxLen: q.max_len,
    })),
    options: Object.fromEntries(
      [...optionsMap.entries()].map(([qid, list]) => [
        qid, list.map((o) => ({ id: o.id, parentId: o.parent_id, label: o.label, sort: o.sort })),
      ])
    ),
    turnstileSiteKey,
    results,
    accent,
  };

  const head =
    (turnstileSiteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : '') +
    '<script src="/assets/vendor/qrcode.min.js" defer></script>';
  const body = `<div class="vp-poll">
  <h1 class="vp-title">${esc(poll.title)}</h1>
  ${poll.description ? `<p class="vp-desc">${esc(poll.description)}</p>` : ''}
  <div id="vp-root"><noscript><p class="vp-muted">${esc(t(loc, 'needJs'))}</p></noscript></div>
</div>
<script type="application/json" id="vp-data">${jsonForScript(payload)}</script>`;
  return c.html(layout({
    title: `${poll.title} · 众声 VoxPop`,
    description: poll.description || poll.title,
    body, head, embed, locale: loc, accent, path: curPath(c),
  }));
}

/* ---------- 新建问卷表单（后台与自助建票共用） ---------- */

export function newPollFormBody(loc: Locale, isAdmin: boolean): string {
  return `
  <div class="vp-field"><label>${esc(t(loc, 'pollTitleLabel'))}</label><input id="f-title" maxlength="80" placeholder="${esc(t(loc, 'pollTitlePlaceholder'))}"></div>
  <div class="vp-field"><label>${esc(t(loc, 'descLabel'))}</label><input id="f-desc" maxlength="300"></div>
  <div class="vp-field-row">
    <div class="vp-field"><label>${esc(t(loc, 'dedupLabel'))}</label>
      <select id="f-dedup">
        <option value="device">${esc(t(loc, 'dedupDevice'))}</option>
        <option value="ip">${esc(t(loc, 'dedupIp'))}</option>
        <option value="open">${esc(t(loc, 'dedupOpen'))}</option>
      </select></div>
    <div class="vp-field"><label>${esc(t(loc, 'policyLabel'))}</label>
      <select id="f-policy">
        <option value="after_vote">${esc(t(loc, 'policyAfterVote'))}</option>
        <option value="always">${esc(t(loc, 'policyAlways'))}</option>
        <option value="after_close">${esc(t(loc, 'policyAfterClose'))}</option>
      </select></div>
    <div class="vp-field"><label>${esc(t(loc, 'closeDaysLabel'))}</label><input id="f-close-days" type="number" min="1" max="365"></div>
    <div class="vp-field"><label>${esc(t(loc, 'accentCreateLabel'))}</label><input id="f-accent" maxlength="7" placeholder="#f8c91c"></div>
  </div>
  ${isAdmin ? `
  <div class="vp-field"><label>${esc(t(loc, 'extraKeysLabel'))}</label><input id="f-extra-keys" maxlength="200" placeholder="src,app_ver,platform"></div>
  <div class="vp-field"><label>${esc(t(loc, 'appsLabel'))}</label><input id="f-apps" maxlength="200" placeholder="beecount, panwatch"></div>
  <div class="vp-field"><label>${esc(t(loc, 'channelsLabel'))}</label><input id="f-channels" maxlength="200" placeholder="appstore, ipa, apk, googleplay"></div>` : ''}
  <h2 class="vp-section">${esc(t(loc, 'questionsTitle'))}</h2>
  <div id="vp-questions"></div>
  <button type="button" id="vp-add-question" class="vp-btn ghost">${esc(t(loc, 'addQuestion'))}</button>
  <div class="vp-actions-bar"><button type="button" id="vp-create" class="vp-btn">${esc(t(loc, 'createBtn'))}</button></div>`;
}

/* ---------- 公共建票页 ---------- */

pages.get('/new', (c) => {
  const loc = localeOf(c);
  ensureVid(c);
  const turnstile = c.env.TURNSTILE_SITE_KEY && c.env.TURNSTILE_SECRET_KEY ? c.env.TURNSTILE_SITE_KEY : null;
  const head = turnstile ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : '';
  const body = `<div class="vp-page">
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(t(loc, 'publicNewTitle'))}</h1>
    <a class="vp-link" href="/">${esc(t(loc, 'home'))}</a>
  </div>
  <p class="vp-banner">${esc(t(loc, 'unlistedNotice'))}</p>
  <p class="vp-banner">${esc(t(loc, 'contentNotice'))}</p>
  ${newPollFormBody(loc, false)}
  ${turnstile ? `<div class="cf-turnstile vp-turnstile" data-sitekey="${esc(turnstile)}"></div>` : ''}
</div>
<script src="/assets/admin.js" defer></script>`;
  return c.html(layout({
    title: `${t(loc, 'publicNewTitle')} · 众声 VoxPop`,
    body, locale: loc, path: curPath(c), createEndpoint: '/api/public/polls', head,
  }));
});

// 兼容旧引用
export { dictFor };
