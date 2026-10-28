import { esc } from './util';

export interface LayoutOpts {
  title: string;
  description?: string;
  body: string;
  head?: string;
  embed?: boolean;
}

/** 页面外壳：嵌入版只保留内容区 */
export function layout(o: LayoutOpts): string {
  const chrome = o.embed
    ? ''
    : `<header class="vp-header">
  <a class="vp-logo" href="/">众声 <span>VoxPop</span></a>
  <span class="vp-tagline">大家的投票站</span>
</header>`;
  const footer = o.embed
    ? ''
    : `<footer class="vp-footer">本站仅做匿名聚合统计，不收集任何个人身份信息 · Powered by <a href="https://github.com/TNT-Likely/voxpop" target="_blank" rel="noopener">众声 VoxPop</a></footer>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
${o.description ? `<meta name="description" content="${esc(o.description)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/app.css">
${o.head ?? ''}
</head>
<body>
${chrome}
<main class="vp-main${o.embed ? ' vp-embed' : ''}">
${o.body}
</main>
${footer}
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

export function notFoundBody(): string {
  return `<div class="vp-empty"><h1>404</h1><p>页面不存在或问卷已下线</p><p><a href="/">回首页</a></p></div>`;
}
