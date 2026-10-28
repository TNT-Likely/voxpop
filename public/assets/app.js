/* 众声 VoxPop 前端脚本：页面埋点 + 投票交互 + 结果渲染 + 嵌入自适应（原生 JS，无依赖） */
(function () {
  'use strict';

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
      box.appendChild(el('p', 'vp-muted', q.answerCount + ' 条补充说明'));
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
    wrap.appendChild(el('h3', null, '答卷构成'));
    [['device', '设备'], ['browser', '浏览器'], ['os', '系统'], ['country', '国家/地区']].forEach(function (pair) {
      var entries = Object.keys(bd[pair[0]] || {}).map(function (k) { return [k, bd[pair[0]][k]]; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12);
      if (!entries.length) return;
      var box = el('div', 'vp-bd');
      box.appendChild(el('h4', null, pair[1]));
      var total = entries.reduce(function (s, r) { return s + r[1]; }, 0) || 1;
      entries.forEach(function (r) {
        var row = el('div', 'vp-row');
        row.appendChild(el('span', 'vp-row-label', r[0] || '未知'));
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
    root.appendChild(el('p', 'vp-total', '共 ' + results.total + ' 份答卷'));
    (results.questions || []).forEach(function (q) { root.appendChild(renderQuestionResult(q)); });
    if (results.breakdown) root.appendChild(renderBreakdown(results.breakdown));
  }

  /* ---------- 表单 ---------- */
  function markVoted(pollId) {
    try { localStorage.setItem('vp_voted_' + pollId, '1'); } catch (e) { /* ignore */ }
  }
  function hasMarkedVoted(pollId) {
    try { return localStorage.getItem('vp_voted_' + pollId) === '1'; } catch (e) { return false; }
  }

  function buildCascade(q, opts, state) {
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
      var ph = el('option', null, depth === 0 ? '请选择' : '请选择下一级');
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

  function initForm(data) {
    var root = document.getElementById('vp-root');
    if (!root) return;
    root.textContent = '';
    if (data.closed) root.appendChild(el('p', 'vp-banner', '调研已截止，仅展示结果'));
    if (data.hasVoted || hasMarkedVoted(data.poll.id)) {
      root.appendChild(el('p', 'vp-banner', '你已参与过这次调研'));
    }

    var state = {};
    var questionsEl = el('div');
    data.questions.forEach(function (q) {
      var box = el('section', 'vp-q');
      box.appendChild(el('h3', null, q.title + (q.required ? '' : '（选填）')));
      if (q.type === 'text') {
        var ta = el('textarea', 'vp-input');
        ta.rows = 3;
        ta.maxLength = q.maxLen || 200;
        ta.placeholder = '请输入（最多 ' + (q.maxLen || 200) + ' 字）';
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
              box.appendChild(el('p', 'vp-muted', '最多可选 ' + q.maxChoices + ' 项'));
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
      var w = el('div', 'cf-turnstile');
      w.setAttribute('data-sitekey', data.turnstileSiteKey);
      root.appendChild(w);
      var timer = setInterval(function () {
        var input = document.querySelector('[name="cf-turnstile-response"]');
        if (input && input.value) { turnstileToken = input.value; clearInterval(timer); }
      }, 300);
    }

    var btn = el('button', 'vp-btn', '提交');
    var msg = el('span', 'vp-msg');
    var actions = el('div', 'vp-actions');
    actions.appendChild(btn);
    actions.appendChild(msg);
    root.appendChild(actions);

    btn.addEventListener('click', function () {
      for (var i = 0; i < data.questions.length; i++) {
        var q = data.questions[i];
        var a = state[q.id];
        var answered = q.type === 'text' ? !!(a && a.text) : !!(a && a.optionIds && a.optionIds.length);
        if (q.required && !answered) { msg.textContent = '请完成：' + q.title; return; }
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
            root.appendChild(el('p', 'vp-thanks', '提交成功，感谢你的声音！'));
            if (data.closed) root.appendChild(el('p', 'vp-banner', '调研已截止'));
          }
        } else if (res.status === 409) {
          msg.textContent = '';
          root.textContent = '';
          root.appendChild(el('p', 'vp-banner', '你已提交过这份问卷'));
          if (res.j.results) renderResults(res.j.results, root);
        } else {
          msg.textContent = res.j && res.j.error ? '提交失败：' + res.j.error : '提交失败，请稍后再试';
          btn.disabled = false;
        }
      }).catch(function () {
        msg.textContent = '网络异常，请稍后再试';
        btn.disabled = false;
      });
    });
  }

  /* ---------- 嵌入自适应 ---------- */
  function postHeight() {
    if (window.parent === window) return;
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    try { window.parent.postMessage({ type: 'voxpop:height', height: h }, '*'); } catch (e) { /* ignore */ }
  }

  /* ---------- 启动 ---------- */
  pageview();
  var dataEl = document.getElementById('vp-data');
  if (dataEl) {
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { data = null; }
    var root = document.getElementById('vp-root');
    if (data && root) {
      if (data.mode === 'form') initForm(data);
      else if (data.results) renderResults(data.results, root);
      else {
        root.appendChild(el('p', 'vp-banner', data.closed ? '调研已截止' : '暂不可见'));
      }
    }
  }
  window.addEventListener('load', postHeight);
  setInterval(postHeight, 800);
})();
