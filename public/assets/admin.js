/* 众声 VoxPop 问卷编辑器：后台与自助建票共用（原生 JS）
 * 端点由 body[data-create-endpoint] 指定；文案来自 window.VP_L。
 */
(function () {
  'use strict';

  var L = window.VP_L || {};
  function T(key, vars) {
    var s = L[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var addBtn = document.getElementById('vp-add-question');
  if (!addBtn) return;

  var ENDPOINT = document.body.getAttribute('data-create-endpoint') || '/api/admin/polls';
  var IS_ADMIN = ENDPOINT.indexOf('/api/admin') === 0;
  var CASCADE_HINT = T('cascadeHint');
  var NORMAL_HINT = T('normalHint');

  function toggleFields(box) {
    var t = box.querySelector('.q-type').value;
    box.querySelector('.q-opts-field').hidden = t === 'text';
    box.querySelector('.q-opts-en-field').hidden = t === 'text';
    box.querySelector('.q-multi-field').hidden = t !== 'multi';
    box.querySelector('.q-text-field').hidden = t !== 'text';
    box.querySelector('.q-options').placeholder = t === 'cascade' ? CASCADE_HINT : NORMAL_HINT;
    box.querySelector('.q-options-en').placeholder = t === 'cascade' ? CASCADE_HINT : NORMAL_HINT;
  }

  function addQuestion() {
    var box = el('div', 'vp-admin-q');
    box.innerHTML =
      '<div class="vp-field"><label>' + T('qTitleLabel') + '</label><input class="q-title" maxlength="120" placeholder="' + T('pollTitlePlaceholder') + '"></div>' +
      '<div class="vp-field-row">' +
      '<div class="vp-field"><label>' + T('qTypeLabel') + '</label><select class="q-type">' +
      '<option value="single">' + T('typeSingle') + '</option>' +
      '<option value="multi">' + T('typeMulti') + '</option>' +
      '<option value="cascade">' + T('typeCascade') + '</option>' +
      '<option value="text">' + T('typeText') + '</option></select></div>' +
      '<div class="vp-field q-multi-field" hidden><label>' + T('maxChoicesLabel') + '</label><input type="number" class="q-max-choices" value="3" min="2" max="50"></div>' +
      '<div class="vp-field q-text-field" hidden><label>' + T('maxLenLabel') + '</label><input type="number" class="q-max-len" value="200" min="1" max="500"></div>' +
      '</div>' +
      '<div class="vp-field q-opts-field"><label>' + T('optionsLabel') + '</label>' +
      '<textarea class="q-options" rows="6"></textarea></div>' +
      '<details class="q-en"><summary>English (optional)</summary>' +
      '<div class="vp-field"><label>English title</label><input class="q-title-en" maxlength="120"></div>' +
      '<div class="vp-field q-opts-en-field"><label>English options (same lines &amp; indent as Chinese)</label>' +
      '<textarea class="q-options-en" rows="6"></textarea></div>' +
      '</details>' +
      '<div class="vp-field"><label><input type="checkbox" class="q-required" checked> ' + T('requiredLabel') + '</label> ' +
      '<button type="button" class="vp-link q-del">' + T('removeQuestion') + '</button></div>';
    document.getElementById('vp-questions').appendChild(box);
    box.querySelector('.q-type').addEventListener('change', function () { toggleFields(box); });
    box.querySelector('.q-del').addEventListener('click', function () { box.remove(); });
    toggleFields(box);
  }

  addBtn.addEventListener('click', addQuestion);
  if (!document.getElementById('vp-questions').children.length) addQuestion();

  document.getElementById('vp-create').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    var bad = '';
    var questions = [];
    Array.prototype.forEach.call(document.getElementById('vp-questions').children, function (box) {
      var type = box.querySelector('.q-type').value;
      var title = box.querySelector('.q-title').value.trim();
      var optionsText = box.querySelector('.q-options').value;
      questions.push({
        type: type,
        title: title,
        titleEn: box.querySelector('.q-title-en').value.trim(),
        required: box.querySelector('.q-required').checked,
        maxChoices: parseInt(box.querySelector('.q-max-choices').value, 10) || 2,
        maxLen: parseInt(box.querySelector('.q-max-len').value, 10) || 200,
        optionsText: optionsText,
        optionsTextEn: box.querySelector('.q-options-en').value
      });
      if (!title) bad = T('needQTitle');
      else if (type !== 'text') {
        var lines = optionsText.split('\n').filter(function (l) { return l.trim(); });
        if (lines.length < 2) bad = T('needTwoOptions', { title: title });
      }
    });

    var title = document.getElementById('f-title').value.trim();
    if (!title) { alert(T('needPollTitle')); btn.disabled = false; return; }
    if (bad) { alert(bad); btn.disabled = false; return; }

    var closeDays = parseInt(document.getElementById('f-close-days').value, 10);
    var accentEl = document.getElementById('f-accent');
    var extraEl = document.getElementById('f-extra-keys');
    var titleEnEl = document.getElementById('f-title-en');
    var descEnEl = document.getElementById('f-desc-en');
    function checkedVals(boxId) {
      var box = document.getElementById(boxId);
      if (!box) return '';
      return Array.prototype.slice.call(box.querySelectorAll('input:checked')).map(function (i) { return i.value; }).join(',');
    }
    var payload = {
      title: title,
      titleEn: titleEnEl ? titleEnEl.value.trim() : '',
      description: document.getElementById('f-desc').value.trim(),
      descriptionEn: descEnEl ? descEnEl.value.trim() : '',
      dedupMode: document.getElementById('f-dedup').value,
      resultPolicy: document.getElementById('f-policy').value,
      closeInDays: isNaN(closeDays) ? null : closeDays,
      accent: accentEl ? accentEl.value.trim() : '',
      extraKeys: extraEl ? extraEl.value.trim() : '',
      channels: checkedVals('f-channels-box'),
      apps: checkedVals('f-apps-box'),
      questions: questions
    };
    var ti = document.querySelector('[name="cf-turnstile-response"]');
    if (ti && ti.value) payload.turnstileToken = ti.value;

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, j: j }; });
    }).then(function (res) {
      if (res.status === 200 && res.j.id) {
        location.href = (IS_ADMIN ? '/admin/p/' : '/p/') + res.j.id;
      } else {
        var code = res.j && res.j.error ? res.j.error : '';
        alert(code ? T(code) : T('createFailed'));
        btn.disabled = false;
      }
    }).catch(function () { alert(T('networkError')); btn.disabled = false; });
  });
})();
