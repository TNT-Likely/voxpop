/** HTML 转义 */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/** 内嵌 <script type="application/json"> 的 JSON（防 </script> 逃逸） */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const ID_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 生成不含易混淆字符的短 ID */
export function genId(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ID_ALPHA[b % ID_ALPHA.length];
  return out;
}

export async function hmacHex(salt: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 自定义维度值清洗：字母数字与-_，最长 24 */
const DIM_RE = /^[A-Za-z0-9_-]{1,24}$/;
export function cleanDim(v: unknown): string {
  return typeof v === 'string' && DIM_RE.test(v) ? v : '';
}

export function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v ?? ''), 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export interface ParsedOption { label: string; depth: number }

/** 解析缩进选项行：每行一个选项，两个空格表示下一级（级联题用） */
export function parseOptionLines(text: string): ParsedOption[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const m = l.match(/^((?: {2})*)(.*)$/);
      return { label: (m ? m[2] : l).trim(), depth: m ? Math.floor(m[1].length / 2) : 0 };
    });
}

export function fmtDate(sec: number | null): string {
  if (!sec) return '-';
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 问卷是否已不可提交：显式截止或到达截止时间（惰性判断） */
export function isClosed(p: { status: string; close_at: number | null }): boolean {
  return p.status === 'closed' || (!!p.close_at && p.close_at <= nowSec());
}

/** UTC 日界起点（unix 秒），offsetDays 负数表示往前推 */
export function utcDayStartSec(offsetDays = 0): number {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % 86400) + offsetDays * 86400;
}
