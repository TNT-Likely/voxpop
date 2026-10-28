import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env, PollRow } from '../types';
import { esc, fmtDate, hmacHex, isClosed, jsonForScript, nowSec } from '../lib/util';
import { layout, notFoundBody } from '../lib/html';
import { t } from '../lib/i18n';
import { parsePollInput } from '../lib/parse';
import { runDailyRollup } from '../lib/cron';
import {
  adminListPolls, buildResults, createPoll, deletePoll, exportPoll, getDailySeries, getPoll,
  getPollPageviews, setPollApps, setPollChannels, setPollStatus, setPollVisibility, setPollAccent,
} from '../lib/db';
import type { DailyPoint, ResultsPayload } from '../lib/db';
import { localeOf, newPollFormBody } from './pages';

export const admin = new Hono<{ Bindings: Env }>();

/* ---------- 登录态 ---------- */

async function makeAdminToken(salt: string): Promise<string> {
  const exp = nowSec() + 7 * 86400;
  return `${exp}.${await hmacHex(salt, 'admin|' + exp)}`;
}

async function isAdmin(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const tok = getCookie(c, 'vp_admin');
  if (!tok) return false;
  const dot = tok.indexOf('.');
  if (dot < 1) return false;
  const exp = parseInt(tok.slice(0, dot), 10);
  if (!Number.isFinite(exp) || exp < nowSec()) return false;
  const sig = tok.slice(dot + 1);
  return sig === (await hmacHex(c.env.SERVER_SALT, 'admin|' + exp));
}

/* ---------- 登录 / 登出 ---------- */

admin.get('/admin', async (c) => {
  const loc = localeOf(c);
  if (!(await isAdmin(c))) {
    return c.html(layout({ title: `${t(loc, 'adminTitle')} · 众声 VoxPop`, body: loginFormRaw(loc, ''), locale: loc, path: c.req.path }));
  }
  const polls = await adminListPolls(c.env.DB);
  return c.html(layout({ title: `${t(loc, 'adminTitle')} · 众声 VoxPop`, body: dashboardHtml(loc, polls), locale: loc, path: c.req.path }));
});

admin.post('/admin/login', async (c) => {
  const loc = localeOf(c);
  const form = await c.req.parseBody();
  const password = String(form['password'] ?? '');
  if (!password || password !== c.env.ADMIN_KEY) {
    return c.html(
      layout({ title: `${t(loc, 'adminTitle')} · 众声 VoxPop`, body: loginFormRaw(loc, t(loc, 'wrongKey')), locale: loc, path: c.req.path }),
      401
    );
  }
  setCookie(c, 'vp_admin', await makeAdminToken(c.env.SERVER_SALT), {
    path: '/', maxAge: 7 * 86400, httpOnly: true, sameSite: 'Strict', secure: true,
  });
  return c.redirect('/admin');
});

admin.post('/admin/logout', (c) => {
  deleteCookie(c, 'vp_admin', { path: '/' });
  return c.redirect('/admin');
});

/* ---------- 新建问卷 ---------- */

admin.get('/admin/new', async (c) => {
  const loc = localeOf(c);
  if (!(await isAdmin(c))) return c.redirect('/admin');
  const body = `
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(t(loc, 'createTitle'))}</h1>
    <a class="vp-link" href="/admin">${esc(t(loc, 'backToList'))}</a>
  </div>
  ${newPollFormBody(loc, true)}
  <script src="/assets/admin.js" defer></script>`;
  return c.html(layout({
    title: `${t(loc, 'createTitle')} · 众声 VoxPop`,
    body, locale: loc, path: c.req.path, createEndpoint: '/api/admin/polls',
  }));
});

admin.post('/api/admin/polls', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'unauthorized' }, 401);
  const raw = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!raw) return c.json({ error: 'bad_request' }, 400);
  const parsed = parsePollInput(raw, { allowExtraKeys: true });
  if (parsed.error || !parsed.input) return c.json({ error: parsed.error ?? 'bad_request' }, 400);
  try {
    const id = await createPoll(c.env.DB, parsed.input);
    return c.json({ ok: true, id });
  } catch {
    return c.json({ error: 'level_too_deep' }, 400);
  }
});

/* ---------- 状态 / 删除 / 导出 / Cron ---------- */

admin.post('/admin/polls/:id/open', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  await setPollStatus(c.env.DB, c.req.param('id'), 'open');
  return c.redirect('/admin');
});

admin.post('/admin/polls/:id/close', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  await setPollStatus(c.env.DB, c.req.param('id'), 'closed');
  return c.redirect(`/admin/p/${c.req.param('id')}`);
});

admin.post('/admin/polls/:id/delete', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  await deletePoll(c.env.DB, c.req.param('id'));
  return c.redirect('/admin');
});

admin.post('/admin/polls/:id/list', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  await setPollVisibility(c.env.DB, c.req.param('id'), 'listed');
  return c.redirect('/admin');
});

admin.post('/admin/polls/:id/unlist', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  await setPollVisibility(c.env.DB, c.req.param('id'), 'unlisted');
  return c.redirect('/admin');
});

admin.post('/admin/polls/:id/meta', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  const form = await c.req.parseBody();
  const accent = String(form['accent'] ?? '').replace('#', '');
  if (/^[0-9a-fA-F]{6}$/i.test(accent)) {
    await setPollAccent(c.env.DB, c.req.param('id'), '#' + accent.toLowerCase());
  } else if (accent === '') {
    await setPollAccent(c.env.DB, c.req.param('id'), '');
  }
  await setPollChannels(c.env.DB, c.req.param('id'), sanitizeTags(String(form['channels'] ?? '')));
  await setPollApps(c.env.DB, c.req.param('id'), sanitizeTags(String(form['apps'] ?? '')));
  return c.redirect(`/admin/p/${c.req.param('id')}`);
});

function sanitizeTags(input: string): string {
  return input
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => /^[a-z0-9_-]{1,32}$/.test(tag))
    .filter((tag, i, arr) => arr.indexOf(tag) === i)
    .slice(0, 8)
    .join(',');
}

admin.get('/admin/polls/:id/export', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'unauthorized' }, 401);
  const data = await exportPoll(c.env.DB, c.req.param('id'));
  if (!data) return c.json({ error: 'poll_not_found' }, 404);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="voxpop-${c.req.param('id')}.json"`,
    },
  });
});

// 手动触发一次日聚合（也用于部署后的首次回填与验证）
admin.post('/admin/cron/run', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'unauthorized' }, 401);
  const r = await runDailyRollup(c.env);
  return c.json({ ok: true, ...r });
});

async function adminGuard(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  if (await isAdmin(c)) return null;
  return c.json({ error: 'unauthorized' }, 401);
}

/* ---------- 结果详情 ---------- */

admin.get('/admin/p/:id', async (c) => {
  const loc = localeOf(c);
  if (!(await isAdmin(c))) return c.redirect('/admin');
  const poll = await getPoll(c.env.DB, c.req.param('id'));
  if (!poll) return c.html(layout({ title: '404 · 众声 VoxPop', body: notFoundBody(loc), locale: loc, path: c.req.path }), 404);
  const results = await buildResults(c.env.DB, poll, true);
  const [trend, pv] = await Promise.all([
    getDailySeries(c.env.DB, poll.id),
    getPollPageviews(c.env.DB, poll.id),
  ]);
  const origin = new URL(c.req.url).origin;
  return c.html(layout({
    title: `${t(loc, 'resultsTitle', { n: results.total, m: pv })} · 众声 VoxPop`,
    body: detailHtml(loc, poll, results, origin, trend, pv),
    locale: loc,
    path: c.req.path,
    accent: poll.accent,
    head: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4" defer></script><script src="/assets/admin-results.js" defer></script>',
  }));
});

interface OptNode { id: string; label: string; count: number; children: OptNode[] }

function typeLabel(loc: Parameters<typeof t>[0], type: string): string {
  const map: Record<string, string> = { single: 'typeSingle', multi: 'typeMulti', cascade: 'typeCascade', text: 'typeText' };
  return t(loc, map[type] ?? type);
}

function detailHtml(
  loc: Parameters<typeof t>[0],
  poll: PollRow,
  results: ResultsPayload,
  origin: string,
  trend: DailyPoint[],
  pv: number
): string {
  const closed = isClosed(poll);
  const badge = poll.status === 'closed' ? t(loc, 'statusClosed') : closed ? t(loc, 'statusExpired') : t(loc, 'statusOpen');
  const link = `${origin}/p/${poll.id}`;
  const embedCode = `<script src="${origin}/embed.js"></script>\n<div class="voxpop-poll" data-poll="${poll.id}"></div>`;

  let qs = '';
  for (const qRaw of results.questions) {
    const q = qRaw as {
      id: string; type: string; title: string; required: boolean;
      answerCount?: number; texts?: unknown; options?: OptNode[];
    };
    qs += `<section class="vp-admin-q"><h3>${esc(q.title)} <small class="vp-chip">${esc(typeLabel(loc, q.type))}${q.required ? '' : esc(t(loc, 'optionalPostfix'))}</small></h3>`;
    if (q.type === 'text') {
      qs += `<p class="vp-muted">${esc(t(loc, 'supplementCount', { n: q.answerCount ?? 0 }))}</p><ul class="vp-texts">`;
      for (const txt of (q.texts ?? []) as { text: string; ts: number }[]) {
        qs += `<li>${esc(txt.text)} <small>${fmtDate(txt.ts)}</small></li>`;
      }
      qs += '</ul>';
    } else {
      const flat: { o: OptNode; depth: number }[] = [];
      const walk = (list: OptNode[], depth: number) => {
        for (const o of list) {
          flat.push({ o, depth });
          walk(o.children ?? [], depth + 1);
        }
      };
      walk(q.options ?? [], 0);
      const sum = flat.reduce((acc, x) => acc + x.o.count, 0) || 1;
      for (const x of flat) {
        const pct = Math.round((x.o.count * 100) / sum);
        qs += `<div class="vp-row"><span class="vp-row-label" style="padding-left:${x.depth * 16}px">${esc(x.o.label)}</span><span class="vp-bar"><span class="vp-bar-fill" style="width:${pct}%"></span></span><span class="vp-row-num">${x.o.count} · ${pct}%</span></div>`;
      }
    }
    qs += '</section>';
  }

  const bdPairs = [['device', 'device'], ['browser', 'browser'], ['os', 'os'], ['country', 'country']] as const;
  let bd = '';
  for (const [key, labelKey] of bdPairs) {
    const entries = Object.entries(results.breakdown[key] ?? {});
    if (entries.length === 0) continue;
    bd += `<div class="vp-bd"><h4>${esc(t(loc, labelKey))}</h4>${entries
      .map(([k, v]) => `<span class="vp-chip">${esc(k || t(loc, 'unknown'))} · ${v}</span>`)
      .join('')}</div>`;
  }

  const hasChartData = results.total > 0 || trend.some((x) => x.responses > 0 || x.pageviews > 0);
  const charts = hasChartData ? `
  <h2 class="vp-section">${esc(t(loc, 'trendTitle'))}</h2>
  <div class="vp-chart-wide"><canvas id="vp-trend" height="110"></canvas></div>
  <h2 class="vp-section">${esc(t(loc, 'composition'))}</h2>
  <div class="vp-charts">
    <div class="vp-chart-box"><h4>${esc(t(loc, 'device'))}</h4><canvas id="vp-ch-device"></canvas></div>
    <div class="vp-chart-box"><h4>${esc(t(loc, 'browser'))}</h4><canvas id="vp-ch-browser"></canvas></div>
    <div class="vp-chart-box"><h4>${esc(t(loc, 'os'))}</h4><canvas id="vp-ch-os"></canvas></div>
    <div class="vp-chart-box"><h4>${esc(t(loc, 'country'))}</h4><canvas id="vp-ch-country"></canvas></div>
  </div>
  <script type="application/json" id="vp-chart-data">${jsonForScript({ trend, breakdown: results.breakdown })}</script>` : '';

  const visibilityForm = poll.visibility === 'listed'
    ? `<form method="post" action="/admin/polls/${poll.id}/unlist" class="inline"><button class="vp-btn ghost small">${esc(t(loc, 'listOff'))}</button></form>`
    : `<form method="post" action="/admin/polls/${poll.id}/list" class="inline"><button class="vp-btn ghost small">${esc(t(loc, 'listOn'))}</button></form>`;

  return `
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(poll.title)}</h1>
    <span class="vp-badge ${closed ? 'off' : 'on'}">${esc(badge)}</span>
  </div>
  <p class="vp-meta">ID <code>${poll.id}</code> · ${esc(t(loc, 'thCreated'))} ${fmtDate(poll.created_at)}${poll.close_at ? ` · ${esc(t(loc, 'closingOn', { date: fmtDate(poll.close_at) }))}` : ''} · ${esc(t(loc, poll.visibility === 'listed' ? 'listedBadge' : 'unlistedBadge'))}${poll.apps ? ` · app: ${esc(poll.apps)}` : ''}${poll.channels ? ` · ${esc(t(loc, 'channelsLabel'))}: ${esc(poll.channels)}` : ''}${poll.extra_keys ? ` · ${esc(poll.extra_keys)}` : ''}</p>
  <div class="vp-admin-actions">
    <a class="vp-btn ghost" href="/p/${poll.id}" target="_blank" rel="noopener">${esc(t(loc, 'viewPage'))}</a>
    <a class="vp-btn ghost" href="/admin/polls/${poll.id}/export">${esc(t(loc, 'exportJson'))}</a>
    <form method="post" action="/admin/polls/${poll.id}/${poll.status === 'open' ? 'close' : 'open'}" class="inline"><button class="vp-btn ghost">${esc(t(loc, poll.status === 'open' ? 'close' : 'reopen'))}</button></form>
    ${visibilityForm}
    <form method="post" action="/admin/polls/${poll.id}/delete" class="inline" onsubmit="return confirm('${esc(t(loc, 'confirmDelete'))}')"><button class="vp-btn danger">${esc(t(loc, 'delete'))}</button></form>
  </div>
  <div class="vp-field-row">
    <div class="vp-field" style="flex:2 1 260px"><label>${esc(t(loc, 'publicLink'))}</label><input readonly value="${esc(link)}" onclick="this.select()"></div>
  </div>
  <form method="post" action="/admin/polls/${poll.id}/meta" class="vp-meta-form">
    <div class="vp-field-row">
      <div class="vp-field" style="flex:0 1 140px"><label>${esc(t(loc, 'accentLabel'))}</label>
        <input type="color" name="accent" value="${esc(poll.accent || '#f8c91c')}">
      </div>
      <div class="vp-field" style="flex:1 1 200px"><label>${esc(t(loc, 'channelsLabel'))}</label>
        <input name="channels" value="${esc(poll.channels)}" placeholder="appstore, ipa, apk, googleplay">
      </div>
      <div class="vp-field" style="flex:1 1 200px"><label>${esc(t(loc, 'appsLabel'))}</label>
        <input name="apps" value="${esc(poll.apps)}" placeholder="beecount, panwatch">
      </div>
      <div class="vp-field" style="flex:0 0 auto; align-self: flex-end;"><button class="vp-btn ghost small">${esc(t(loc, 'setAccent'))}</button></div>
    </div>
  </form>
  <div class="vp-field"><label>${esc(t(loc, 'embedCode'))}</label><textarea readonly rows="3" onclick="this.select()">${esc(embedCode)}</textarea></div>
  <h2 class="vp-section">${esc(t(loc, 'resultsTitle', { n: results.total, m: pv }))}</h2>
  ${qs || `<p class="vp-muted">${esc(t(loc, 'noResponses'))}</p>`}
  <h2 class="vp-section">${esc(t(loc, 'composition'))}</h2>
  ${bd || `<p class="vp-muted">${esc(t(loc, 'noData'))}</p>`}
  ${charts}
  <p class="vp-muted" style="margin-top:24px"><a href="/admin">← ${esc(t(loc, 'backToList'))}</a></p>`;
}

function dashboardHtml(loc: Parameters<typeof t>[0], polls: (PollRow & { response_count: number })[]): string {
  const rows = polls.map((p) => {
    const closed = isClosed(p);
    const badge = p.status === 'closed' ? t(loc, 'statusClosed') : closed ? t(loc, 'statusExpired') : t(loc, 'statusOpen');
    const action = p.status === 'open' ? 'close' : 'open';
    const actionLabel = p.status === 'open' ? t(loc, 'close') : t(loc, 'reopen');
    const visLabel = t(loc, p.visibility === 'listed' ? 'listedBadge' : 'unlistedBadge');
    const visAction = p.visibility === 'listed' ? 'unlist' : 'list';
    const visActionLabel = p.visibility === 'listed' ? t(loc, 'listOff') : t(loc, 'listOn');
    return `<tr>
    <td><a href="/admin/p/${p.id}">${esc(p.title)}</a></td>
    <td><code>${p.id}</code></td>
    <td><span class="vp-badge ${closed ? 'off' : 'on'}">${esc(badge)}</span> <span class="vp-badge ${p.visibility === 'listed' ? 'on' : 'off'}">${esc(visLabel)}</span></td>
    <td>${p.response_count}</td>
    <td>${fmtDate(p.created_at)}</td>
    <td class="vp-actions">
      <form method="post" action="/admin/polls/${p.id}/${action}" class="inline"><button class="vp-btn ghost small">${esc(actionLabel)}</button></form>
      <form method="post" action="/admin/polls/${p.id}/${visAction}" class="inline"><button class="vp-btn ghost small">${esc(visActionLabel)}</button></form>
      <form method="post" action="/admin/polls/${p.id}/delete" class="inline" onsubmit="return confirm('${esc(t(loc, 'confirmDelete'))}')"><button class="vp-btn danger small">${esc(t(loc, 'delete'))}</button></form>
    </td>
  </tr>`;
  }).join('');
  return `
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(t(loc, 'adminTitle'))}</h1>
    <div>
      <a class="vp-btn" href="/admin/new">${esc(t(loc, 'newPoll'))}</a>
      <form method="post" action="/admin/logout" class="inline"><button class="vp-btn ghost">${esc(t(loc, 'logout'))}</button></form>
    </div>
  </div>
  ${polls.length
    ? `<div class="vp-table-wrap"><table class="vp-table"><thead><tr><th>${esc(t(loc, 'thTitle'))}</th><th>ID</th><th>${esc(t(loc, 'thStatus'))}</th><th>${esc(t(loc, 'thResponses'))}</th><th>${esc(t(loc, 'thCreated'))}</th><th>${esc(t(loc, 'thActions'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="vp-empty">${esc(t(loc, 'noPolls'))}</p>`}`;
}

function loginFormRaw(loc: Parameters<typeof t>[0], error: string): string {
  return `<div class="vp-login">
  <h1>${esc(t(loc, 'adminTitle'))}</h1>
  ${error ? `<p class="vp-error">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login">
    <div class="vp-field"><label>${esc(t(loc, 'adminKeyLabel'))}</label><input type="password" name="password" autofocus autocomplete="current-password"></div>
    <button class="vp-btn">${esc(t(loc, 'loginBtn'))}</button>
  </form>
</div>`;
}
