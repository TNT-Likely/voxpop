/* 后台视图层：纯渲染函数（无路由、无鉴权），由 routes/admin.ts 调用 */
import type { Env, PollRow } from '../types';
import { esc, fmtDate, isClosed, jsonForScript } from '../lib/util';
import { t } from '../lib/i18n';
import type { CrossAnalysis, DailyPoint, RegistryEntry, ResultsPayload } from '../lib/db';

export function sanitizeTags(input: string): string {
  return input
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => /^[a-z0-9_-]{1,32}$/.test(tag))
    .filter((tag, i, arr) => arr.indexOf(tag) === i)
    .slice(0, 8)
    .join(',');
}

export function loginFormRaw(loc: Parameters<typeof t>[0], error: string): string {
  return `<div class="vp-login">
  <h1>${esc(t(loc, 'adminTitle'))}</h1>
  ${error ? `<p class="vp-error">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login">
    <div class="vp-field"><label>${esc(t(loc, 'adminKeyLabel'))}</label><input type="password" name="password" autofocus autocomplete="current-password"></div>
    <button class="vp-btn">${esc(t(loc, 'loginBtn'))}</button>
  </form>
</div>`;
}

export function registryHtml(loc: Parameters<typeof t>[0], apps: RegistryEntry[], channels: RegistryEntry[]): string {
  const col = (kindLabel: string, kind: 'app' | 'channel', list: RegistryEntry[]) => `
  <div class="vp-admin-q">
    <h3>${esc(kindLabel)}</h3>
    ${list.length ? `<ul class="vp-reg-list">${list.map((x) => `<li><code>${esc(x.slug)}</code><span>${esc(x.name)}</span>
      <form method="post" action="/admin/registry/delete" class="inline"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="slug" value="${esc(x.slug)}"><button class="vp-btn danger small">${esc(t(loc, 'delTag'))}</button></form></li>`).join('')}</ul>`
      : `<p class="vp-muted">${esc(t(loc, 'noTags'))}</p>`}
    <form method="post" action="/admin/registry/add" class="vp-field-row">
      <input type="hidden" name="kind" value="${kind}">
      <div class="vp-field" style="flex:1 1 120px"><label>${esc(t(loc, 'slugLabel'))}</label><input name="slug" maxlength="32" placeholder="mychannel" required></div>
      <div class="vp-field" style="flex:1 1 120px"><label>${esc(t(loc, 'nameLabel'))}</label><input name="name" maxlength="32" placeholder="显示名" required></div>
      <div class="vp-field" style="flex:0 0 auto; align-self: flex-end"><button class="vp-btn ghost small">${esc(t(loc, 'addTag'))}</button></div>
    </form>
  </div>`;
  return `
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(t(loc, 'registryTitle'))}</h1>
    <a class="vp-link" href="/admin">${esc(t(loc, 'backToList'))}</a>
  </div>
  <p class="vp-banner">${esc(t(loc, 'registryHint'))}</p>
  <div class="vp-field-row">
    ${col(t(loc, 'kindApps'), 'app', apps)}
    ${col(t(loc, 'kindChannels'), 'channel', channels)}
  </div>`;
}

export function dashboardHtml(loc: Parameters<typeof t>[0], polls: (PollRow & { response_count: number })[]): string {
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
      <a class="vp-btn ghost" href="/admin/registry">${esc(t(loc, 'registryTitle'))}</a>
      <form method="post" action="/admin/logout" class="inline"><button class="vp-btn ghost">${esc(t(loc, 'logout'))}</button></form>
    </div>
  </div>
  ${polls.length
    ? `<div class="vp-table-wrap"><table class="vp-table"><thead><tr><th>${esc(t(loc, 'thTitle'))}</th><th>ID</th><th>${esc(t(loc, 'thStatus'))}</th><th>${esc(t(loc, 'thResponses'))}</th><th>${esc(t(loc, 'thCreated'))}</th><th>${esc(t(loc, 'thActions'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="vp-empty">${esc(t(loc, 'noPolls'))}</p>`}`;
}

interface OptNode { id: string; label: string; count: number; children: OptNode[] }

function typeLabel(loc: Parameters<typeof t>[0], type: string): string {
  const map: Record<string, string> = { single: 'typeSingle', multi: 'typeMulti', cascade: 'typeCascade', text: 'typeText' };
  return t(loc, map[type] ?? type);
}

export function detailHtml(
  loc: Parameters<typeof t>[0],
  poll: PollRow,
  results: ResultsPayload,
  origin: string,
  trend: DailyPoint[],
  pv: number,
  reg: { apps: Map<string, string>; channels: Map<string, string> },
  regLists: { apps: RegistryEntry[]; channels: RegistryEntry[] },
  crossData: CrossAnalysis
): string {
  const regApps = regLists.apps;
  const regChannels = regLists.channels;
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

  const bdPairs = [['device', 'device'], ['browser', 'browser'], ['os', 'os'], ['country', 'country'], ['lang', 'lang']] as const;
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
    <div class="vp-chart-box"><h4>${esc(t(loc, 'lang'))}</h4><canvas id="vp-ch-lang"></canvas></div>
  </div>
  <script type="application/json" id="vp-chart-data">${jsonForScript({ trend, breakdown: results.breakdown })}</script>` : '';

  const tagNames = (tags: string, map: Map<string, string>) =>
    tags ? tags.split(',').map((s) => esc(map.get(s) ?? s)).join('、') : '';
  const visForm = poll.visibility === 'listed'
    ? `<form method="post" action="/admin/polls/${poll.id}/unlist" class="inline"><button class="vp-btn ghost small">${esc(t(loc, 'listOff'))}</button></form>`
    : `<form method="post" action="/admin/polls/${poll.id}/list" class="inline"><button class="vp-btn ghost small">${esc(t(loc, 'listOn'))}</button></form>`;
  const appsTags = tagNames(poll.apps, reg.apps);
  const channelTags = tagNames(poll.channels, reg.channels);

  return `
  <div class="vp-admin-head">
    <h1 class="vp-title">${esc(poll.title)}</h1>
    <span class="vp-badge ${closed ? 'off' : 'on'}">${esc(badge)}</span>
  </div>
  <p class="vp-meta">ID <code>${poll.id}</code> · ${esc(t(loc, 'thCreated'))} ${fmtDate(poll.created_at)}${poll.close_at ? ` · ${esc(t(loc, 'closingOn', { date: fmtDate(poll.close_at) }))}` : ''} · ${esc(t(loc, poll.visibility === 'listed' ? 'listedBadge' : 'unlistedBadge'))}${appsTags ? ` · app: ${appsTags}` : ''}${channelTags ? ` · ${esc(t(loc, 'kindChannels'))}: ${channelTags}` : ''}${poll.extra_keys ? ` · ${esc(poll.extra_keys)}` : ''}</p>
  <div class="vp-admin-actions">
    <a class="vp-btn ghost" href="/p/${poll.id}" target="_blank" rel="noopener">${esc(t(loc, 'viewPage'))}</a>
    <a class="vp-btn ghost" href="/admin/polls/${poll.id}/export">${esc(t(loc, 'exportJson'))}</a>
    <a class="vp-btn ghost" href="/admin/polls/${poll.id}/export?format=csv">CSV</a>
    <form method="post" action="/admin/polls/${poll.id}/${poll.status === 'open' ? 'close' : 'open'}" class="inline"><button class="vp-btn ghost">${esc(t(loc, poll.status === 'open' ? 'close' : 'reopen'))}</button></form>
    ${visForm}
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
      <div class="vp-field" style="flex:2 1 260px"><label>${esc(t(loc, 'titleEnLabel'))}</label>
        <input name="titleEn" value="${esc(poll.title_en)}" maxlength="80" placeholder="English title (optional)">
      </div>
      <div class="vp-field" style="flex:2 1 300px"><label>${esc(t(loc, 'appsLabel'))}</label>
        <div class="vp-checks">${regApps.map((a) => `<label class="vp-check"><input type="checkbox" name="apps" value="${esc(a.slug)}"${poll.apps.split(',').includes(a.slug) ? ' checked' : ''}> ${esc(a.name)} <code class="vp-slug">${esc(a.slug)}</code></label>`).join('') || `<span class="vp-muted">${esc(t(loc, 'noTags'))}</span>`}</div>
      </div>
      <div class="vp-field" style="flex:2 1 300px"><label>${esc(t(loc, 'channelsLabel'))}</label>
        <div class="vp-checks">${regChannels.map((ch) => `<label class="vp-check"><input type="checkbox" name="channels" value="${esc(ch.slug)}"${poll.channels.split(',').includes(ch.slug) ? ' checked' : ''}> ${esc(ch.name)} <code class="vp-slug">${esc(ch.slug)}</code></label>`).join('') || `<span class="vp-muted">${esc(t(loc, 'noTags'))}</span>`}</div>
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
  ${crossSection(loc, crossData)}
  <p class="vp-muted" style="margin-top:24px"><a href="/admin">← ${esc(t(loc, 'backToList'))}</a></p>`;
}

function crossSection(loc: Parameters<typeof t>[0], data: CrossAnalysis): string {
  const hasCross = data.cross.length > 0;
  const extraKeys = Object.keys(data.extraDist);
  if (!hasCross && extraKeys.length === 0) return '';
  let html = `<h2 class="vp-section">${esc(t(loc, 'crossTitle'))}</h2>`;
  for (const q of data.cross) {
    const devices = Array.from(new Set(q.rows.flatMap((r) => Object.keys(r.counts))));
    html += `<section class="vp-admin-q"><h3>${esc(q.title)}</h3><div class="vp-table-wrap"><table class="vp-table" style="min-width:0"><thead><tr><th> </th>${devices.map((d) => `<th>${esc(d || t(loc, 'unknown'))}</th>`).join('')}<th>${esc(t(loc, 'totalLabel'))}</th></tr></thead><tbody>`;
    for (const r of q.rows) {
      html += `<tr><td>${esc(r.label)}</td>${devices.map((d) => `<td>${r.counts[d] ?? 0}</td>`).join('')}<td><b>${r.total}</b></td></tr>`;
    }
    html += '</tbody></table></div></section>';
  }
  if (extraKeys.length > 0) {
    html += `<h2 class="vp-section">${esc(t(loc, 'dimsTitle'))}</h2>`;
    for (const key of extraKeys) {
      const entries = Object.entries(data.extraDist[key]).sort((a, b) => b[1] - a[1]).slice(0, 12);
      html += `<div class="vp-bd"><h4>${esc(key)}</h4>${entries
        .map(([v, n]) => `<span class="vp-chip">${esc(v)} · ${n}</span>`)
        .join('')}</div>`;
    }
  }
  return html;
}
