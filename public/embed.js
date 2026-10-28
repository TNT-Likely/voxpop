/* 众声 VoxPop 嵌入脚本：一行代码把问卷嵌进任意网页
 * 用法：
 *   <script src="https://<你的域名>/embed.js"></script>
 *   <div class="voxpop-poll" data-poll="<问卷ID>"></div>
 */
(function () {
  'use strict';
  var ORIGIN = '';
  try {
    ORIGIN = document.currentScript && document.currentScript.src
      ? new URL(document.currentScript.src).origin
      : location.origin;
  } catch (e) {
    ORIGIN = location.origin;
  }

  function mount(el) {
    var id = el.getAttribute('data-poll');
    if (!id || el.querySelector('iframe')) return;
    var f = document.createElement('iframe');
    f.src = ORIGIN + '/embed/' + encodeURIComponent(id);
    f.setAttribute('title', 'voxpop poll');
    f.setAttribute('loading', 'lazy');
    f.style.width = '100%';
    f.style.border = '0';
    f.style.minHeight = '160px';
    f.style.display = 'block';
    el.appendChild(f);
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'voxpop:height' && e.source === f.contentWindow) {
        f.style.height = Math.max(160, Number(e.data.height) || 160) + 'px';
      }
    });
  }

  function init() {
    var nodes = document.querySelectorAll('.voxpop-poll[data-poll], [data-voxpop]');
    Array.prototype.forEach.call(nodes, mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
