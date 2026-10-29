import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../types';
import { esc, hmacHex, nowSec } from '../lib/util';
import { layout, notFoundBody } from '../lib/html';
import { t } from '../lib/i18n';
import { parsePollInput } from '../lib/parse';
import { runDailyRollup } from '../lib/cron';
import {
  addRegistry, adminListPolls, buildResults, createPoll, deletePoll, deleteRegistry, exportPoll,
  exportPollCsv, getCrossAnalysis, getDailySeries, getPoll, getPollPageviews, listRegistry,
  registryNameMaps, setPollApps, setPollChannels, setPollStatus, setPollTitleEn,
  setPollVisibility, setPollAccent,
} from '../lib/db';
import { localeOf, newPollFormBody } from './pages';
import { detailHtml, dashboardHtml, loginFormRaw, registryHtml, sanitizeTags } from './admin-views';

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
  const ip = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
  if (c.env.RL_LOGIN) {
    try {
      const rl = await c.env.RL_LOGIN.limit({ key: 'login:' + ip });
      if (!rl.success) {
        return c.html(
          layout({ title: `${t(loc, 'adminTitle')} · 众声 VoxPop`, body: loginFormRaw(loc, t(loc, 'tooManyRequests')), locale: loc, path: c.req.path }),
          429
        );
      }
    } catch {
      // 限流不可用时放行
    }
  }
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
  const registry = { apps: await listRegistry(c.env.DB, 'app'), channels: await listRegistry(c.env.DB, 'channel') };
  const body = `
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(t(loc, 'createTitle'))}</h1>
    <a class="vp-link" href="/admin">${esc(t(loc, 'backToList'))}</a>
  </div>
  ${newPollFormBody(loc, true, registry)}
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
  } catch (e) {
    console.error('voxpop createPoll failed:', e);
    return c.json({ error: 'level_too_deep' }, 400);
  }
});

/* ---------- 标签注册表维护 ---------- */

admin.get('/admin/registry', async (c) => {
  const loc = localeOf(c);
  if (!(await isAdmin(c))) return c.redirect('/admin');
  const apps = await listRegistry(c.env.DB, 'app');
  const channels = await listRegistry(c.env.DB, 'channel');
  return c.html(layout({ title: `${t(loc, 'registryTitle')} · 众声 VoxPop`, body: registryHtml(loc, apps, channels), locale: loc, path: c.req.path }));
});

admin.post('/admin/registry/add', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  const form = await c.req.parseBody();
  const kind = String(form['kind'] ?? '');
  const slug = String(form['slug'] ?? '').trim().toLowerCase();
  const name = String(form['name'] ?? '').trim().slice(0, 32);
  if ((kind === 'app' || kind === 'channel') && /^[a-z0-9_-]{1,32}$/.test(slug) && name) {
    await addRegistry(c.env.DB, kind, slug, name);
  }
  return c.redirect('/admin/registry');
});

admin.post('/admin/registry/delete', async (c) => {
  if (await adminGuard(c)) return c.redirect('/admin');
  const form = await c.req.parseBody();
  const kind = String(form['kind'] ?? '');
  const slug = String(form['slug'] ?? '').trim().toLowerCase();
  if ((kind === 'app' || kind === 'channel') && /^[a-z0-9_-]{1,32}$/.test(slug)) {
    await deleteRegistry(c.env.DB, kind, slug);
  }
  return c.redirect('/admin/registry');
});

/* ---------- 状态 / 删除 / 收录 / 发布设置 / 导出 / Cron ---------- */

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
  const asList = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map(String);
  const accent = String(form['accent'] ?? '').replace('#', '');
  if (/^[0-9a-fA-F]{6}$/i.test(accent)) {
    await setPollAccent(c.env.DB, c.req.param('id'), '#' + accent.toLowerCase());
  } else if (accent === '') {
    await setPollAccent(c.env.DB, c.req.param('id'), '');
  }
  await setPollChannels(c.env.DB, c.req.param('id'), sanitizeTags(asList(form['channels']).join(',')));
  await setPollApps(c.env.DB, c.req.param('id'), sanitizeTags(asList(form['apps']).join(',')));
  const titleEn = String(form['titleEn'] ?? '').trim();
  if (titleEn.length <= 80) await setPollTitleEn(c.env.DB, c.req.param('id'), titleEn);
  return c.redirect(`/admin/p/${c.req.param('id')}`);
});

admin.get('/admin/polls/:id/export', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (c.req.query('format') === 'csv') {
    const csv = await exportPollCsv(c.env.DB, id);
    if (csv == null) return c.json({ error: 'poll_not_found' }, 404);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="voxpop-${id}.csv"`,
      },
    });
  }
  const data = await exportPoll(c.env.DB, id);
  if (!data) return c.json({ error: 'poll_not_found' }, 404);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="voxpop-${id}.json"`,
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
  const [trend, pv, reg, regLists, crossData] = await Promise.all([
    getDailySeries(c.env.DB, poll.id),
    getPollPageviews(c.env.DB, poll.id),
    registryNameMaps(c.env.DB),
    Promise.all([listRegistry(c.env.DB, 'app'), listRegistry(c.env.DB, 'channel')]).then(([apps, channels]) => ({ apps, channels })),
    getCrossAnalysis(c.env.DB, poll),
  ]);
  const origin = new URL(c.req.url).origin;
  return c.html(layout({
    title: `${t(loc, 'resultsTitle', { n: results.total, m: pv })} · 众声 VoxPop`,
    body: detailHtml(loc, poll, results, origin, trend, pv, reg, regLists, crossData),
    locale: loc,
    path: c.req.path,
    accent: poll.accent,
    head: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4" defer></script><script src="/assets/admin-results.js" defer></script>',
  }));
});
