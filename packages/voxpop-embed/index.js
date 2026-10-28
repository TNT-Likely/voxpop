/*!
 * 众声 VoxPop 嵌入脚本 | VoxPop embed script
 * https://github.com/TNT-Likely/voxpop · MIT License
 *
 * 用法（script 标签自动挂载）：
 *   <script src="https://<你的域名>/embed.js"></script>
 *   <div class="voxpop-poll" data-poll="<问卷ID>"></div>
 *
 * 用法（UMD / 打包器）：
 *   const VoxPop = require('voxpop-embed');        // CJS
 *   import VoxPop from 'voxpop-embed';             // ESM
 *   VoxPop.mount(document.querySelector('#box'), { host: 'https://voxpop.example.com', poll: '<问卷ID>' });
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VoxPop = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ORIGIN = '';

  function mount(el, opts) {
    opts = opts || {};
    var id = opts.poll || el.getAttribute('data-poll') || el.getAttribute('data-voxpop');
    if (!id || el.querySelector('iframe')) return null;
    var host = opts.host || ORIGIN || (typeof location !== 'undefined' ? location.origin : '');
    if (!host) return null;
    var f = document.createElement('iframe');
    f.src = host.replace(/\/$/, '') + '/embed/' + encodeURIComponent(id);
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
    return f;
  }

  function init() {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('.voxpop-poll[data-poll], [data-voxpop]');
    Array.prototype.forEach.call(nodes, function (el) { mount(el); });
  }

  // 经 <script src=".../embed.js"> 引入时：记录来源域名并自动挂载
  if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
    try {
      ORIGIN = new URL(document.currentScript.src).origin;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    } catch (e) { /* ignore */ }
  }

  return { mount: mount, init: init };
});
