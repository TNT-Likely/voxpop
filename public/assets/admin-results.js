/* 众声 VoxPop 后台结果页图表（依赖页面 head 里引人的 Chart.js 4） */
(function () {
  'use strict';
  var dataEl = document.getElementById('vp-chart-data');
  if (!dataEl || typeof Chart === 'undefined') return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var accent = '#4f46e5';
  var palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif";
  Chart.defaults.color = '#6b7280';

  var trend = data.trend || [];
  var trendCanvas = document.getElementById('vp-trend');
  if (trend.length && trendCanvas) {
    new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: trend.map(function (t) { return t.day.slice(5); }),
        datasets: [
          {
            label: '答卷',
            data: trend.map(function (t) { return t.responses; }),
            borderColor: accent,
            backgroundColor: 'rgba(79,70,229,.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 2
          },
          {
            label: '浏览 PV',
            data: trend.map(function (t) { return t.pageviews; }),
            borderColor: '#0ea5e9',
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  [['device', 'vp-ch-device'], ['browser', 'vp-ch-browser'], ['os', 'vp-ch-os'], ['country', 'vp-ch-country']]
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
          labels: entries.map(function (e) { return e[0] || '未知'; }),
          datasets: [{
            data: entries.map(function (e) { return e[1]; }),
            backgroundColor: entries.map(function (_, i) { return palette[i % palette.length]; }),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
          cutout: '58%'
        }
      });
    });
})();
