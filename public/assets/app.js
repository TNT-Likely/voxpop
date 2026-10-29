/* 众声 VoxPop 前端脚本：埋点 + 投票交互 + 结果渲染 + 分享海报 + 主题切换（原生 JS，无依赖） */
(function () {
  'use strict';

  var L = window.VP_L || {};
  function T(key, vars) {
    var s = L[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  /* ---------- 工具 ---------- */
  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
        var r = (Math.random() * 16) | 0;
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------- 主题切换（自动 → 日间 → 暗黑） ---------- */
  function initThemeToggle() {
    var btn = document.getElementById('vp-theme-toggle');
    if (!btn) return;
    var order = ['auto', 'light', 'dark'];
    function stored() {
      try { return localStorage.getItem('vp_theme') || 'auto'; } catch (e) { return 'auto'; }
    }
    var ICONS = {
      auto: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
      light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/></svg>',
      dark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
    };
    function icon(t) { return ICONS[t] || ICONS.auto; }
    function label(t) { return T(t === 'light' ? 'themeLight' : t === 'dark' ? 'themeDark' : 'themeAuto'); }
    function effTheme() {
      // URL ?theme= 是硬覆盖（嵌入场景），优先于本地偏好
      var q = new URLSearchParams(location.search).get('theme');
      if (q === 'dark' || q === 'light') return q;
      var t = stored();
      if (t === 'auto') return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      return t;
    }
    function apply() {
      var t = stored();
      document.documentElement.dataset.theme = effTheme();
      btn.innerHTML = icon(t);
      btn.title = label(t);
      btn.setAttribute('aria-label', label(t));
    }
    btn.addEventListener('click', function () {
      var next = order[(order.indexOf(stored()) + 1) % order.length];
      try { localStorage.setItem('vp_theme', next); } catch (e) { /* ignore */ }
      apply();
    });
    if (window.matchMedia) {
      try {
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if (stored() === 'auto') apply();
        });
      } catch (e) { /* 旧浏览器忽略 */ }
    }
    apply();
  }

  /* ---------- 设备/浏览器识别（客户端枚举化，服务端仅收白名单字段） ---------- */
  function detectDims() {
    var ua = navigator.userAgent || '';
    var device = /iPad|Tablet|PlayBook|Silk/i.test(ua) ? 'tablet'
      : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop';
    var browser = 'Other';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    else if (/MSIE|Trident/.test(ua)) browser = 'IE';
    var os = 'Other';
    if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return { device: device, browser: browser, os: os };
  }

  /* ---------- 埋点 ---------- */
  function sessionId() {
    try {
      var raw = sessionStorage.getItem('vp_sid');
      var obj = raw ? JSON.parse(raw) : null;
      if (obj && obj.t && Date.now() - obj.t < 30 * 60 * 1000) {
        obj.t = Date.now();
        sessionStorage.setItem('vp_sid', JSON.stringify(obj));
        return obj.id;
      }
      var id = uuid();
      sessionStorage.setItem('vp_sid', JSON.stringify({ id: id, t: Date.now() }));
      return id;
    } catch (e) {
      return uuid();
    }
  }
  function pageview() {
    try {
      var extra = {};
      new URLSearchParams(location.search).forEach(function (v, k) {
        if (k.length <= 32 && v.length <= 64) extra[k] = v;
      });
      var m = location.pathname.match(/^\/(?:p|embed)\/([a-z0-9]+)/);
      var payload = {
        type: 'pageview',
        path: location.pathname,
        poll_id: m ? m[1] : '',
        visitor_id: readCookie('vp_vid'),
        session_id: sessionId(),
        screen: window.screen ? screen.width + 'x' + screen.height : '',
        lang: (navigator.language || '').slice(0, 12),
        referrer: document.referrer || '',
        dims: detectDims(),
        extra: extra
      };
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/t', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true });
      }
    } catch (e) { /* 统计失败不影响使用 */ }
  }

  /* ---------- 结果渲染 ---------- */
  function flattenOptions(list, depth, out) {
    (list || []).forEach(function (o) {
      out.push({ o: o, depth: depth });
      flattenOptions(o.children, depth + 1, out);
    });
    return out;
  }

  function renderQuestionResult(q) {
    var box = el('section', 'vp-q');
    box.appendChild(el('h3', null, q.title));
    if (q.type === 'text') {
      box.appendChild(el('p', 'vp-muted', T('supplementCount', { n: q.answerCount })));
      return box;
    }
    var flat = flattenOptions(q.options, 0, []);
    var sum = flat.reduce(function (s, x) { return s + x.o.count; }, 0) || 1;
    flat.forEach(function (x) {
      var pct = Math.round((x.o.count * 100) / sum);
      var row = el('div', 'vp-row');
      var label = el('span', 'vp-row-label', x.o.label);
      label.style.paddingLeft = (x.depth * 16) + 'px';
      var barWrap = el('span', 'vp-bar');
      var bar = el('span', 'vp-bar-fill');
      bar.style.width = pct + '%';
      barWrap.appendChild(bar);
      row.appendChild(label);
      row.appendChild(barWrap);
      row.appendChild(el('span', 'vp-row-num', x.o.count + ' · ' + pct + '%'));
      box.appendChild(row);
    });
    return box;
  }

  function renderBreakdown(bd) {
    var wrap = el('section', null);
    wrap.appendChild(el('h3', 'vp-section-h', T('composition')));
    [['device', 'device'], ['browser', 'browser'], ['os', 'os'], ['country', 'country']].forEach(function (pair) {
      var entries = Object.keys(bd[pair[0]] || {}).map(function (k) { return [k, bd[pair[0]][k]]; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12);
      if (!entries.length) return;
      var box = el('div', 'vp-bd');
      box.appendChild(el('h4', null, T(pair[1])));
      var total = entries.reduce(function (s, r) { return s + r[1]; }, 0) || 1;
      entries.forEach(function (r) {
        var row = el('div', 'vp-row');
        row.appendChild(el('span', 'vp-row-label', r[0] || T('unknown')));
        var bw = el('span', 'vp-bar');
        var bf = el('span', 'vp-bar-fill');
        bf.style.width = Math.round((r[1] * 100) / total) + '%';
        bw.appendChild(bf);
        row.appendChild(bw);
        row.appendChild(el('span', 'vp-row-num', String(r[1])));
        box.appendChild(row);
      });
      wrap.appendChild(box);
    });
    return wrap;
  }

  function renderResults(results, root) {
    root.textContent = '';
    var head = el('div', 'vp-results-head');
    head.appendChild(el('p', 'vp-total', T('totalResponses', { n: results.total })));
    if (window.qrcode && results.questions) {
      var share = el('button', 'vp-btn ghost small', T('sharePoster'));
      share.type = 'button';
      share.addEventListener('click', function () {
        try { makePoster(currentData, results); } catch (e) { alert(T('posterFailed')); }
      });
      head.appendChild(share);
    }
    root.appendChild(head);
    (results.questions || []).forEach(function (q) { root.appendChild(renderQuestionResult(q)); });
    if (results.breakdown) root.appendChild(renderBreakdown(results.breakdown));
  }

  /* ---------- 分享海报（亮色主题渲染，含二维码） ---------- */
  function hexToRgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length !== 6) return 'rgba(0,0,0,' + a + ')';
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(ctx, text, maxWidth, maxLines) {
    var lines = [];
    var cur = '';
    text.split('').forEach(function (ch) {
      if (ctx.measureText(cur + ch).width > maxWidth || ch === '\n') {
        lines.push(cur);
        cur = ch === '\n' ? '' : ch;
        if (lines.length === maxLines) cur = '';
      } else {
        cur += ch;
      }
    });
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && text.length > lines.join('').length) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    }
    return lines;
  }

  function makePoster(data, results) {
    // 海报固定用亮色 token 渲染（分享图观感稳定）
    var W = 1080, H = 1440, M = 56;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var font = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif';
    var bg = '#f5f6f7', paper = '#ffffff', ink = '#25282c', muted = '#777c82';
    var accent = (data.accent && /^#[0-9a-fA-F]{6}$/.test(data.accent)) ? data.accent : cssVar('--bc-accent', '#f8c91c').replace('#', '') && ('#' + cssVar('--bc-accent', '#f8c91c').replace('#', ''));
    if (!/^#[0-9a-fA-F]{6}$/.test(accent)) accent = '#f8c91c';
    var accentInk = '#4c3b05';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    rr(ctx, M, M, W - 2 * M, H - 2 * M, 44);
    ctx.fillStyle = paper;
    ctx.fill();

    // 顶部胶囊条
    rr(ctx, M + 52, M + 60, 128, 14, 7);
    ctx.fillStyle = accent;
    ctx.fill();

    // 标题
    ctx.fillStyle = ink;
    ctx.font = '600 60px ' + font;
    ctx.textBaseline = 'top';
    var lines = wrapText(ctx, data.poll.title || '', W - 2 * M - 104, 3);
    var y = M + 108;
    lines.forEach(function (l) { ctx.fillText(l, M + 52, y); y += 80; });

    // 答卷数
    y += 8;
    ctx.font = '500 38px ' + font;
    var stat = String(results.total) + ' ' + T('responsesLabel');
    var sw = ctx.measureText(stat).width;
    rr(ctx, M + 52, y, sw + 56, 72, 20);
    ctx.fillStyle = hexToRgba(accent, 0.16);
    ctx.fill();
    ctx.fillStyle = accentInk;
    ctx.fillText(stat, M + 52 + 28, y + 16);

    // 二维码卡片（中心放三竖条 logo，纠错级别 H 保证可扫）
    var qrSize = 380, qx = (W - qrSize) / 2, qy = H - M - 120 - 96 - qrSize;
    var qr = window.qrcode(0, 'H');
    qr.addData(data.poll.link);
    qr.make();
    var count = qr.getModuleCount();
    var cell = qrSize / count;
    rr(ctx, qx - 24, qy - 24, qrSize + 48, qrSize + 48, 28);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = ink;
    for (var r = 0; r < count; r++) {
      for (var col = 0; col < count; col++) {
        if (qr.isDark(r, col)) {
          ctx.fillRect(qx + col * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
    // 中心三竖条 logo
    var lw2 = 92, lx2 = W / 2 - lw2 / 2, ly2 = qy + qrSize / 2 - lw2 / 2;
    rr(ctx, lx2, ly2, lw2, lw2, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    var barSpecs = [{ h: 28, o: 0.65 }, { h: 40, o: 0.85 }, { h: 54, o: 1 }];
    var barW = 13, barGap = 9;
    var totalBarW = barSpecs.length * barW + (barSpecs.length - 1) * barGap;
    var bx = W / 2 - totalBarW / 2;
    var baseY = ly2 + lw2 - 20;
    barSpecs.forEach(function (b) {
      rr(ctx, bx, baseY - b.h, barW, b.h, 6.5);
      ctx.fillStyle = 'rgba(76,59,5,' + b.o + ')';
      ctx.fill();
      bx += barW + barGap;
    });
    ctx.fillStyle = muted;
    ctx.font = '500 34px ' + font;
    ctx.textAlign = 'center';
    ctx.fillText(T('scanToVote'), W / 2, qy + qrSize + 44);

    // 品牌页脚
    ctx.fillStyle = ink;
    ctx.font = '600 36px ' + font;
    ctx.fillText(T('posterBrand'), W / 2, H - M - 92);
    ctx.fillStyle = muted;
    ctx.font = '400 26px ' + font;
    ctx.fillText(T('tagline'), W / 2, H - M - 46);
    ctx.textAlign = 'left';

    c.toBlob(function (blob) {
      if (!blob) { alert(T('posterFailed')); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'voxpop-' + data.poll.id + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    }, 'image/png');
  }

  /* ---------- 级联 ---------- */
  function buildCascade(q, opts, state) {
    // 精确指针（桌面）用自绘下拉，触屏保留原生选择器（系统体验更好）
    var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    return fine ? cascadeDropdown(q, opts, state) : cascadeSelect(q, opts, state);
  }

  function cascadeDropdown(q, opts, state) {
    var byParent = {};
    var byId = {};
    opts.forEach(function (o) {
      byId[o.id] = o;
      var key = o.parentId || '';
      (byParent[key] = byParent[key] || []).push(o);
    });
    var holder = el('div', 'vp-cascade');
    var dds = [];
    var chosen = null;
    function closeAll(except) {
      dds.forEach(function (d) {
        if (d !== except) {
          d.panel.style.display = 'none';
          d.wrap.classList.remove('open');
          d.btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    document.addEventListener('click', function (e) {
      if (!holder.contains(e.target)) closeAll();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll();
    });
    function makeDD(depth, parentId) {
      var list = byParent[parentId] || [];
      if (!list.length) return;
      var wrap = el('div', 'dd');
      var btn = el('button', 'dd-btn', depth === 0 ? T('selectLevel') : T('selectNext'));
      btn.type = 'button';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      var panel = el('ul', 'dd-panel');
      panel.style.display = 'none';
      list.forEach(function (o) {
        var li = el('li', 'dd-item', o.label);
        li.setAttribute('role', 'option');
        li.addEventListener('click', function () {
          dds = dds.filter(function (d) {
            if (d.depth > depth) { d.wrap.remove(); return false; }
            return true;
          });
          btn.textContent = o.label;
          chosen = null;
          var hasChildren = (byParent[o.id] || []).length > 0;
          if (hasChildren) {
            makeDD(depth + 1, o.id);
          } else {
            chosen = o.id; // 必须选到叶子
            closeAll();
          }
          state[q.id] = chosen ? { optionIds: [chosen] } : undefined;
        });
        panel.appendChild(li);
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.style.display !== 'none';
        closeAll();
        if (!open) {
          panel.style.display = 'block';
          wrap.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
      wrap.appendChild(btn);
      wrap.appendChild(panel);
      holder.appendChild(wrap);
      dds.push({ wrap: wrap, panel: panel, btn: btn, depth: depth });
    }
    makeDD(0, '');
    return holder;
  }

  function cascadeSelect(q, opts, state) {
    var byParent = {};
    var byId = {};
    opts.forEach(function (o) {
      byId[o.id] = o;
      var key = o.parentId || '';
      (byParent[key] = byParent[key] || []).push(o);
    });
    var holder = el('div', 'vp-cascade');
    var chosen = null;
    function level(depth, parentId) {
      var list = byParent[parentId] || [];
      if (!list.length) return;
      var sel = el('select', 'vp-input');
      sel.dataset.level = String(depth);
      var ph = el('option', null, depth === 0 ? T('selectLevel') : T('selectNext'));
      ph.value = '';
      sel.appendChild(ph);
      list.forEach(function (o) {
        var op = el('option', null, o.label);
        op.value = o.id;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () {
        Array.prototype.slice.call(holder.querySelectorAll('select')).forEach(function (s) {
          if (Number(s.dataset.level) > depth) s.remove();
        });
        chosen = null;
        if (sel.value) {
          var hasChildren = (byParent[sel.value] || []).length > 0;
          if (hasChildren) {
            level(depth + 1, sel.value);
            var next = holder.querySelectorAll('select');
            if (next.length) next[next.length - 1].focus();
          } else {
            chosen = sel.value; // 必须选到叶子
          }
        }
        state[q.id] = chosen ? { optionIds: [chosen] } : undefined;
      });
      holder.appendChild(sel);
    }
    level(0, '');
    return holder;
  }

  /* ---------- 表单 ---------- */
  function markVoted(pollId) {
    try { localStorage.setItem('vp_voted_' + pollId, '1'); } catch (e) { /* ignore */ }
  }
  function hasMarkedVoted(pollId) {
    try { return localStorage.getItem('vp_voted_' + pollId) === '1'; } catch (e) { return false; }
  }

  function initForm(data) {
    var root = document.getElementById('vp-root');
    if (!root) return;
    root.textContent = '';
    if (data.closed) root.appendChild(el('p', 'vp-banner', T('closedBanner')));
    var locked = data.hasVoted || (data.poll.dedupMode !== 'open' && hasMarkedVoted(data.poll.id));
    if (data.hasVoted || hasMarkedVoted(data.poll.id)) {
      root.appendChild(el('p', 'vp-banner', T('votedBanner')));
    }
    if (data.closed && !data.hasVoted && data.poll.resultPolicy === 'after_close') {
      // 截止且未投过：无结果可看（服务端已保证 closed 必出结果，这里只是兜底文案）
    }

    var state = {};
    var questionsEl = el('div');
    data.questions.forEach(function (q) {
      var box = el('section', 'vp-q');
      box.appendChild(el('h3', null, q.title + (q.required ? '' : T('optionalPostfix'))));
      if (q.type === 'text') {
        var ta = el('textarea', 'vp-input');
        ta.rows = 3;
        ta.maxLength = q.maxLen || 200;
        ta.placeholder = T('textPlaceholder', { n: q.maxLen || 200 });
        ta.addEventListener('input', function () {
          state[q.id] = { text: ta.value.trim() };
        });
        box.appendChild(ta);
      } else if (q.type === 'cascade') {
        box.appendChild(buildCascade(q, data.options[q.id] || [], state));
      } else {
        var wrap = el('div', 'vp-choices');
        (data.options[q.id] || []).filter(function (o) { return !o.parentId; }).forEach(function (o) {
          var lb = el('label', 'vp-choice');
          var input = el('input');
          input.type = q.type === 'multi' ? 'checkbox' : 'radio';
          input.name = 'q_' + q.id;
          input.value = o.id;
          lb.appendChild(input);
          lb.appendChild(el('span', null, o.label));
          input.addEventListener('change', function () {
            var ids = Array.prototype.slice.call(wrap.querySelectorAll('input:checked')).map(function (i) { return i.value; });
            if (q.type === 'multi' && q.maxChoices && ids.length > q.maxChoices) {
              input.checked = false;
              ids = ids.filter(function (v) { return v !== input.value; });
              var tip = box.querySelector('.vp-tip');
              if (tip) tip.remove();
              box.appendChild(el('p', 'vp-muted vp-tip', T('maxChoicesTip', { n: q.maxChoices })));
            }
            state[q.id] = { optionIds: ids };
          });
          wrap.appendChild(lb);
        });
        box.appendChild(wrap);
      }
      questionsEl.appendChild(box);
    });
    root.appendChild(questionsEl);

    // Turnstile（配置了 site key 时）
    var turnstileToken = '';
    if (data.turnstileSiteKey) {
      var w = el('div', 'cf-turnstile vp-turnstile');
      w.setAttribute('data-sitekey', data.turnstileSiteKey);
      root.appendChild(w);
      var timer = setInterval(function () {
        var input = document.querySelector('[name="cf-turnstile-response"]');
        if (input && input.value) { turnstileToken = input.value; clearInterval(timer); }
      }, 300);
    }

    var btn = el('button', 'vp-btn', T('submit'));
    btn.type = 'button';
    var msg = el('span', 'vp-msg');
    var actions = el('div', 'vp-actions');
    actions.appendChild(btn);
    actions.appendChild(msg);
    root.appendChild(actions);

    // 已参与（非宽松模式）：整表禁用，仅展示
    if (locked) {
      root.classList.add('vp-locked');
      Array.prototype.slice.call(root.querySelectorAll('input, select, textarea')).forEach(function (n) { n.disabled = true; });
      btn.disabled = true;
    }

    btn.addEventListener('click', function () {
      for (var i = 0; i < data.questions.length; i++) {
        var q = data.questions[i];
        var a = state[q.id];
        var answered = q.type === 'text' ? !!(a && a.text) : !!(a && a.optionIds && a.optionIds.length);
        if (q.required && !answered) { msg.textContent = T('pleaseComplete', { title: q.title }); return; }
      }
      msg.textContent = '';
      btn.disabled = true;
      var answers = data.questions
        .filter(function (q) { return state[q.id]; })
        .map(function (q) {
          var s = state[q.id];
          return q.type === 'text' ? { questionId: q.id, text: s.text } : { questionId: q.id, optionIds: s.optionIds };
        });
      fetch('/api/polls/' + data.poll.id + '/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          answers: answers,
          dims: detectDims(),
          lang: data.locale || '',
          turnstileToken: turnstileToken,
          sessionId: sessionId()
        })
      }).then(function (r) {
        return r.json().then(function (j) { return { status: r.status, j: j }; });
      }).then(function (res) {
        if (res.status === 200) {
          markVoted(data.poll.id);
          root.textContent = '';
          if (res.j.results) renderResults(res.j.results, root);
          else {
            root.appendChild(el('p', 'vp-thanks', T('thanks')));
            if (data.closed) root.appendChild(el('p', 'vp-banner', T('closedBanner')));
            if (data.poll.resultPolicy === 'after_close') root.appendChild(el('p', 'vp-banner', T('resultsHiddenNotice')));
          }
        } else if (res.status === 409) {
          msg.textContent = '';
          root.textContent = '';
          root.appendChild(el('p', 'vp-banner', T('alreadySubmitted')));
          if (res.j.results) renderResults(res.j.results, root);
        } else {
          var code = res.j && res.j.error ? res.j.error : '';
          msg.textContent = code ? T('submitFailed', { reason: T(code) }) : T('networkError');
          btn.disabled = false;
        }
      }).catch(function () {
        msg.textContent = T('networkError');
        btn.disabled = false;
      });
    });
  }

  /* ---------- 结果自动刷新（30s，仅结果页且页面可见时） ---------- */
  function initRefresh(data) {
    var root = document.getElementById('vp-root');
    if (!root || !data.poll) return;
    var on = false;
    try { on = localStorage.getItem('vp_ar') === '1'; } catch (e) { /* ignore */ }
    var bar = el('div', 'vp-refresh-bar');
    var b = el('button', 'vp-btn ghost small');
    b.type = 'button';
    function paint() { b.textContent = T('autoRefresh') + ' · ' + (on ? 'ON' : 'OFF'); }
    b.addEventListener('click', function () {
      on = !on;
      try { localStorage.setItem('vp_ar', on ? '1' : '0'); } catch (e) { /* ignore */ }
      paint();
    });
    paint();
    setInterval(function () {
      if (!on || document.visibilityState !== 'visible') return;
      fetch('/api/polls/' + data.poll.id + '/results')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.questions) {
            currentData.results = j;
            renderResults(j, root);
          }
        })
        .catch(function () { /* 静默 */ });
    }, 30000);
    root.insertAdjacentElement('afterend', bar);
    bar.appendChild(b);
  }

  /* ---------- 嵌入自适应 ---------- */
  function postHeight() {
    if (window.parent === window) return;
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    try { window.parent.postMessage({ type: 'voxpop:height', height: h }, '*'); } catch (e) { /* ignore */ }
  }

  /* ---------- 启动 ---------- */
  pageview();
  initThemeToggle();
  var dataEl = document.getElementById('vp-data');
  var currentData = null;
  if (dataEl) {
    try { currentData = JSON.parse(dataEl.textContent); } catch (e) { currentData = null; }
    var root = document.getElementById('vp-root');
    if (currentData && root) {
      if (currentData.mode === 'form') initForm(currentData);
      else if (currentData.results) renderResults(currentData.results, root);
      else {
        root.appendChild(el('p', 'vp-banner', currentData.closed ? T('closedBanner') : T('resultsHiddenNotice')));
      }
    }
  }
  if (currentData && currentData.mode === 'results') initRefresh(currentData);
  window.addEventListener('load', postHeight);
  if (window.ResizeObserver) {
    try {
      new ResizeObserver(postHeight).observe(document.body);
    } catch (e) {
      setInterval(postHeight, 800);
    }
  } else {
    setInterval(postHeight, 800);
  }
})();
