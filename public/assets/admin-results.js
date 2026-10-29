/* 众声 VoxPop 后台结果页图表（依赖 head 引入的 Chart.js 4；文案来自 window.VP_L） */
(function () {
  'use strict';
  var L = window.VP_L || {};
  function T(key) { return L[key] || key; }
  var dataEl = document.getElementById('vp-chart-data');
  if (!dataEl || typeof Chart === 'undefined') return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  var accent = cssVar('--bc-accent', '#f8c91c');
  var palette = [accent, '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
  var ink = cssVar('--bc-ink', '#25282c');
  var muted = cssVar('--bc-muted', '#777c82');
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif";
  Chart.defaults.color = muted;

  var trend = data.trend || [];
  var trendCanvas = document.getElementById('vp-trend');
  if (trend.length && trendCanvas) {
    new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: trend.map(function (x) { return x.day.slice(5); }),
        datasets: [
          {
            label: T('responsesLabel'),
            data: trend.map(function (x) { return x.responses; }),
            borderColor: accent,
            backgroundColor: 'rgba(79,70,229,.10)',
            fill: true,
            tension: 0.3,
            pointRadius: 2
          },
          {
            label: T('pageviewsLabel'),
            data: trend.map(function (x) { return x.pageviews; }),
            borderColor: '#0ea5e9',
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: muted } } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, color: muted }, grid: { color: 'rgba(128,128,128,.15)' } },
          x: { ticks: { color: muted }, grid: { display: false } }
        }
      }
    });
  }

  [['device', 'vp-ch-device'], ['browser', 'vp-ch-browser'], ['os', 'vp-ch-os'], ['country', 'vp-ch-country'], ['lang', 'vp-ch-lang']]
    .forEach(function (pair) {
      var canvas = document.getElementById(pair[1]);
      if (!canvas) return;
      var entries = Object.keys((data.breakdown || {})[pair[0]] || {})
        .map(function (k) { return [k, data.breakdown[pair[0]][k]]; })
        .sort(function (a, b) { return b[1] - a[1]; })
        .slice(0, 6);
      if (!entries.length) return;
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: entries.map(function (e) { return e[0] || T('unknown'); }),
          datasets: [{
            data: entries.map(function (e) { return e[1]; }),
            backgroundColor: entries.map(function (_, i) { return palette[i % palette.length]; }),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: muted } } },
          cutout: '58%'
        }
      });
    });
})();
