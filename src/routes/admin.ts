import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { DedupMode, Env, PollInput, PollRow, QuestionType, ResultPolicy } from '../types';
import { clampInt, esc, fmtDate, hmacHex, isClosed, nowSec, parseOptionLines } from '../lib/util';
import { layout, notFoundBody } from '../lib/html';
import {
  adminListPolls, buildResults, createPoll, deletePoll, exportPoll, getPoll, setPollStatus,
} from '../lib/db';
import type { ResultsPayload } from '../lib/db';

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

function loginForm(error: string): string {
  return `<div class="vp-login">
  <h1>管理后台</h1>
  ${error ? `<p class="vp-error">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login">
    <div class="vp-field"><label>管理密钥</label><input type="password" name="password" autofocus autocomplete="current-password"></div>
    <button class="vp-btn">登录</button>
  </form>
</div>`;
}

admin.get('/admin', async (c) => {
  if (!(await isAdmin(c))) return c.html(layout({ title: '登录 · 众声 VoxPop', body: loginForm('') }));
  const polls = await adminListPolls(c.env.DB);
  return c.html(layout({ title: '管理后台 · 众声 VoxPop', body: dashboardHtml(polls) }));
});

admin.post('/admin/login', async (c) => {
  const form = await c.req.parseBody();
  const password = String(form['password'] ?? '');
  if (!password || password !== c.env.ADMIN_KEY) {
    return c.html(layout({ title: '登录 · 众声 VoxPop', body: loginForm('密钥不正确') }), 401);
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
  if (!(await isAdmin(c))) return c.redirect('/admin');
  return c.html(layout({ title: '新建问卷 · 众声 VoxPop', body: newPollForm() }));
});

admin.post('/api/admin/polls', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'unauthorized' }, 401);
  const raw = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!raw) return c.json({ error: 'bad_request' }, 400);
  const parsed = parsePollInput(raw);
  if (parsed.error || !parsed.input) return c.json({ error: parsed.error ?? 'bad_request' }, 400);
  try {
    const id = await createPoll(c.env.DB, parsed.input);
    return c.json({ ok: true, id });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '创建失败' }, 400);
  }
});

function parsePollInput(raw: Record<string, unknown>): { input?: PollInput; error?: string } {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const title = s(raw.title).trim();
  if (!title || title.length > 80) return { error: '标题必填且不超过 80 字' };
  const description = s(raw.description).trim().slice(0, 300);

  const dedupMode = (['device', 'ip', 'open'] as const).includes(s(raw.dedupMode) as DedupMode)
    ? (s(raw.dedupMode) as DedupMode) : 'device';
  const resultPolicy = (['always', 'after_vote', 'after_close'] as const).includes(s(raw.resultPolicy) as ResultPolicy)
    ? (s(raw.resultPolicy) as ResultPolicy) : 'after_vote';

  const closeInDays = raw.closeInDays == null ? null : clampInt(raw.closeInDays, 1, 365, 0);
  const closeAt = closeInDays && closeInDays > 0 ? nowSec() + closeInDays * 86400 : null;

  const extraKeys = s(raw.extraKeys)
    .split(/[,，\s]+/).filter(Boolean)
    .filter((k) => /^[a-z0-9_]{1,32}$/.test(k))
    .slice(0, 8).join(',');

  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  if (rawQuestions.length === 0 || rawQuestions.length > 20) {
    return { error: '问卷需要 1~20 道题' };
  }
  const questions: PollInput['questions'] = [];
  for (const rq of rawQuestions) {
    const q = (rq ?? {}) as Record<string, unknown>;
    const type = s(q.type) as QuestionType;
    if (!['single', 'multi', 'cascade', 'text'].includes(type)) return { error: '未知题型' };
    const qTitle = s(q.title).trim();
    if (!qTitle || qTitle.length > 120) return { error: '题目标题必填且不超过 120 字' };
    const required = q.required !== false;
    const maxChoices = type === 'multi' ? clampInt(q.maxChoices, 2, 50, 3) : 1;
    const maxLen = type === 'text' ? clampInt(q.maxLen, 1, 500, 200) : 0;
    let parsedOptions: { label: string; depth: number }[] = [];
    if (type !== 'text') {
      parsedOptions = parseOptionLines(s(q.optionsText));
      if (parsedOptions.length < 2) return { error: `「${qTitle}」至少需要两个选项` };
      if (parsedOptions.length > 200) return { error: `「${qTitle}」选项过多` };
      if (type !== 'cascade' && parsedOptions.some((o) => o.depth > 0)) {
        return { error: `「${qTitle}」只有级联题支持缩进子选项` };
      }
    }
    questions.push({ type, title: qTitle, required, maxChoices, maxLen, parsedOptions });
  }
  return { input: { title, description, dedupMode, resultPolicy, closeAt, extraKeys, questions } };
}

/* ---------- 状态操作 / 删除 / 导出 ---------- */

const adminGuard = async (c: Context<{ Bindings: Env }>): Promise<Response | null> => {
  if (await isAdmin(c)) return null;
  return c.json({ error: 'unauthorized' }, 401);
};

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

/* ---------- 结果详情 ---------- */

admin.get('/admin/p/:id', async (c) => {
  if (!(await isAdmin(c))) return c.redirect('/admin');
  const poll = await getPoll(c.env.DB, c.req.param('id'));
  if (!poll) return c.html(layout({ title: '404 · 众声 VoxPop', body: notFoundBody() }), 404);
  const results = await buildResults(c.env.DB, poll, true);
  const origin = new URL(c.req.url).origin;
  return c.html(layout({ title: `结果 · ${poll.title} · 众声 VoxPop`, body: detailHtml(poll, results, origin) }));
});

interface OptNode { id: string; label: string; count: number; children: OptNode[] }

function typeLabel(t: string): string {
  return { single: '单选', multi: '多选', cascade: '级联', text: '文本' }[t] ?? t;
}

function detailHtml(poll: PollRow, results: ResultsPayload, origin: string): string {
  const closed = isClosed(poll);
  const badge = poll.status === 'closed' ? '已截止' : closed ? '已到期' : '进行中';
  const link = `${origin}/p/${poll.id}`;
  const embedCode = `<script src="${origin}/embed.js"></script>\n<div class="voxpop-poll" data-poll="${poll.id}"></div>`;

  let qs = '';
  for (const qRaw of results.questions) {
    const q = qRaw as {
      id: string; type: string; title: string; required: boolean;
      answerCount?: number; texts?: unknown; options?: OptNode[];
    };
    qs += `<section class="vp-admin-q"><h3>${esc(q.title)} <small class="vp-chip">${typeLabel(q.type)}${q.required ? '' : ' · 选填'}</small></h3>`;
    if (q.type === 'text') {
      qs += `<p class="vp-muted">${q.answerCount ?? 0} 条补充说明</p><ul class="vp-texts">`;
      for (const t of (q.texts ?? []) as { text: string; ts: number }[]) {
        qs += `<li>${esc(t.text)} <small>${fmtDate(t.ts)}</small></li>`;
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

  const bdPairs = [['device', '设备'], ['browser', '浏览器'], ['os', '系统'], ['country', '国家/地区']] as const;
  let bd = '';
  for (const [key, label] of bdPairs) {
    const entries = Object.entries(results.breakdown[key] ?? {});
    if (entries.length === 0) continue;
    bd += `<div class="vp-bd"><h4>${label}</h4>${entries
      .map(([k, v]) => `<span class="vp-chip">${esc(k)} · ${v}</span>`)
      .join('')}</div>`;
  }

  return `
  <div class="vp-admin-head">
    <h1>${esc(poll.title)}</h1>
    <span class="vp-badge ${closed ? 'off' : 'on'}">${badge}</span>
  </div>
  <p class="vp-meta">ID <code>${poll.id}</code> · 创建于 ${fmtDate(poll.created_at)}${poll.close_at ? ` · ${fmtDate(poll.close_at)} 截止` : ''}${poll.extra_keys ? ` · 自定义维度：${esc(poll.extra_keys)}` : ''}</p>
  <div class="vp-admin-actions">
    <a class="vp-btn ghost" href="/p/${poll.id}" target="_blank" rel="noopener">打开公开页</a>
    <a class="vp-btn ghost" href="/admin/polls/${poll.id}/export">导出 JSON</a>
    <form method="post" action="/admin/polls/${poll.id}/${poll.status === 'open' ? 'close' : 'open'}" class="inline"><button class="vp-btn ghost">${poll.status === 'open' ? '截止' : '重新开启'}</button></form>
    <form method="post" action="/admin/polls/${poll.id}/delete" class="inline" onsubmit="return confirm('确定删除该问卷及其全部数据？不可恢复')"><button class="vp-btn danger">删除</button></form>
  </div>
  <div class="vp-field"><label>公开链接</label><input readonly value="${esc(link)}" onclick="this.select()"></div>
  <div class="vp-field"><label>嵌入代码</label><textarea readonly rows="3" onclick="this.select()">${esc(embedCode)}</textarea></div>
  <h2>结果（${results.total} 份答卷）</h2>
  ${qs || '<p class="vp-muted">还没有答卷</p>'}
  <h2>答卷构成</h2>
  ${bd || '<p class="vp-muted">暂无数据</p>'}
  <p class="vp-muted" style="margin-top:24px"><a href="/admin">← 返回列表</a></p>`;
}

function dashboardHtml(polls: (PollRow & { response_count: number })[]): string {
  const rows = polls.map((p) => {
    const closed = isClosed(p);
    const badge = p.status === 'closed' ? '已截止' : closed ? '已到期' : '进行中';
    const action = p.status === 'open' ? 'close' : 'open';
    const actionLabel = p.status === 'open' ? '截止' : '开启';
    return `<tr>
    <td><a href="/admin/p/${p.id}">${esc(p.title)}</a></td>
    <td><code>${p.id}</code></td>
    <td><span class="vp-badge ${closed ? 'off' : 'on'}">${badge}</span></td>
    <td>${p.response_count}</td>
    <td>${fmtDate(p.created_at)}</td>
    <td class="vp-actions">
      <form method="post" action="/admin/polls/${p.id}/${action}" class="inline"><button class="vp-btn ghost small">${actionLabel}</button></form>
      <form method="post" action="/admin/polls/${p.id}/delete" class="inline" onsubmit="return confirm('确定删除？不可恢复')"><button class="vp-btn danger small">删除</button></form>
    </td>
  </tr>`;
  }).join('');
  return `
  <div class="vp-admin-head">
    <h1>管理后台</h1>
    <div>
      <a class="vp-btn" href="/admin/new">+ 新建问卷</a>
      <form method="post" action="/admin/logout" class="inline"><button class="vp-btn ghost">退出登录</button></form>
    </div>
  </div>
  ${polls.length
    ? `<table class="vp-table"><thead><tr><th>标题</th><th>ID</th><th>状态</th><th>答卷</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="vp-empty">还没有问卷，点右上角新建</p>'}`;
}

function newPollForm(): string {
  return `
  <div class="vp-admin-head">
    <h1>新建问卷</h1>
    <a class="vp-link" href="/admin">← 返回列表</a>
  </div>
  <div class="vp-field"><label>标题（必填）</label><input id="f-title" maxlength="80" placeholder="例如：BeeCount 下个版本你最想要什么功能？"></div>
  <div class="vp-field"><label>说明（选填）</label><input id="f-desc" maxlength="300"></div>
  <div class="vp-field-row">
    <div class="vp-field"><label>防重策略</label>
      <select id="f-dedup">
        <option value="device">每设备一份（推荐）</option>
        <option value="ip">每 IP 一份（严格）</option>
        <option value="open">宽松（仅前端提示）</option>
      </select></div>
    <div class="vp-field"><label>结果可见</label>
      <select id="f-policy">
        <option value="after_vote">提交后可见</option>
        <option value="always">实时可见</option>
        <option value="after_close">截止后可见</option>
      </select></div>
    <div class="vp-field"><label>几天后截止（留空不限）</label><input id="f-close-days" type="number" min="1" max="365"></div>
  </div>
  <div class="vp-field"><label>自定义维度键（App / 官网链接可透传的参数名，逗号分隔）</label><input id="f-extra-keys" maxlength="200" placeholder="src,app_ver,platform"></div>
  <h2>题目</h2>
  <div id="vp-questions"></div>
  <button type="button" id="vp-add-question" class="vp-btn ghost">+ 添加题目</button>
  <div class="vp-actions-bar"><button type="button" id="vp-create" class="vp-btn">创建问卷</button></div>
  <script src="/assets/admin.js" defer></script>`;
}
