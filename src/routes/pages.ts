import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, PollRow } from '../types';
import { esc, fmtDate, isClosed, jsonForScript } from '../lib/util';
import { layout, notFoundBody } from '../lib/html';
import {
  buildResults, getOptionsByQuestionIds, getPoll, getQuestions, hasResponded, listOpenPolls,
} from '../lib/db';
import type { ResultsPayload } from '../lib/db';
import { ensureVid, voterHash } from '../lib/identity';

export const pages = new Hono<{ Bindings: Env }>();

pages.get('/', async (c) => {
  ensureVid(c);
  const polls = await listOpenPolls(c.env.DB);
  const cards = polls.map((p) => `
  <a class="vp-card" href="/p/${p.id}">
    <h2 class="vp-card-title">${esc(p.title)}</h2>
    ${p.description ? `<p class="vp-card-desc">${esc(p.description)}</p>` : ''}
    <p class="vp-card-meta">${p.response_count} 人参与${p.close_at ? ` · ${fmtDate(p.close_at)} 截止` : ' · 进行中'}</p>
  </a>`).join('');
  const body = `<div class="vp-home">
  <h1 class="vp-home-title">进行中的调研</h1>
  ${cards || '<p class="vp-empty">暂无进行中的调研</p>'}
</div>`;
  return c.html(layout({ title: '众声 VoxPop · 大家的投票站', body }));
});

pages.get('/p/:id', (c) => renderPollPage(c, c.req.param('id'), false));
pages.get('/embed/:id', (c) => renderPollPage(c, c.req.param('id'), true));

async function renderPollPage(c: Context<{ Bindings: Env }>, id: string, embed: boolean): Promise<Response> {
  const poll = await getPoll(c.env.DB, id);
  if (!poll || poll.status === 'draft') {
    return c.html(layout({ title: '404 · 众声 VoxPop', body: notFoundBody() }), 404);
  }
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

  const payload = {
    mode: showResults ? 'results' : 'form',
    closed,
    hasVoted,
    poll: { id: poll.id, title: poll.title },
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
  };

  const head = turnstileSiteKey
    ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : '';
  const body = `<div class="vp-poll">
  <h1 class="vp-title">${esc(poll.title)}</h1>
  ${poll.description ? `<p class="vp-desc">${esc(poll.description)}</p>` : ''}
  <div id="vp-root"><noscript><p class="vp-muted">需要启用 JavaScript 才能参与。</p></noscript></div>
</div>
<script type="application/json" id="vp-data">${jsonForScript(payload)}</script>`;
  return c.html(layout({
    title: `${poll.title} · 众声 VoxPop`,
    description: poll.description || poll.title,
    body, head, embed,
  }));
}
