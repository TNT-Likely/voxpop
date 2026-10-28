import { esc, jsonForScript } from './util';
import { dictFor, t, type Locale } from './i18n';

export interface LayoutOpts {
  title: string;
  description?: string;
  body: string;
  head?: string;
  embed?: boolean;
  locale?: Locale;
  /** 主题色（#RRGGBB），注入 --vp-accent */
  accent?: string;
  /** 当前路径（含 query），用于语言切换链接 */
  path?: string;
  /** body 上的建卷端点标记（后台 / 自助建票共用渲染器） */
  createEndpoint?: string;
  /** 社交分享卡片 */
  og?: { title: string; description?: string; url?: string };
}

/** 首帧前设置主题，避免闪烁；URL ?theme= 优先（嵌入场景） */
const THEME_BOOT = `<script>(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='dark'||q==='light')?q:(localStorage.getItem('vp_theme')||'auto');if(t==='auto')t=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}})();</script>`;

/** 主题色注入：v4 规则——主色原色直用，其上前景按明暗取深墨 #262829 或白 */
export function accentStyle(accent: string): string {
  const hex = accent.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '';
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const ink = lum > 0.62 ? '#262829' : '#ffffff';
  return `<style>:root{--bc-accent:#${hex.toLowerCase()};--bc-accent-ink:${ink};}</style>`;
}

function langHref(path: string | undefined, other: Locale): string {
  const p = path || '/';
  try {
    const u = new URL(p, 'https://voxpop.local');
    u.searchParams.set('lang', other);
    return u.pathname + (u.search || `?lang=${other}`);
  } catch {
    return p + (p.includes('?') ? '&' : '?') + `lang=${other}`;
  }
}

/** 页面外壳：嵌入版只保留内容区 */
export function layout(o: LayoutOpts): string {
  const locale: Locale = o.locale ?? 'zh';
  const other: Locale = locale === 'zh' ? 'en' : 'zh';
  const chrome = o.embed
    ? ''
    : `<header class="vp-header"><div class="vp-header-in">
  <a class="vp-logo" href="/">${locale === 'zh' ? '<span class="vp-logo-zh">众声</span>' : ''}<span class="vp-logo-chip">VoxPop</span></a>  <span class="vp-tagline">${esc(t(locale, 'tagline'))}</span>
  <div class="vp-header-right">
    <nav class="vp-nav">
      <a href="/new">${esc(t(locale, 'newPoll'))}</a>
      <a href="/admin">${esc(t(locale, 'admin'))}</a>
    </nav>
    <div class="vp-tools">
      <a class="vp-lang" href="${esc(langHref(o.path, other))}" title="${other === 'en' ? 'English' : '切换到中文'}">${locale === 'zh' ? 'EN' : '中'}</a>
      <button id="vp-theme-toggle" type="button" class="vp-icon-btn" aria-label="${esc(t(locale, 'themeAuto'))}" title="${esc(t(locale, 'themeAuto'))}"></button>
    </div>
  </div>
</div></header>`;
  const footer = o.embed
    ? ''
    : `<footer class="vp-footer"><div class="vp-footer-in">
  <div class="vp-footer-brand">
    ${locale === 'zh' ? '<span>众声</span>' : ''}<span class="vp-logo-chip sm">VoxPop</span>
    <a class="vp-footer-gh" href="https://github.com/TNT-Likely/voxpop" target="_blank" rel="noopener" aria-label="GitHub" title="GitHub">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
    </a>
  </div>
  <p class="vp-footer-privacy">${esc(t(locale, 'footerPrivacy'))}</p>
</div></footer>`;
  const bodyAttrs = o.createEndpoint ? ` data-create-endpoint="${esc(o.createEndpoint)}"` : '';
  return `<!doctype html>
<html lang="${locale === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${esc(o.title)}</title>
${o.description ? `<meta name="description" content="${esc(o.description)}">` : ''}
${o.og ? `<meta property="og:title" content="${esc(o.og.title)}">
${o.og.description ? `<meta property="og:description" content="${esc(o.og.description)}">` : ''}
${o.og.url ? `<meta property="og:url" content="${esc(o.og.url)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="众声 VoxPop">
<meta name="twitter:card" content="summary">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/app.css">
${THEME_BOOT}
${o.accent ? accentStyle(o.accent) : ''}
<script>window.VP_L = ${jsonForScript(dictFor(locale))};</script>
${o.head ?? ''}
</head>
<body${bodyAttrs}>
${chrome}
<main class="vp-main${o.embed ? ' vp-embed' : ''}">
${o.body}
</main>
${footer}
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

export function notFoundBody(locale: Locale = 'zh'): string {
  return `<div class="vp-empty"><h1>404</h1><p>${esc(t(locale, 'notFoundDesc'))}</p><p><a href="/">(${esc(t(locale, 'backHome'))})</a></p></div>`;
}
