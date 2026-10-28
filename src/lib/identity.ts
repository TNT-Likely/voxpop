import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env, PollRow } from '../types';
import { hmacHex } from './util';

const VID_RE = /^[0-9a-f-]{36}$/;

/**
 * 读取（必要时签发）一方访客 Cookie vp_vid。
 * 注意：防重哈希只能用「请求自带」的 Cookie（见 voterHash），
 * 这里签发的新 ID 只为后续访问建立身份。
 */
export function ensureVid(c: Context<{ Bindings: Env }>): string {
  const existing = getCookie(c, 'vp_vid');
  if (existing && VID_RE.test(existing)) return existing;
  const vid = crypto.randomUUID();
  // SameSite=None + Secure：支持跨站 iframe 嵌入场景；第三方 Cookie 被浏览器
  // 拦截时会退化为 IP+UA 指纹，防重仍然成立
  setCookie(c, 'vp_vid', vid, { path: '/', maxAge: 31536000, sameSite: 'None', secure: true });
  return vid;
}

/**
 * 计算防重身份 HMAC（SERVER_SALT 不落库、不回传）：
 * - device：vid|ip|UA（有 Cookie）或 ip|UA（无 Cookie/被拦截）——同一设备在两种
 *   状态下各稳定一次，跨状态理论上可多投一票，属于可接受的残余边界
 * - ip：强制 ip|UA（严格）
 * - open：每次随机（仅体验层防重，唯一约束自然失效）
 */
export async function voterHash(
  env: Env, poll: PollRow, vid: string, ip: string, ua: string
): Promise<string> {
  let identity: string;
  if (poll.dedup_mode === 'open') {
    identity = 'open|' + crypto.randomUUID();
  } else if (poll.dedup_mode === 'ip' || !vid) {
    identity = 'ip|' + ip + '|' + ua;
  } else {
    identity = 'vid|' + vid + '|ip|' + ip + '|' + ua;
  }
  return hmacHex(env.SERVER_SALT, `${poll.id}|${identity}`);
}
