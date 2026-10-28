/* 众声 VoxPop 后台脚本：问卷编辑器（原生 JS） */
(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var CASCADE_HINT = 'iOS\n  iOS 18\n  iOS 17\nAndroid\n  Android 15\nHarmonyOS';
  var NORMAL_HINT = '选项 A\n选项 B\n选项 C';

  function toggleFields(box) {
    var t = box.querySelector('.q-type').value;
    box.querySelector('.q-opts-field').hidden = t === 'text';
    box.querySelector('.q-multi-field').hidden = t !== 'multi';
    box.querySelector('.q-text-field').hidden = t !== 'text';
    box.querySelector('.q-options').placeholder = t === 'cascade' ? CASCADE_HINT : NORMAL_HINT;
  }

  function addQuestion() {
    var box = el('div', 'vp-admin-q');
    box.innerHTML =
      '<div class="vp-field"><label>题目</label><input class="q-title" maxlength="120" placeholder="例如：你最希望优先上线的功能？"></div>' +
      '<div class="vp-field-row">' +
      '<div class="vp-field"><label>题型</label><select class="q-type">' +
      '<option value="single">单选</option><option value="multi">多选</option>' +
      '<option value="cascade">级联选择</option><option value="text">文本输入</option></select></div>' +
      '<div class="vp-field q-multi-field" hidden><label>最多可选</label><input type="number" class="q-max-choices" value="3" min="2" max="50"></div>' +
      '<div class="vp-field q-text-field" hidden><label>最大字数</label><input type="number" class="q-max-len" value="200" min="1" max="500"></div>' +
      '</div>' +
      '<div class="vp-field q-opts-field"><label>选项（每行一个；级联题用两个空格缩进表示下一级，最深 3 层）</label>' +
      '<textarea class="q-options" rows="6" placeholder="' + NORMAL_HINT.replace(/\n/g, '&#10;') + '"></textarea></div>' +
      '<div class="vp-field"><label><input type="checkbox" class="q-required" checked> 必答</label> ' +
      '<button type="button" class="vp-link q-del">删除本题</button></div>';
    document.getElementById('vp-questions').appendChild(box);
    box.querySelector('.q-type').addEventListener('change', function () { toggleFields(box); });
    box.querySelector('.q-del').addEventListener('click', function () { box.remove(); });
    toggleFields(box);
  }

  var addBtn = document.getElementById('vp-add-question');
  if (!addBtn) return;
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
        required: box.querySelector('.q-required').checked,
        maxChoices: parseInt(box.querySelector('.q-max-choices').value, 10) || 2,
        maxLen: parseInt(box.querySelector('.q-max-len').value, 10) || 200,
        optionsText: optionsText
      });
      if (!title) bad = '有题目还没填标题';
      else if (type !== 'text') {
        var lines = optionsText.split('\n').filter(function (l) { return l.trim(); });
        if (lines.length < 2) bad = '「' + title + '」至少需要两个选项';
      }
    });

    var title = document.getElementById('f-title').value.trim();
    if (!title) { alert('请填写问卷标题'); btn.disabled = false; return; }
    if (bad) { alert(bad); btn.disabled = false; return; }

    var closeDays = parseInt(document.getElementById('f-close-days').value, 10);
    var payload = {
      title: title,
      description: document.getElementById('f-desc').value.trim(),
      dedupMode: document.getElementById('f-dedup').value,
      resultPolicy: document.getElementById('f-policy').value,
      closeInDays: isNaN(closeDays) ? null : closeDays,
      extraKeys: document.getElementById('f-extra-keys').value.trim(),
      questions: questions
    };
    fetch('/api/admin/polls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, j: j }; });
    }).then(function (res) {
      if (res.status === 200 && res.j.id) location.href = '/admin/p/' + res.j.id;
      else { alert(res.j && res.j.error ? res.j.error : '创建失败'); btn.disabled = false; }
    }).catch(function () { alert('网络异常'); btn.disabled = false; });
  });
})();
